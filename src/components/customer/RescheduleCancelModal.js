// components/customer/RescheduleCancelModal.js
import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';

const RescheduleCancelModal = ({ 
  isOpen, 
  onClose, 
  appointment, 
  action, // 'reschedule' or 'cancel'
  onSuccess 
}) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for your request.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Resolve reliable customer name
      let resolvedCustomerName = appointment.customer?.full_name || '';
      if (!resolvedCustomerName) {
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          resolvedCustomerName = authUser?.user_metadata?.full_name || authUser?.email || '';
        } catch (_) {
          // ignore auth fetch errors
        }
      }
      if (!resolvedCustomerName) {
        try {
          const { data: userRow } = await supabase
            .from('users')
            .select('full_name, email')
            .eq('id', appointment.customer_id)
            .single();
          resolvedCustomerName = userRow?.full_name || userRow?.email || '';
        } catch (_) {
          // ignore user fetch errors
        }
      }
      if (!resolvedCustomerName) {
        resolvedCustomerName = `Customer ${String(appointment.customer_id || '').slice(-8)}`;
      }

      const requestData = {
        appointment_id: appointment.id,
        customer_id: appointment.customer_id,
        barber_id: appointment.barber_id,
        action_type: action,
        reason: reason.trim(),
        status: 'pending_approval',
        requested_at: new Date().toISOString(),
        current_appointment_data: {
          appointment_date: appointment.appointment_date,
          appointment_time: appointment.appointment_time,
          appointment_type: appointment.appointment_type,
          services: appointment.services,
          add_ons: appointment.add_ons,
          notes: appointment.notes,
          customer_name: resolvedCustomerName
        }
      };

      // Insert reschedule/cancel request
      const { data: request, error: requestError } = await supabase
        .from('appointment_requests')
        .insert([requestData])
        .select()
        .single();

      if (requestError) throw requestError;

      // Send notification to barber (database + push) via CentralizedNotificationService
      const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
      await centralizedNotificationService.createNotification({
        userId: appointment.barber_id,
        title: `Appointment ${action === 'reschedule' ? 'Reschedule' : 'Cancellation'} Request`,
        message: `${resolvedCustomerName} has requested to ${action} their appointment. Reason: ${reason}`,
        type: `appointment_${action}_request`,
        category: 'request',
        priority: 'high',
        channels: ['app', 'push'],
        data: {
          request_id: request.id,
          appointment_id: appointment.id,
          customer_name: resolvedCustomerName,
          reason: reason,
          action_type: action
        },
        appointmentId: appointment.id
      });

      // Note: Manager notifications removed since user_profiles table doesn't exist
      // You can add manager notifications later when you have a proper user role system

      // Add system log
      await supabase.from('system_logs').insert({
        user_id: appointment.customer_id,
        action: `appointment_${action}_requested`,
        details: {
          appointment_id: appointment.id,
          request_id: request.id,
          reason: reason,
          action_type: action
        }
      });

      onSuccess(request);
      onClose();

    } catch (err) {
      console.error(`Error submitting ${action} request:`, err);
      setError(`Failed to submit ${action} request. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className={`bi bi-${action === 'reschedule' ? 'arrow-repeat' : 'x-circle'} me-2`}></i>
              {action === 'reschedule' ? 'Reschedule' : 'Cancel'} Appointment
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
                          <i className="bi bi-clock text-primary me-2"></i>
                          <div>
                            <small className="text-muted d-block">Time</small>
                            <strong>
                              {appointment.appointment_time 
                                ? new Date(`2000-01-01T${appointment.appointment_time}`).toLocaleTimeString('en-US', { 
                                    hour: 'numeric', 
                                    minute: '2-digit',
                                    hour12: true 
                                  })
                                : 'Queue Position'
                              }
                            </strong>
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-sm-6">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-person-badge text-primary me-2"></i>
                          <div>
                            <small className="text-muted d-block">Barber</small>
                            <strong>{appointment.barber?.full_name || 'N/A'}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-sm-6">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-tag text-primary me-2"></i>
                          <div>
                            <small className="text-muted d-block">Type</small>
                            <span className={`badge ${appointment.appointment_type === 'scheduled' ? 'bg-info' : 'bg-warning'}`}>
                              {appointment.appointment_type === 'scheduled' ? 'Scheduled' : 'Queue'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="reason" className="form-label fw-semibold">
                  <i className="bi bi-chat-text me-2"></i>
                  Reason for {action === 'reschedule' ? 'Rescheduling' : 'Cancellation'} *
                </label>
                <textarea
                  id="reason"
                  className="form-control border-2"
                  rows="4"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={`Please explain why you need to ${action} this appointment...`}
                  required
                  disabled={loading}
                  style={{ resize: 'vertical' }}
                />
                <div className="form-text mt-2">
                  <i className="bi bi-info-circle me-1"></i>
                  Your request will be sent to the barber for approval.
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
                  className={`btn ${action === 'reschedule' ? 'btn-warning' : 'btn-danger'} flex-fill`}
                  disabled={loading || !reason.trim()}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <i className={`bi bi-${action === 'reschedule' ? 'arrow-repeat' : 'x-circle'} me-2`}></i>
                      Submit Request
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

export default RescheduleCancelModal;
