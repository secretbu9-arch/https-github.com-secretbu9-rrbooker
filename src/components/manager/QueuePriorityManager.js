import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/PushService';

const QueuePriorityManager = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBarber, setSelectedBarber] = useState('');
  const [barbers, setBarbers] = useState([]);
  const [queueStatus, setQueueStatus] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch barbers
  const fetchBarbers = async () => {
    try {
      console.log('🔍 Fetching barbers...');
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'barber')
        .order('full_name');

      if (error) throw error;
      console.log('👥 Barbers found:', data?.length || 0, data);
      setBarbers(data || []);
    } catch (error) {
      console.error('Error fetching barbers:', error);
    }
  };

  // Fetch appointments for the selected date and barber
  const fetchAppointments = async () => {
    if (!selectedDate) return;

    setLoading(true);
    try {
      console.log('🔍 Fetching appointments for:', { selectedDate, selectedBarber });
      
      let query = supabase
        .from('appointments')
        .select(`
          id,
          customer_id,
          barber_id,
          appointment_date,
          appointment_time,
          status,
          queue_position,
          priority_level,
          estimated_wait_time,
          auto_inserted_at,
          manager_adjusted_at,
          created_at,
          total_duration,
          services_data,
          add_ons_data,
          is_double_booking,
          double_booking_data,
          customer:customer_id(full_name, email, phone),
          barber:barber_id(full_name),
          service:service_id(name, duration)
        `)
        .eq('appointment_date', selectedDate)
        .in('status', ['scheduled', 'pending', 'ongoing'])
        .not('queue_position', 'is', null)
        .order('priority_level', { ascending: true })
        .order('queue_position', { ascending: true });

      if (selectedBarber) {
        query = query.eq('barber_id', selectedBarber);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      console.log('📊 Appointments found:', data?.length || 0, data);
      
      // Debug: Check for friend booking data
      if (data && data.length > 0) {
        console.log('🔍 Checking for friend booking data...');
        data.forEach((apt, index) => {
          console.log(`Appointment ${index + 1}:`, {
            id: apt.id,
            customer_name: apt.customer?.full_name,
            is_double_booking: apt.is_double_booking,
            double_booking_data: apt.double_booking_data,
            double_booking_data_type: typeof apt.double_booking_data
          });
        });
      }
      
      setAppointments(data || []);
      
      // Test the functions with actual data
      if (data && data.length > 0) {
        console.log('🧪 Testing booking type and friend info functions...');
        data.forEach((apt, index) => {
          const bookingType = getBookingType(apt);
          const friendInfo = getFriendInfo(apt);
          console.log(`Test ${index + 1}:`, {
            customer: apt.customer?.full_name,
            bookingType,
            friendInfo,
            hasFriendData: !!friendInfo
          });
        });
      }

      // Also fetch all appointments for debugging (without queue_position filter)
      const { data: allAppointments, error: allError } = await supabase
        .from('appointments')
        .select('id, appointment_date, status, queue_position, barber_id, appointment_time')
        .eq('appointment_date', selectedDate);
      
      if (!allError) {
        console.log('📋 All appointments for date:', allAppointments?.length || 0, allAppointments);
        
        // Check which appointments have queue_position
        const withQueuePosition = allAppointments?.filter(apt => apt.queue_position !== null) || [];
        console.log('🎯 Appointments with queue_position:', withQueuePosition.length, withQueuePosition);
        
        // Check which appointments have correct status
        const correctStatus = allAppointments?.filter(apt => 
          ['scheduled', 'pending', 'ongoing'].includes(apt.status)
        ) || [];
        console.log('✅ Appointments with correct status:', correctStatus.length, correctStatus);
        
        // Check which appointments meet ALL criteria
        const meetsAllCriteria = allAppointments?.filter(apt => 
          apt.queue_position !== null && 
          ['scheduled', 'pending', 'ongoing'].includes(apt.status)
        ) || [];
        console.log('🎯 Appointments meeting ALL criteria:', meetsAllCriteria.length, meetsAllCriteria);
        
        // Check if we have the required related data
        console.log('🔍 Checking related data...');
        const { data: customers } = await supabase.from('users').select('id').eq('role', 'customer').limit(1);
        const { data: barbers } = await supabase.from('users').select('id').eq('role', 'barber').limit(1);
        const { data: services } = await supabase.from('services').select('id').limit(1);
        console.log('👥 Customers available:', customers?.length || 0);
        console.log('👨‍💼 Barbers available:', barbers?.length || 0);
        console.log('🔧 Services available:', services?.length || 0);
      }

      // Fetch queue status if barber is selected
      if (selectedBarber) {
        await fetchQueueStatus(selectedBarber);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
      setError('Failed to fetch appointments');
    } finally {
      setLoading(false);
    }
  };

  // Fetch queue status for selected barber
  const fetchQueueStatus = async (barberId) => {
    try {
      const { data, error } = await supabase
        .rpc('get_barber_queue_status', {
          p_barber_id: barberId,
          p_appointment_date: selectedDate
        });

      if (error) throw error;
      setQueueStatus(data?.[0] || null);
    } catch (error) {
      console.error('Error fetching queue status:', error);
    }
  };

  // Update queue priority
  const updateQueuePriority = async (appointmentId, newPriority) => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) return;

      const { error } = await supabase
        .from('appointments')
        .update({ 
          priority_level: newPriority,
          manager_adjusted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Reorder queue based on new priority
      await reorderQueueByPriority(appointment.barber_id, appointment.appointment_date);

      // Send notification to customer about priority change
      try {
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
        await centralizedNotificationService.createNotification({
          userId: appointment.customer_id,
          title: 'Queue Priority Updated',
          message: `Your appointment priority has been updated to ${newPriority}. Your position in the queue may have changed.`,
          type: 'queue_priority_update',
          category: 'queue_update',
          priority: 'normal',
          channels: ['app', 'push'],
          data: {
            appointment_id: appointmentId,
            new_priority: newPriority,
            barber_name: appointment.barber?.full_name
          },
          appointmentId: appointmentId
        });
      } catch (pushError) {
        console.warn('Failed to send priority update notification:', pushError);
      }

      setSuccess('Queue priority updated successfully');
      fetchAppointments(); // Refresh the list
    } catch (error) {
      console.error('Error updating priority:', error);
      setError('Failed to update queue priority');
    }
  };

  // Reorder queue based on priority levels
  const reorderQueueByPriority = async (barberId, appointmentDate) => {
    try {
      // Get all appointments in queue for this barber and date
      const { data: queueAppointments, error } = await supabase
        .from('appointments')
        .select('id, queue_position, priority_level, appointment_time, created_at')
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .in('status', ['scheduled', 'pending', 'ongoing'])
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: true });

      if (error) throw error;

      // Sort by priority and time
      const sortedAppointments = queueAppointments.sort((a, b) => {
        const priorityOrder = { 'urgent': 0, 'high': 1, 'normal': 2, 'low': 3 };
        const aPriority = priorityOrder[a.priority_level] || 2;
        const bPriority = priorityOrder[b.priority_level] || 2;
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        
        // If same priority, sort by original queue position (FIFO)
        return (a.queue_position || 999) - (b.queue_position || 999);
      });

      // Update queue positions
      for (let i = 0; i < sortedAppointments.length; i++) {
        const newPosition = i + 1;
        if (sortedAppointments[i].queue_position !== newPosition) {
          await supabase
            .from('appointments')
            .update({ 
              queue_position: newPosition,
              updated_at: new Date().toISOString()
            })
            .eq('id', sortedAppointments[i].id);
        }
      }

      // Update estimated wait times
      await supabase.rpc('update_estimated_wait_times', {
        p_barber_id: barberId,
        p_appointment_date: appointmentDate
      });

    } catch (error) {
      console.error('Error reordering queue by priority:', error);
      throw error;
    }
  };

  // Move appointment to specific position in queue
  const moveToPosition = async (appointmentId, newPosition) => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) return;

      const currentPosition = appointment.queue_position;
      if (currentPosition === newPosition) return;

      // Get all appointments for this barber and date
      const { data: allAppointments, error: fetchError } = await supabase
        .from('appointments')
        .select('id, queue_position')
        .eq('barber_id', appointment.barber_id)
        .eq('appointment_date', appointment.appointment_date)
        .in('status', ['scheduled', 'pending', 'ongoing'])
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: true });

      if (fetchError) throw fetchError;

      // Create updates array
      const updates = [];

      if (newPosition < currentPosition) {
        // Moving up - shift others down
        for (const apt of allAppointments) {
          if (apt.queue_position >= newPosition && apt.queue_position < currentPosition && apt.id !== appointmentId) {
            updates.push({
              id: apt.id,
              queue_position: apt.queue_position + 1
            });
          }
        }
      } else {
        // Moving down - shift others up
        for (const apt of allAppointments) {
          if (apt.queue_position > currentPosition && apt.queue_position <= newPosition && apt.id !== appointmentId) {
            updates.push({
              id: apt.id,
              queue_position: apt.queue_position - 1
            });
          }
        }
      }

      // Add the moved appointment
      updates.push({
        id: appointmentId,
        queue_position: newPosition
      });

      // Execute all updates
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('appointments')
          .update({ 
            queue_position: update.queue_position,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id);

        if (updateError) throw updateError;
      }

      // Send notification to customer about position change
      try {
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
        await centralizedNotificationService.createQueuePositionNotification({
          userId: appointment.customer_id,
          appointmentId: appointmentId,
          queuePosition: newPosition,
          reason: 'Position updated by manager',
          barberName: appointment.barber?.full_name
        });
      } catch (pushError) {
        console.warn('Failed to send position update notification:', pushError);
      }

      setSuccess(`Appointment moved to position #${newPosition}`);
      fetchAppointments();
    } catch (error) {
      console.error('Error moving appointment:', error);
      setError('Failed to move appointment');
    }
  };

  // Move appointment up in queue
  const moveUp = async (appointmentId, currentPosition) => {
    if (currentPosition <= 1) return;
    await moveToPosition(appointmentId, currentPosition - 1);
  };

  // Move appointment down in queue
  const moveDown = async (appointmentId, currentPosition) => {
    const maxPosition = Math.max(...appointments.map(apt => apt.queue_position));
    if (currentPosition >= maxPosition) return;
    await moveToPosition(appointmentId, currentPosition + 1);
  };

  // Process scheduled appointments for queue insertion
  const processScheduledAppointments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .rpc('process_scheduled_appointments_for_queue');

      if (error) throw error;
      
      setSuccess(`Processed ${data} scheduled appointments for queue insertion`);
      fetchAppointments();
    } catch (error) {
      console.error('Error processing scheduled appointments:', error);
      setError('Failed to process scheduled appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBarbers();
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [selectedDate, selectedBarber]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchAppointments();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, selectedDate, selectedBarber]);

  const formatTime = (timeString) => {
    if (!timeString) return 'Queue-based';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatWaitTime = (minutes) => {
    if (!minutes) return 'N/A';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Calculate actual estimated time based on queue position and service duration
  const calculateEstimatedTime = (appointment, allAppointments) => {
    if (!appointment.queue_position) return 'N/A';
    
    // Start time is 8:00 AM (480 minutes from midnight)
    const startTime = 8 * 60; // 8:00 AM in minutes
    let currentTime = startTime;
    
    // Calculate time for all appointments before this one
    for (let i = 1; i < appointment.queue_position; i++) {
      const prevAppointment = allAppointments.find(apt => apt.queue_position === i);
      if (prevAppointment) {
        const duration = prevAppointment.total_duration || 30; // Default 30 minutes
        currentTime += duration;
        
        // Skip lunch break (12:00 PM - 1:00 PM)
        if (currentTime >= 12 * 60 && currentTime < 13 * 60) {
          currentTime = 13 * 60; // Move to 1:00 PM
        }
      }
    }
    
    // Convert minutes back to time format
    const hours = Math.floor(currentTime / 60);
    const minutes = currentTime % 60;
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Determine booking type and get friend info
  const getBookingType = (appointment) => {
    console.log('🔍 Checking booking type for appointment:', appointment.id, {
      is_double_booking: appointment.is_double_booking,
      double_booking_data: appointment.double_booking_data
    });
    
    if (appointment.is_double_booking) {
      console.log('✅ Found is_double_booking flag');
      return 'Book for Friend';
    }
    if (appointment.double_booking_data) {
      // Check if it's already an object or needs parsing
      let data = appointment.double_booking_data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
          console.log('📋 Parsed double_booking_data for type check:', data);
        } catch (e) {
          console.error('❌ Error parsing double_booking_data for type:', e);
          return 'Single Booking';
        }
      } else {
        console.log('📋 double_booking_data is already an object:', data);
      }
      
      if (data && (data.book_for_friend || data.friend_name)) {
        console.log('✅ Found friend booking in data');
        return 'Book for Friend';
      }
    }
    console.log('❌ No friend booking found, returning Single Booking');
    return 'Single Booking';
  };

  // Get friend contact information
  const getFriendInfo = (appointment) => {
    console.log('🔍 Checking friend info for appointment:', appointment.id, appointment.double_booking_data);
    
    if (appointment.double_booking_data) {
      // Check if it's already an object or needs parsing
      let data = appointment.double_booking_data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
          console.log('📋 Parsed double_booking_data:', data);
        } catch (e) {
          console.error('❌ Error parsing double_booking_data:', e);
          return null;
        }
      } else {
        console.log('📋 double_booking_data is already an object:', data);
      }
      
      if (data && data.friend_name) {
        const friendInfo = {
          name: data.friend_name,
          phone: data.friend_phone || 'No phone',
          email: data.friend_email || 'No email'
        };
        console.log('✅ Friend info found:', friendInfo);
        return friendInfo;
      }
    }
    
    console.log('❌ No friend info found');
    return null;
  };

  const getPriorityBadgeClass = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-danger';
      case 'high': return 'bg-warning';
      case 'normal': return 'bg-primary';
      case 'low': return 'bg-secondary';
      default: return 'bg-primary';
    }
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title mb-0">
                <i className="bi bi-arrow-up-down me-2"></i>
                Enhanced Queue Priority Manager
              </h4>
            </div>
            <div className="card-body">
              {/* Controls */}
              <div className="row mb-4">
                <div className="col-md-3">
                  <label htmlFor="selectedDate" className="form-label">Select Date</label>
                  <input
                    type="date"
                    className="form-control"
                    id="selectedDate"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
                <div className="col-md-3">
                  <label htmlFor="selectedBarber" className="form-label">Select Barber</label>
                  <select
                    className="form-select"
                    id="selectedBarber"
                    value={selectedBarber}
                    onChange={(e) => setSelectedBarber(e.target.value)}
                  >
                    <option value="">All Barbers</option>
                    {barbers.map(barber => (
                      <option key={barber.id} value={barber.id}>
                        {barber.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3 d-flex align-items-end">
                  <button
                    className="btn btn-primary me-2"
                    onClick={fetchAppointments}
                    disabled={loading}
                  >
                    {loading ? 'Loading...' : 'Refresh Queue'}
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={processScheduledAppointments}
                    disabled={loading}
                    title="Process scheduled appointments for queue insertion"
                  >
                    <i className="bi bi-arrow-right-circle me-1"></i>
                    Process Queue
                  </button>
                </div>
                <div className="col-md-3 d-flex align-items-end">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="autoRefreshSwitch"
                      checked={autoRefresh}
                      onChange={() => setAutoRefresh(!autoRefresh)}
                    />
                    <label className="form-check-label" htmlFor="autoRefreshSwitch">
                      Auto-refresh
                    </label>
                  </div>
                </div>
              </div>

              {/* Queue Status */}
              {queueStatus && (
                <div className="row mb-4">
                  <div className="col-12">
                    <div className="card bg-light">
                      <div className="card-body">
                        <h6 className="card-title">Queue Status</h6>
                        <div className="row">
                          <div className="col-md-2">
                            <strong>Total in Queue:</strong> {queueStatus.total_in_queue}
                          </div>
                          <div className="col-md-2">
                            <strong>Currently Serving:</strong> {queueStatus.currently_serving}
                          </div>
                          <div className="col-md-2">
                            <strong>Waiting:</strong> {queueStatus.waiting}
                          </div>
                          <div className="col-md-3">
                            <strong>Next Customer:</strong> {queueStatus.next_customer_name || 'None'}
                          </div>
                          <div className="col-md-3">
                            <strong>Est. Wait Time:</strong> {formatWaitTime(queueStatus.estimated_wait_time)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Alerts */}
              {error && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {error}
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setError('')}
                  ></button>
                </div>
              )}

              {success && (
                <div className="alert alert-success alert-dismissible fade show" role="alert">
                  <i className="bi bi-check-circle me-2"></i>
                  {success}
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setSuccess('')}
                  ></button>
                </div>
              )}

              {/* Queue List */}
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead className="table-light">
                    <tr>
                      <th>Queue #</th>
                      <th>Customer</th>
                      <th>Barber</th>
                      <th>Estimated Time</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Wait Time</th>
                      <th>Booking Type</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((appointment, index) => (
                      <tr key={appointment.id}>
                        <td>
                          <span className="badge bg-primary fs-6">
                            #{appointment.queue_position}
                          </span>
                        </td>
                        <td>
                          <div>
                            <div className="fw-medium">{appointment.customer?.full_name || 'Unknown'}</div>
                            <small className="text-muted">
                              {appointment.customer?.email || ''}
                              {appointment.customer?.phone && (
                                <><br/><i className="bi bi-telephone me-1"></i>{appointment.customer.phone}</>
                              )}
                            </small>
                            
                            {/* Show friend contact info if it's a "Book for Friend" appointment */}
                            {(() => {
                              const bookingType = getBookingType(appointment);
                              const friendInfo = getFriendInfo(appointment);
                              console.log(`🔍 Rendering appointment ${appointment.id}:`, { bookingType, friendInfo });
                              
                              if (bookingType === 'Book for Friend' && friendInfo) {
                                return (
                                  <div className="mt-2 p-2 bg-info bg-opacity-10 rounded">
                                    <small className="text-info fw-bold">
                                      <i className="bi bi-person-heart me-1"></i>
                                      Friend: {friendInfo.name}
                                    </small>
                                    <br/>
                                    <small className="text-muted">
                                      <i className="bi bi-telephone me-1"></i>
                                      {friendInfo.phone}
                                    </small>
                                    {friendInfo.email !== 'No email' && (
                                      <>
                                        <br/>
                                        <small className="text-muted">
                                          <i className="bi bi-envelope me-1"></i>
                                          {friendInfo.email}
                                        </small>
                                      </>
                                    )}
                                  </div>
                                );
                              } else if (bookingType === 'Book for Friend') {
                                return (
                                  <div className="mt-2 p-2 bg-warning bg-opacity-10 rounded">
                                    <small className="text-warning">
                                      <i className="bi bi-exclamation-triangle me-1"></i>
                                      Book for Friend (no friend data)
                                    </small>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </td>
                        <td>{appointment.barber?.full_name || 'Unknown'}</td>
                        <td>
                          <div>
                            {calculateEstimatedTime(appointment, appointments)}
                            {appointment.auto_inserted_at && (
                              <small className="text-success d-block">
                                <i className="bi bi-arrow-right-circle me-1"></i>
                                Auto-inserted
                              </small>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${
                            appointment.status === 'scheduled' ? 'bg-success' :
                            appointment.status === 'pending' ? 'bg-primary' :
                            appointment.status === 'ongoing' ? 'bg-warning' :
                            'bg-secondary'
                          }`}>
                            {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                          </span>
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <select
                              className="form-select form-select-sm"
                              value={appointment.priority_level || 'normal'}
                              onChange={(e) => updateQueuePriority(appointment.id, e.target.value)}
                            >
                              <option value="low">Low</option>
                              <option value="normal">Normal</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                            <span className={`badge ${getPriorityBadgeClass(appointment.priority_level)}`}>
                              {appointment.priority_level || 'normal'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="text-muted">
                            {formatWaitTime(appointment.estimated_wait_time)}
                          </span>
                        </td>
                        <td>
                          <div>
                            <span className={`badge ${
                              getBookingType(appointment) === 'Book for Friend' ? 'bg-info' : 'bg-secondary'
                            }`}>
                              {getBookingType(appointment)}
                            </span>
                            
                            {/* Show friend contact details for "Book for Friend" appointments */}
                            {getBookingType(appointment) === 'Book for Friend' && getFriendInfo(appointment) && (
                              <div className="mt-1">
                                <small className="text-info d-block">
                                  <i className="bi bi-person-heart me-1"></i>
                                  {getFriendInfo(appointment).name}
                                </small>
                                <small className="text-muted d-block">
                                  <i className="bi bi-telephone me-1"></i>
                                  {getFriendInfo(appointment).phone}
                                </small>
                                {getFriendInfo(appointment).email !== 'No email' && (
                                  <small className="text-muted d-block">
                                    <i className="bi bi-envelope me-1"></i>
                                    {getFriendInfo(appointment).email}
                                  </small>
                                )}
                              </div>
                            )}
                            
                            {appointment.manager_adjusted_at && (
                              <small className="text-info d-block mt-1">
                                <i className="bi bi-person-gear me-1"></i>
                                Manager adjusted
                              </small>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="btn-group" role="group">
                            <button
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => moveUp(appointment.id, appointment.queue_position)}
                              disabled={appointment.queue_position <= 1}
                              title="Move Up"
                            >
                              <i className="bi bi-arrow-up"></i>
                            </button>
                            <button
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => moveDown(appointment.id, appointment.queue_position)}
                              disabled={appointment.queue_position >= Math.max(...appointments.map(apt => apt.queue_position))}
                              title="Move Down"
                            >
                              <i className="bi bi-arrow-down"></i>
                            </button>
                            <div className="dropdown">
                              <button
                                className="btn btn-outline-secondary btn-sm dropdown-toggle"
                                type="button"
                                data-bs-toggle="dropdown"
                                title="Move to Position"
                              >
                                <i className="bi bi-arrow-right"></i>
                              </button>
                              <ul className="dropdown-menu">
                                {Array.from({ length: Math.max(...appointments.map(apt => apt.queue_position)) }, (_, i) => i + 1).map(position => (
                                  <li key={position}>
                                    <button
                                      className="dropdown-item"
                                      onClick={() => moveToPosition(appointment.id, position)}
                                      disabled={position === appointment.queue_position}
                                    >
                                      Move to #{position}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {appointments.length === 0 && !loading && (
                <div className="text-center py-5">
                  <i className="bi bi-queue-list display-1 text-muted"></i>
                  <h5 className="text-muted mt-3">No appointments in queue</h5>
                  <p className="text-muted">Select a date to view the queue for that day.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueuePriorityManager;
