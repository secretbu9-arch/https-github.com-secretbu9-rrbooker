// components/barber/BarberQueue.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
// REMOVED: PushService and NotificationService imports - use only CentralizedNotificationService
import LoadingSpinner from '../common/LoadingSpinner';
import addOnsService from '../../services/AddOnsService';
import enhancedQueueService from '../../services/EnhancedQueueService';
import dateService from '../../services/DateService';
import appointmentTypeManager from '../../services/AppointmentTypeManager';
import AdvancedHybridQueueService from '../../services/AdvancedHybridQueueService';
import FriendBookingDisplay from '../common/FriendBookingDisplay';
import '../../styles/barber-appointments.css';
import '../../styles/hybrid-queue.css';

const BarberQueue = () => {
  const [currentAppointment, setCurrentAppointment] = useState(null);
  const [queuedAppointments, setQueuedAppointments] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    completed: 0,
    remaining: 0,
    totalTime: 0,
    pendingRequests: 0
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Advanced Hybrid Queue System state
  const [timeline, setTimeline] = useState([]);
  const [queueStats, setQueueStats] = useState({});
  const [efficiency, setEfficiency] = useState(0);


  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];

    // Initial data fetch
    fetchQueueData();

    // Set up Advanced Hybrid Queue real-time subscription
    const handleQueueUpdate = (update) => {
      console.log('🔔 Advanced Hybrid Queue real-time update:', update);
      
      // Refresh queue data
      if (update.queueData.success) {
        setTimeline(update.queueData.timeline);
        setCurrentAppointment(update.queueData.current);
        setQueueStats(update.queueData.stats);
        setEfficiency(update.queueData.efficiency || 0);

        // Update legacy state for compatibility - filter by appointment_type
        setQueuedAppointments(update.queueData.timeline.filter(apt => apt.appointment_type === 'queue'));
        setPendingRequests(update.queueData.timeline.filter(apt => apt.status === 'pending'));

        // Show toast notification
        if (update.event) {
          console.log(`📢 Queue updated: ${update.event}`);
        }
      }
    };

    const subscription = AdvancedHybridQueueService.subscribeToQueue(
      user.id,
      today,
      handleQueueUpdate
    );

    // Auto-refresh interval
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        console.log('🔄 Advanced Hybrid Queue periodic refresh');
        fetchQueueData();
      }, 20000);
    }

    // Custom event listener for legacy compatibility
    const handleAppointmentChange = (event) => {
      const { barberId } = event.detail;
      console.log(`📢 Queue received custom event:`, event.detail);
      
      if (barberId === user.id) {
        clearTimeout(window.queueUpdateTimeout);
        window.queueUpdateTimeout = setTimeout(() => {
          console.log('🔄 Queue updating from custom event...');
          fetchQueueData();
        }, 500);
      }
    };

    // Listen for force refresh events
    const handleForceRefresh = (event) => {
      if (event.detail.barberId === user.id) {
        console.log('🔄 Queue force refresh triggered');
        fetchQueueData();
      }
    };

    window.addEventListener('appointmentStatusChanged', handleAppointmentChange);
    window.addEventListener('forceRefreshBarberData', handleForceRefresh);
    
    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up Advanced Hybrid Queue subscriptions');
      AdvancedHybridQueueService.unsubscribeFromQueue(`${user.id}-${today}`);
      if (interval) clearInterval(interval);
      clearTimeout(window.queueUpdateTimeout);
      window.removeEventListener('appointmentStatusChanged', handleAppointmentChange);
      window.removeEventListener('forceRefreshBarberData', handleForceRefresh);
    };
  }, [user, autoRefresh]);

  const getCurrentUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (err) {
      console.error('Error getting current user:', err);
      setError('Failed to authenticate user');
      setLoading(false);
    }
  };

  // Validate appointment data consistency
  const validateAppointmentData = (appointments) => {
    const issues = [];
    
    appointments.forEach(apt => {
      // Check for data consistency
      if (apt.appointment_type === 'scheduled' && !apt.appointment_time) {
        issues.push(`Scheduled appointment ${apt.id} missing appointment_time`);
      }
      
      if (apt.appointment_type === 'queue' && apt.appointment_time) {
        issues.push(`Queue appointment ${apt.id} has appointment_time (should be null)`);
      }
      
      if (apt.appointment_type === 'queue' && (!apt.queue_position && apt.queue_position !== 0)) {
        issues.push(`Queue appointment ${apt.id} missing queue_position`);
      }
      
      if (apt.appointment_type === 'scheduled' && apt.queue_position) {
        issues.push(`Scheduled appointment ${apt.id} has queue_position (should be null)`);
      }
    });
    
    if (issues.length > 0) {
      console.warn('⚠️ Appointment data consistency issues:', issues);
    }
    
    return issues.length === 0;
  };

  const fetchQueueData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) return;

      console.log('🔄 Fetching unified queue with Advanced Hybrid System...');

      // Use Advanced Hybrid Queue Service
      const queueData = await AdvancedHybridQueueService.getUnifiedQueue(
        user.id,
        new Date().toISOString().split('T')[0]
      );

      if (queueData.success) {
        // Validate appointment data consistency
        validateAppointmentData(queueData.timeline);
        
        setTimeline(queueData.timeline);
        setCurrentAppointment(queueData.current);
        setQueueStats(queueData.stats);
        setEfficiency(queueData.efficiency || 0);

        // Update legacy state for compatibility - filter by appointment_type
        setQueuedAppointments(queueData.timeline.filter(apt => apt.appointment_type === 'queue'));
        setPendingRequests(queueData.timeline.filter(apt => apt.status === 'pending'));

        // Calculate enhanced stats
        const totalTimeMinutes = queueData.timeline.reduce((total, apt) => {
          return total + (apt.total_duration || 30);
        }, 0);

        setStats({
          completed: queueData.stats.completed || 0,
          remaining: queueData.timeline.length,
          totalTime: totalTimeMinutes,
          pendingRequests: queueData.timeline.filter(apt => apt.status === 'pending').length,
          efficiency: queueData.efficiency || 0
        });

        console.log('✅ Unified queue loaded:', {
          total: queueData.timeline.length,
          current: queueData.current?.id,
          stats: queueData.stats,
          efficiency: queueData.efficiency
        });
      } else {
        setError('Failed to load unified queue');
      }

    } catch (err) {
      console.error('❌ Error fetching unified queue:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateAddOnsDuration = async (addOnsData) => {
    return await addOnsService.calculateAddOnsDuration(addOnsData);
  };

  const getServicesDisplay = (appointment) => {
    const services = [];
    
    // Add primary service
    if (appointment.service) {
      services.push(appointment.service.name);
    }
    
    // Add additional services
    if (appointment.services_data) {
      try {
        // Handle different data types
        let serviceIds;
        
        if (typeof appointment.services_data === 'string') {
          // Handle empty or invalid JSON strings
          if (appointment.services_data.trim() === '' || 
              appointment.services_data === '[]' || 
              appointment.services_data === 'null' || 
              appointment.services_data === 'undefined') {
            return services.join(', ');
          }
          
          serviceIds = JSON.parse(appointment.services_data);
        } else if (Array.isArray(appointment.services_data)) {
          // Data is already an array
          serviceIds = appointment.services_data;
        } else {
          // Data is null, undefined, or other type
          return services.join(', ');
        }
        
        if (Array.isArray(serviceIds)) {
          // Skip the first one as it's already added as primary service
          const additionalServiceIds = serviceIds.slice(1);
          // You would need to fetch service details for these IDs
          // For now, just indicate there are additional services
          if (additionalServiceIds.length > 0) {
            services.push(`+${additionalServiceIds.length} more services`);
          }
        }
      } catch (e) {
        console.error('Error parsing services data:', e);
        // Return just the primary service if parsing fails
      }
    }
    
    return services.join(', ');
  };

  const getAddOnsDisplay = async (appointment) => {
    return await addOnsService.getAddOnsDisplay(appointment.add_ons_data);
  };

  // Component to display add-ons with async loading
  const AddOnsDisplay = ({ appointment }) => {
    const [addOnsText, setAddOnsText] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const loadAddOns = async () => {
        if (!appointment.add_ons_data) {
          setAddOnsText('');
          setLoading(false);
          return;
        }

        try {
          const text = await getAddOnsDisplay(appointment);
          setAddOnsText(text);
        } catch (error) {
          console.error('Error loading add-ons display:', error);
          setAddOnsText('');
        } finally {
          setLoading(false);
        }
      };

      loadAddOns();
    }, [appointment.add_ons_data]);

    if (loading) {
      return <div className="text-muted small">Loading add-ons...</div>;
    }

    if (!addOnsText) {
      return null;
    }

    return (
      <div className="text-muted small">{addOnsText}</div>
    );
  };

  const getTotalPrice = (appointment) => {
    let total = appointment.total_price || appointment.service?.price || 0;
    
    // Add urgent fee if applicable
    if (appointment.is_urgent) {
      total += 100;
    }
    
    return total;
  };

  const handleBookingResponse = async (appointmentId, action, reason = '') => {
    try {
      const appointment = pendingRequests.find(req => req.id === appointmentId);
      if (!appointment) {
        console.error('❌ Appointment not found in pending requests:', appointmentId);
        return;
      }

      console.log(`🔄 Enhanced Queue Service: ${action} booking request:`, appointmentId);

      if (action === 'accept') {
        // Use enhanced queue service for acceptance
        const result = await enhancedQueueService.acceptQueueRequest(
          appointmentId, 
          user.id, 
          appointment.is_urgent
        );

        if (result.success) {
          console.log('✅ Enhanced queue acceptance completed:', result);
          
          // Send notification using centralized service
          const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
          await centralizedNotificationService.createBookingConfirmationNotification({
            userId: appointment.customer_id,
            appointmentId: appointment.id,
            queuePosition: result.queuePosition,
            estimatedTime: result.estimatedTime
          });

          // Push notification is now handled by CentralizedNotificationService

          // Log the action
          await supabase.from('system_logs').insert({
            user_id: user.id,
            action: 'booking_request_accepted',
            details: {
              appointment_id: appointmentId,
              customer_id: appointment.customer_id,
              is_urgent: appointment.is_urgent,
              queue_position: result.queuePosition
            }
          });
        }

      } else {
        // Decline the booking
        const { error } = await supabase
          .from('appointments')
          .update({ 
            status: 'cancelled',
            cancellation_reason: reason || 'Declined by barber'
          })
          .eq('id', appointmentId);

        if (error) throw error;

        // Send notification using centralized service
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
        await centralizedNotificationService.createNotification({
          userId: appointment.customer_id,
          title: 'Booking Request Declined',
          message: `Your booking request has been declined. Reason: ${reason}`,
          type: 'booking',
          channels: ['app', 'push']
        });

        // Log the action
        await supabase.from('system_logs').insert({
          user_id: user.id,
          action: 'booking_request_declined',
          details: {
            appointment_id: appointmentId,
            customer_id: appointment.customer_id,
            reason: reason
          }
        });
      }

      // Broadcast change to all components
      window.dispatchEvent(new CustomEvent('appointmentStatusChanged', {
        detail: {
          appointmentId,
          newStatus: action === 'accept' ? 'scheduled' : 'cancelled',
          barberId: user.id,
          appointmentDate: appointment.appointment_date,
          timestamp: Date.now()
        }
      }));

      console.log(`✅ Enhanced queue booking ${action} completed`);

      // Refresh queue data
      setTimeout(() => fetchQueueData(), 1000);
    } catch (err) {
      console.error('❌ Enhanced queue service error:', err);
      
      // More specific error messages
      let errorMessage = 'Failed to process booking request. ';
      
      if (err.message) {
        if (err.message.includes('permission denied')) {
          errorMessage += 'Permission denied. Please make sure you are logged in.';
        } else if (err.message.includes('foreign key')) {
          errorMessage += 'Invalid appointment data. Please refresh and try again.';
        } else if (err.message.includes('network')) {
          errorMessage += 'Network error. Please check your connection.';
        } else if (err.message.includes('duplicate key')) {
          errorMessage += 'This action has already been processed.';
        } else {
          errorMessage += `Error: ${err.message}`;
        }
      } else {
        errorMessage += 'Please try again.';
      }
      
      setError(errorMessage);
    }
  };

  const handleAppointmentStatus = async (appointmentId, status) => {
    try {
      const appointment = currentAppointment?.id === appointmentId 
        ? currentAppointment 
        : queuedAppointments.find(apt => apt.id === appointmentId);

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      console.log(`🔄 Queue updating appointment ${appointmentId} to ${status}`);

      // Optimistic updates
      if (appointmentId === currentAppointment?.id && status === 'done') {
        setCurrentAppointment(null);
      }

      if (status === 'ongoing') {
        const appointmentToStart = queuedAppointments.find(apt => apt.id === appointmentId);
        if (appointmentToStart) {
          setCurrentAppointment(appointmentToStart);
          setQueuedAppointments(prev => prev.filter(apt => apt.id !== appointmentId));
        }
      }

      // Database update - simplified approach
      const { error } = await supabase
        .from('appointments')
        .update({ status })
        .eq('id', appointmentId);

      if (error) throw error;

      // Log the action (optional - skip if table doesn't exist)
      try {
        await supabase.from('system_logs').insert({
          user_id: user.id,
          action: `appointment_marked_${status}`,
          details: {
            appointment_id: appointmentId
          }
        });
      } catch (logError) {
        console.log('ℹ️ System logs table not available, skipping log entry');
      }

      // Push notification is now handled by CentralizedNotificationService

      // Create notification using centralized service (handles both database and push)
      try {
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
        await centralizedNotificationService.createAppointmentStatusNotification({
          userId: appointment.customer_id,
          appointmentId: appointmentId,
          status: status,
          changedBy: 'barber'
        });
        console.log('✅ Notification created for customer via CentralizedNotificationService');
      } catch (notificationError) {
        console.warn('Failed to create notification:', notificationError);
      }

      // Notify next customer if appointment completed
      if (status === 'done' && queuedAppointments.length > 0) {
        const nextAppointment = queuedAppointments[0];
        
        // Notify next customer using centralized service
        try {
          const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
          await centralizedNotificationService.createQueuePositionNotification({
            userId: nextAppointment.customer_id,
            appointmentId: nextAppointment.id,
            queuePosition: 1,
            reason: 'Previous appointment completed'
          });
          console.log('✅ Next in queue notification sent via CentralizedNotificationService');
        } catch (notificationError) {
          console.warn('Failed to send next in queue notification:', notificationError);
        }
      }

      // Broadcast change
      window.dispatchEvent(new CustomEvent('appointmentStatusChanged', {
        detail: {
          appointmentId,
          newStatus: status,
          previousStatus: appointment.status,
          barberId: user.id,
          appointmentDate: appointment.appointment_date,
          timestamp: Date.now()
        }
      }));

      console.log(`✅ Queue successfully updated appointment to ${status}`);

      // Refresh data
      setTimeout(() => fetchQueueData(), 1000);

    } catch (err) {
      console.error('❌ Queue error updating appointment status:', err);
      setError('Failed to update appointment status. Please try again.');
      
      // Refresh on error to revert optimistic updates
      fetchQueueData();
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    return `${hour12}:${minutes} ${period}`;
  };

  const formatTimeRemaining = (durationMinutes) => {
    if (durationMinutes < 60) {
      return `${durationMinutes} minutes`;
    } else {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}${minutes > 0 ? ` ${minutes} min` : ''}`;
    }
  };

  if (loading && !currentAppointment && queuedAppointments.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Today's Queue & Requests</h2>
        <div className="d-flex align-items-center">
          <div className="form-check form-switch me-3">
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
          <button 
            className="btn btn-outline-primary"
            onClick={fetchQueueData}
          >
            <i className="bi bi-arrow-clockwise me-1"></i>
            Refresh
          </button>
        </div>
      </div>
      
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setError(null)} 
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Stats */}
      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <div className="card bg-success text-white h-100">
            <div className="card-body">
              <h6 className="card-title">Completed Today</h6>
              <h3 className="mb-0">{stats.completed}</h3>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 mb-3">
          <div className="card bg-warning text-white h-100">
            <div className="card-body">
              <h6 className="card-title">In Queue</h6>
              <h3 className="mb-0">{stats.remaining}</h3>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 mb-3">
          <div className="card bg-info text-white h-100">
            <div className="card-body">
              <h6 className="card-title">Est. Time Remaining</h6>
              <h3 className="mb-0">{stats.totalTime ? formatTimeRemaining(stats.totalTime) : '0 min'}</h3>
            </div>
          </div>
        </div>

        <div className="col-md-3 mb-3">
          <div className="card bg-primary text-white h-100">
            <div className="card-body">
              <h6 className="card-title">Pending Requests</h6>
              <h3 className="mb-0">{stats.pendingRequests}</h3>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Hybrid Queue - Unified Timeline */}
      {timeline.length > 0 && (
        <div className="card mb-4 border-primary shadow-sm">
          <div className="card-header bg-primary text-white">
            <div className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                <i className="bi bi-clock-history me-2"></i>
                Today's Unified Timeline ({timeline.length} appointments)
              </h5>
              <div className="d-flex align-items-center gap-3">
                <div className="text-center">
                  <div className="fw-bold fs-5">{efficiency}%</div>
                  <div className="small opacity-75">Efficiency</div>
                </div>
                <div className="text-center">
                  <div className="fw-bold fs-5">{queueStats.completed || 0}</div>
                  <div className="small opacity-75">Completed</div>
                </div>
              </div>
            </div>
          </div>
          <div className="card-body p-0">
            <div className="unified-timeline">
              {/* Current Appointment */}
              {currentAppointment && (
                <div className="timeline-item current-appointment">
                  <div className="timeline-marker current">
                    <i className="bi bi-play-circle-fill"></i>
                  </div>
                  <div className="timeline-content">
                    <div className="card border-success border-2">
                      <div className="card-header bg-success text-white">
                        <h6 className="mb-0">
                          <i className="bi bi-scissors me-2"></i>
                          CURRENT - {currentAppointment.customer?.full_name}
                        </h6>
                      </div>
                      <div className="card-body">
                        <div className="row">
                          <div className="col-md-6">
                            <strong>Services:</strong> {getServicesDisplay(currentAppointment)}
                          </div>
                          <div className="col-md-6">
                            <strong>Duration:</strong> {currentAppointment.total_duration || 30} min
                          </div>
                        </div>
                        <div className="mt-2">
                          <AddOnsDisplay appointment={currentAppointment} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Timeline Items */}
              {timeline.map((appointment, index) => (
                <div key={appointment.id} className={`timeline-item ${appointment.id === currentAppointment?.id ? 'current' : ''}`}>
                  <div className={`timeline-marker ${appointment.appointment_type === 'scheduled' ? 'scheduled' : 'queue'}`}>
                    {appointment.appointment_type === 'scheduled' ? (
                      <i className="bi bi-calendar-check"></i>
                    ) : (
                      <span>{appointment.queue_position || index + 1}</span>
                    )}
                  </div>
                  <div className="timeline-content">
                    <div className={`card ${appointment.is_urgent ? 'border-danger' : 'border-secondary'}`}>
                      <div className={`card-header ${appointment.appointment_type === 'scheduled' ? 'bg-info' : 'bg-warning'} text-white`}>
                        <div className="d-flex justify-content-between align-items-center">
                          <h6 className="mb-0">
                            {appointment.appointment_type === 'scheduled' ? (
                              <i className="bi bi-calendar-check me-2"></i>
                            ) : (
                              <i className="bi bi-people me-2"></i>
                            )}
                            {appointment.customer?.full_name}
                          </h6>
                          <div className="d-flex gap-1">
                            {appointment.is_urgent && (
                              <span className="badge bg-danger">
                                <i className="bi bi-lightning-fill me-1"></i>URGENT
                              </span>
                            )}
                            <span className="badge bg-light text-dark">
                              {appointment.appointment_time || `Queue #${appointment.queue_position || index + 1}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="card-body">
                        <div className="row">
                          <div className="col-md-6">
                            <strong>Services:</strong> {getServicesDisplay(appointment)}
                          </div>
                          <div className="col-md-6">
                            <strong>Duration:</strong> {appointment.total_duration || 30} min
                          </div>
                        </div>
                        <div className="mt-2">
                          <AddOnsDisplay appointment={appointment} />
                        </div>
                        {(appointment.estimated_arrival || appointment.estimated_time) && (
                          <div className="mt-2">
                            <small className="text-muted">
                              <i className="bi bi-clock me-1"></i>
                              Est. Start: {appointment.estimated_arrival || appointment.estimated_time}
                            </small>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pending Booking Requests */}
      {pendingRequests.length > 0 && (
        <div className="card mb-4 border-warning shadow-sm">
          <div className="card-header bg-warning text-dark">
            <h5 className="mb-0">
              <i className="bi bi-bell me-2"></i>
              Pending Booking Requests ({pendingRequests.length})
              {pendingRequests.some(req => req.is_urgent) && (
                <span className="badge bg-danger ms-2">
                  <i className="bi bi-lightning-fill me-1"></i>
                  {pendingRequests.filter(req => req.is_urgent).length} URGENT
                </span>
              )}
            </h5>
          </div>
          <div className="card-body p-3">
            <div className="row g-3">
              {pendingRequests.map((request) => (
                <div key={request.id} className="col-12 col-md-6 col-lg-4">
                  <div className={`card h-100 ${request.is_urgent ? 'border-danger border-2' : 'border-secondary'} shadow-sm`}>
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h6 className="card-title mb-0">{request.customer?.full_name}</h6>
                        <div className="d-flex gap-1">
                          {request.is_urgent && (
                            <span className="badge bg-danger">
                              <i className="bi bi-lightning-fill me-1"></i>URGENT
                            </span>
                          )}
                          {request.is_rebooking && (
                            <span className="badge bg-info">RESCHEDULE</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="mb-2">
                        <small className="text-muted">
                          <i className="bi bi-calendar me-1"></i>
                          {new Date(request.appointment_date).toLocaleDateString()}
                        </small>
                      </div>

                      <div className="mb-2">
                        <strong>Services:</strong>
                        <div className="text-muted small">{getServicesDisplay(request)}</div>
                      </div>

                      <div className="mb-2">
                        <small className="text-muted">Add-ons:</small>
                        <div className="addon-display">
                          <AddOnsDisplay appointment={request} />
                        </div>
                      </div>

                      {/* Friend/Child Booking Information */}
                      <FriendBookingDisplay appointment={request} variant="compact" />

                      <div className="mb-2">
                        <strong>Total:</strong> 
                        <span className="text-success ms-1">₱{getTotalPrice(request)}</span>
                        <small className="text-muted ms-2">
                          ({request.total_duration || (request.service?.duration || 30)} min)
                        </small>
                      </div>

                      {request.notes && (
                        <div className="mb-2">
                          <strong>Notes:</strong>
                          <div className="text-muted small bg-light p-2 rounded">{request.notes}</div>
                        </div>
                      )}

                      <div className="d-flex justify-content-between gap-2">
                        <button
                          className={`btn ${request.is_urgent ? 'btn-danger' : 'btn-success'} btn-sm flex-fill`}
                          onClick={() => handleBookingResponse(request.id, 'accept')}
                        >
                          <i className="bi bi-check-circle me-1"></i>
                          {request.is_urgent ? 'Accept URGENT' : 'Accept'}
                        </button>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => {
                            const reason = prompt('Reason for declining (optional):');
                            if (reason !== null) {
                              handleBookingResponse(request.id, 'decline', reason);
                            }
                          }}
                        >
                          <i className="bi bi-x-circle me-1"></i>
                          Decline
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Current appointment - Enhanced UI */}
      {currentAppointment ? (
        <div className="card mb-4 border-0 shadow-lg current-appointment-card">
          <div className="card-header bg-gradient bg-primary text-white position-relative overflow-hidden">
            <div className="position-absolute top-0 end-0 w-100 h-100 opacity-10">
              <i className="bi bi-scissors" style={{ fontSize: '6rem', position: 'absolute', top: '-1rem', right: '-1rem' }}></i>
            </div>
            <div className="d-flex align-items-center justify-content-between position-relative">
              <div>
                <h4 className="mb-1 fw-bold">
                  <i className="bi bi-scissors me-2"></i>
                  Currently Serving
                </h4>
                <p className="mb-0 opacity-75">Active appointment in progress</p>
              </div>
              <div className="text-center">
                <div className="bg-white bg-opacity-20 rounded-pill px-3 py-2">
                  <div className="fw-bold fs-5">IN PROGRESS</div>
                  <div className="small opacity-75">Live Service</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="card-body p-4">
            <div className="row g-4">
              {/* Customer Profile */}
              <div className="col-12 col-md-4 mb-3 mb-md-0">
                <div className="text-center">
                  <div className="customer-avatar mb-3">
                    <div className="rounded-circle bg-primary bg-opacity-10 p-4 d-inline-block position-relative">
                      <i className="bi bi-person-circle fs-1 text-primary"></i>
                      <div className="position-absolute top-0 end-0 translate-middle">
                        <span className="badge bg-success rounded-pill">
                          <i className="bi bi-check-circle me-1"></i>
                          Active
                        </span>
                      </div>
                    </div>
                  </div>
                  <h3 className="mb-3 fw-bold text-primary">{currentAppointment.customer?.full_name}</h3>
                  <div className="d-flex flex-column flex-sm-row gap-2 justify-content-center">
                    {currentAppointment.customer?.phone && (
                      <a 
                        href={`tel:${currentAppointment.customer.phone}`}
                        className="btn btn-outline-primary btn-lg contact-btn"
                      >
                        <i className="bi bi-telephone me-2"></i>
                        Call Customer
                      </a>
                    )}
                    {currentAppointment.customer?.email && (
                      <a 
                        href={`mailto:${currentAppointment.customer.email}`}
                        className="btn btn-outline-secondary btn-lg contact-btn"
                      >
                        <i className="bi bi-envelope me-2"></i>
                        Email
                      </a>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Service Details */}
              <div className="col-md-5 mb-3 mb-md-0">
                <div className="card h-100 border-0 shadow-sm">
                  <div className="card-header bg-light">
                    <h5 className="mb-0 fw-bold">
                      <i className="bi bi-scissors me-2"></i>
                      Service Details
                    </h5>
                  </div>
                  <div className="card-body">
                    <div className="service-details">
                      <div className="detail-row">
                        <span className="detail-label">Services:</span>
                        <span className="detail-value">{getServicesDisplay(currentAppointment)}</span>
                      </div>
                      
                      <div className="detail-row">
                        <span className="detail-label">Add-ons:</span>
                        <span className="detail-value">
                          <AddOnsDisplay appointment={currentAppointment} />
                        </span>
                      </div>
                      
                      <div className="detail-row">
                        <span className="detail-label">Total:</span>
                        <span className="detail-value fw-bold text-success">₱{getTotalPrice(currentAppointment)}</span>
                      </div>
                      
                      <div className="detail-row">
                        <span className="detail-label">Duration:</span>
                        <span className="detail-value">
                          {currentAppointment.total_duration || currentAppointment.service?.duration} minutes
                        </span>
                      </div>
                    </div>
                    
                    {/* Friend/Child Booking Information */}
                    <div className="mt-3">
                      <FriendBookingDisplay appointment={currentAppointment} variant="card" />
                    </div>
                    
                    {currentAppointment.notes && (
                      <div className="mt-3">
                        <div className="notes-section">
                          <h6 className="detail-label">
                            <i className="bi bi-chat-right-text me-2"></i>
                            Notes
                          </h6>
                          <div className="notes-content">
                            {currentAppointment.notes}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Action Button */}
              <div className="col-md-3 d-flex align-items-center justify-content-center">
                <button
                  className="btn btn-success btn-lg w-100 action-btn complete-btn"
                  onClick={() => handleAppointmentStatus(currentAppointment.id, 'done')}
                >
                  <i className="bi bi-check-circle me-2"></i>
                  Complete Service
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card mb-4 border-0 shadow-sm">
          <div className="card-body text-center py-5 empty-state">
            <div className="display-1 text-muted mb-4">
              <i className="bi bi-scissors"></i>
            </div>
            <h4 className="text-muted mb-3">No customer currently being served</h4>
            <p className="text-muted mb-4">Ready to start the next appointment</p>
            {queuedAppointments.length > 0 && (
              <button
                className="btn btn-primary btn-lg action-btn"
                onClick={() => handleAppointmentStatus(queuedAppointments[0].id, 'ongoing')}
              >
                <i className="bi bi-play-fill me-2"></i>
                Start Next Appointment
              </button>
            )}
          </div>
        </div>
      )}

      {/* Queue - Enhanced UI */}
      <div className="card border-0 shadow-lg">
        <div className="card-header bg-gradient bg-light">
          <div className="d-flex align-items-center justify-content-between">
            <h4 className="mb-0 fw-bold">
              <i className="bi bi-people-fill me-2 text-primary"></i>
              Waiting Queue
            </h4>
            <div className="text-center">
              <div className="bg-primary bg-opacity-10 rounded-pill px-3 py-2">
                <span className="fw-bold fs-4 text-primary">{queuedAppointments.length}</span>
                <div className="small text-muted">
                  {queuedAppointments.length === 1 ? 'customer' : 'customers'} waiting
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="card-body p-0">
          {queuedAppointments.length === 0 ? (
            <div className="text-center py-5 empty-state">
              <div className="display-1 text-muted mb-4">
                <i className="bi bi-list-check"></i>
              </div>
              <h5 className="text-muted mb-3">No customers waiting</h5>
              <p className="text-muted mb-4">All appointments are completed or in progress</p>
              <Link to="/schedule" className="btn btn-outline-primary btn-lg">
                <i className="bi bi-calendar3 me-2"></i>
                View Full Schedule
              </Link>
            </div>
          ) : (
            <div className="queue-list">
              {queuedAppointments.map((appointment, index) => (
                <div key={appointment.id} className={`queue-item ${appointment.is_urgent ? 'urgent-item' : ''} ${index === 0 ? 'next-in-line' : ''}`}>
                  <div className="queue-item-content">
                    {/* Queue Position & Customer Info */}
                    <div className="queue-position-section">
                      <div className={`queue-number ${appointment.is_urgent ? 'urgent' : 'normal'}`}>
                        {appointment.is_urgent ? (
                          <i className="bi bi-lightning-fill"></i>
                        ) : (
                          <span>{appointment.queue_position || index + 1}</span>
                        )}
                      </div>
                      
                      <div className="customer-details">
                        <h5 className="customer-name mb-1">{appointment.customer?.full_name}</h5>
                        <div className="customer-meta">
                          {appointment.customer?.phone && (
                            <span className="text-muted">
                              <i className="bi bi-telephone me-1"></i>
                              {appointment.customer.phone}
                            </span>
                          )}
                          {appointment.is_urgent && (
                            <span className="badge bg-danger ms-2">
                              <i className="bi bi-lightning-fill me-1"></i>
                              URGENT
                            </span>
                          )}
                        </div>
                        <FriendBookingDisplay appointment={appointment} variant="inline" />
                      </div>
                    </div>

                    {/* Service Details */}
                    <div className="service-details-section">
                      <h6 className="service-name mb-1">{getServicesDisplay(appointment)}</h6>
                      <div className="service-meta">
                        <span className="text-muted">
                          <i className="bi bi-clock me-1"></i>
                          {appointment.total_duration || appointment.service?.duration} min
                        </span>
                        <span className="text-success fw-semibold ms-2">
                          <i className="bi bi-currency-dollar me-1"></i>
                          <span className="currency-amount">₱{Number(getTotalPrice(appointment)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </span>
                      </div>
                      <div className="addons-info">
                        <AddOnsDisplay appointment={appointment} />
                      </div>
                    </div>

                    {/* Queue Info */}
                    <div className="queue-info-section">
                      <div className="queue-position-info">
                        <span className="position-text">
                          Position #{appointment.queue_position || index + 1}
                        </span>
                        {appointment.priority_level && appointment.priority_level !== 'normal' && (
                          <span className={`priority-badge ${appointment.priority_level}`}>
                            {appointment.priority_level}
                          </span>
                        )}
                      </div>
                      
                      {(appointment.estimated_arrival || appointment.estimated_time) && (
                        <div className="wait-time">
                          <i className="bi bi-clock me-1"></i>
                          Est. arrival: {appointment.estimated_arrival || appointment.estimated_time}
                        </div>
                      )}
                      
                      {appointment.wait_time && appointment.wait_time > 0 && (
                        <div className="wait-time">
                          <i className="bi bi-hourglass-split me-1"></i>
                          Wait: {appointment.wait_time} min
                        </div>
                      )}
                      
                      {appointment.notes && (
                        <div className="notes-indicator">
                          <i className="bi bi-chat-right-text me-1"></i>
                          Has notes
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="action-section">
                      {index === 0 && !currentAppointment ? (
                        <button
                          className="btn btn-primary btn-lg action-btn"
                          onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                        >
                          <i className="bi bi-play-fill me-2"></i>
                          Start Service
                        </button>
                      ) : (
                        <button
                          className="btn btn-outline-danger btn-lg action-btn"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to cancel this appointment?')) {
                              handleAppointmentStatus(appointment.id, 'cancelled');
                            }
                          }}
                        >
                          <i className="bi bi-x-circle me-2"></i>
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default BarberQueue;