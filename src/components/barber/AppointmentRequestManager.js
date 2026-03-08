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
  const [typeFilter, setTypeFilter] = useState('all'); // all, new_booking, change (reschedule/cancel)
  const [availabilityStatus, setAvailabilityStatus] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchRequests();

    // Set up real-time subscription
    if (user?.id) {
      const channel = supabase
        .channel('appointment-requests-changes')
        .on('postgres_changes',
          { event: '*', table: 'appointment_requests', filter: userRole === 'barber' ? `barber_id=eq.${user.id}` : undefined },
          () => fetchRequests()
        )
        .on('postgres_changes',
          { event: '*', table: 'appointments', filter: userRole === 'barber' ? `barber_id=eq.${user.id}` : undefined },
          () => fetchRequests()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, userRole]);

  // Filter requests based on selected filter and type filter
  useEffect(() => {
    let filtered = [...requests];

    // Apply Status Filter
    if (filter !== 'all') {
      filtered = filtered.filter(request => request.status === filter);
    }

    // Apply Type Filter
    if (typeFilter !== 'all') {
      if (typeFilter === 'new_booking') {
        filtered = filtered.filter(request => request.action_type === 'new_booking');
      } else if (typeFilter === 'change') {
        filtered = filtered.filter(request => ['reschedule', 'cancel'].includes(request.action_type));
      }
    }

    setFilteredRequests(filtered);
  }, [requests, filter, typeFilter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError('');

      // 1. Fetch from appointment_requests table (Cancellations/Reschedules)
      let requestsQuery = supabase
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
            queue_position,
            customer:customer_id(full_name, email)
          )
        `)
        .order('requested_at', { ascending: false });

      if (userRole === 'barber') {
        requestsQuery = requestsQuery.eq('barber_id', user.id);
      }

      const { data: requestData, error: requestError } = await requestsQuery;

      if (requestError) {
        console.error('Error fetching appointment_requests:', requestError);
      }

      // 2. Fetch from appointments table where status is pending (New Bookings)
      let pendingQuery = supabase
        .from('appointments')
        .select(`
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
          queue_position,
          created_at,
          customer:customer_id(full_name, email)
        `)
        .eq('status', 'pending');

      if (userRole === 'barber') {
        pendingQuery = pendingQuery.eq('barber_id', user.id);
      }

      const { data: pendingData, error: pendingError } = await pendingQuery;

      if (pendingError) {
        console.error('Error fetching pending appointments:', pendingError);
      }

      // 3. Unify and Process data
      const unified = [
        ...(requestData || []).map(r => ({
          ...r,
          isRequestTable: true,
          type: r.action_type || 'request'
        })),
        ...(pendingData || []).map(p => ({
          id: `apt-${p.id}`,
          appointment_id: p.id,
          customer_id: p.customer_id,
          barber_id: p.barber_id,
          status: 'pending_approval',
          requested_at: p.created_at,
          action_type: 'new_booking',
          reason: 'New booking request',
          appointment: p,
          isRequestTable: false,
          type: 'new_booking'
        }))
      ].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));

      const processedRequests = unified.map(request => {
        let customerName = 'Unknown Customer';

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
      console.error('Error in fetchRequests:', err);
      setError(`Failed to load requests: ${err.message || 'Database connection error'}`);
    } finally {
      setLoading(false);
    }
  };

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

      if (request.isRequestTable) {
        const updateData = {
          status: decision,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: action === 'approve' ? 'Request approved' : 'Request rejected'
        };

        const { error: requestError } = await supabase
          .from('appointment_requests')
          .update(updateData)
          .eq('id', requestId);

        if (requestError) throw requestError;

        if (decision === 'approved' && request.action_type === 'cancel') {
          const { error: cancelError } = await supabase
            .from('appointments')
            .update({
              status: 'cancelled',
              cancellation_reason: request.reason,
              updated_at: new Date().toISOString()
            })
            .eq('id', request.appointment_id);
          if (cancelError) throw cancelError;
        }
      } else {
        const { error: aptError } = await supabase
          .from('appointments')
          .update({
            status: decision === 'approved' ? 'confirmed' : 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', request.appointment_id);

        if (aptError) throw aptError;
      }

      await fetchRequests();
    } catch (err) {
      console.error('Error handling approval:', err);
      setError(`Failed to ${action} request: ${err.message || 'Unknown error occurred'}`);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending_approval: 'bg-warning text-dark',
      pending: 'bg-warning text-dark',
      approved: 'bg-primary',
      confirmed: 'bg-primary',
      scheduled: 'bg-primary',
      rejected: 'bg-danger',
      cancelled: 'bg-danger'
    };
    return badges[status] || 'bg-secondary';
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'reschedule': return 'arrow-repeat';
      case 'cancel': return 'x-circle';
      case 'new_booking': return 'plus-circle';
      default: return 'bell';
    }
  };

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchRequests();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="container-fluid py-4 px-md-4">
      {/* Header */}
      <div className="row mb-3 align-items-center">
        <div className="col-12">
          <div className="d-flex flex-row justify-content-between align-items-center bg-white p-3 p-md-4 shadow-sm" style={{ borderRadius: '20px', border: '1px solid rgba(0,0,0,0.05)' }}>
            <div className="d-flex align-items-center">
              <div className="bg-primary bg-opacity-10 p-3 rounded-4 me-3 d-none d-sm-flex align-items-center justify-content-center" style={{ width: '60px', height: '60px' }}>
                <i className="bi bi-clipboard-check fs-2 text-primary"></i>
              </div>
              <div>
                <h2 className="mb-1 h4 fw-bold text-dark d-flex align-items-center">
                  <i className="bi bi-clipboard-check text-primary me-2 d-sm-none"></i>
                  Appointment Requests
                </h2>
                <p className="text-muted mb-0 small fw-medium d-none d-md-block">Action Center • Review, Approve, or Decline</p>
                <p className="text-muted mb-0 x-small fw-medium d-md-none">Review & Manage</p>
              </div>
            </div>

            <button
              className={`btn ${isRefreshing || loading ? 'btn-light' : 'btn-primary'} rounded-pill px-3 px-md-4 d-flex align-items-center shadow-sm transition-all`}
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
              style={{ height: '45px', fontWeight: '600' }}
            >
              <i className={`bi bi-arrow-clockwise me-md-2 ${isRefreshing || loading ? 'rotate-animation' : ''}`} style={{ fontSize: '1.2rem' }}></i>
              <span className="d-none d-md-inline">{isRefreshing || loading ? 'Syncing...' : 'Refresh Sync'}</span>
              <span className="d-md-none">{isRefreshing || loading ? '...' : 'Sync'}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger border-0 shadow-sm mb-4" style={{ borderRadius: '15px' }}>
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}

      {loading && requests.length === 0 && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary mb-2" role="status"></div>
          <p className="text-muted small">Fetching latest requests...</p>
        </div>
      )}

      {/* Smart Filter Bar */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex flex-wrap align-items-center gap-3 bg-white p-3 shadow-sm" style={{ borderRadius: '15px' }}>
            <div className="dropdown">
              <button
                className="btn btn-light border-0 px-3 rounded-pill dropdown-toggle fw-bold"
                type="button"
                data-bs-toggle="dropdown"
                style={{ background: '#f8f9fa' }}
              >
                <i className={`bi bi-${typeFilter === 'new_booking' ? 'plus-circle text-success' : typeFilter === 'change' ? 'arrow-repeat text-warning' : 'funnel'} me-2`}></i>
                {typeFilter === 'all' ? 'All Requests' : typeFilter === 'new_booking' ? 'New Bookings' : 'Changes'}
              </button>
              <ul className="dropdown-menu border-0 shadow-lg p-2" style={{ borderRadius: '12px' }}>
                <li><button className="dropdown-item rounded-3 mb-1" onClick={() => setTypeFilter('all')}>All Requests</button></li>
                <li><button className="dropdown-item rounded-3 mb-1" onClick={() => setTypeFilter('new_booking')}>New Bookings</button></li>
                <li><button className="dropdown-item rounded-3" onClick={() => setTypeFilter('change')}>Schedule Changes</button></li>
              </ul>
            </div>

            <div className="d-flex gap-2 ms-md-auto overflow-auto pb-1 no-scrollbar">
              {['all', 'pending_approval', 'approved'].map((s) => (
                <button
                  key={s}
                  className={`btn btn-sm px-3 rounded-pill fw-semibold transition-all ${filter === s ? 'btn-dark' : 'btn-outline-secondary border-0 text-muted'}`}
                  onClick={() => setFilter(s)}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {s === 'all' ? 'All' : s === 'pending_approval' ? 'Pending' : 'Completed'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="text-center py-5">
          <div className="card border-0 bg-light" style={{ borderRadius: '20px' }}>
            <div className="card-body py-5">
              <i className="bi bi-inbox display-1 text-muted mb-3 opacity-25"></i>
              <h4 className="text-muted fw-bold">No requests found</h4>
              <p className="text-muted small">Your action center is clear!</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {filteredRequests.map((request) => (
            <div key={request.id} className="col-12 col-md-6 col-lg-4">
              <div className="card h-100 shadow-sm border-0" style={{ borderRadius: '20px', overflow: 'hidden' }}>
                <div className="card-body p-4">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <span className={`badge rounded-pill mb-2 ${request.action_type === 'new_booking' ? 'bg-success bg-opacity-10 text-success' :
                        request.action_type === 'reschedule' ? 'bg-warning bg-opacity-10 text-warning-emphasis' :
                          'bg-danger bg-opacity-10 text-danger'
                        }`}>
                        <i className={`bi bi-${getActionIcon(request.action_type)} me-1`}></i>
                        {request.action_type === 'new_booking' ? 'New Booking' : request.action_type === 'reschedule' ? 'Reschedule' : 'Cancel'}
                      </span>
                      <h4 className="mb-0 fw-bold text-dark" style={{ letterSpacing: '-0.5px' }}>{request.customerName}</h4>
                      <small className="text-muted">Requested {new Date(request.requested_at).toLocaleDateString() === new Date().toLocaleDateString() ? 'Today' : formatDate(request.requested_at)}</small>
                    </div>
                    <span className={`badge rounded-pill px-3 py-2 ${getStatusBadge(request.status)} text-capitalize`} style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                      {request.status.replace('_', ' ')}
                    </span>
                  </div>

                  {request.appointment && (
                    <div className="bg-light p-3 rounded-4 mb-3 border-0">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="d-flex align-items-center text-dark">
                          <i className={`bi bi-${request.appointment.appointment_type === 'queue' ? 'hash' : 'calendar4-event'} text-primary me-2`}></i>
                          <span className={`fw-bold ${request.appointment.appointment_type === 'queue' ? 'bg-primary bg-opacity-10 px-2 py-1 rounded-3 text-primary' : ''}`}>
                            {request.appointment.appointment_type === 'queue'
                              ? `Queue ${request.appointment.queue_position || '?'}`
                              : formatDate(request.appointment.appointment_date)}
                          </span>
                        </div>
                        <span className="fw-bold text-primary">
                          {request.appointment.appointment_type !== 'queue' && formatTime(request.appointment.appointment_time)}
                        </span>
                      </div>
                      <div className="d-flex align-items-center justify-content-between small text-muted">
                        <span className="text-capitalize"><i className="bi bi-scissors me-1"></i> {request.appointment.appointment_type}</span>
                        {request.status === 'pending_approval' && availabilityStatus[request.id]?.isAvailable && (
                          <span className="text-success fw-bold small"><i className="bi bi-patch-check-fill me-1"></i> Available</span>
                        )}
                      </div>
                    </div>
                  )}

                  {(request.reason && request.action_type !== 'new_booking') && (
                    <div className="mb-3 p-3 rounded-3 border-start border-3 border-primary bg-light bg-opacity-50 small" style={{ fontStyle: 'italic', color: '#4b5563' }}>
                      <div className="text-muted fw-bold mb-1" style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>Reason</div>
                      "{request.reason}"
                    </div>
                  )}

                  {request.appointment?.notes && (
                    <div className="mb-3 p-3 rounded-4 bg-light border-0 small">
                      <div className="text-muted fw-bold mb-1" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <i className="bi bi-chat-left-text me-1"></i> Customer Note
                      </div>
                      <div className="text-dark">"{request.appointment.notes}"</div>
                    </div>
                  )}

                  {request.status === 'pending_approval' && availabilityStatus[request.id] && !availabilityStatus[request.id].isAvailable && (
                    <div className="alert alert-danger py-2 px-3 mb-3 border-0 small d-flex align-items-center" style={{ borderRadius: '12px' }}>
                      <i className="bi bi-exclamation-octagon-fill me-2 fs-5"></i>
                      <span>{availabilityStatus[request.id].reason}</span>
                    </div>
                  )}

                  {request.status === 'pending_approval' ? (
                    <div className="d-flex gap-2 mt-4">
                      <button
                        className="btn btn-success flex-fill rounded-pill py-2 fw-bold shadow-sm"
                        onClick={() => handleApproval(request.id, 'approve', 'approved')}
                        disabled={availabilityStatus[request.id] && !availabilityStatus[request.id].isAvailable}
                        style={{ fontSize: '0.9rem' }}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-outline-danger flex-fill rounded-pill py-2 fw-bold"
                        onClick={() => handleApproval(request.id, 'reject', 'rejected')}
                        style={{ fontSize: '0.9rem' }}
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-2 mt-3 bg-light rounded-pill opacity-75">
                      <small className="text-muted fw-bold text-capitalize" style={{ fontSize: '0.7rem' }}>
                        {request.status === 'approved' ? '✓ Approved' : '✕ Declined'}
                        <span className="mx-2 opacity-50">|</span>
                        {new Date(request.reviewed_at).toLocaleDateString()}
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
