// components/barber/BarberQueue.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
// REMOVED: PushService and NotificationService imports - use only CentralizedNotificationService
import LoadingSpinner from '../common/LoadingSpinner';
import addOnsService from '../../services/booking/AddOnsService';
import enhancedQueueService from '../../services/queue/EnhancedQueueService';
import dateService from '../../services/core/DateService';
import appointmentTypeManager from '../../services/booking/AppointmentTypeManager';
import AdvancedHybridQueueService from '../../services/queue/AdvancedHybridQueueService';
import FriendBookingDisplay from '../common/FriendBookingDisplay';
import RescheduleModal from './RescheduleModal';
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
  const [rescheduleModal, setRescheduleModal] = useState({ isOpen: false, appointment: null });

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
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        return; // Silent bypass
      }
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

          // Notification is already sent by EnhancedQueueService.notifyCustomerQueueAcceptance()
          // No need to send duplicate notification here

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
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        await centralizedNotificationService.createNotification({
          userId: appointment.customer_id,
          title: 'Booking Request Declined ❌',
          message: `Unfortunately, your booking request could not be accepted. Reason: ${reason || 'Barber unavailable'}. Please try another time.`,
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
          newStatus: action === 'accept' ? 'confirmed' : 'cancelled',
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

      // Check if starting an appointment (ongoing) is for today only
      if (status === 'ongoing') {
        const today = new Date().toISOString().split('T')[0];
        const appointmentDate = appointment.appointment_date || '';

        if (appointmentDate !== today) {
          setError('You can only start appointments scheduled for today.');
          return;
        }
      }

      // Optimistic updates
      if (appointmentId === currentAppointment?.id && status === 'completed') {
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
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
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
      if (status === 'completed' && queuedAppointments.length > 0) {
        const nextAppointment = queuedAppointments[0];

        // Notify next customer using centralized service
        try {
          const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
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

  // Calculate total service time
  const totalServiceTime = queuedAppointments.reduce((total, apt) => {
    return total + (apt.total_duration || apt.service?.duration || 30);
  }, 0);

  return (
    <div className="container py-4" style={{ maxWidth: '1200px' }}>
      {/* Header */}
      <div
        className="d-flex justify-content-between align-items-center mb-3 mb-md-4 queue-status-header"
        style={{
          borderRadius: '12px',
          padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)',
        }}
      >
        <div className="d-flex align-items-center gap-2">
          <div
            className="d-flex align-items-center justify-content-center"
            style={{
              width: 'clamp(32px, 7vw, 38px)',
              height: 'clamp(32px, 7vw, 38px)',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.16)',
            }}
          >
            <i className="bi bi-list-ol" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)' }}></i>
          </div>
          <div>
            <h3
              className="mb-0 text-white fw-bold"
              style={{ fontSize: 'clamp(1rem, 4vw, 1.25rem)' }}
            >
              Today's Queue & Requests
            </h3>
            <small
              className="text-white-50 d-none d-sm-inline"
              style={{ fontSize: 'clamp(0.75rem, 2.2vw, 0.85rem)' }}
            >
              Quickly see who&apos;s waiting and manage new booking requests
            </small>
          </div>
        </div>
        <button
          className="btn btn-light rounded-circle"
          onClick={fetchQueueData}
          style={{
            width: 'clamp(35px, 8vw, 40px)',
            height: 'clamp(35px, 8vw, 40px)',
            padding: 0,
            minWidth: '35px',
          }}
          title="Refresh queue"
        >
          <i
            className="bi bi-arrow-clockwise"
            style={{ fontSize: 'clamp(0.875rem, 2vw, 1rem)' }}
          ></i>
        </button>
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

      {/* Stats Cards */}
      <div className="row mb-4 g-2 g-md-3">
        <div className="col-6 col-md-3 mb-2 mb-md-3">
          <div className="queue-stat-card h-100">
            <div className="d-flex flex-column align-items-center text-center">
              <div className="mb-1">
                <i
                  className="bi bi-check-circle-fill text-success"
                  style={{ fontSize: 'clamp(1.1rem, 3vw, 1.4rem)' }}
                ></i>
              </div>
              <div className="queue-stat-number">{stats.completed || 0}</div>
              <div className="queue-stat-label">Completed Today</div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3 mb-2 mb-md-3">
          <div className="queue-stat-card h-100">
            <div className="d-flex flex-column align-items-center text-center">
              <div className="mb-1">
                <i
                  className="bi bi-people-fill text-primary"
                  style={{ fontSize: 'clamp(1.1rem, 3vw, 1.4rem)' }}
                ></i>
              </div>
              <div className="queue-stat-number">{stats.remaining || 0}</div>
              <div className="queue-stat-label">In Queue</div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3 mb-2 mb-md-3">
          <div className="queue-stat-card h-100">
            <div className="d-flex flex-column align-items-center text-center">
              <div className="mb-1">
                <i
                  className="bi bi-bell-fill text-warning"
                  style={{ fontSize: 'clamp(1.1rem, 3vw, 1.4rem)' }}
                ></i>
              </div>
              <div className="queue-stat-number">{stats.pendingRequests || 0}</div>
              <div className="queue-stat-label">Pending Requests</div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3 mb-2 mb-md-3">
          <div className="queue-stat-card h-100">
            <div className="d-flex flex-column align-items-center text-center">
              <div className="mb-1">
                <i
                  className="bi bi-clock-history text-info"
                  style={{ fontSize: 'clamp(1.1rem, 3vw, 1.4rem)' }}
                ></i>
              </div>
              <div className="queue-stat-number">{totalServiceTime}</div>
              <div className="queue-stat-label">Total Service Time (min)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer to Service Section */}
      {queuedAppointments.length > 0 && !currentAppointment && (
        <div className="mb-3 mb-md-4">
          <h5 className="mb-2 mb-md-3" style={{ fontWeight: '600', fontSize: 'clamp(1rem, 3vw, 1.25rem)' }}>Customer to Service</h5>
          <div className="d-flex align-items-center mb-2 mb-md-3" style={{
            background: '#e5e7eb',
            borderRadius: '12px',
            padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)',
            gap: 'clamp(0.5rem, 2vw, 1rem)'
          }}>
            {/* Queue Number Badge */}
            <div className="d-flex align-items-center justify-content-center flex-shrink-0" style={{
              width: 'clamp(35px, 8vw, 40px)',
              height: 'clamp(35px, 8vw, 40px)',
              background: '#d1d5db',
              borderRadius: '50%',
              color: '#16a34a',
              fontWeight: 'bold',
              fontSize: 'clamp(1rem, 3vw, 1.2rem)'
            }}>
              {queuedAppointments[0].queue_position || 1}
            </div>

            {/* Customer Info */}
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'clamp(0.95rem, 3vw, 1.1rem)', fontWeight: '500', marginBottom: '0.25rem' }}>
                {queuedAppointments[0].customer?.full_name || 'Unknown Customer'}
              </div>
              <div style={{ fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)', color: '#6b7280' }}>
                Services: {getServicesDisplay(queuedAppointments[0]) || 'Classic'}
              </div>
            </div>

            {/* Duration */}
            <div className="flex-shrink-0" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1rem)', fontWeight: '500', color: '#4b5563' }}>
              {queuedAppointments[0].total_duration || queuedAppointments[0].service?.duration || 30} min
            </div>
          </div>

          {/* Action Buttons */}
          <div className="d-flex gap-2 mb-4">
            <button
              className="btn text-white flex-fill"
              onClick={() => handleAppointmentStatus(queuedAppointments[0].id, 'ongoing')}
              style={{
                background: '#16a34a',
                borderRadius: '8px',
                padding: 'clamp(0.625rem, 2vw, 0.75rem)',
                fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                fontWeight: '500',
                border: 'none'
              }}
            >
              Start
            </button>
            <button
              className="btn text-white flex-fill"
              onClick={() => {
                if (queuedAppointments.length > 1) {
                  handleAppointmentStatus(queuedAppointments[1].id, 'ongoing');
                }
              }}
              disabled={queuedAppointments.length <= 1}
              style={{
                background: '#eab308',
                borderRadius: '8px',
                padding: 'clamp(0.625rem, 2vw, 0.75rem)',
                fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                fontWeight: '500',
                border: 'none',
                opacity: queuedAppointments.length <= 1 ? 0.5 : 1
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Current Customer Being Served */}
      {currentAppointment && (
        <div className="mb-3 mb-md-4">
          <h5 className="mb-2 mb-md-3" style={{ fontWeight: '600', fontSize: 'clamp(1rem, 3vw, 1.25rem)' }}>Customer to Service</h5>
          <div className="d-flex align-items-center mb-2 mb-md-3" style={{
            background: '#e5e7eb',
            borderRadius: '12px',
            padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)',
            gap: 'clamp(0.5rem, 2vw, 1rem)'
          }}>
            {/* Queue Number Badge */}
            <div className="d-flex align-items-center justify-content-center flex-shrink-0" style={{
              width: 'clamp(35px, 8vw, 40px)',
              height: 'clamp(35px, 8vw, 40px)',
              background: '#d1d5db',
              borderRadius: '50%',
              color: '#16a34a',
              fontWeight: 'bold',
              fontSize: 'clamp(1rem, 3vw, 1.2rem)'
            }}>
              1
            </div>

            {/* Customer Info */}
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'clamp(0.95rem, 3vw, 1.1rem)', fontWeight: '500', marginBottom: '0.25rem' }}>
                {currentAppointment.customer?.full_name || 'Unknown Customer'}
              </div>
              <div style={{ fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)', color: '#6b7280' }}>
                Services: {getServicesDisplay(currentAppointment) || 'Classic'}
              </div>
            </div>

            {/* Duration */}
            <div className="flex-shrink-0" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1rem)', fontWeight: '500', color: '#4b5563' }}>
              {currentAppointment.total_duration || currentAppointment.service?.duration || 30} min
            </div>
          </div>

          {/* Action Buttons */}
          <div className="d-flex gap-2 mb-4">
            <button
              className="btn text-white flex-fill"
              onClick={() => handleAppointmentStatus(currentAppointment.id, 'completed')}
              style={{
                background: '#16a34a',
                borderRadius: '8px',
                padding: 'clamp(0.625rem, 2vw, 0.75rem)',
                fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                fontWeight: '500',
                border: 'none'
              }}
            >
              Complete
            </button>
            {queuedAppointments.length > 0 && (
              <button
                className="btn text-white flex-fill"
                onClick={() => handleAppointmentStatus(queuedAppointments[0].id, 'ongoing')}
                style={{
                  background: '#eab308',
                  borderRadius: '8px',
                  padding: 'clamp(0.625rem, 2vw, 0.75rem)',
                  fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                  fontWeight: '500',
                  border: 'none'
                }}
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}

      {/* Waiting List Section */}
      <div className="mb-3 mb-md-4">
        <div className="d-flex justify-content-between align-items-center mb-2 mb-md-3 flex-wrap gap-2">
          <h5 className="mb-0" style={{ fontWeight: '600', fontSize: 'clamp(1rem, 3vw, 1.25rem)' }}>Waiting List</h5>
          <div className="d-flex align-items-center gap-2">
            <span className="d-none d-md-inline" style={{ fontSize: 'clamp(0.8rem, 2vw, 0.9rem)', color: '#6b7280' }}>Customer Waiting</span>
            <span className="badge" style={{
              background: '#bfdbfe',
              color: '#fff',
              borderRadius: '50%',
              width: 'clamp(28px, 6vw, 32px)',
              height: 'clamp(28px, 6vw, 32px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
              fontWeight: '600'
            }}>
              {(() => {
                if (currentAppointment) {
                  return queuedAppointments.length;
                } else {
                  return Math.max(0, queuedAppointments.length - 1);
                }
              })()}
            </span>
          </div>
        </div>

        {(() => {
          const waitingList = currentAppointment
            ? queuedAppointments
            : queuedAppointments.slice(1);

          return waitingList.length === 0 ? (
            <div className="text-center py-5" style={{
              background: '#f9fafb',
              borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}>
              <p className="text-muted mb-0">No customers waiting</p>
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              {waitingList.map((appointment, displayIndex) => {
                const actualIndex = currentAppointment ? displayIndex + 1 : displayIndex + 2;
                return (
                  <div
                    key={appointment.id}
                    className="d-flex align-items-center"
                    style={{
                      background: '#e5e7eb',
                      borderRadius: '12px',
                      padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)',
                      gap: 'clamp(0.5rem, 2vw, 1rem)'
                    }}
                  >
                    {/* Queue Number Badge */}
                    <div className="d-flex align-items-center justify-content-center flex-shrink-0" style={{
                      width: 'clamp(35px, 8vw, 40px)',
                      height: 'clamp(35px, 8vw, 40px)',
                      background: '#d1d5db',
                      borderRadius: '50%',
                      color: '#16a34a',
                      fontWeight: 'bold',
                      fontSize: 'clamp(0.95rem, 3vw, 1.1rem)'
                    }}>
                      {appointment.queue_position || (actualIndex + 1)}
                    </div>

                    {/* Customer Info */}
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1rem)', fontWeight: '500', marginBottom: '0.25rem', color: '#1f2937' }}>
                        {appointment.customer?.full_name || 'Customer'}
                      </div>
                      <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.85rem)', color: '#6b7280' }}>
                        {getServicesDisplay(appointment) || 'Service'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Pending Requests Section */}
      <div>
        <h5 className="mb-2 mb-md-3" style={{ fontWeight: '600', fontSize: 'clamp(1rem, 3vw, 1.25rem)' }}>Pending Requests</h5>
        {pendingRequests.length === 0 ? (
          <div className="text-center py-4" style={{
            background: '#f9fafb',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
          }}>
            <p className="text-muted mb-0">No pending requests</p>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-2 gap-md-0"
                style={{
                  background: '#f3f4f6',
                  borderRadius: '12px',
                  padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)',
                  border: request.is_urgent ? '2px solid #ef4444' : '1px solid #e5e7eb'
                }}
              >
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex align-items-center gap-2 mb-1 mb-md-2 flex-wrap">
                    <div style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1rem)', fontWeight: '500', color: '#1f2937' }}>
                      {request.customer?.full_name || 'Unknown Customer'}
                    </div>
                    {request.is_urgent && (
                      <span className="badge bg-danger" style={{ fontSize: 'clamp(0.7rem, 2vw, 0.75rem)' }}>
                        URGENT
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.85rem)', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Services: {getServicesDisplay(request) || 'Classic'}
                  </div>
                  <div style={{ fontSize: 'clamp(0.75rem, 2vw, 0.85rem)', color: '#6b7280' }}>
                    Total: <span className="text-success fw-bold">₱{getTotalPrice(request)}</span>
                    {' '}({request.total_duration || (request.service?.duration || 30)} min)
                  </div>
                </div>

                <div className="d-flex gap-2 w-100 w-md-auto">
                  <button
                    className="btn btn-sm flex-fill flex-md-initial"
                    onClick={() => handleBookingResponse(request.id, 'accept')}
                    style={{
                      background: request.is_urgent ? '#ef4444' : '#16a34a',
                      color: '#fff',
                      borderRadius: '8px',
                      border: 'none',
                      padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                      fontWeight: '500',
                      fontSize: 'clamp(0.85rem, 2vw, 0.9rem)'
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger flex-fill flex-md-initial"
                    onClick={() => {
                      const reason = prompt('Reason for declining (optional):');
                      if (reason !== null) {
                        handleBookingResponse(request.id, 'decline', reason);
                      }
                    }}
                    style={{
                      borderRadius: '8px',
                      padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                      fontWeight: '500',
                      fontSize: 'clamp(0.85rem, 2vw, 0.9rem)'
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Reschedule Modal */}
      <RescheduleModal
        isOpen={rescheduleModal.isOpen}
        onClose={() => setRescheduleModal({ isOpen: false, appointment: null })}
        appointment={rescheduleModal.appointment}
        onSuccess={(request) => {
          console.log('✅ Reschedule request created:', request);
          setRescheduleModal({ isOpen: false, appointment: null });
          fetchQueueData(); // Refresh the queue after reschedule request
        }}
      />
    </div>
  );
};

export default BarberQueue;
