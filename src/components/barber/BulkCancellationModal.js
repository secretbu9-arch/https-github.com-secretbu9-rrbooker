// components/barber/BulkCancellationModal.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/PushService';

const BulkCancellationModal = ({ isOpen, onClose, barberId, selectedDate, onSuccess }) => {
  const [appointments, setAppointments] = useState([]);
  const [selectedAppointments, setSelectedAppointments] = useState([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: Select appointments, 2: Confirm cancellation

  useEffect(() => {
    if (isOpen && barberId && selectedDate) {
      fetchAppointments();
      setStep(1); // Reset to step 1 when modal opens
      setSelectedAppointments([]);
      setReason('');
      setError('');
    }
  }, [isOpen, barberId, selectedDate]);

  const fetchAppointments = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          customer_id,
          appointment_time,
          appointment_type,
          status,
          total_price,
          services_data,
          add_ons_data,
          notes,
          customers:customer_id (
            id,
            full_name,
            email,
            phone
          )
        `)
        .eq('barber_id', barberId)
        .eq('appointment_date', selectedDate)
        .in('status', ['scheduled', 'confirmed', 'pending']);

      if (error) throw error;

      setAppointments(data || []);
      setSelectedAppointments([]);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      setError('Failed to fetch appointments');
    }
  };

  const handleAppointmentSelect = (appointmentId) => {
    setSelectedAppointments(prev => 
      prev.includes(appointmentId) 
        ? prev.filter(id => id !== appointmentId)
        : [...prev, appointmentId]
    );
  };

  const handleSelectAll = () => {
    if (selectedAppointments.length === appointments.length) {
      setSelectedAppointments([]);
    } else {
      setSelectedAppointments(appointments.map(apt => apt.id));
    }
  };

  const handleNext = () => {
    if (selectedAppointments.length === 0) {
      setError('Please select at least one appointment to cancel');
      return;
    }
    setStep(2);
    setError('');
  };

  const handleBack = () => {
    setStep(1);
    setError('');
  };

  const getSelectedAppointmentsData = () => {
    return appointments.filter(apt => selectedAppointments.includes(apt.id));
  };

  const formatTime = (time) => {
    if (!time) return 'Queue';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const handleBulkCancel = async () => {
    if (selectedAppointments.length === 0) {
      setError('Please select at least one appointment to cancel');
      return;
    }

    if (!reason.trim()) {
      setError('Please provide a reason for cancellation');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const selectedAppointmentData = appointments.filter(apt => 
        selectedAppointments.includes(apt.id)
      );

      // Update appointment statuses
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ 
          status: 'cancelled',
          cancellation_reason: reason,
          updated_at: new Date().toISOString()
        })
        .in('id', selectedAppointments);

      if (updateError) throw updateError;

      // Send notifications to customers
      for (const appointment of selectedAppointmentData) {
        // Database notification
        await supabase.from('notifications').insert({
          user_id: appointment.customer_id,
          title: 'Appointment Cancelled - Barber Unavailable',
          message: `Your appointment on ${selectedDate} at ${appointment.appointment_time} has been cancelled because your barber is unavailable. Reason: ${reason}. Please reschedule or book with another barber.`,
          type: 'appointment_cancelled',
          data: {
            appointment_id: appointment.id,
            cancellation_reason: reason,
            barber_id: barberId,
            appointment_date: selectedDate
          }
        });

        // Push notification
        try {
          console.log('🔔 Sending push notification to user:', appointment.customer_id);
          
          // Test if PushService is properly initialized
          if (!PushService.initialized) {
            console.log('⚠️ PushService not initialized, initializing now...');
            await PushService.initialize();
          }
          
          await PushService.sendNotificationToUser(
            appointment.customer_id,
            'Appointment Cancelled',
            `Your appointment on ${selectedDate} has been cancelled. Reason: ${reason}`,
            {
              type: 'appointment_cancelled',
              appointmentId: appointment.id,
              barberId: barberId
            }
          );
          console.log('✅ Push notification sent successfully');
          
          // Show local notification for immediate feedback (works without HTTPS)
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Appointment Cancelled', {
                body: `Your appointment on ${selectedDate} has been cancelled. Reason: ${reason}`,
                icon: '/favicon.ico',
                tag: `cancelled-${appointment.id}`
              });
              console.log('✅ Browser notification shown');
            }
          } catch (localError) {
            console.warn('❌ Browser notification failed:', localError);
          }
          
        } catch (pushError) {
          console.warn('❌ Push notification failed:', pushError);
          
          // Try browser notification as fallback (works without HTTPS)
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Appointment Cancelled', {
                body: `Your appointment on ${selectedDate} has been cancelled. Reason: ${reason}`,
                icon: '/favicon.ico',
                tag: `cancelled-${appointment.id}`
              });
              console.log('✅ Browser notification fallback shown');
            } else {
              console.log('⚠️ Browser notifications not available or permission not granted');
            }
          } catch (localError) {
            console.warn('❌ Browser notification fallback also failed:', localError);
          }
        }

        // Email notification
        try {
          console.log('📧 Sending email notification to:', appointment.customers.email);
          await supabase.functions.invoke('send-booking-email', {
            body: {
              appointment: {
                id: appointment.id,
                customer_name: appointment.customers.full_name,
                barber_name: 'Your Barber',
                service_name: 'Appointment Service',
                appointment_date: selectedDate,
                appointment_time: appointment.appointment_time,
                total_price: appointment.total_price,
                notes: `Cancellation Reason: ${reason}`,
                customer: {
                  email: appointment.customers.email
                }
              },
              type: 'status_update',
              status: 'cancelled'
            }
          });
          console.log('✅ Email notification sent successfully');
        } catch (emailError) {
          console.warn('❌ Email notification failed:', emailError);
        }
      }

      console.log(`✅ Successfully cancelled ${selectedAppointments.length} appointments`);
      
      if (onSuccess) {
        onSuccess(selectedAppointments.length);
      }
      
      onClose();
      
    } catch (error) {
      console.error('Error cancelling appointments:', error);
      setError('Failed to cancel appointments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          {/* Header */}
          <div className="modal-header bg-danger text-white">
            <h5 className="modal-title">
              <i className="bi bi-x-circle me-2"></i>
              Cancel Appointments
            </h5>
            <button 
              type="button" 
              className="btn-close btn-close-white" 
              onClick={onClose}
              disabled={loading}
            ></button>
          </div>
          
          <div className="modal-body p-4">
            {error && (
              <div className="alert alert-danger">
                <i className="bi bi-exclamation-triangle me-2"></i>
                {error}
              </div>
            )}

            {/* Step 1: Select Appointments */}
            {step === 1 && (
              <>
                <div className="text-center mb-4">
                  <h6 className="text-muted">Step 1 of 2</h6>
                  <h5>Select Appointments to Cancel</h5>
                  <p className="text-muted mb-0">Date: <strong>{selectedDate}</strong></p>
                </div>

                {appointments.length === 0 ? (
                  <div className="text-center py-5">
                    <i className="bi bi-calendar-check text-success" style={{ fontSize: '3rem' }}></i>
                    <h5 className="mt-3 text-muted">No appointments found</h5>
                    <p className="text-muted">There are no appointments scheduled for this date.</p>
                  </div>
                ) : (
                  <>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <span className="text-muted">
                        {appointments.length} appointment{appointments.length !== 1 ? 's' : ''} found
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={handleSelectAll}
                        disabled={loading}
                      >
                        {selectedAppointments.length === appointments.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    
                    <div className="row g-3">
                      {appointments.map((appointment) => (
                        <div key={appointment.id} className="col-12">
                          <div className={`card border ${selectedAppointments.includes(appointment.id) ? 'border-danger bg-light' : 'border-light'}`}>
                            <div className="card-body p-3">
                              <div className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  id={`appointment-${appointment.id}`}
                                  checked={selectedAppointments.includes(appointment.id)}
                                  onChange={() => handleAppointmentSelect(appointment.id)}
                                  disabled={loading}
                                />
                                <label className="form-check-label w-100" htmlFor={`appointment-${appointment.id}`}>
                                  <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                      <h6 className="mb-1">{appointment.customers?.full_name}</h6>
                                      <div className="d-flex gap-3 text-muted small">
                                        <span><i className="bi bi-clock me-1"></i>{formatTime(appointment.appointment_time)}</span>
                                        <span><i className="bi bi-currency-dollar me-1"></i>${appointment.total_price}</span>
                                        <span><i className="bi bi-tag me-1"></i>{appointment.appointment_type}</span>
                                      </div>
                                    </div>
                                    <span className={`badge ${
                                      appointment.status === 'scheduled' ? 'bg-primary' :
                                      appointment.status === 'confirmed' ? 'bg-success' : 'bg-warning'
                                    }`}>
                                      {appointment.status}
                                    </span>
                                  </div>
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Step 2: Confirm Cancellation */}
            {step === 2 && (
              <>
                <div className="text-center mb-4">
                  <h6 className="text-muted">Step 2 of 2</h6>
                  <h5>Confirm Cancellation</h5>
                </div>

                <div className="alert alert-warning">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  <strong>Warning:</strong> You are about to cancel {selectedAppointments.length} appointment{selectedAppointments.length !== 1 ? 's' : ''}. 
                  All customers will be notified automatically.
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">
                    <i className="bi bi-chat-text me-2"></i>
                    Cancellation Reason
                  </label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Please provide a reason for cancelling these appointments..."
                    disabled={loading}
                  />
                  <div className="form-text">This reason will be sent to all affected customers.</div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold">
                    <i className="bi bi-list-check me-2"></i>
                    Appointments to Cancel
                  </label>
                  <div className="list-group">
                    {getSelectedAppointmentsData().map((appointment) => (
                      <div key={appointment.id} className="list-group-item">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <h6 className="mb-1">{appointment.customers?.full_name}</h6>
                            <small className="text-muted">
                              {formatTime(appointment.appointment_time)} • ${appointment.total_price}
                            </small>
                          </div>
                          <span className="badge bg-danger">Will be cancelled</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* Footer */}
          <div className="modal-footer">
            {step === 1 ? (
              <>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleNext}
                  disabled={loading || selectedAppointments.length === 0}
                >
                  Next <i className="bi bi-arrow-right ms-1"></i>
                </button>
              </>
            ) : (
              <>
                <button 
                  type="button" 
                  className="btn btn-outline-secondary" 
                  onClick={handleBack}
                  disabled={loading}
                >
                  <i className="bi bi-arrow-left me-1"></i> Back
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger"
                  onClick={handleBulkCancel}
                  disabled={loading || !reason.trim()}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-x-circle me-2"></i>
                      Cancel {selectedAppointments.length} Appointment{selectedAppointments.length !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkCancellationModal;
