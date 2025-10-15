// components/manager/QueueManagementPanel.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import ComprehensiveQueueManager from '../../services/ComprehensiveQueueManager';
import LoadingSpinner from '../common/LoadingSpinner';

const QueueManagementPanel = () => {
  const [queueData, setQueueData] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddToQueue, setShowAddToQueue] = useState(null); // For scheduled appointments
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerHistory, setCustomerHistory] = useState([]);

  // Fetch barbers
  useEffect(() => {
    fetchBarbers();
  }, []);

  // Fetch queue when barber or date changes
  useEffect(() => {
    if (selectedBarber && selectedDate) {
      fetchQueue();
    }
  }, [selectedBarber, selectedDate]);

  const fetchBarbers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'barber')
        .order('full_name');

      if (error) throw error;
      setBarbers(data || []);
      if (data && data.length > 0) {
        setSelectedBarber(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching barbers:', err);
    }
  };

  const fetchQueue = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch all appointments for the date (both queue and scheduled)
      const { data: allAppointments, error: allError } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, phone, email),
          service:service_id(id, name, duration, price)
        `)
        .eq('barber_id', selectedBarber)
        .eq('appointment_date', selectedDate)
        .in('status', ['scheduled', 'pending', 'ongoing'])
        .order('queue_position', { ascending: true, nullsLast: true });

      if (allError) throw allError;

      // Separate queue and scheduled appointments
      const queueAppointments = allAppointments?.filter(apt => 
        apt.queue_position !== null && apt.appointment_type === 'queue'
      ) || [];

      const scheduledAppointments = allAppointments?.filter(apt => 
        apt.queue_position === null && apt.appointment_type === 'scheduled'
      ) || [];

      setQueueData({
        queue: queueAppointments,
        scheduled: scheduledAppointments,
        total: allAppointments?.length || 0
      });

    } catch (err) {
      console.error('Error fetching queue:', err);
      setError('Failed to load queue data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddScheduledToQueue = async (appointmentId, isUrgent) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const result = await ComprehensiveQueueManager.addScheduledToQueue(
        appointmentId,
        selectedBarber,
        isUrgent
      );

      if (result.success) {
        setSuccess(result.message);
        setShowAddToQueue(null);
        await fetchQueue();
      }

    } catch (err) {
      console.error('Error adding to queue:', err);
      setError(err.message || 'Failed to add to queue');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePosition = async (appointmentId, newPosition) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const result = await ComprehensiveQueueManager.changeQueuePosition(
        appointmentId,
        newPosition
      );

      if (result.success) {
        setSuccess(result.message);
        await fetchQueue();
      }

    } catch (err) {
      console.error('Error changing position:', err);
      setError(err.message || 'Failed to change position');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePriority = async (appointmentId, priority) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const result = await ComprehensiveQueueManager.changePriority(
        appointmentId,
        priority
      );

      if (result.success) {
        setSuccess(`Priority changed to ${priority}`);
        await fetchQueue();
      }

    } catch (err) {
      console.error('Error changing priority:', err);
      setError(err.message || 'Failed to change priority');
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadgeColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'danger';
      case 'high': return 'warning';
      case 'normal': return 'primary';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'ongoing': return 'success';
      case 'scheduled': return 'primary';
      case 'pending': return 'warning';
      default: return 'secondary';
    }
  };

  // Enhanced customer management functions
  const handleShowCustomerDetails = async (appointment) => {
    try {
      setSelectedCustomer(appointment);
      setLoading(true);
      
      // Fetch customer history
      const { data: history, error } = await supabase
        .from('appointments')
        .select(`
          *,
          service:service_id(name, duration),
          barber:barber_id(full_name)
        `)
        .eq('customer_id', appointment.customer_id)
        .order('appointment_date', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      setCustomerHistory(history || []);
      setShowCustomerDetails(true);
    } catch (err) {
      console.error('Error fetching customer history:', err);
      setError('Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseCustomerDetails = () => {
    setShowCustomerDetails(false);
    setSelectedCustomer(null);
    setCustomerHistory([]);
  };

  return (
    <div className="container-fluid p-4">
      <div className="row mb-4">
        <div className="col-12">
          <h2 className="mb-3">
            <i className="bi bi-list-ol me-2"></i>
            Queue Management
          </h2>
        </div>
      </div>

      {/* Filters */}
      <div className="row mb-4">
        <div className="col-md-6 mb-3">
          <label className="form-label fw-bold">Select Barber</label>
          <select
            className="form-select"
            value={selectedBarber}
            onChange={(e) => setSelectedBarber(e.target.value)}
          >
            <option value="">Choose a barber...</option>
            {barbers.map(barber => (
              <option key={barber.id} value={barber.id}>
                {barber.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-md-6 mb-3">
          <label className="form-label fw-bold">Select Date</label>
          <input
            type="date"
            className="form-control"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError('')}></button>
        </div>
      )}

      {success && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          {success}
          <button type="button" className="btn-close" onClick={() => setSuccess('')}></button>
        </div>
      )}

      {loading && <LoadingSpinner />}

      {!loading && queueData && (
        <div className="row">
          {/* Current Queue */}
          <div className="col-lg-8 mb-4">
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">
                  <i className="bi bi-people-fill me-2"></i>
                  Current Queue ({queueData.queue?.length || 0})
                </h5>
              </div>
              <div className="card-body">
                {queueData.queue && queueData.queue.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead>
                        <tr>
                          <th style={{width: '80px'}}>Position</th>
                          <th>Customer</th>
                          <th>Service</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Wait Time</th>
                          <th style={{width: '200px'}}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queueData.queue.map((appointment) => (
                          <tr key={appointment.id} className={appointment.status === 'ongoing' ? 'table-success' : ''}>
                            <td>
                              <div className="input-group input-group-sm" style={{width: '70px'}}>
                                <input
                                  type="number"
                                  className="form-control"
                                  value={appointment.queue_position}
                                  min="1"
                                  max={queueData.queue.length}
                                  onChange={(e) => {
                                    const newPos = parseInt(e.target.value);
                                    if (newPos > 0 && newPos <= queueData.queue.length) {
                                      handleChangePosition(appointment.id, newPos);
                                    }
                                  }}
                                />
                              </div>
                            </td>
                            <td>
                              <div className="fw-bold">{appointment.customer?.full_name || 'Unknown'}</div>
                              <small className="text-muted">{appointment.customer?.phone}</small>
                              {appointment.is_walk_in && (
                                <span className="badge bg-info ms-2">Walk-in</span>
                              )}
                              {appointment.is_double_booking && (
                                <span className="badge bg-secondary ms-2">Friend</span>
                              )}
                              <div className="mt-1">
                                <button
                                  className="btn btn-sm btn-outline-info"
                                  onClick={() => handleShowCustomerDetails(appointment)}
                                  title="View customer details and history"
                                >
                                  <i className="bi bi-person-lines-fill me-1"></i>
                                  Details
                                </button>
                              </div>
                            </td>
                            <td>
                              {appointment.service?.name || 'N/A'}
                              <br />
                              <small className="text-muted">{appointment.service?.duration} min</small>
                            </td>
                            <td>
                              <select
                                className={`form-select form-select-sm badge bg-${getPriorityBadgeColor(appointment.priority_level)}`}
                                value={appointment.priority_level || 'normal'}
                                onChange={(e) => handleChangePriority(appointment.id, e.target.value)}
                                style={{border: 'none', color: 'white'}}
                              >
                                <option value="urgent">Urgent</option>
                                <option value="high">High</option>
                                <option value="normal">Normal</option>
                                <option value="low">Low</option>
                              </select>
                            </td>
                            <td>
                              <span className={`badge bg-${getStatusBadgeColor(appointment.status)}`}>
                                {appointment.status}
                              </span>
                            </td>
                            <td>
                              {appointment.estimated_wait_time !== null 
                                ? `${appointment.estimated_wait_time} min` 
                                : 'Calculating...'}
                            </td>
                            <td>
                              <div className="btn-group btn-group-sm" role="group">
                                <button
                                  className="btn btn-outline-primary"
                                  onClick={() => handleChangePosition(appointment.id, 1)}
                                  disabled={appointment.queue_position === 1}
                                  title="Move to front"
                                >
                                  <i className="bi bi-arrow-up"></i>
                                </button>
                                <button
                                  className="btn btn-outline-primary"
                                  onClick={() => handleChangePosition(appointment.id, queueData.queue.length)}
                                  disabled={appointment.queue_position === queueData.queue.length}
                                  title="Move to back"
                                >
                                  <i className="bi bi-arrow-down"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center text-muted py-4">
                    <i className="bi bi-inbox" style={{fontSize: '3rem'}}></i>
                    <p className="mt-2">No customers in queue</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Scheduled Appointments (Not in Queue) */}
          <div className="col-lg-4 mb-4">
            <div className="card">
              <div className="card-header bg-secondary text-white">
                <h5 className="mb-0">
                  <i className="bi bi-calendar-check me-2"></i>
                  Scheduled ({queueData.scheduled?.length || 0})
                </h5>
              </div>
              <div className="card-body">
                {queueData.scheduled && queueData.scheduled.length > 0 ? (
                  <div className="list-group">
                    {queueData.scheduled.map((appointment) => (
                      <div key={appointment.id} className="list-group-item">
                        <div className="d-flex justify-content-between align-items-start">
                          <div className="flex-grow-1">
                            <div className="fw-bold">{appointment.customer?.full_name}</div>
                            <small className="text-muted">
                              <i className="bi bi-clock me-1"></i>
                              {appointment.appointment_time}
                            </small>
                            <br />
                            <small className="text-muted">{appointment.service?.name}</small>
                          </div>
                        </div>
                        <div className="mt-2">
                          {showAddToQueue === appointment.id ? (
                            <div className="btn-group btn-group-sm w-100">
                              <button
                                className="btn btn-danger"
                                onClick={() => handleAddScheduledToQueue(appointment.id, true)}
                              >
                                <i className="bi bi-lightning-fill me-1"></i>
                                Urgent
                              </button>
                              <button
                                className="btn btn-primary"
                                onClick={() => handleAddScheduledToQueue(appointment.id, false)}
                              >
                                <i className="bi bi-arrow-right me-1"></i>
                                Normal
                              </button>
                              <button
                                className="btn btn-secondary"
                                onClick={() => setShowAddToQueue(null)}
                              >
                                <i className="bi bi-x"></i>
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-sm btn-outline-primary w-100"
                              onClick={() => setShowAddToQueue(appointment.id)}
                            >
                              <i className="bi bi-arrow-right-circle me-1"></i>
                              Add to Queue
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted py-4">
                    <i className="bi bi-calendar-x" style={{fontSize: '2rem'}}></i>
                    <p className="mt-2 mb-0">No scheduled appointments</p>
                  </div>
                )}
              </div>
            </div>

            {/* Queue Summary */}
            <div className="card mt-3">
              <div className="card-header bg-info text-white">
                <h6 className="mb-0">
                  <i className="bi bi-info-circle me-2"></i>
                  Queue Summary
                </h6>
              </div>
              <div className="card-body">
                <div className="d-flex justify-content-between mb-2">
                  <span>Total in Queue:</span>
                  <strong>{queueData.queue?.length || 0}</strong>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span>Scheduled (Not in Queue):</span>
                  <strong>{queueData.scheduled?.length || 0}</strong>
                </div>
                <div className="d-flex justify-content-between mb-2">
                  <span>Total Appointments:</span>
                  <strong>{queueData.total || 0}</strong>
                </div>
                <hr />
                <div className="d-flex justify-content-between">
                  <span>Currently Serving:</span>
                  <strong className="text-success">
                    {queueData.queue?.find(a => a.status === 'ongoing')?.customer?.full_name || 'None'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Details Modal */}
      {showCustomerDetails && selectedCustomer && (
        <div className="modal fade show" style={{display: 'block', backgroundColor: 'rgba(0,0,0,0.5)'}}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-person-lines-fill me-2"></i>
                  Customer Details - {selectedCustomer.customer?.full_name}
                </h5>
                <button type="button" className="btn-close" onClick={handleCloseCustomerDetails}></button>
              </div>
              <div className="modal-body">
                <div className="row">
                  {/* Customer Information */}
                  <div className="col-md-6">
                    <h6 className="text-primary">Customer Information</h6>
                    <div className="mb-3">
                      <strong>Name:</strong> {selectedCustomer.customer?.full_name || 'N/A'}
                    </div>
                    <div className="mb-3">
                      <strong>Phone:</strong> 
                      {selectedCustomer.customer?.phone ? (
                        <a href={`tel:${selectedCustomer.customer.phone}`} className="ms-2">
                          {selectedCustomer.customer.phone}
                        </a>
                      ) : (
                        <span className="ms-2 text-muted">N/A</span>
                      )}
                    </div>
                    <div className="mb-3">
                      <strong>Email:</strong> 
                      {selectedCustomer.customer?.email ? (
                        <a href={`mailto:${selectedCustomer.customer.email}`} className="ms-2">
                          {selectedCustomer.customer.email}
                        </a>
                      ) : (
                        <span className="ms-2 text-muted">N/A</span>
                      )}
                    </div>
                    
                    {/* Current Appointment Details */}
                    <h6 className="text-primary mt-4">Current Appointment</h6>
                    <div className="mb-2">
                      <strong>Service:</strong> {selectedCustomer.service?.name || 'N/A'}
                    </div>
                    <div className="mb-2">
                      <strong>Duration:</strong> {selectedCustomer.service?.duration || 'N/A'} minutes
                    </div>
                    <div className="mb-2">
                      <strong>Queue Position:</strong> #{selectedCustomer.queue_position || 'N/A'}
                    </div>
                    <div className="mb-2">
                      <strong>Priority:</strong> 
                      <span className={`badge bg-${getPriorityBadgeColor(selectedCustomer.priority_level)} ms-2`}>
                        {selectedCustomer.priority_level || 'normal'}
                      </span>
                    </div>
                    <div className="mb-2">
                      <strong>Status:</strong> 
                      <span className={`badge bg-${getStatusBadgeColor(selectedCustomer.status)} ms-2`}>
                        {selectedCustomer.status}
                      </span>
                    </div>
                  </div>

                  {/* Customer History */}
                  <div className="col-md-6">
                    <h6 className="text-primary">Recent History</h6>
                    {customerHistory.length > 0 ? (
                      <div className="table-responsive" style={{maxHeight: '300px', overflowY: 'auto'}}>
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Service</th>
                              <th>Barber</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerHistory.map((appointment) => (
                              <tr key={appointment.id}>
                                <td>{new Date(appointment.appointment_date).toLocaleDateString()}</td>
                                <td>{appointment.service?.name || 'N/A'}</td>
                                <td>{appointment.barber?.full_name || 'N/A'}</td>
                                <td>
                                  <span className={`badge bg-${getStatusBadgeColor(appointment.status)}`}>
                                    {appointment.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-muted">No previous appointments found.</p>
                    )}
                  </div>
                </div>

                {/* Double Booking Information */}
                {selectedCustomer.is_double_booking && selectedCustomer.double_booking_data && (
                  <div className="row mt-3">
                    <div className="col-12">
                      <div className="alert alert-info">
                        <h6 className="alert-heading">
                          <i className="bi bi-people me-2"></i>
                          Double Booking Information
                        </h6>
                        <p className="mb-1">
                          <strong>Service For:</strong> {selectedCustomer.double_booking_data.friend_name || 'Friend'}
                        </p>
                        {selectedCustomer.double_booking_data.friend_phone && (
                          <p className="mb-1">
                            <strong>Friend's Phone:</strong> 
                            <a href={`tel:${selectedCustomer.double_booking_data.friend_phone}`} className="ms-2">
                              {selectedCustomer.double_booking_data.friend_phone}
                            </a>
                          </p>
                        )}
                        <p className="mb-0">
                          <strong>Booked By:</strong> {selectedCustomer.double_booking_data.booked_by || 'Customer'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseCustomerDetails}>
                  Close
                </button>
                {selectedCustomer.customer?.phone && (
                  <a 
                    href={`tel:${selectedCustomer.customer.phone}`}
                    className="btn btn-primary"
                  >
                    <i className="bi bi-telephone me-2"></i>
                    Call Customer
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueueManagementPanel;

