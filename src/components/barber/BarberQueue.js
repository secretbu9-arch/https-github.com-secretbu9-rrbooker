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
import { formatPrice, toISODateString } from '../utils/helpers';
import RescheduleModal from './RescheduleModal';

const barberQueueStyles = `
  :root {
    --barber-black: #0a0a0a;
    --barber-brown: #2c1810;
    --barber-gold: #d4af37;
    --barber-white: #ffffff;
    --barber-light-gray: #f8fafc;
    --barber-gray: #f1f5f9;
    --barber-dark-gray: #64748b;
    --barber-accent: #1e293b;
    --premium-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
  }

  .queue-container {
    background-color: #fafbfc;
    min-height: 100vh;
    padding-bottom: 5rem;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  /* Premium Cards */
  .premium-card {
    background: var(--barber-white);
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 24px;
    box-shadow: var(--premium-shadow);
    overflow: hidden;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .premium-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 30px 40px -10px rgba(0, 0, 0, 0.08);
  }

  /* Stat Cards - Interactive */
  .stat-card-modern {
    background: var(--barber-white);
    border-radius: 24px;
    padding: 1.5rem;
    border: 1px solid rgba(0,0,0,0.03);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03);
    height: 100%;
  }

  @media (min-width: 768px) {
    .stat-card-modern {
      flex-direction: row;
      align-items: center;
      gap: 1.25rem;
    }
  }

  .stat-card-modern:hover {
    transform: translateY(-5px);
    border-color: var(--barber-gold);
    box-shadow: var(--premium-shadow);
  }

  .stat-icon-box {
    width: 56px;
    height: 56px;
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    transition: all 0.3s ease;
    flex-shrink: 0;
  }

  /* Serving Card - High Focus */
  .serving-card-premium {
    background: linear-gradient(135deg, #111 0%, #000 100%);
    color: var(--barber-white);
    border-radius: 32px;
    padding: 2.5rem;
    margin-bottom: 2.5rem;
    position: relative;
    overflow: hidden;
    box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  @media (min-width: 992px) {
    .serving-card-premium {
      flex-direction: row;
      align-items: stretch;
      padding: 3.5rem;
    }
    
    .serving-main-content {
      flex: 1;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      padding-right: 3rem;
    }
    
    .serving-side-content {
      width: 320px;
      padding-left: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
  }

  .serving-card-premium::after {
    content: '';
    position: absolute;
    top: -50%;
    right: -20%;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(212, 175, 55, 0.05) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
  }

  .serving-label {
    text-transform: uppercase;
    letter-spacing: 3px;
    font-size: 0.8rem;
    font-weight: 800;
    color: var(--barber-gold);
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* Queue Item - Minimalist */
  .queue-item-minimal {
    background: var(--barber-white);
    border-radius: 20px;
    padding: 1.25rem 1.75rem;
    margin-bottom: 1.25rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    border: 1px solid rgba(0,0,0,0.03);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .queue-item-minimal:hover {
    transform: scale(1.01) translateX(8px);
    border-color: var(--barber-gold);
    box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.05);
  }

  .queue-number-badge {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: var(--barber-gray);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    color: var(--barber-black);
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  /* Buttons */
  .btn-premium-primary {
    background: var(--barber-black);
    color: var(--barber-white);
    border: none;
    border-radius: 16px;
    padding: 1rem 2rem;
    font-weight: 700;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 0.9rem;
  }

  .btn-premium-primary:hover {
    background: var(--barber-gold);
    transform: translateY(-2px);
    color: var(--barber-black);
    box-shadow: 0 10px 20px -5px rgba(212, 175, 55, 0.3);
  }

  .btn-premium-finish {
    background: var(--barber-white);
    color: var(--barber-black);
    border: none;
    border-radius: 18px;
    padding: 1.25rem 2rem;
    font-weight: 900;
    width: 100%;
    transition: all 0.3s ease;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    text-transform: uppercase;
    letter-spacing: 2px;
  }

  .btn-premium-finish:hover {
    background: var(--barber-gold);
    color: var(--barber-black);
    transform: translateY(-3px);
    box-shadow: 0 15px 30px rgba(212, 175, 55, 0.4);
  }

  .section-title {
    font-weight: 900;
    letter-spacing: -0.5px;
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--barber-black);
    font-size: 1.25rem;
  }

  .empty-state-minimal {
    padding: 5rem 2rem;
    text-align: center;
    background: var(--barber-white);
    border-radius: 32px;
    border: 2px dashed var(--barber-gray);
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
  }

  /* Stats Grid Responsive */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    padding: 0 0 2rem;
  }

  @media (min-width: 992px) {
    .stats-row {
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
    }
  }

  /* Custom Transitions */
  .fade-in-up {
    animation: fadeInUp 0.6s ease-out forwards;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Web Premium Header */
  .web-header {
    background: white;
    padding: 4rem 0 3rem;
    border-bottom: 1px solid rgba(0,0,0,0.05);
    margin-bottom: 3rem;
  }

  @media (max-width: 768px) {
    .web-header {
      padding: 2rem 0;
      margin-bottom: 2rem;
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

    const today = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');

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

        // Update legacy state for compatibility - include both queue and scheduled types
        setQueuedAppointments(queueData.timeline.filter(apt =>
          (apt.appointment_type === 'queue' || apt.appointment_type === 'scheduled') &&
          apt.status !== 'completed' &&
          apt.status !== 'done' &&
          apt.status !== 'ongoing' &&
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
  const AddOnsDisplay = ({ appointment, className = "text-muted" }) => {
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
    }, [appointment.add_ons_data, appointment.id]); // added id to dependency to be safe

    if (loading) {
      return <div className={`${className} small`}>Loading add-ons...</div>;
    }

    if (!addOnsText) {
      return null;
    }

    return (
      <div className={`${className} small`}>{addOnsText}</div>
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

      // Prepare update data
      const updateData = { status };

      if (status === 'ongoing') {
        const now = new Date();
        const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        
        // Extract date portion safely
        const appointmentDate = appointment.appointment_date ? appointment.appointment_date.split(' ')[0].split('T')[0] : '';

        console.log('🗓️ Starting session date check:', { today, appointmentDate, currentTime });

        // Allow today or past appointments (late night shifts)
        if (appointmentDate > today) {
          setError(`You cannot start future appointments. This appointment is for ${appointmentDate}.`);
          return;
        }

        // Always record the actual start time
        updateData.appointment_time = currentTime;
      }

      // Optimistic updates
      if (appointmentId === currentAppointment?.id && status === 'completed') {
        setCurrentAppointment(null);
      }

      if (status === 'ongoing') {
        const appointmentToStart = queuedAppointments.find(apt => apt.id === appointmentId);
        if (appointmentToStart) {
          setCurrentAppointment({
            ...appointmentToStart,
            status: 'ongoing',
            appointment_time: updateData.appointment_time
          });
          setQueuedAppointments(prev => prev.filter(apt => apt.id !== appointmentId));
        }
      }

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
      
      {/* Web Premium Header */}
      <div className="web-header">
        <div className="container">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-4">
            <div className="fade-in-up">
              <h1 className="display-5 fw-black mb-1" style={{ letterSpacing: '-2px' }}>BARBER QUEUE</h1>
              <div className="d-flex align-items-center gap-3">
                <span className="badge bg-black rounded-pill px-4 py-2" style={{ fontSize: '0.8rem', letterSpacing: '1px' }}>
                  {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                {efficiency > 0 && (
                  <div className="d-flex align-items-center gap-2 py-1 px-3 bg-warning bg-opacity-10 rounded-pill">
                    <i className="bi bi-lightning-charge-fill text-warning"></i>
                    <span className="text-dark small fw-bold">{efficiency}% Performance</span>
                  </div>
                )}
              </div>
            </div>
            <div className="d-flex gap-3 fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="btn-group rounded-pill overflow-hidden shadow-sm">
                <button 
                  className="btn btn-white border-end px-3 py-2" 
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
                  }}
                >
                  <i className="bi bi-chevron-left"></i>
                </button>
                <button className="btn btn-white px-4 fw-bold small text-uppercase" style={{ letterSpacing: '1px' }}>
                  Today
                </button>
                <button 
                  className="btn btn-white border-start px-3 py-2" 
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + 1);
                    setSelectedDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
                  }}
                >
                  <i className="bi bi-chevron-right"></i>
                </button>
              </div>
              <button className="btn btn-black text-white rounded-circle shadow-sm" style={{ width: '50px', height: '50px' }} onClick={fetchQueueData}>
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
        <div className="stats-row mb-5 fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="stat-card-modern">
            <div className="stat-icon-box bg-success bg-opacity-10 text-success">
              <i className="bi bi-check2-circle"></i>
            </div>
            <div>
              <div className="text-muted small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>Completed</div>
              <div className="h3 mb-0 fw-black">{stats.completed || 0}</div>
            </div>
          </div>
          <div className="stat-card-modern">
            <div className="stat-icon-box bg-primary bg-opacity-10 text-primary">
              <i className="bi bi-people"></i>
            </div>
            <div>
              <div className="text-muted small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>In Queue</div>
              <div className="h3 mb-0 fw-black">{stats.remaining || 0}</div>
            </div>
          </div>
          <div className="stat-card-modern">
            <div className="stat-icon-box bg-warning bg-opacity-10 text-warning">
              <i className="bi bi-bell-fill"></i>
            </div>
            <div>
              <div className="text-muted small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>Requests</div>
              <div className="h3 mb-0 fw-black">{stats.pendingRequests || 0}</div>
            </div>
          </div>
          <div className="stat-card-modern">
            <div className="stat-icon-box bg-info bg-opacity-10 text-info">
              <i className="bi bi-clock-history"></i>
            </div>
            <div>
              <div className="text-muted small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>Workload</div>
              <div className="h3 mb-0 fw-black">{stats.totalTime}m</div>
            </div>
          </div>
        </div>

        <div className="row g-5">
          {/* Main Column */}
          <div className="col-lg-8 fade-in-up" style={{ animationDelay: '0.3s' }}>
            {/* CURRENTLY SERVING */}
            <div className="section-title">
              <span className="p-2 bg-black rounded-3 text-white">
                <i className="bi bi-scissors fs-5"></i>
              </span>
              <span>ACTIVE SESSION</span>
            </div>
            
            {currentAppointment ? (
              <div className="serving-card-premium">
                <div className="serving-main-content">
                  <div className="serving-label">
                    <span className="px-2 py-1 bg-warning bg-opacity-10 rounded text-warning" style={{ fontSize: '0.6rem' }}>LIVE</span>
                    Current Client
                  </div>
                  <h2 className="display-4 fw-black mb-3">{currentAppointment.customer?.full_name}</h2>
                  <div className="d-flex flex-wrap align-items-center gap-4 mb-4">
                    <div className="d-flex align-items-center gap-2 px-3 py-2 bg-white bg-opacity-10 rounded-pill">
                      <i className="bi bi-clock text-warning"></i>
                      <span className="small">Started at {formatTime(currentAppointment.appointment_time)}</span>
                    </div>
                    <div className="d-flex align-items-center gap-2 px-3 py-2 bg-white bg-opacity-10 rounded-pill">
                      <i className="bi bi-cash-stack text-success"></i>
                      <span className="small fw-bold">{formatPrice(Number(getTotalPrice(currentAppointment)))}</span>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-white rounded-4 shadow-sm border-0">
                    <div className="small fw-bold text-uppercase text-muted mb-3" style={{ letterSpacing: '2px', fontSize: '0.7rem' }}>Selected Services</div>
                    <div className="h4 mb-2 fw-bold text-black">{getServicesDisplay(currentAppointment)}</div>
                    <AddOnsDisplay appointment={currentAppointment} className="text-secondary" />
                  </div>
                </div>

                <div className="serving-side-content">
                  <div className="text-center mb-4 d-none d-lg-block">
                    <div className="display-1 opacity-25 fw-black">01</div>
                    <div className="small fw-bold opacity-50">STATION</div>
                  </div>
                  <button 
                    className="btn-premium-finish group"
                    onClick={() => handleAppointmentStatus(currentAppointment.id, 'completed')}
                  >
                    COMPLETE SESSION 
                    <i className="bi bi-check-circle-fill ms-2"></i>
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state-minimal mb-5">
                <div className="display-1 text-light mb-4">
                  <i className="bi bi-cup-hot"></i>
                </div>
                <h3 className="fw-black text-dark">Take a Break</h3>
                <p className="text-muted mb-4 mx-auto" style={{ maxWidth: '400px' }}>
                  There is no active session right now. You can start the next customer from the waiting list when you're ready.
                </p>
                {queuedAppointments.length > 0 && (
                  <button 
                    className="btn btn-premium-primary"
                    onClick={() => handleAppointmentStatus(queuedAppointments[0].id, 'ongoing')}
                  >
                    START NEXT CUSTOMER <i className="bi bi-play-fill ms-2"></i>
                  </button>
                )}
              </div>
            )}

            {/* WAITING LIST */}
            <div className="section-title mt-5 pt-4">
              <span className="p-2 bg-primary bg-opacity-10 rounded-3 text-primary">
                <i className="bi bi-list-stars fs-5"></i>
              </span>
              <span>WAITING LIST</span>
              <span className="badge bg-light text-dark ms-auto border rounded-pill px-4 py-2" style={{ fontSize: '0.8rem' }}>
                {queuedAppointments.length} Customers Waiting
              </span>
            </div>

            {queuedAppointments.length === 0 ? (
              <div className="empty-state-minimal">
                <p className="text-muted mb-0 fw-bold">The waiting list is empty.</p>
              </div>
            ) : (
              <div className="queue-list-container">
                {queuedAppointments.map((apt, index) => (
                  <div key={apt.id} className={`queue-item-minimal ${apt.is_urgent ? 'border-danger border-opacity-25' : ''}`}>
                    <div className={`queue-number-badge ${apt.is_urgent ? 'bg-danger text-white' : ''}`}>
                      {apt.queue_position || (index + 1)}
                    </div>
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-3 mb-1">
                        <h5 className="mb-0 fw-black">{apt.customer?.full_name}</h5>
                        {apt.is_urgent && <span className="badge bg-danger rounded-pill px-3 py-1" style={{ fontSize: '0.6rem', letterSpacing: '1px' }}>URGENT</span>}
                        {apt.is_rebooking && <span className="badge bg-info text-white rounded-pill px-3 py-1" style={{ fontSize: '0.6rem', letterSpacing: '1px' }}>REBOOK</span>}
                      </div>
                      <div className="text-muted small d-flex align-items-center gap-2">
                        <i className="bi bi-tag-fill opacity-50"></i>
                        <span>{getServicesDisplay(apt)}</span>
                      </div>
                    </div>
                    <div className="text-end me-4 d-none d-md-block">
                      <div className="h5 mb-0 fw-black text-black">{formatPrice(Number(getTotalPrice(apt)))}</div>
                      <div className="small text-muted fw-bold">{apt.total_duration || 30} MINS</div>
                    </div>
                    <div className="d-flex gap-2">
                      {!currentAppointment && index === 0 && (
                        <button 
                          className="btn btn-black text-white rounded-pill px-4 fw-bold"
                          onClick={() => handleAppointmentStatus(apt.id, 'ongoing')}
                        >
                          Start
                        </button>
                      )}
                      <button 
                        className="btn btn-light rounded-circle shadow-sm" 
                        style={{ width: '40px', height: '40px' }}
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
          <div className="col-lg-4 fade-in-up" style={{ animationDelay: '0.4s' }}>
            {/* PENDING REQUESTS */}
            <div className="section-title">
              <span className="p-2 bg-warning bg-opacity-10 rounded-3 text-warning">
                <i className="bi bi-lightning-fill fs-5"></i>
              </span>
              <span>INCOMING REQUESTS</span>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="empty-state-minimal p-5 mb-5" style={{ padding: '3rem !important' }}>
                <div className="opacity-50 mb-3">
                  <i className="bi bi-inbox display-6"></i>
                </div>
                <p className="text-muted small mb-0 fw-bold">All caught up!</p>
              </div>
            ) : (
              <div className="mb-5">
                {pendingRequests.map(request => (
                  <div key={request.id} className="premium-card p-4 mb-4">
                    <div className="d-flex justify-content-between align-items-start mb-3">
                      <div>
                        <h6 className="fw-black mb-1">{request.customer?.full_name}</h6>
                        <div className="badge bg-warning bg-opacity-10 text-dark-emphasis rounded-pill" style={{ fontSize: '0.65rem' }}>NEW REQUEST</div>
                      </div>
                      <div className="text-end">
                        <div className="fw-black text-black">{formatPrice(Number(getTotalPrice(request)))}</div>
                      </div>
                    </div>
                    <div className="text-muted small mb-4 p-3 bg-light rounded-3">
                      <i className="bi bi-info-circle me-2"></i>
                      {getServicesDisplay(request)}
                    </div>
                    <div className="d-flex gap-3">
                      <button 
                        className="btn btn-black text-white flex-grow-1 fw-bold py-2 rounded-3 shadow-sm"
                        onClick={() => handleBookingResponse(request.id, 'accept')}
                      >
                        Accept
                      </button>
                      <button 
                        className="btn btn-light border-0 fw-bold py-2 rounded-3"
                        onClick={() => {
                          const reason = prompt('Decline reason (optional):');
                          if (reason !== null) handleBookingResponse(request.id, 'decline', reason);
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* QUICK HISTORY */}
            <div className="section-title">
              <span className="p-2 bg-primary bg-opacity-10 rounded-3 text-primary">
                <i className="bi bi-clock-history fs-5"></i>
              </span>
              <span>HISTORY TODAY</span>
            </div>
            
            <div className="premium-card border-0 shadow-none bg-transparent" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {completedAppointments.length === 0 ? (
                <div className="p-5 text-center text-muted small bg-white rounded-4 border dashed">
                  Work history will appear here.
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {completedAppointments.slice(0, 10).map(apt => (
                    <div key={apt.id} className="p-3 bg-white rounded-4 border-0 shadow-sm d-flex align-items-center gap-3">
                      <div className="bg-success bg-opacity-10 text-success p-3 rounded-4">
                        <i className="bi bi-check2"></i>
                      </div>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div className="fw-black small text-uppercase truncate">{apt.customer?.full_name}</div>
                        <div className="text-muted fw-bold" style={{ fontSize: '0.7rem' }}>{formatTime(apt.appointment_time)}</div>
                      </div>
                      <div className="text-end">
                        <div className="fw-black text-black small">{formatPrice(Number(getTotalPrice(apt)))}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SYSTEM ACTIONS */}
            <div className="mt-5 p-5 bg-black text-white rounded-4 shadow-lg position-relative overflow-hidden">
              <div className="position-relative z-1">
                <h5 className="mb-4 fw-black" style={{ letterSpacing: '2px' }}>INSIGHTS</h5>
                <div className="d-flex justify-content-between mb-3 small opacity-75">
                  <span className="fw-bold">DAILY WORKLOAD</span>
                  <span className="fw-black">{stats.totalTime} MIN</span>
                </div>
                <div className="d-flex justify-content-between mb-4 small opacity-75">
                  <span className="fw-bold">CURRENT PACE</span>
                  <span className="fw-black">OPTIMAL</span>
                </div>
                <div className="border-top border-white border-opacity-10 pt-4 mt-2">
                  <Link to="/schedule" className="btn btn-white w-100 fw-black rounded-pill text-black text-decoration-none text-center d-block py-3 shadow-sm hover-scale">
                    VIEW FULL SCHEDULE
                  </Link>
                </div>
              </div>
              <div className="position-absolute bottom-0 end-0 opacity-10" style={{ transform: 'translate(20%, 20%)' }}>
                <i className="bi bi-graph-up-arrow display-1"></i>
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
