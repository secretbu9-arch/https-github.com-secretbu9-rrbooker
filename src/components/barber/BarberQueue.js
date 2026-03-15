// components/barber/BarberQueue.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
// REMOVED: PushService and NotificationService imports - use only CentralizedNotificationService
import LoadingSpinner from '../common/LoadingSpinner';
import addOnsService from '../../services/booking/AddOnsService';
import queueService from '../../services/queue/QueueService';
import dateService from '../../services/core/DateService';
import appointmentTypeManager from '../../services/booking/AppointmentTypeManager';
import AdvancedHybridQueueService from '../../services/queue/AdvancedHybridQueueService';
import FriendBookingDisplay from '../common/FriendBookingDisplay';
import RescheduleModal from './RescheduleModal';

const barberQueueStyles = `
  :root {
    --barber-black: #000000;
    --barber-brown: #2c1810;
    --barber-light-brown: #4d3a31;
    --barber-white: #ffffff;
    --barber-light-gray: #f8f9fa;
    --barber-gray: #e9ecef;
    --barber-dark-gray: #6c757d;
  }

  .queue-container {
    background-color: var(--barber-light-gray);
    min-height: 100vh;
    padding-bottom: 5rem;
  }

  /* Premium Cards */
  .premium-card {
    background: var(--barber-white);
    border: none;
    border-radius: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    overflow: hidden;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  /* Stat Cards - Interactive */
  .stat-card-modern {
    background: var(--barber-white);
    border-radius: 20px;
    padding: 1rem 1.25rem;
    border: 1px solid rgba(0,0,0,0.05);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 100%;
    min-width: 0;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    user-select: none;
    scroll-snap-align: center;
    -webkit-tap-highlight-color: transparent;
  }

  .stat-card-modern:hover {
    transform: translateY(-2px);
    border-color: var(--barber-brown);
    box-shadow: 0 10px 20px rgba(0,0,0,0.05);
  }

  .stat-card-modern:active {
    transform: scale(0.96);
    background: var(--barber-gray);
  }

  .stat-icon-box {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    transition: all 0.3s ease;
  }

  /* Serving Card - High Focus */
  .serving-card-premium {
    background: var(--barber-black);
    color: var(--barber-white);
    border-radius: 24px;
    padding: 2rem;
    margin-bottom: 2rem;
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
  }

  .serving-card-premium::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 150px;
    height: 150px;
    background: linear-gradient(135deg, transparent, rgba(255,255,255,0.05));
    border-radius: 0 0 0 100%;
  }

  .serving-label {
    text-transform: uppercase;
    letter-spacing: 2px;
    font-size: 0.75rem;
    font-weight: 800;
    color: var(--barber-dark-gray);
    margin-bottom: 0.5rem;
  }

  /* Queue Item - Minimalist */
  .queue-item-minimal {
    background: var(--barber-white);
    border-radius: 16px;
    padding: 1rem 1.5rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 1.25rem;
    border: 1px solid rgba(0,0,0,0.03);
    transition: all 0.2s ease;
  }

  .queue-item-minimal:hover {
    transform: translateX(5px);
    border-color: var(--barber-brown);
  }

  .queue-number-badge {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--barber-light-gray);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    color: var(--barber-black);
    font-size: 1.1rem;
  }

  /* Buttons */
  .btn-premium-primary {
    background: var(--barber-brown);
    color: var(--barber-white);
    border: none;
    border-radius: 12px;
    padding: 0.75rem 1.5rem;
    font-weight: 700;
    transition: all 0.2s ease;
  }

  .btn-premium-primary:hover {
    background: var(--barber-black);
    transform: translateY(-2px);
    color: var(--barber-white);
  }

  .btn-premium-finish {
    background: var(--barber-white);
    color: var(--barber-black);
    border: none;
    border-radius: 14px;
    padding: 1rem 2rem;
    font-weight: 800;
    width: 100%;
    margin-top: 1rem;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  }

  .btn-premium-finish:hover {
    background: var(--barber-gray);
    transform: translateY(-2px);
  }

  .section-title {
    font-weight: 900;
    letter-spacing: -0.5px;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .empty-state-minimal {
    padding: 3rem;
    text-align: center;
    background: rgba(0,0,0,0.02);
    border-radius: 20px;
    border: 2px dashed rgba(0,0,0,0.05);
  }

  /* New 2x2 Grid for Mobile */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    padding: 0 0 1.5rem;
  }

  .stats-row::-webkit-scrollbar {
    display: none;
  }

  @media (min-width: 768px) {
    .stats-row {
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
    }
  }
`;

const BarberQueue = () => {
  const [currentAppointment, setCurrentAppointment] = useState(null);
  const [queuedAppointments, setQueuedAppointments] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [completedAppointments, setCompletedAppointments] = useState([]);
  const [cancelledAppointments, setCancelledAppointments] = useState([]);
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
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  });


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
      selectedDate,
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
      AdvancedHybridQueueService.unsubscribeFromQueue(`${user.id}-${selectedDate}`);
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
        selectedDate
      );

      if (queueData.success) {
        // Validate appointment data consistency
        validateAppointmentData(queueData.timeline);

        setTimeline(queueData.timeline);
        setCurrentAppointment(queueData.current);
        setQueueStats(queueData.stats);
        setEfficiency(queueData.efficiency || 0);

        // Update legacy state for compatibility - filter by appointment_type
        setQueuedAppointments(queueData.timeline.filter(apt =>
          apt.appointment_type === 'queue' &&
          apt.status !== 'completed' &&
          apt.status !== 'cancelled' &&
          apt.status !== 'cancel'
        ));
        setPendingRequests(queueData.timeline.filter(apt => apt.status === 'pending'));
        setCompletedAppointments(queueData.timeline.filter(apt => apt.status === 'completed' || apt.status === 'done'));
        setCancelledAppointments(queueData.timeline.filter(apt => apt.status === 'cancelled' || apt.status === 'cancel'));

        // Calculate enhanced stats
        const activeAppointments = queueData.timeline.filter(apt =>
          apt.status !== 'completed' &&
          apt.status !== 'done' &&
          apt.status !== 'cancelled' &&
          apt.status !== 'cancel'
        );
        const totalTimeMinutes = activeAppointments.reduce((total, apt) => {
          return total + (apt.total_duration || 30);
        }, 0);

        setStats({
          completed: queueData.stats.completed || 0,
          remaining: activeAppointments.length,
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
        const result = await queueService.acceptQueueRequest(
          appointmentId,
          user.id,
          appointment.is_urgent
        );

        if (result.success) {
          console.log('✅ Queue acceptance completed:', result);

          // Notification is already sent by queueService.notifyCustomerQueueAcceptance()
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
      const updateData = { status };
      if (status === 'cancelled' || status === 'cancel') {
        updateData.queue_position = null;
      }

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
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
    <div className="queue-container">
      <style>{barberQueueStyles}</style>
      
      {/* Premium Header */}
      <div className="bg-white border-bottom mb-4">
        <div className="container py-4">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h1 className="h3 fw-black mb-1" style={{ letterSpacing: '-1px' }}>QUEUE</h1>
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-black rounded-pill px-3 py-1" style={{ fontSize: '0.7rem' }}>
                  {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </span>
                {efficiency > 0 && (
                  <span className="text-muted small fw-bold">
                    <i className="bi bi-lightning-charge-fill text-warning me-1"></i>
                    {efficiency}% Efficiency
                  </span>
                )}
              </div>
            </div>
            <div className="d-flex gap-2">
              <button 
                className="btn btn-light rounded-circle p-0 d-flex align-items-center justify-content-center" 
                style={{ width: '45px', height: '45px' }}
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 1);
                  setSelectedDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
                }}
              >
                <i className="bi bi-chevron-left"></i>
              </button>
              <button 
                className="btn btn-light rounded-circle p-0 d-flex align-items-center justify-content-center" 
                style={{ width: '45px', height: '45px' }}
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  setSelectedDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
                }}
              >
                <i className="bi bi-chevron-right"></i>
              </button>
              <button className="btn btn-black text-white rounded-circle ms-2" style={{ width: '45px', height: '45px' }} onClick={fetchQueueData}>
                <i className="bi bi-arrow-clockwise"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        {error && (
          <div className="alert alert-dark border-0 rounded-4 shadow-sm mb-4 d-flex align-items-center gap-3">
            <i className="bi bi-exclamation-octagon-fill fs-4"></i>
            <div>
              <div className="fw-bold">Something went wrong</div>
              <div className="small opacity-75">{error}</div>
            </div>
            <button className="btn-close ms-auto" onClick={() => setError(null)}></button>
          </div>
        )}

        {/* Minimalist Stats */}
        <div className="stats-row mb-5">
          <div className="stat-card-modern">
            <div className="stat-icon-box bg-success bg-opacity-10 text-success">
              <i className="bi bi-check2-circle"></i>
            </div>
            <div>
              <div className="text-muted small fw-bold text-uppercase">Finished</div>
              <div className="h4 mb-0 fw-black">{stats.completed || 0}</div>
            </div>
          </div>
          <div className="stat-card-modern">
            <div className="stat-icon-box bg-primary bg-opacity-10 text-primary">
              <i className="bi bi-people"></i>
            </div>
            <div>
              <div className="text-muted small fw-bold text-uppercase">Waiting</div>
              <div className="h4 mb-0 fw-black">{stats.remaining || 0}</div>
            </div>
          </div>
          <div className="stat-card-modern">
            <div className="stat-icon-box bg-warning bg-opacity-10 text-warning">
              <i className="bi bi-hourglass-split"></i>
            </div>
            <div>
              <div className="text-muted small fw-bold text-uppercase">Pending</div>
              <div className="h4 mb-0 fw-black">{stats.pendingRequests || 0}</div>
            </div>
          </div>
          <div className="stat-card-modern">
            <div className="stat-icon-box bg-info bg-opacity-10 text-info">
              <i className="bi bi-clock"></i>
            </div>
            <div>
              <div className="text-muted small fw-bold text-uppercase">Work Time</div>
              <div className="h4 mb-0 fw-black">{stats.totalTime}m</div>
            </div>
          </div>
        </div>

        <div className="row g-4">
          {/* Main Column */}
          <div className="col-lg-8">
            {/* CURRENTLY SERVING */}
            <div className="section-title text-black">
              <i className="bi bi-scissors"></i> NOW SERVING
            </div>
            
            {currentAppointment ? (
              <div className="serving-card-premium">
                <div className="serving-label">Active Session</div>
                <div className="d-flex justify-content-between align-items-start mb-4">
                  <div>
                    <h2 className="display-6 fw-black mb-1">{currentAppointment.customer?.full_name}</h2>
                    <div className="d-flex align-items-center gap-2 opacity-75">
                      <i className="bi bi-clock"></i>
                      <span>Started {formatTime(currentAppointment.appointment_time)}</span>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="h2 mb-0 fw-black text-white">₱{Number(getTotalPrice(currentAppointment)).toLocaleString()}</div>
                    <div className="small opacity-50 fw-bold">TOTAL PRICE</div>
                  </div>
                </div>
                
                <div className="p-3 bg-white bg-opacity-10 rounded-4 mb-4">
                  <div className="small fw-bold text-uppercase opacity-50 mb-2" style={{ letterSpacing: '1px' }}>Requested Services</div>
                  <div className="h5 mb-2">{getServicesDisplay(currentAppointment)}</div>
                  <AddOnsDisplay appointment={currentAppointment} />
                </div>

                <button 
                  className="btn-premium-finish"
                  onClick={() => handleAppointmentStatus(currentAppointment.id, 'completed')}
                >
                  FINISH SESSION <i className="bi bi-check-all ms-2"></i>
                </button>
              </div>
            ) : (
              <div className="empty-state-minimal mb-5">
                <i className="bi bi-cup-hot display-4 text-muted opacity-25 mb-3 d-block"></i>
                <h5 className="fw-bold text-muted">No active customer</h5>
                <p className="text-muted small">Select a customer from the waiting list to start serving.</p>
                {queuedAppointments.length > 0 && (
                  <button 
                    className="btn btn-premium-primary mt-3"
                    onClick={() => handleAppointmentStatus(queuedAppointments[0].id, 'ongoing')}
                  >
                    START NEXT CUSTOMER
                  </button>
                )}
              </div>
            )}

            {/* WAITING LIST */}
            <div className="section-title mt-5">
              <i className="bi bi-list-task"></i> WAITING LIST
              <span className="badge bg-light text-dark ms-auto border rounded-pill px-3">
                {queuedAppointments.length} Total
              </span>
            </div>

            {queuedAppointments.length === 0 ? (
              <div className="empty-state-minimal">
                <p className="text-muted mb-0">No one is waiting in the queue.</p>
              </div>
            ) : (
              <div className="queue-list-container">
                {queuedAppointments.map((apt, index) => (
                  <div key={apt.id} className={`queue-item-minimal ${apt.is_urgent ? 'border-danger border-opacity-50' : ''}`}>
                    <div className={`queue-number-badge ${apt.is_urgent ? 'bg-danger text-white' : ''}`}>
                      {apt.queue_position || (index + 1)}
                    </div>
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2">
                        <h6 className="mb-0 fw-black">{apt.customer?.full_name}</h6>
                        {apt.is_urgent && <span className="badge bg-danger rounded-pill" style={{ fontSize: '0.6rem' }}>URGENT</span>}
                        {apt.is_rebooking && <span className="badge bg-info rounded-pill" style={{ fontSize: '0.6rem' }}>REBOOK</span>}
                      </div>
                      <div className="text-muted small truncate" style={{ maxWidth: '200px' }}>
                        {getServicesDisplay(apt)}
                      </div>
                    </div>
                    <div className="text-end me-3 d-none d-md-block">
                      <div className="fw-bold text-dark">₱{Number(getTotalPrice(apt)).toLocaleString()}</div>
                      <div className="small text-muted">{apt.total_duration || 30}m</div>
                    </div>
                    <div className="d-flex gap-2">
                      {!currentAppointment && index === 0 && (
                        <button 
                          className="btn btn-premium-primary btn-sm rounded-pill px-3"
                          onClick={() => handleAppointmentStatus(apt.id, 'ongoing')}
                        >
                          Start
                        </button>
                      )}
                      <button 
                        className="btn btn-light btn-sm rounded-circle" 
                        style={{ width: '32px', height: '32px' }}
                        onClick={() => setRescheduleModal({ isOpen: true, appointment: apt })}
                      >
                        <i className="bi bi-clock-history"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Side Column */}
          <div className="col-lg-4">
            {/* PENDING REQUESTS */}
            <div className="section-title">
              <i className="bi bi-bell-fill"></i> RECENT REQUESTS
            </div>

            {pendingRequests.length === 0 ? (
              <div className="empty-state-minimal p-4 mb-4">
                <p className="text-muted small mb-0">No pending requests</p>
              </div>
            ) : (
              <div className="mb-4">
                {pendingRequests.map(request => (
                  <div key={request.id} className="premium-card p-3 mb-3 border">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <h6 className="fw-bold mb-0">{request.customer?.full_name}</h6>
                      <span className="badge bg-warning bg-opacity-20 text-warning-emphasis">NEW</span>
                    </div>
                    <div className="text-muted small mb-3">
                      {getServicesDisplay(request)}
                    </div>
                    <div className="d-flex gap-2">
                      <button 
                        className="btn btn-black text-white btn-sm flex-grow-1 fw-bold py-2 rounded-3"
                        onClick={() => handleBookingResponse(request.id, 'accept')}
                      >
                        Accept
                      </button>
                      <button 
                        className="btn btn-light btn-sm px-3 rounded-3"
                        onClick={() => {
                          const reason = prompt('Decline reason (optional):');
                          if (reason !== null) handleBookingResponse(request.id, 'decline', reason);
                        }}
                      >
                        <i className="bi bi-x-lg"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* QUICK HISTORY */}
            <div className="section-title mt-4">
              <i className="bi bi-clock-history"></i> COMPLETED TODAY
            </div>
            
            <div className="premium-card p-0" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {completedAppointments.length === 0 ? (
                <div className="p-4 text-center text-muted small">
                  Your work history will appear here.
                </div>
              ) : (
                completedAppointments.slice(0, 10).map(apt => (
                  <div key={apt.id} className="p-3 border-bottom d-flex align-items-center gap-2">
                    <div className="bg-success bg-opacity-10 text-success p-2 rounded-circle">
                      <i className="bi bi-check-lg"></i>
                    </div>
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div className="fw-bold small truncate">{apt.customer?.full_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.6rem' }}>{formatTime(apt.appointment_time)}</div>
                    </div>
                    <div className="fw-black small text-dark">₱{Number(getTotalPrice(apt)).toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>

            {/* SYSTEM ACTIONS */}
            <div className="mt-5 p-4 bg-black text-white rounded-4 shadow-sm">
              <h6 className="mb-3 fw-black" style={{ letterSpacing: '1px' }}>QUEUE INFO</h6>
              <div className="d-flex justify-content-between mb-2 small opacity-75">
                <span>Total Workload</span>
                <span>{stats.totalTime} min</span>
              </div>
              <div className="d-flex justify-content-between mb-2 small opacity-75">
                <span>Avg. Duration</span>
                <span>30 min</span>
              </div>
              <div className="border-top border-white border-opacity-10 pt-3 mt-3">
                <Link to="/schedule" className="btn btn-white w-100 fw-bold rounded-pill text-black text-decoration-none text-center d-block">
                  View Full Schedule
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reschedule Modal */}
      <RescheduleModal
        isOpen={rescheduleModal.isOpen}
        onClose={() => setRescheduleModal({ isOpen: false, appointment: null })}
        appointment={rescheduleModal.appointment}
        onSuccess={() => {
          setRescheduleModal({ isOpen: false, appointment: null });
          fetchQueueData();
        }}
      />
    </div>
  );
};

export default BarberQueue;
