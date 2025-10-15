// components/barber/AppointmentRequestManager.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/PushService';

const AppointmentRequestManager = ({ user, userRole }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, pending, approved, rejected

  useEffect(() => {
    fetchRequests();
  }, [user, userRole]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      
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
            services,
            add_ons,
            notes
          )
        `)
        .order('requested_at', { ascending: false });

      // Filter by user role - only barbers can see their own requests
      if (userRole === 'barber') {
        query = query.eq('barber_id', user.id);
      }
      // Note: Manager role removed since user_profiles table doesn't exist

      const { data, error } = await query;

      console.log('Appointment requests query result:', { data, error });

      if (error) {
        console.error('Database error:', error);
        throw error;
      }
      
      setRequests(data || []);
    } catch (err) {
      console.error('Error fetching requests:', err);
      setError(`Failed to load requests: ${err.message || 'Database connection error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (requestId, action, decision) => {
    try {
      const request = requests.find(r => r.id === requestId);
      if (!request) return;

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

          // Send database notification to customer (fallback)
          await supabase.from('notifications').insert({
            user_id: request.customer_id,
            title: 'Appointment Cancelled',
            message: 'Your appointment cancellation request has been approved.',
            type: 'appointment_cancelled_approved',
            data: {
              appointment_id: request.appointment_id,
              request_id: requestId
            }
          });

          // Send push notification to customer
          try {
            await PushService.sendNotificationToUser(
              request.customer_id,
              'Appointment Cancelled ❌',
              'Your appointment cancellation request has been approved.',
              {
                type: 'appointment_cancelled_approved',
                appointment_id: request.appointment_id,
                request_id: requestId
              }
            );
            console.log('✅ Cancellation approval notification sent via PushService');
          } catch (pushError) {
            console.warn('Failed to send cancellation approval notification:', pushError);
          }

        } else if (request.action_type === 'reschedule') {
          // For reschedule, we need to wait for customer to select new time
          // Send database notification to customer (fallback)
          await supabase.from('notifications').insert({
            user_id: request.customer_id,
            title: 'Reschedule Request Approved',
            message: 'Your reschedule request has been approved. Please select a new date and time.',
            type: 'appointment_reschedule_approved',
            data: {
              appointment_id: request.appointment_id,
              request_id: requestId
            }
          });

          // Send push notification to customer
          try {
            await PushService.sendNotificationToUser(
              request.customer_id,
              'Reschedule Request Approved ✅',
              'Your reschedule request has been approved. Please select a new date and time.',
              {
                type: 'appointment_reschedule_approved',
                appointment_id: request.appointment_id,
                request_id: requestId
              }
            );
            console.log('✅ Reschedule approval notification sent via PushService');
          } catch (pushError) {
            console.warn('Failed to send reschedule approval notification:', pushError);
          }
        }
      } else {
        // Request rejected
        // Send database notification to customer (fallback)
        await supabase.from('notifications').insert({
          user_id: request.customer_id,
          title: `${request.action_type === 'reschedule' ? 'Reschedule' : 'Cancellation'} Request Rejected`,
          message: `Your ${request.action_type} request has been rejected. Reason: ${action}`,
          type: `appointment_${request.action_type}_rejected`,
          data: {
            appointment_id: request.appointment_id,
            request_id: requestId
          }
        });

        // Send push notification to customer
        try {
          await PushService.sendNotificationToUser(
            request.customer_id,
            `${request.action_type === 'reschedule' ? 'Reschedule' : 'Cancellation'} Request Rejected ❌`,
            `Your ${request.action_type} request has been rejected. Reason: ${action}`,
            {
              type: `appointment_${request.action_type}_rejected`,
              appointment_id: request.appointment_id,
              request_id: requestId
            }
          );
          console.log('✅ Request rejection notification sent via PushService');
        } catch (pushError) {
          console.warn('Failed to send request rejection notification:', pushError);
        }
      }

      // Add system log
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

      // Refresh requests
      await fetchRequests();

    } catch (err) {
      console.error('Error handling approval:', err);
      setError(`Failed to ${action} request: ${err.message || 'Unknown error occurred'}`);
    }
  };

  const filteredRequests = requests.filter(request => {
    if (filter === 'all') return true;
    return request.status === filter;
  });

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

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Appointment Requests</h2>
        <div className="btn-group" role="group">
          <input
            type="radio"
            className="btn-check"
            name="filter"
            id="all"
            checked={filter === 'all'}
            onChange={() => setFilter('all')}
          />
          <label className="btn btn-outline-primary" htmlFor="all">All</label>

          <input
            type="radio"
            className="btn-check"
            name="filter"
            id="pending"
            checked={filter === 'pending_approval'}
            onChange={() => setFilter('pending_approval')}
          />
          <label className="btn btn-outline-warning" htmlFor="pending">Pending</label>

          <input
            type="radio"
            className="btn-check"
            name="filter"
            id="approved"
            checked={filter === 'approved'}
            onChange={() => setFilter('approved')}
          />
          <label className="btn btn-outline-success" htmlFor="approved">Approved</label>

          <input
            type="radio"
            className="btn-check"
            name="filter"
            id="rejected"
            checked={filter === 'rejected'}
            onChange={() => setFilter('rejected')}
          />
          <label className="btn btn-outline-danger" htmlFor="rejected">Rejected</label>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}

      {filteredRequests.length === 0 ? (
        <div className="text-center py-5">
          <i className="bi bi-inbox display-1 text-muted"></i>
          <h4 className="text-muted mt-3">No requests found</h4>
          <p className="text-muted">No appointment requests match your current filter.</p>
        </div>
      ) : (
        <div className="row">
          {filteredRequests.map((request) => (
            <div key={request.id} className="col-md-6 col-lg-4 mb-4">
              <div className="card h-100">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center">
                    <i className={`bi bi-${getActionIcon(request.action_type)} me-2`}></i>
                    <strong className="text-capitalize">{request.action_type}</strong>
                  </div>
                  <span className={`badge ${getStatusBadge(request.status)}`}>
                    {request.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="card-body">
                  <div className="mb-3">
                    <h6>Customer ID:</h6>
                    <p className="mb-1">
                      {request.appointment?.customer_id || 'Unknown Customer'}
                    </p>
                  </div>

                  <div className="mb-3">
                    <h6>Appointment Details:</h6>
                    <div className="small text-muted">
                      <div><strong>Date:</strong> {new Date(request.appointment?.appointment_date).toLocaleDateString()}</div>
                      <div><strong>Time:</strong> {request.appointment?.appointment_time || 'Queue'}</div>
                      <div><strong>Type:</strong> {request.appointment?.appointment_type || 'N/A'}</div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <h6>Reason:</h6>
                    <p className="small bg-light p-2 rounded">{request.reason}</p>
                  </div>

                  <div className="mb-3">
                    <h6>Requested:</h6>
                    <small className="text-muted">
                      {new Date(request.requested_at).toLocaleString()}
                    </small>
                  </div>

                  {request.reviewed_at && (
                    <div className="mb-3">
                      <h6>Reviewed:</h6>
                      <small className="text-muted">
                        {new Date(request.reviewed_at).toLocaleString()}
                      </small>
                    </div>
                  )}
                </div>

                <div className="card-footer">
                  {request.status === 'pending_approval' ? (
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-success btn-sm flex-fill"
                        onClick={() => handleApproval(request.id, 'approve', 'approved')}
                      >
                        <i className="bi bi-check me-1"></i>
                        Approve
                      </button>
                      <button
                        className="btn btn-danger btn-sm flex-fill"
                        onClick={() => handleApproval(request.id, 'reject', 'rejected')}
                      >
                        <i className="bi bi-x me-1"></i>
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <small className="text-muted">
                        Reviewed by {userRole} on {new Date(request.reviewed_at).toLocaleDateString()}
                      </small>
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
