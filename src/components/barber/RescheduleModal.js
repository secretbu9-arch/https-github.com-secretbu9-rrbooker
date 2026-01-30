// components/barber/RescheduleModal.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import addOnsService from '../../services/AddOnsService';

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
      const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
      
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
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-arrow-repeat me-2"></i>
              Reschedule Appointment
            </h5>
            <button 
              type="button" 
              className="btn-close" 
              onClick={onClose}
              disabled={loading}
            ></button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="mb-4">
                <h6 className="text-primary mb-3">
                  <i className="bi bi-calendar-event me-2"></i>
                  Current Appointment Details
                </h6>
                <div className="card border-0 bg-light">
                  <div className="card-body p-3">
                    <div className="row g-3">
                      <div className="col-12 col-sm-6">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-calendar-date text-primary me-2"></i>
                          <div>
                            <small className="text-muted d-block">Date</small>
                            <strong>{new Date(appointment.appointment_date).toLocaleDateString('en-US', { 
                              weekday: 'long', 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-sm-6">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-list-ol text-primary me-2"></i>
                          <div>
                            <small className="text-muted d-block">Queue Position</small>
                            <strong>
                              {appointment.queue_position ? `#${appointment.queue_position}` : 'Not assigned'}
                            </strong>
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-sm-6">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-person-badge text-primary me-2"></i>
                          <div>
                            <small className="text-muted d-block">Customer</small>
                            <strong>{appointment.customer?.full_name || 'N/A'}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-sm-6">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-tag text-primary me-2"></i>
                          <div>
                            <small className="text-muted d-block">Type</small>
                            <span className="badge bg-warning">
                              Queue
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-sm-6">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-scissors text-primary me-2"></i>
                          <div>
                            <small className="text-muted d-block">Services</small>
                            <strong>
                              {appointment.service?.name || appointment.services_data ? 
                                (Array.isArray(appointment.services_data) ? 
                                  appointment.services_data.length + ' service(s)' : 
                                  'Service') : 
                                'N/A'}
                            </strong>
                          </div>
                        </div>
                      </div>
                      {addOnsDisplay && (
                        <div className="col-12 col-sm-6">
                          <div className="d-flex align-items-center">
                            <i className="bi bi-plus-circle text-primary me-2"></i>
                            <div>
                              <small className="text-muted d-block">Add-ons</small>
                              <strong className="text-info">{addOnsDisplay || 'None'}</strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <h6 className="text-success mb-3">
                  <i className="bi bi-calendar-check me-2"></i>
                  New Appointment Details
                </h6>
                
                <div className="row g-3">
                  <div className="col-12">
                    <div className="alert alert-info mb-3">
                      <i className="bi bi-info-circle me-2"></i>
                      <strong>Queue-Only System:</strong> The appointment will remain as a queue appointment on the new date. 
                      The customer will join the queue on the selected date.
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <label htmlFor="newDate" className="form-label fw-semibold">
                      <i className="bi bi-calendar-date me-2"></i>
                      New Date *
                    </label>
                    <input
                      type="date"
                      id="newDate"
                      className="form-control"
                      value={newDate}
                      onChange={handleDateChange}
                      min={new Date().toISOString().split('T')[0]}
                      required
                      disabled={loading}
                    />
                    <div className="form-text mt-2">
                      <i className="bi bi-info-circle me-1"></i>
                      The customer will be added to the queue on this date.
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label fw-semibold">
                      <i className="bi bi-list-check me-2"></i>
                      Appointment Type
                    </label>
                    <div className="form-control bg-light">
                      <span className="badge bg-warning me-2">
                        <i className="bi bi-list-ol me-1"></i>
                        Queue
                      </span>
                      <small className="text-muted">Queue appointments don't have specific time slots</small>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="reason" className="form-label fw-semibold">
                  <i className="bi bi-chat-text me-2"></i>
                  Reason for Rescheduling *
                </label>
                <textarea
                  id="reason"
                  className="form-control border-2"
                  rows="4"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Please explain why you need to reschedule this appointment..."
                  required
                  disabled={loading}
                  style={{ resize: 'vertical' }}
                />
                <div className="form-text mt-2">
                  <i className="bi bi-info-circle me-1"></i>
                  The customer will receive a notification to confirm or decline this reschedule request.
                </div>
              </div>

              {error && (
                <div className="alert alert-danger">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {error}
                </div>
              )}
            </div>

            <div className="modal-footer bg-light border-0">
              <div className="d-flex gap-2 w-100">
                <button 
                  type="button" 
                  className="btn btn-outline-secondary flex-fill" 
                  onClick={onClose}
                  disabled={loading}
                >
                  <i className="bi bi-x-lg me-2"></i>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-warning flex-fill"
                  disabled={loading || !newDate || !reason.trim()}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-arrow-repeat me-2"></i>
                      Submit Reschedule Request
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RescheduleModal;

