import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/PushService';

const QueuePosition = ({ appointmentId }) => {
  const [appointment, setAppointment] = useState(null);
  const [queuePosition, setQueuePosition] = useState(null);
  const [estimatedWaitTime, setEstimatedWaitTime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (appointmentId) {
      fetchQueuePosition();
      
      // Set up real-time subscription for queue updates
      const subscription = supabase
        .channel(`queue-position-${appointmentId}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'appointments',
            filter: `id=eq.${appointmentId}`
          }, 
          (payload) => {
            console.log('Queue position update received:', payload);
            const oldPosition = appointment?.queue_position;
            fetchQueuePosition();
            
            // Check if position changed and send notification
            if (payload.new && oldPosition !== payload.new.queue_position) {
              handlePositionChange(oldPosition, payload.new.queue_position);
            }
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [appointmentId, appointment?.queue_position]);

  const fetchQueuePosition = async () => {
    try {
      setLoading(true);
      
      // Get appointment details
      const { data: appointmentData, error: appointmentError } = await supabase
        .from('appointments')
        .select(`
          id,
          barber_id,
          appointment_date,
          appointment_time,
          status,
          queue_position,
          priority_level,
          estimated_wait_time,
          barber:barber_id(full_name, email)
        `)
        .eq('id', appointmentId)
        .single();

      if (appointmentError) throw appointmentError;

      setAppointment(appointmentData);

      // If appointment is in queue, get queue status
      if (appointmentData?.queue_position && appointmentData?.status === 'scheduled') {
        const { data: queueStatus, error: queueError } = await supabase
          .rpc('get_barber_queue_status', {
            p_barber_id: appointmentData.barber_id,
            p_appointment_date: appointmentData.appointment_date
          });

        if (queueError) throw queueError;

        setQueuePosition(queueStatus?.[0]);
        setEstimatedWaitTime(appointmentData.estimated_wait_time);
      }
    } catch (err) {
      console.error('Error fetching queue position:', err);
      setError('Failed to load queue information');
    } finally {
      setLoading(false);
    }
  };

  const getPositionMessage = () => {
    if (!appointment || !queuePosition) return null;

    const position = appointment.queue_position;
    const totalInQueue = queuePosition.total_in_queue;
    const currentlyServing = queuePosition.currently_serving;

    if (position === 1 && currentlyServing === 0) {
      return "You're next! Please be ready.";
    } else if (position === 1) {
      return "You're first in line!";
    } else if (position <= 3) {
      return `You're #${position} in line. Almost your turn!`;
    } else {
      return `You're #${position} out of ${totalInQueue} in line.`;
    }
  };

  const getWaitTimeMessage = () => {
    if (!estimatedWaitTime) return null;

    if (estimatedWaitTime < 30) {
      return `Estimated wait: ${estimatedWaitTime} minutes`;
    } else if (estimatedWaitTime < 60) {
      return `Estimated wait: ${estimatedWaitTime} minutes`;
    } else {
      const hours = Math.floor(estimatedWaitTime / 60);
      const minutes = estimatedWaitTime % 60;
      return `Estimated wait: ${hours}h ${minutes}m`;
    }
  };

  const getPriorityBadge = () => {
    if (!appointment?.priority_level || appointment.priority_level === 'normal') return null;

    const badgeClass = {
      'urgent': 'bg-danger',
      'high': 'bg-warning',
      'low': 'bg-secondary'
    }[appointment.priority_level];

    return (
      <span className={`badge ${badgeClass} ms-2`}>
        {appointment.priority_level.toUpperCase()}
      </span>
    );
  };

  // Handle queue position changes and send notifications
  const handlePositionChange = async (oldPosition, newPosition) => {
    if (!oldPosition || !newPosition) return;
    
    try {
      console.log(`🔔 Queue position changed: ${oldPosition} → ${newPosition}`);
      
      // Use the enhanced PushService for proper notification delivery
      if (newPosition < oldPosition) {
        // Only send notifications for position improvements
        await PushService.sendQueuePositionNotification(newPosition, appointmentId);
        console.log(`✅ Queue position notification sent via PushService for position #${newPosition}`);
      }
    } catch (error) {
      console.error('Error sending position change notification via PushService:', error);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-body text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2 text-muted">Loading queue position...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-danger">
        <div className="card-body text-center">
          <i className="bi bi-exclamation-triangle text-danger fs-1"></i>
          <p className="text-danger mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="card">
        <div className="card-body text-center">
          <i className="bi bi-question-circle text-muted fs-1"></i>
          <p className="text-muted mt-2">Appointment not found</p>
        </div>
      </div>
    );
  }

  // If appointment is not in queue
  if (!appointment.queue_position || appointment.status !== 'scheduled') {
    return (
      <div className="card">
        <div className="card-body text-center">
          <i className="bi bi-calendar-check text-success fs-1"></i>
          <h5 className="mt-2">Scheduled Appointment</h5>
          <p className="text-muted">
            {appointment.appointment_time ? 
              `Scheduled for ${appointment.appointment_time}` : 
              'Your appointment is scheduled'
            }
          </p>
          <p className="small text-muted">
            Barber: {appointment.barber?.full_name}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header bg-primary text-white">
        <h5 className="mb-0">
          <i className="bi bi-people-fill me-2"></i>
          Your Queue Position
        </h5>
      </div>
      <div className="card-body">
        <div className="row align-items-center">
          <div className="col-md-4 text-center">
            <div className="display-1 text-primary mb-2">
              #{appointment.queue_position}
            </div>
            <h6 className="text-muted">Position in Queue</h6>
            {getPriorityBadge()}
          </div>
          
          <div className="col-md-8">
            <div className="mb-3">
              <h6 className="text-primary mb-1">Status</h6>
              <p className="mb-0">{getPositionMessage()}</p>
            </div>
            
            {estimatedWaitTime && (
              <div className="mb-3">
                <h6 className="text-info mb-1">
                  <i className="bi bi-clock me-1"></i>
                  Wait Time
                </h6>
                <p className="mb-0">{getWaitTimeMessage()}</p>
              </div>
            )}
            
            <div className="mb-3">
              <h6 className="text-success mb-1">
                <i className="bi bi-scissors me-1"></i>
                Your Barber
              </h6>
              <p className="mb-0">{appointment.barber?.full_name}</p>
            </div>

            {queuePosition && (
              <div className="row text-center">
                <div className="col-4">
                  <div className="text-muted small">Total in Queue</div>
                  <div className="fw-bold">{queuePosition.total_in_queue}</div>
                </div>
                <div className="col-4">
                  <div className="text-muted small">Currently Serving</div>
                  <div className="fw-bold">{queuePosition.currently_serving}</div>
                </div>
                <div className="col-4">
                  <div className="text-muted small">Waiting</div>
                  <div className="fw-bold">{queuePosition.waiting}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {queuePosition && (
          <div className="mt-4">
            <div className="d-flex justify-content-between small text-muted mb-1">
              <span>Queue Progress</span>
              <span>{appointment.queue_position} of {queuePosition.total_in_queue}</span>
            </div>
            <div className="progress" style={{ height: '8px' }}>
              <div 
                className="progress-bar bg-primary" 
                role="progressbar" 
                style={{ 
                  width: `${(queuePosition.total_in_queue - appointment.queue_position + 1) / queuePosition.total_in_queue * 100}%` 
                }}
              ></div>
            </div>
          </div>
        )}

        {/* Notifications */}
        <div className="mt-3">
          <div className="alert alert-info mb-0">
            <i className="bi bi-bell me-2"></i>
            <small>
              🔔 <strong>Smart Notifications Enabled!</strong><br/>
              • You'll get notified when you're next in line<br/>
              • Updates when your position changes<br/>
              • Alerts when it's almost your turn<br/>
              <em>Make sure notifications are enabled!</em>
            </small>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueuePosition;
