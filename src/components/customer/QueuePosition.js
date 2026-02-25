import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/notifications/PushService';

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
          customer_id,
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
        await PushService.sendQueuePositionNotification(appointment.customer_id, newPosition, appointmentId);
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
    <div className="card border-0 shadow-lg overflow-hidden animate-fade-in mx-auto" style={{ borderRadius: '24px', maxWidth: '500px' }}>
      <style>{`
        .queue-header {
          background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%);
          padding: 2.5rem 1.5rem;
          color: white;
          text-align: center;
          position: relative;
        }
        .queue-body {
          padding: 2rem 1.5rem;
          background: #ffffff;
        }
        .main-number-container {
          position: relative;
          width: 180px;
          height: 180px;
          margin: -110px auto 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }
        .main-number-bg {
          position: absolute;
          width: 100%;
          height: 100%;
          background: white;
          border-radius: 50%;
          box-shadow: 0 15px 35px rgba(0,0,0,0.1);
          border: 8px solid #fff;
        }
        .number-glamour {
          font-size: 4.5rem;
          font-weight: 900;
          background: linear-gradient(135deg, #0d6efd 0%, #198754 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          line-height: 1;
          margin-bottom: -5px;
          z-index: 2;
        }
        .number-sub {
          font-size: 0.75rem;
          font-weight: 700;
          text-uppercase;
          color: #adb5bd;
          letter-spacing: 2px;
          z-index: 2;
        }
        .status-badge-glow {
          display: inline-flex;
          align-items: center;
          padding: 0.6rem 1.2rem;
          background: rgba(13, 110, 253, 0.05);
          color: #0d6efd;
          border-radius: 50px;
          font-weight: 700;
          margin-bottom: 2rem;
          border: 1px solid rgba(13, 110, 253, 0.1);
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin: 2rem 0;
        }
        .stat-box {
          text-align: center;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 16px;
          transition: transform 0.2s ease;
        }
        .stat-box:hover {
          transform: translateY(-5px);
          background: #f1f3f5;
        }
        .stat-val {
          display: block;
          font-size: 1.25rem;
          font-weight: 800;
          color: #212529;
        }
        .stat-label {
          font-size: 0.65rem;
          font-weight: 700;
          text-uppercase;
          color: #6c757d;
          letter-spacing: 1px;
        }
        .barber-info-premium {
          display: flex;
          align-items: center;
          padding: 1.25rem;
          background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
          border-radius: 20px;
          border: 1px solid #e9ecef;
          margin-bottom: 1.5rem;
        }
        .barber-avatar {
          width: 50px;
          height: 50px;
          background: #e7f1ff;
          color: #0d6efd;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 1rem;
          font-size: 1.5rem;
        }
        .pulse-soft {
          animation: pulse-soft 2s infinite;
        }
        @keyframes pulse-soft {
          0% { box-shadow: 0 0 0 0 rgba(13, 110, 253, 0.4); }
          70% { box-shadow: 0 0 0 15px rgba(13, 110, 253, 0); }
          100% { box-shadow: 0 0 0 0 rgba(13, 110, 253, 0); }
        }
        @media (max-width: 576px) {
          .queue-header {
            padding: 2rem 1rem;
          }
          .main-number-container {
            width: 140px;
            height: 140px;
            margin-top: -85px;
          }
          .number-glamour {
            font-size: 3.5rem;
          }
          .stats-grid {
            gap: 0.5rem;
          }
          .stat-box {
            padding: 0.75rem 0.5rem;
          }
          .stat-val {
            font-size: 1.1rem;
          }
          .stat-label {
            font-size: 0.55rem;
          }
          .barber-info-premium {
            padding: 1rem;
          }
        }
      `}</style>

      <div className="queue-header">
        <h4 className="fw-bold mb-0 text-white">Live Queue Status</h4>
        <p className="opacity-75 small mb-0 text-white">Real-time updates for your appointment</p>
      </div>

      <div className="queue-body text-center">
        <div className="main-number-container">
          <div className="main-number-bg pulse-soft"></div>
          <div className="d-flex flex-column align-items-center">
            <span className="number-glamour">#{appointment.queue_position}</span>
            <span className="number-sub">Your Position</span>
          </div>
        </div>

        <div className="status-badge-glow">
          <i className="bi bi-info-circle-fill me-2"></i>
          {getPositionMessage()}
        </div>

        <div className="stats-grid">
          <div className="stat-box">
            <span className="stat-val text-success">{(appointment.queue_position || 1) - 1}</span>
            <span className="stat-label">Ahead</span>
          </div>
          <div className="stat-box">
            <span className="stat-val text-primary">{queuePosition?.currently_serving || '0'}</span>
            <span className="stat-label">Serving</span>
          </div>
          <div className="stat-box">
            <span className="stat-val text-success">{queuePosition?.waiting || '0'}</span>
            <span className="stat-label">Waiting</span>
          </div>
        </div>

        <div className="barber-info-premium text-start">
          <div className="barber-avatar">
            <i className="bi bi-person-badge"></i>
          </div>
          <div>
            <h6 className="mb-0 fw-bold">{appointment.barber?.full_name}</h6>
            <p className="mb-0 text-muted extra-small text-uppercase fw-bold letter-spacing-1">Your Licensed Barber</p>
          </div>
          {getPriorityBadge() && (
            <div className="ms-auto">
              <span className={`badge ${appointment.priority_level === 'urgent' ? 'bg-danger' : 'bg-warning'} rounded-pill`}>
                {appointment.priority_level.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {estimatedWaitTime && (
          <div className="alert border-0 bg-light rounded-4 d-flex align-items-center mb-4 text-start p-3">
            <div className="bg-white p-2 rounded-3 me-3 shadow-sm text-primary">
              <i className="bi bi-hourglass-split fs-4"></i>
            </div>
            <div>
              <p className="mb-0 text-muted extra-small text-uppercase fw-bold">Estimated Wait</p>
              <h5 className="mb-0 fw-bold text-dark">{getWaitTimeMessage()}</h5>
            </div>
          </div>
        )}

        <div className="mt-4 pt-2">
          <div className="d-flex justify-content-between align-items-center mb-2 px-1">
            <span className="small fw-bold text-muted">Queue Progress</span>
            <span className="badge bg-primary bg-opacity-10 text-primary rounded-pill">
              {queuePosition?.currently_serving || 0} / {appointment.queue_position}
            </span>
          </div>
          <div className="progress rounded-pill bg-light" style={{ height: '12px' }}>
            <div
              className="progress-bar progress-bar-striped progress-bar-animated rounded-pill shadow-sm"
              role="progressbar"
              style={{
                width: `${Math.min(100, Math.max(5, (queuePosition?.currently_serving || 0) / appointment.queue_position * 100))}%`,
                background: 'linear-gradient(90deg, #0d6efd 0%, #198754 100%)'
              }}
            ></div>
          </div>
          <p className="extra-small text-muted mt-2">
            Progress is updated in real-time as your barber serves clients.
          </p>
        </div>

        <div className="mt-4 p-3 rounded-4 bg-info bg-opacity-5 border border-info border-opacity-10 text-start">
          <div className="d-flex align-items-start gap-3">
            <i className="bi bi-bell-fill text-info fs-4"></i>
            <div>
              <h6 className="mb-1 fw-bold text-info small">Smart Notifications Enabled</h6>
              <p className="mb-0 extra-small text-muted line-height-sm">
                We'll notify you when you're <strong>next in line</strong> and when it's finally <strong>your turn</strong>. Please keep your notifications enabled.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueuePosition;
