// components/barber/AppointmentRequestManager.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import BarberAvailabilityService from '../../services/booking/BarberAvailabilityService';

const AppointmentRequestManager = ({ user, userRole }) => {
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, pending_approval, approved, rejected
  const [availabilityStatus, setAvailabilityStatus] = useState({});

  useEffect(() => {
    fetchRequests();
  }, [user, userRole]);

  // Filter requests based on selected filter
  useEffect(() => {
    if (filter === 'all') {
      setFilteredRequests(requests);
    } else {
      setFilteredRequests(requests.filter(request => request.status === filter));
    }
  }, [requests, filter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('Fetching appointment requests for user:', user?.id, 'role:', userRole);

      // Fetch requests with joined appointment and customer details
      // Using a more robust query approach similar to the Basic version for name handling
      let query = supabase
        .from('appointment_requests')
        .select(`
          *,
          appointment:appointment_id(
            id,
            appointment_date,
            appointment_time,
            appointment_type,
            customer_id,
            barber_id,
            services_data,
            add_ons_data,
            notes,
            status,
            customer:customer_id(full_name, email)
          )
        `)
        .order('requested_at', { ascending: false });

      // Filter by user role - only barbers can see their own requests
      if (userRole === 'barber') {
        query = query.eq('barber_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      // Process names and data
      const processedRequests = (data || []).map(request => {
        let customerName = 'Unknown Customer';

        // Try multiple sources for customer name
        if (request.current_appointment_data?.customer_name) {
          customerName = request.current_appointment_data.customer_name;
        } else if (request.appointment?.customer?.full_name) {
          customerName = request.appointment.customer.full_name;
        } else if (request.appointment?.customer?.email) {
          customerName = request.appointment.customer.email;
        } else if (typeof request.customer_id === 'string' && request.customer_id.length >= 8) {
          customerName = `Customer ${request.customer_id.slice(-8)}`;
        }

        return {
          ...request,
          customerName
        };
      });

      setRequests(processedRequests);

      // Check availability for all pending requests
      await checkAvailabilityForAllRequests(processedRequests);
    } catch (err) {
      console.error('Error fetching requests:', err);
      setError(`Failed to load requests: ${err.message || 'Database connection error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Check availability for all requests
  const checkAvailabilityForAllRequests = async (requestsList) => {
    const availabilityMap = {};

    for (const request of requestsList) {
      if (request.appointment && request.status === 'pending_approval') {
        try {
          const availability = await BarberAvailabilityService.checkBarberAvailability(
            request.barber_id,
            request.appointment.appointment_date,
            request.appointment.appointment_time
          );
          availabilityMap[request.id] = availability;
        } catch (err) {
          console.error(`Error checking availability for request ${request.id}:`, err);
          availabilityMap[request.id] = { isAvailable: true, reason: 'Check failed' };
        }
      }
    }

    setAvailabilityStatus(availabilityMap);
  };

  const handleApproval = async (requestId, action, decision) => {
    try {
      const request = requests.find(r => r.id === requestId);
      if (!request) return;

      // Check barber availability before approving
      if (decision === 'approved' && request.appointment) {
        const availabilityCheck = await BarberAvailabilityService.checkBarberAvailability(
          request.barber_id,
          request.appointment.appointment_date,
          request.appointment.appointment_time
        );

        if (!availabilityCheck.isAvailable) {
          setError(`Cannot approve request: ${availabilityCheck.reason}`);
          return;
        }
      }

      const updateData = {
        status: decision,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_notes: action === 'approve' ? 'Request approved' : 'Request rejected'
      };

      // Update request status
      const { error: requestError } = await supabase
        .from('appointment_requests')
        .update(updateData)
        .eq('id', requestId);

      if (requestError) throw requestError;

      if (decision === 'approved') {
        if (request.action_type === 'cancel') {
          // Cancel the appointment
          const { error: cancelError } = await supabase
            .from('appointments')
            .update({
              status: 'cancelled',
              cancellation_reason: request.reason,
              updated_at: new Date().toISOString()
            })
            .eq('id', request.appointment_id);

          if (cancelError) throw cancelError;

          // Create notification
          try {
            const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
            await centralizedNotificationService.createNotification({
              userId: request.customer_id,
              title: 'Cancellation Approved ✅',
              message: 'Your request to cancel the appointment has been approved. We hope to see you again soon!',
              type: 'appointment',
              category: 'status_update',
              priority: 'high',
              channels: ['app', 'push'],
              appointmentId: request.appointment_id,
              data: {
                status: 'cancelled',
                changed_by: 'system',
                request_id: requestId,
                cancellation_type: 'customer_request_approved'
              }
            });
          } catch (notifError) {
            console.warn('Failed to send cancellation approval notification:', notifError);
          }

        } else if (request.action_type === 'reschedule') {
          // Send notification for reschedule
          try {
            const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
            await centralizedNotificationService.createNotification({
              userId: request.customer_id,
              title: 'Reschedule Approved ✅',
              message: 'Your reschedule request has been approved! You can now select a new time for your appointment.',
              type: 'appointment',
              category: 'status_update',
              priority: 'high',
              channels: ['app', 'push'],
              appointmentId: request.appointment_id,
              data: {
                request_id: requestId,
                reschedule_type: 'approved'
              }
            });
          } catch (notifError) {
            console.warn('Failed to send reschedule approval notification:', notifError);
          }
        }
      } else {
        // Request rejected
        try {
          const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
          const actionTypeLabel = request.action_type === 'reschedule' ? 'Reschedule' : 'Cancellation';
          await centralizedNotificationService.createNotification({
            userId: request.customer_id,
            title: `${actionTypeLabel} Request Declined ❌`,
            message: `Your ${request.action_type} request could not be processed at this time. Reason: ${action}`,
            type: 'appointment',
            category: 'status_update',
            priority: 'normal',
            channels: ['app', 'push'],
            appointmentId: request.appointment_id,
            data: {
              request_id: requestId,
              rejection_reason: action,
              request_type: request.action_type
            }
          });
        } catch (notifError) {
          console.warn('Failed to send request rejection notification:', notifError);
        }
      }

      // Add system log
      try {
        await supabase.from('system_logs').insert({
          user_id: user.id,
          action: `appointment_request_${decision}`,
          details: {
            request_id: requestId,
            appointment_id: request.appointment_id,
            action_type: request.action_type,
            decision: decision,
            reviewer_role: userRole
          }
        });
      } catch (logErr) {
        console.warn('Failed to create system log:', logErr);
      }

      // Refresh requests
      await fetchRequests();

    } catch (err) {
      console.error('Error handling approval:', err);
      setError(`Failed to ${action} request: ${err.message || 'Unknown error occurred'}`);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending_approval: 'bg-warning text-dark',
      approved: 'bg-success',
      rejected: 'bg-danger'
    };
    return badges[status] || 'bg-secondary';
  };

  const getActionIcon = (actionType) => {
    return actionType === 'reschedule' ? 'arrow-repeat' : 'x-circle';
  };

  // Function to format time
  const formatTime = (timeString) => {
    if (!timeString) return 'Queue Position';
    try {
      return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return timeString;
    }
  };

  // Function to format date
  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="container py-4">
        <div className="text-center py-4">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading appointment requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-3">
      {/* Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
            <div>
              <h2 className="mb-1">
                <i className="bi bi-clipboard-check me-2 text-primary"></i>
                Appointment Requests
              </h2>
              <p className="text-muted mb-0">Review and manage customer requests</p>
            </div>
            <button className="btn btn-outline-primary" onClick={fetchRequests}>
              <i className="bi bi-arrow-clockwise me-2"></i>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card border-0 bg-light">
            <div className="card-body p-3">
              <div className="d-flex flex-wrap gap-2">
                <button
                  className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setFilter('all')}
                >
                  <i className="bi bi-list-ul me-1"></i>
                  All ({requests.length})
                </button>
                <button
                  className={`btn btn-sm ${filter === 'pending_approval' ? 'btn-warning' : 'btn-outline-warning'}`}
                  onClick={() => setFilter('pending_approval')}
                >
                  <i className="bi bi-clock me-1"></i>
                  Pending ({requests.filter(r => r.status === 'pending_approval').length})
                </button>
                <button
                  className={`btn btn-sm ${filter === 'approved' ? 'btn-success' : 'btn-outline-success'}`}
                  onClick={() => setFilter('approved')}
                >
                  <i className="bi bi-check-circle me-1"></i>
                  Approved ({requests.filter(r => r.status === 'approved').length})
                </button>
                <button
                  className={`btn btn-sm ${filter === 'rejected' ? 'btn-danger' : 'btn-outline-danger'}`}
                  onClick={() => setFilter('rejected')}
                >
                  <i className="bi bi-x-circle me-1"></i>
                  Rejected ({requests.filter(r => r.status === 'rejected').length})
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="text-center py-5">
          <div className="card border-0 bg-light">
            <div className="card-body py-5">
              <i className="bi bi-inbox display-1 text-muted mb-3"></i>
              <h4 className="text-muted">No requests found</h4>
              <p className="text-muted">
                {filter === 'all'
                  ? (userRole === 'barber'
                    ? 'No appointment requests.'
                    : 'No appointment requests found.')
                  : `No ${filter.replace('_', ' ')} requests found.`
                }
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {filteredRequests.map((request) => (
            <div key={request.id} className="col-12 col-md-6 col-lg-4">
              <div className="card h-100 shadow-sm border-0">
                <div className="card-header bg-white border-bottom">
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center">
                      <div className={`p-2 rounded-circle me-3 ${request.action_type === 'reschedule' ? 'bg-warning bg-opacity-10' : 'bg-danger bg-opacity-10'}`}>
                        <i className={`bi bi-${getActionIcon(request.action_type)} ${request.action_type === 'reschedule' ? 'text-warning' : 'text-danger'}`}></i>
                      </div>
                      <div>
                        <h6 className="mb-0 text-capitalize">{request.action_type}</h6>
                        <small className="text-muted">Request #{request.id.slice(-8)}</small>
                      </div>
                    </div>
                    <span className={`badge ${getStatusBadge(request.status)}`}>
                      {request.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="card-body">
                  {/* Customer Info */}
                  <div className="mb-3">
                    <div className="d-flex align-items-center mb-2">
                      <i className="bi bi-person-circle text-primary me-2"></i>
                      <h6 className="mb-0">Customer</h6>
                    </div>
                    <p className="mb-0 fw-semibold">{request.customerName}</p>
                    <p className="mb-0 text-muted small">
                      ID: {request.customer_id}
                    </p>
                  </div>

                  {/* Availability Warning */}
                  {request.status === 'pending_approval' && availabilityStatus[request.id] && !availabilityStatus[request.id].isAvailable && (
                    <div className="mb-3">
                      <div className="alert alert-warning py-2 mb-0">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-exclamation-triangle me-2"></i>
                          <div>
                            <strong>Availability Issue:</strong>
                            <br />
                            <small>{availabilityStatus[request.id].reason}</small>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Appointment Details */}
                  {request.appointment && (
                    <div className="mb-3">
                      <div className="d-flex align-items-center mb-2">
                        <i className="bi bi-calendar-event text-primary me-2"></i>
                        <h6 className="mb-0">Appointment</h6>
                        {request.status === 'pending_approval' && availabilityStatus[request.id]?.isAvailable && (
                          <span className="badge bg-success ms-2">
                            <i className="bi bi-check-circle me-1"></i>
                            Available
                          </span>
                        )}
                      </div>
                      <div className="bg-light p-2 rounded">
                        <div className="row g-2 small">
                          <div className="col-6">
                            <strong>Date:</strong><br />
                            <span className="text-muted">{formatDate(request.appointment.appointment_date)}</span>
                          </div>
                          <div className="col-6">
                            <strong>Time:</strong><br />
                            <span className="text-muted">{formatTime(request.appointment.appointment_time)}</span>
                          </div>
                          <div className="col-12">
                            <strong>Type:</strong>
                            <span className={`badge ms-1 ${request.appointment.appointment_type === 'scheduled' ? 'bg-info' : 'bg-warning'}`}>
                              {request.appointment.appointment_type}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reason */}
                  <div className="mb-3">
                    <div className="d-flex align-items-center mb-2">
                      <i className="bi bi-chat-text text-primary me-2"></i>
                      <h6 className="mb-0">Reason</h6>
                    </div>
                    <p className="small bg-light p-2 rounded mb-0">{request.reason}</p>
                  </div>

                  {/* Timestamps */}
                  <div className="mb-3">
                    <div className="d-flex align-items-center mb-2">
                      <i className="bi bi-clock text-primary me-2"></i>
                      <h6 className="mb-0">Timeline</h6>
                    </div>
                    <div className="small text-muted">
                      <div>Requested: {new Date(request.requested_at).toLocaleString()}</div>
                      {request.reviewed_at && (
                        <div>Reviewed: {new Date(request.reviewed_at).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="card-footer bg-light border-0">
                  {request.status === 'pending_approval' ? (
                    <div className="d-flex gap-2">
                      <button
                        className={`btn btn-sm flex-fill ${availabilityStatus[request.id] && !availabilityStatus[request.id].isAvailable ? 'btn-outline-secondary' : 'btn-success'}`}
                        onClick={() => handleApproval(request.id, 'approve', 'approved')}
                        disabled={availabilityStatus[request.id] && !availabilityStatus[request.id].isAvailable}
                      >
                        <i className="bi bi-check-circle me-1"></i>
                        Approve
                      </button>
                      <button
                        className="btn btn-outline-danger btn-sm flex-fill"
                        onClick={() => handleApproval(request.id, 'reject', 'rejected')}
                      >
                        <i className="bi bi-x-circle me-1"></i>
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="d-flex align-items-center justify-content-center">
                        <i className={`bi bi-${request.status === 'approved' ? 'check-circle text-success' : 'x-circle text-danger'} me-2`}></i>
                        <small className="text-muted">
                          {request.status === 'approved' ? 'Approved' : 'Rejected'} by {userRole} on {new Date(request.reviewed_at).toLocaleDateString()}
                        </small>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AppointmentRequestManager;
