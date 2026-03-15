// components/barber/RescheduleModal.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import addOnsService from '../../services/booking/AddOnsService';

const RescheduleModal = ({ 
  isOpen, 
  onClose, 
  appointment,
  onSuccess 
}) => {
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addOnsDisplay, setAddOnsDisplay] = useState('');
  
  // Helper to format time strings
  const formatTime = (timeString) => {
    if (!timeString) return null;
    try {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours, 10);
      const period = hour >= 12 ? 'PM' : 'AM';
      return `${hour % 12 || 12}:${minutes} ${period}`;
    } catch (e) {
      return timeString;
    }
  };

  const isSubmittingRef = useRef(false);
  const lastRequestIdRef = useRef(null); // Track the last request ID to prevent duplicates

  useEffect(() => {
    if (isOpen && appointment) {
      // Set minimum date to today
      const today = new Date().toISOString().split('T')[0];
      setNewDate(today);
      setReason('');
      setError('');
      // Reset refs when modal opens
      isSubmittingRef.current = false;
      lastRequestIdRef.current = null;
      
      // Load add-ons display
      const loadAddOns = async () => {
        if (appointment.add_ons_data) {
          try {
            const text = await addOnsService.getAddOnsDisplay(appointment.add_ons_data);
            setAddOnsDisplay(text);
          } catch (error) {
            console.error('Error loading add-ons display:', error);
            setAddOnsDisplay('');
          }
        } else {
          setAddOnsDisplay('');
        }
      };
      loadAddOns();
    }
  }, [isOpen, appointment]);

  const handleDateChange = (e) => {
    const date = e.target.value;
    setNewDate(date);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent double-submission using both state and ref
    if (loading || isSubmittingRef.current) {
      console.log('🔄 Reschedule submission already in progress - preventing duplicate');
      return;
    }
    
    // Mark as submitting immediately
    isSubmittingRef.current = true;
    
    if (!newDate) {
      setError('Please select a new date.');
      return;
    }

    if (!reason.trim()) {
      setError('Please provide a reason for rescheduling.');
      return;
    }

    // Check if new date is not in the past
    const selectedDate = new Date(newDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      setError('Cannot reschedule to a past date.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Resolve customer name
      let customerName = appointment.customer?.full_name || '';
      if (!customerName) {
        try {
          const { data: userRow } = await supabase
            .from('users')
            .select('full_name, email')
            .eq('id', appointment.customer_id)
            .single();
          customerName = userRow?.full_name || userRow?.email || '';
        } catch (_) {
          // ignore
        }
      }
      if (!customerName) {
        customerName = `Customer ${String(appointment.customer_id || '').slice(-8)}`;
      }

      // Create reschedule request
      // Store new appointment data in current_appointment_data JSON along with current data
      // Use status 'pending_approval' (required by schema) and track barber-initiated in JSON
      const requestData = {
        appointment_id: appointment.id,
        customer_id: appointment.customer_id,
        barber_id: appointment.barber_id,
        action_type: 'reschedule',
        reason: reason.trim(),
        status: 'pending_approval', // Schema only allows: 'pending_approval', 'approved', 'rejected'
        requested_at: new Date().toISOString(),
        current_appointment_data: {
          // Current appointment data
          appointment_date: appointment.appointment_date,
          appointment_time: appointment.appointment_time || null,
          appointment_type: appointment.appointment_type || 'queue',
          services: appointment.services_data || appointment.services || [],
          add_ons: appointment.add_ons_data || appointment.add_ons || [],
          notes: appointment.notes || null,
          customer_name: customerName,
          queue_position: appointment.queue_position || null,
          // New appointment data (stored in same JSON for compatibility)
          new_appointment_date: newDate,
          new_appointment_time: null, // Queue appointments don't have time
          new_appointment_type: 'queue', // System is queue-only
          new_queue_position: null, // Will be assigned when customer confirms
          // Metadata to distinguish barber-initiated requests
          requested_by: 'barber', // Store in JSON to track who requested (barber-initiated)
          requires_customer_confirmation: true // Flag to indicate customer needs to confirm
        }
      };

      // Insert reschedule request
      const { data: request, error: requestError } = await supabase
        .from('appointment_requests')
        .insert([requestData])
        .select()
        .single();

      if (requestError) throw requestError;
      
      // Check if we just created this request (prevent React StrictMode double-call)
      if (lastRequestIdRef.current === request.id) {
        console.log('🔄 Duplicate request detected (same request_id) - likely React StrictMode double-render - skipping notification');
        onSuccess(request);
        onClose();
        return;
      }
      lastRequestIdRef.current = request.id;

      // Send notification to customer via CentralizedNotificationService
      // The service has built-in duplicate prevention, but we'll add an extra check here
      const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
      
      // Extra safety check: verify no duplicate notification exists for this specific request
      const { data: existingNotifs, error: checkError } = await supabase
        .from('notifications')
        .select('id, created_at')
        .eq('user_id', appointment.customer_id)
        .eq('type', 'appointment_reschedule_request')
        .eq('title', 'Appointment Reschedule Request')
        .eq('data->>appointment_id', appointment.id)
        .eq('data->>request_id', request.id)
        .gte('created_at', new Date(Date.now() - 30000).toISOString()) // Last 30 seconds
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (checkError) {
        console.warn('Error checking for existing notification:', checkError);
      }
      
      if (existingNotifs && existingNotifs.length > 0) {
        const age = Date.now() - new Date(existingNotifs[0].created_at).getTime();
        console.log(`🔄 Duplicate notification already exists for this reschedule request (${Math.round(age/1000)}s ago) - skipping creation`);
        // Still return success since the notification exists
      } else {
        // Create notification - the service will also check for duplicates
        try {
          await centralizedNotificationService.createNotification({
            userId: appointment.customer_id,
            title: 'Appointment Reschedule Request',
            message: `Your barber has requested to reschedule your appointment. Please confirm or decline.`,
            type: 'appointment_reschedule_request',
            category: 'request',
            priority: 'high',
            channels: ['app', 'push'],
            data: {
              request_id: request.id,
              appointment_id: appointment.id,
              barber_name: appointment.barber?.full_name || 'Your barber',
              reason: reason,
              new_date: newDate,
              new_time: null, // Queue appointments don't have time
              appointment_type: 'queue',
              action_type: 'reschedule'
            },
            appointmentId: appointment.id
          });
          console.log('✅ Reschedule notification created successfully');
        } catch (notifError) {
          // If it's a duplicate error, that's okay - the notification already exists
          if (notifError.message?.includes('duplicate') || notifError.message?.includes('already exists')) {
            console.log('🔄 Notification already exists (caught in error handler)');
          } else {
            console.error('Error creating reschedule notification:', notifError);
            throw notifError;
          }
        }
      }

      // Add system log
      try {
        await supabase.from('system_logs').insert({
          user_id: appointment.barber_id,
          action: 'appointment_reschedule_requested_by_barber',
            details: {
              appointment_id: appointment.id,
              request_id: request.id,
              reason: reason,
              new_date: newDate,
              appointment_type: 'queue'
            }
        });
      } catch (logError) {
        console.warn('Failed to create system log:', logError);
      }

      onSuccess(request);
      onClose();

    } catch (err) {
      console.error('Error submitting reschedule request:', err);
      setError(`Failed to submit reschedule request. ${err.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal show d-block premium-modal-overlay" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow-ultra-premium overflow-hidden" style={{ borderRadius: '24px' }}>
          {/* Header with Dark Gradient Background */}
          <div className="modal-header border-0 p-4" style={{ background: 'linear-gradient(135deg, #2c1810 0%, #000000 100%)' }}>
            <div className="d-flex align-items-center gap-3">
              <div className="bg-warning bg-opacity-20 text-warning p-2 rounded-3 d-flex align-items-center justify-content-center" style={{ width: '45px', height: '45px' }}>
                <i className="bi bi-arrow-repeat fs-4"></i>
              </div>
              <div>
                <h5 className="modal-title fw-black text-white mb-0" style={{ letterSpacing: '-0.5px' }}>Reschedule Request</h5>
                <p className="text-white-50 small mb-0">Adjust the booking for {appointment.customer?.full_name}</p>
              </div>
            </div>
            <button 
              type="button" 
              className="btn-close btn-close-white shadow-none" 
              onClick={onClose}
              disabled={loading}
              aria-label="Close"
            ></button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="modal-body p-4 scroll-container-minimal" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Context Summary Card */}
              <div className="mb-4">
                <div className="card border-0 bg-light rounded-4 overflow-hidden">
                  <div className="card-body p-3">
                    <div className="row g-3">
                      <div className="col-6">
                        <div className="small text-muted text-uppercase fw-bold mb-1" style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>Date</div>
                        <div className="fw-semibold text-dark small">
                          {new Date(appointment.appointment_date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric' 
                          })} • {formatTime(appointment.appointment_time) || 'Queue'}
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="small text-muted text-uppercase fw-bold mb-1" style={{ fontSize: '0.65rem', letterSpacing: '1px' }}>Service</div>
                        <div className="fw-semibold text-dark small truncate">{appointment.service?.name || 'Multiple'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input Section */}
              <div className="space-y-4">
                <div className="mb-4">
                  <label htmlFor="newDate" className="form-label small fw-black text-muted text-uppercase mb-2 d-block" style={{ letterSpacing: '1px' }}>
                    Select New Date
                  </label>
                  <div className="position-relative">
                    <i className="bi bi-calendar3 position-absolute top-50 start-0 translate-middle-y ms-3 text-primary"></i>
                    <input
                      type="date"
                      id="newDate"
                      className="form-control ps-5 py-3 rounded-4 border-light-subtle bg-white shadow-sm"
                      value={newDate}
                      onChange={handleDateChange}
                      min={new Date().toISOString().split('T')[0]}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label htmlFor="reason" className="form-label small fw-black text-muted text-uppercase mb-2 d-block" style={{ letterSpacing: '1px' }}>
                    Reason for Change
                  </label>
                  <textarea
                    id="reason"
                    className="form-control rounded-4 border-light-subtle bg-white shadow-sm p-3"
                    rows="3"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Short message for the customer..."
                    required
                    disabled={loading}
                    style={{ resize: 'none' }}
                  />
                  <div className="form-text mt-2 small text-muted">
                    <i className="bi bi-info-circle me-1"></i>
                    The customer must approve this request before the change is finalized.
                  </div>
                </div>
              </div>

              {error && (
                <div className="alert alert-danger border-0 rounded-4 py-3 d-flex align-items-center">
                  <i className="bi bi-exclamation-circle-fill me-3 fs-4"></i>
                  <div className="small fw-medium">{error}</div>
                </div>
              )}
            </div>

            <div className="modal-footer border-0 p-4 pt-0">
              <div className="row g-3 w-100">
                <div className="col-4">
                  <button 
                    type="button" 
                    className="btn btn-outline-light text-dark fw-bold w-100 rounded-pill py-3 border-light-subtle transition-all" 
                    onClick={onClose}
                    disabled={loading}
                  >
                    Back
                  </button>
                </div>
                <div className="col-8">
                  <button 
                    type="submit" 
                    className="btn btn-warning fw-black text-dark w-100 rounded-pill py-3 shadow-premium transition-all d-flex align-items-center justify-content-center"
                    disabled={loading || !newDate || !reason.trim()}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                        Processing...
                      </>
                    ) : (
                      <>
                        Send Request <i className="bi bi-send-fill ms-2"></i>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RescheduleModal;

