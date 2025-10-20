// components/barber/BarberSchedule.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import LoadingSpinner from '../common/LoadingSpinner';
import addOnsService from '../../services/AddOnsService';
import { PushService } from '../../services/PushService';
import BulkCancellationModal from './BulkCancellationModal';
import FriendBookingDisplay from '../common/FriendBookingDisplay';
import ComprehensiveQueueManager from '../../services/ComprehensiveQueueManager';
import TimelineView from './TimelineView';
import { toISODateString } from '../utils/helpers';
import EnhancedScheduledQueueIntegration from '../../services/EnhancedScheduledQueueIntegration';
import '../../styles/barber-appointments.css';

const BarberSchedule = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'timeline'
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [weekDays, setWeekDays] = useState([]);
  const [showBulkCancelModal, setShowBulkCancelModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelAppointmentId, setCancelAppointmentId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [enhancedTimeline, setEnhancedTimeline] = useState(null);
  const [isFixingDataConsistency, setIsFixingDataConsistency] = useState(false);


  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAppointments();
      generateWeekDays();

      // Set up real-time subscription
      const channelName = `barber-schedule-${user.id}-${Date.now()}`;
      console.log(`📡 Setting up schedule subscription: ${channelName}`);
      
      const subscription = supabase
        .channel(channelName)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'appointments',
            filter: `barber_id=eq.${user.id}`
          }, 
          (payload) => {
            console.log(`📥 Schedule received real-time update:`, payload);
            
            clearTimeout(window.scheduleUpdateTimeout);
            window.scheduleUpdateTimeout = setTimeout(() => {
              console.log('🔄 Schedule refreshing data...');
              fetchAppointments();
            }, 800);
          }
        )
        .subscribe((status, err) => {
          console.log(`📡 Schedule subscription status: ${status}`, err);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Schedule real-time subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Schedule subscription error:', err);
          }
        });

      // Custom event listener
      const handleAppointmentChange = (event) => {
        const { barberId } = event.detail;
        console.log(`📢 Schedule received custom event:`, event.detail);
        
        if (barberId === user.id) {
          clearTimeout(window.scheduleUpdateTimeout);
          window.scheduleUpdateTimeout = setTimeout(() => {
            console.log('🔄 Schedule updating from custom event...');
            fetchAppointments();
          }, 500);
        }
      };

      // Listen for force refresh events
      const handleForceRefresh = (event) => {
        if (event.detail.barberId === user.id) {
          console.log('🔄 Schedule force refresh triggered');
          fetchAppointments();
        }
      };

      window.addEventListener('appointmentStatusChanged', handleAppointmentChange);
      window.addEventListener('forceRefreshBarberData', handleForceRefresh);

      return () => {
        console.log('🧹 Cleaning up schedule subscriptions');
        subscription.unsubscribe();
        clearTimeout(window.scheduleUpdateTimeout);
        window.removeEventListener('appointmentStatusChanged', handleAppointmentChange);
        window.removeEventListener('forceRefreshBarberData', handleForceRefresh);
      };
    }
  }, [user, selectedDate]);

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

  const generateWeekDays = () => {
    const days = [];
    const startDate = new Date(selectedDate);
    
    // Find the Monday of the current week
    const day = startDate.getDay();
    const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
    startDate.setDate(diff);
    
    // Generate array for the week (Mon-Sun)
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    
    setWeekDays(days);
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
      
      if (apt.appointment_type === 'queue' && !apt.queue_position) {
        issues.push(`Queue appointment ${apt.id} missing queue_position`);
      }
      
      if (apt.appointment_type === 'scheduled' && apt.queue_position) {
        issues.push(`Scheduled appointment ${apt.id} has queue_position (should be null)`);
      }
    });
    
    if (issues.length > 0) {
      console.warn('⚠️ Appointment data consistency issues:', issues);
      // Only auto-fix if we're not already in the process of fixing
      if (!isFixingDataConsistency) {
        fixDataConsistencyIssues();
      }
    }
    
    return issues.length === 0;
  };

  const fixDataConsistencyIssues = async () => {
    if (isFixingDataConsistency) {
      console.log('🔧 Already fixing data consistency, skipping...');
      return;
    }

    try {
      setIsFixingDataConsistency(true);
      console.log('🔧 Attempting to fix data consistency issues...');
      
      // Get current appointments to identify issues
      const currentAppointments = appointments.filter(apt => 
        apt.appointment_date === `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
      );

      // Fix queue appointments that have appointment_time (should be null)
      const queueWithTimeIssues = currentAppointments.filter(apt => 
        apt.appointment_type === 'queue' && apt.appointment_time
      );

      for (const appointment of queueWithTimeIssues) {
        console.log(`🔧 Fixing queue appointment ${appointment.id} - removing appointment_time`);
        await supabase
          .from('appointments')
          .update({ 
            appointment_time: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', appointment.id);
      }

      // Fix scheduled appointments that have queue_position (should be null)
      const scheduledWithQueueIssues = currentAppointments.filter(apt => 
        apt.appointment_type === 'scheduled' && apt.queue_position
      );

      for (const appointment of scheduledWithQueueIssues) {
        console.log(`🔧 Fixing scheduled appointment ${appointment.id} - removing queue_position`);
        await supabase
          .from('appointments')
          .update({ 
            queue_position: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', appointment.id);
      }

      console.log('✅ Data consistency issues fixed directly');
      
      // Refresh appointments after fixing (but don't trigger validation again)
      setTimeout(() => {
        fetchAppointmentsWithoutValidation();
      }, 1000);

    } catch (error) {
      console.error('❌ Error fixing data consistency issues:', error);
    } finally {
      setIsFixingDataConsistency(false);
    }
  };

  const fetchAppointments = async () => {
    await fetchAppointmentsInternal(true);
  };

  const fetchAppointmentsWithoutValidation = async () => {
    await fetchAppointmentsInternal(false);
  };

  const fetchAppointmentsInternal = async (shouldValidate = true) => {
    try {
      setLoading(true);
      
      // Get start and end of the week using local timezone
      const startOfWeek = new Date(weekDays[0] || selectedDate);
      const endOfWeek = new Date(weekDays[6] || selectedDate);
      
      // Format dates in local timezone to avoid UTC conversion issues
      const startDate = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}-${String(startOfWeek.getDate()).padStart(2, '0')}`;
      const endDate = `${endOfWeek.getFullYear()}-${String(endOfWeek.getMonth() + 1).padStart(2, '0')}-${String(endOfWeek.getDate()).padStart(2, '0')}`;
      
      console.log('Fetching schedule appointments from:', startDate, 'to:', endDate);
      
      // Fetch appointments for the week with all necessary fields
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('barber_id', user.id)
        .gte('appointment_date', startDate)
        .lte('appointment_date', endDate)
        .order('appointment_date')
        .order('appointment_time', { ascending: true })
        .order('queue_position', { ascending: true, nullsLast: true });

      if (error) throw error;

      console.log('📅 Schedule appointments fetched:', data?.length || 0);
      console.log('📅 Selected date (local):', selectedDate.toLocaleDateString());
      console.log('📅 Selected date formatted:', `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`);
      
      // Validate appointment data consistency only if requested
      if (shouldValidate && data && data.length > 0) {
        validateAppointmentData(data);
      }
      
      // Log detailed appointment data for debugging
      if (data && data.length > 0) {
        console.log('📋 Detailed appointment data:', data.map(apt => ({
          id: apt.id,
          customer: apt.customer?.full_name,
          service: apt.service?.name,
          appointment_time: apt.appointment_time,
          appointment_date: apt.appointment_date,
          appointment_type: apt.appointment_type,
          appointment_date_matches_selected: apt.appointment_date === `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`,
          queue_position: apt.queue_position,
          status: apt.status,
          is_urgent: apt.is_urgent,
          total_duration: apt.total_duration,
          add_ons_data: apt.add_ons_data,
          services_data: apt.services_data,
          notes: apt.notes,
          customer_rating: apt.customer_rating,
          is_reviewed: apt.is_reviewed
        })));
        
        // Check for missing data
        const missingData = data.filter(apt => 
          !apt.customer?.full_name || 
          !apt.service?.name || 
          !apt.appointment_time
        );
        
        if (missingData.length > 0) {
          console.warn('⚠️ Appointments with missing data:', missingData);
        }
        
        // Check queue positions
        const queueAppointments = data.filter(apt => apt.queue_position);
        console.log('👥 Appointments with queue positions:', queueAppointments.length);
        
        // Check urgent appointments
        const urgentAppointments = data.filter(apt => apt.is_urgent);
        console.log('🚨 Urgent appointments:', urgentAppointments.length);
      }
      
      setAppointments(data || []);
      
      // Fetch enhanced timeline for the selected date
      await fetchEnhancedTimeline();
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchEnhancedTimeline = async () => {
    try {
      if (!user) return;
      
      const selectedDateString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
      const timeline = await EnhancedScheduledQueueIntegration.getIntegratedTimeline(user.id, selectedDateString);
      setEnhancedTimeline(timeline);
      
      console.log('📊 Enhanced timeline fetched:', timeline);
    } catch (error) {
      console.error('❌ Error fetching enhanced timeline:', error);
    }
  };

  const getServicesDisplay = (appointment) => {
    const services = [];
    
    if (appointment.service) {
      services.push(appointment.service.name);
    }
    
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
        
        if (Array.isArray(serviceIds) && serviceIds.length > 1) {
          services.push(`+${serviceIds.length - 1} more`);
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
      return <div className="small text-muted">Loading add-ons...</div>;
    }

    if (!addOnsText) {
      return null;
    }

    return (
      <div className="small text-info">
        <i className="bi bi-plus-circle me-1"></i>
        {addOnsText}
      </div>
    );
  };

  const getTotalPrice = (appointment) => {
    let total = appointment.total_price || appointment.service?.price || 0;
    if (appointment.is_urgent) {
      total += 100;
    }
    return total;
  };

  const handleBookingResponse = async (appointmentId, action, reason = '') => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) return;

      console.log(`🔄 Schedule ${action} booking request:`, appointmentId, 'Type:', appointment.appointment_type);

      if (action === 'accept') {
        const updates = {
          status: 'scheduled',
          updated_at: new Date().toISOString()
        };

        // Handle different appointment types differently
        if (appointment.appointment_type === 'queue') {
          // For queue appointments, assign queue position and calculate estimated time
          console.log('📋 Accepting queue appointment - assigning queue position');
          
          // Get current queue appointments for this barber and date
          const dateAppointments = getAppointmentsForDate(selectedDate).filter(apt => 
            apt.status === 'scheduled' && apt.appointment_type === 'queue'
          );
          
          if (appointment.is_urgent) {
            updates.queue_position = 1;
            
            // Increment all existing queue positions
            await supabase
              .from('appointments')
              .update({ queue_position: supabase.raw('queue_position + 1') })
              .eq('barber_id', user.id)
              .eq('appointment_date', appointment.appointment_date)
              .eq('status', 'scheduled')
              .eq('appointment_type', 'queue');
          } else {
            const maxQueueNumber = Math.max(0, ...dateAppointments.map(apt => apt.queue_position || 0));
            updates.queue_position = maxQueueNumber + 1;
          }
          
          // Calculate estimated wait time based on queue position and existing appointments
          const totalWaitTime = dateAppointments.reduce((total, apt) => {
            return total + (apt.total_duration || 30) + 5; // Add 5 minutes buffer
          }, 0);
          
          updates.estimated_wait_time = totalWaitTime;
          
        } else if (appointment.appointment_type === 'scheduled') {
          // For scheduled appointments, don't assign queue position
          console.log('📅 Accepting scheduled appointment - no queue position needed');
          // Keep appointment_time as is, don't add queue_position
        }

        const { error } = await supabase
          .from('appointments')
          .update(updates)
          .eq('id', appointmentId);

        if (error) throw error;

        // Create notification using centralized service (handles both database and push)
        try {
          const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
          
          if (appointment.appointment_type === 'queue') {
            // For queue appointments, send queue-specific notification
            await centralizedNotificationService.createBookingConfirmationNotification({
              userId: appointment.customer_id,
              appointmentId: appointmentId,
              queuePosition: updates.queue_position,
              estimatedTime: null,
              appointmentType: 'queue'
            });
            console.log('✅ Queue appointment approval notification sent');
          } else {
            // For scheduled appointments, send scheduled-specific notification
            await centralizedNotificationService.createBookingConfirmationNotification({
              userId: appointment.customer_id,
              appointmentId: appointmentId,
              queuePosition: null,
              estimatedTime: appointment.appointment_time,
              appointmentType: 'scheduled'
            });
            console.log('✅ Scheduled appointment approval notification sent');
          }
        } catch (notificationError) {
          console.warn('Failed to send schedule approval notification:', notificationError);
        }

      } else {
        const { error } = await supabase
          .from('appointments')
          .update({ 
            status: 'cancelled',
            updated_at: new Date().toISOString(),
            cancellation_reason: reason || 'Declined by barber'
          })
          .eq('id', appointmentId);

        if (error) throw error;

        await supabase.from('notifications').insert({
          user_id: appointment.customer_id,
          title: 'Booking Request Declined',
          message: `Your appointment request has been declined. ${reason ? `Reason: ${reason}` : 'Please try booking with another barber or a different time.'}`,
          type: 'appointment_declined',
          data: { appointment_id: appointmentId, reason }
        });
      }

      // Log the action
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: action === 'accept' ? 'booking_request_accepted' : 'booking_request_declined',
        details: {
          appointment_id: appointmentId,
          customer_id: appointment.customer_id,
          reason: action === 'decline' ? reason : undefined
        }
      });

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

      console.log(`✅ Schedule booking ${action} completed`);

      // Refresh appointments
      setTimeout(() => fetchAppointments(), 1000);
    } catch (err) {
      console.error('Error responding to booking request:', err);
      setError('Failed to process booking request. Please try again.');
    }
  };

  const handleAppointmentStatus = async (appointmentId, status, reason = '') => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Check if appointment can be started
      if (status === 'ongoing' && appointment.status !== 'scheduled') {
        throw new Error('Only scheduled appointments can be started');
      }

      console.log(`🔄 Schedule starting status change: ${appointment.status} → ${status} for appointment ${appointmentId}`);

      // Optimistic update - update UI immediately
      setAppointments(prev => prev.map(apt => 
        apt.id === appointmentId 
          ? { 
              ...apt, 
              status, 
              queue_position: status === 'ongoing' ? 0 : 
                           status === 'done' || status === 'cancelled' ? null : 
                           apt.queue_position,
              updated_at: new Date().toISOString()
            }
          : apt
      ));

      const updateData = { 
        status, 
        updated_at: new Date().toISOString(),
        queue_position: status === 'done' || status === 'cancelled' ? null : 
                     status === 'ongoing' ? 0 : undefined
      };

      // Add cancellation reason if provided
      if (status === 'cancelled' && reason) {
        updateData.cancellation_reason = reason;
      }

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', appointmentId);

      if (error) throw error;

      // If cancelled, collapse queue positions for same barber/date
      if (status === 'cancelled' && appointment.queue_position != null) {
        try {
          console.log(`🔄 Collapsing queue positions after barber cancelling position ${appointment.queue_position}`);
          
          const { data: affected, error: fetchErr } = await supabase
            .from('appointments')
            .select('id, queue_position')
            .eq('barber_id', user.id)
            .eq('appointment_date', appointment.appointment_date)
            .in('status', ['scheduled', 'pending', 'confirmed', 'ongoing'])
            .gt('queue_position', appointment.queue_position)
            .order('queue_position', { ascending: true });

          if (!fetchErr && Array.isArray(affected) && affected.length) {
            console.log(`📝 Found ${affected.length} appointments to update positions`);
            
            for (const apt of affected) {
              const newPosition = apt.queue_position - 1;
              console.log(`📝 Updating appointment ${apt.id} from position ${apt.queue_position} to ${newPosition}`);
              
              await supabase
                .from('appointments')
                .update({ 
                  queue_position: newPosition,
                  updated_at: new Date().toISOString()
                })
                .eq('id', apt.id);
            }
            
            console.log('✅ Queue positions collapsed successfully');
          } else {
            console.log('ℹ️ No appointments found to collapse positions');
          }
        } catch (collapseErr) {
          console.warn('Queue collapse warning (barber):', collapseErr);
        }
      }

      // Log the action
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'appointment_status_change',
        details: {
          appointment_id: appointmentId,
          new_status: status,
          previous_status: appointment.status
        }
      });

      // Create notification for customer
      const notificationData = {
        user_id: appointment.customer_id,
        type: 'appointment',
        data: { appointment_id: appointmentId, status }
      };

      switch (status) {
        case 'ongoing':
          notificationData.title = 'Your appointment has started! ✂️';
          notificationData.message = 'Your barber is ready for you now.';
          break;
        case 'done':
          notificationData.title = 'Appointment Completed ✅';
          notificationData.message = 'Thank you for visiting us! Please rate your experience.';
          break;
        case 'cancelled':
          notificationData.title = 'Appointment Cancelled ❌';
          notificationData.message = reason ? 
            `Your appointment has been cancelled by the barber. Reason: ${reason}` : 
            'Your appointment has been cancelled by the barber.';
          break;
        default:
          notificationData.title = `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`;
          notificationData.message = `Your appointment status has been updated to ${status}`;
      }

      // Create notification using centralized service (ONLY way to create notifications)
      const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
      await centralizedNotificationService.createAppointmentStatusNotification({
        userId: appointment.customer_id,
        appointmentId: appointmentId,
        status: status,
        changedBy: 'barber'
      });

      // If starting an appointment, notify other customers in queue about updated wait times
      if (status === 'ongoing') {
        const queuedAppointments = appointments.filter(apt => 
          apt.status === 'scheduled' && 
          apt.appointment_date === appointment.appointment_date &&
          apt.queue_position > 0
        ).sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));

        // Notify next customer using centralized service
        if (queuedAppointments.length > 0) {
          const nextAppointment = queuedAppointments[0];
          await centralizedNotificationService.createQueuePositionNotification({
            userId: nextAppointment.customer_id,
            appointmentId: nextAppointment.id,
            queuePosition: 1,
            reason: 'Previous appointment completed'
          });
        }
      }

      // Broadcast change to all components with detailed information
      const changeEvent = new CustomEvent('appointmentStatusChanged', {
        detail: {
          appointmentId,
          newStatus: status,
          previousStatus: appointment.status,
          barberId: user.id,
          appointmentDate: appointment.appointment_date,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(changeEvent);

      console.log(`✅ Schedule status change completed: ${appointment.status} → ${status}`);

      // Refresh local data after a delay to ensure consistency
      setTimeout(() => {
        fetchAppointments();
      }, 1000);

    } catch (err) {
      console.error('❌ Error updating appointment status:', err);
      setError(err.message || 'Failed to update appointment status. Please try again.');
      
      // Revert optimistic update on error
      fetchAppointments();
    }
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  const handleCancelAppointment = (appointmentId) => {
    setCancelAppointmentId(appointmentId);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const confirmCancelAppointment = async () => {
    if (!cancelAppointmentId) return;
    
    try {
      await handleAppointmentStatus(cancelAppointmentId, 'cancelled', cancelReason);
      setShowCancelModal(false);
      setCancelAppointmentId(null);
      setCancelReason('');
    } catch (err) {
      console.error('Error cancelling appointment:', err);
    }
  };

  const closeCancelModal = () => {
    setShowCancelModal(false);
    setCancelAppointmentId(null);
    setCancelReason('');
  };

  // Move scheduled appointment to queue
  const handleAddToQueue = async (appointmentId, isUrgent = false) => {
    try {
      setLoading(true);
      setError(null);

      const result = await ComprehensiveQueueManager.addScheduledToQueue(
        appointmentId,
        user?.id,
        isUrgent
      );

      if (result.success) {
        console.log(`✅ Appointment added to queue at position ${result.queuePosition}`);
        await fetchAppointments();
      }
    } catch (err) {
      console.error('Error adding to queue:', err);
      setError('Failed to add appointment to queue');
    } finally {
      setLoading(false);
    }
  };

  // Change appointment priority
  const handleChangePriority = async (appointmentId, priority) => {
    try {
      setLoading(true);
      setError(null);

      const result = await ComprehensiveQueueManager.changePriority(appointmentId, priority);

      if (result.success) {
        await fetchAppointments();
        console.log(`✅ Priority changed to ${priority}`);
      }
    } catch (err) {
      console.error('Error changing priority:', err);
      setError('Failed to change priority');
    } finally {
      setLoading(false);
    }
  };

  const navigateWeek = (direction) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setSelectedDate(newDate);
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const isSelectedDate = (date) => {
    return date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear();
  };

  const getAppointmentsForDate = (date) => {
    // Use local date to avoid timezone issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;
    
    return appointments.filter(apt => apt.appointment_date === formattedDate);
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    return `${hour12}:${minutes} ${period}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'done':
        return 'success';
      case 'ongoing':
        return 'primary';
      case 'cancelled':
        return 'danger';
      case 'pending':
        return 'warning';
      case 'scheduled':
        return 'info';
      default:
        return 'secondary';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'done':
        return 'bi-check-circle-fill';
      case 'ongoing':
        return 'bi-scissors';
      case 'cancelled':
        return 'bi-x-circle-fill';
      case 'pending':
        return 'bi-clock-fill';
      case 'scheduled':
        return 'bi-calendar-check';
      default:
        return 'bi-circle';
    }
  };

  if (loading && !weekDays.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container-fluid px-2 px-md-4 py-3 py-md-4">
      {/* Mobile-Optimized Header Card */}
      <div className="card mb-4 shadow-sm">
        <div className="card-body p-3">
          <div className="row align-items-center">
            <div className="col-12 col-md-8">
              <h2 className="mb-1">
                <i className="bi bi-calendar-week me-2 text-primary"></i>
                My Schedule
              </h2>
              <p className="text-muted mb-0">
                <i className="bi bi-clock me-1"></i>
                {selectedDate.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            <div className="col-12 col-md-4 mt-3 mt-md-0">
              <div className="d-flex flex-column flex-sm-row gap-2 justify-content-md-end">
                {/* View Mode Toggle */}
                <div className="btn-group btn-group-sm" role="group">
                  <button
                    type="button"
                    className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setViewMode('list')}
                    title="List View"
                  >
                    <i className="bi bi-list-ul"></i>
                  </button>
                  <button
                    type="button"
                    className={`btn ${viewMode === 'timeline' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setViewMode('timeline')}
                    title="Timeline View"
                  >
                    <i className="bi bi-clock-history"></i>
                  </button>
                </div>
                
                {getAppointmentsForDate(selectedDate).length > 0 && (
                  <button 
                    className="btn btn-outline-danger btn-sm" 
                    onClick={() => setShowBulkCancelModal(true)}
                    title="Cancel all appointments for this date"
                  >
                    <i className="bi bi-x-circle me-1"></i>
                    Bulk Cancel
                  </button>
                )}
                <button className="btn btn-outline-primary btn-sm" onClick={fetchAppointments}>
                  <i className="bi bi-arrow-clockwise me-1"></i>
                  Refresh
                </button>
              </div>
            </div>
          </div>
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

      {/* Timeline View */}
      {viewMode === 'timeline' && user && (
        <TimelineView 
          barberId={user.id}
          selectedDate={selectedDate}
          onAppointmentClick={(appointment) => {
            // Handle appointment click - could open details modal
            console.log('Appointment clicked:', appointment);
          }}
        />
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <>
      {/* Enhanced Week Navigation with Labels */}
      <div className="row mb-4">
        <div className="col-3 col-md-2 d-flex align-items-center">
          <button 
            className="btn btn-outline-primary btn-sm w-100" 
            onClick={() => navigateWeek(-1)}
            title="Previous Week"
          >
            <i className="bi bi-chevron-left me-1"></i>
            <span className="d-none d-sm-inline">Previous</span>
            <span className="d-sm-none">Prev</span>
          </button>
        </div>
        
        <div className="col-6 col-md-8">
          <div className="card shadow-sm">
            <div className="card-body p-3 text-center">
              <h5 className="mb-1 fw-bold">
                {weekDays.length > 0 ? (
                  `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - 
                   ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                ) : 'Loading...'}
              </h5>
              <small className="text-muted">Week View</small>
            </div>
          </div>
        </div>
        
        <div className="col-3 col-md-2 d-flex align-items-center">
          <button 
            className="btn btn-outline-primary btn-sm w-100" 
            onClick={() => navigateWeek(1)}
            title="Next Week"
          >
            <span className="d-none d-sm-inline me-1">Next</span>
            <span className="d-sm-none me-1">Next</span>
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>

      {/* Enhanced Week View */}
      <div className="row g-2 g-md-3 mb-4">
        {weekDays.map((date, index) => (
          <div key={index} className="col-6 col-md">
            <div 
              className={`day-card card h-100 shadow-sm ${isToday(date) ? 'border-primary border-2' : ''} ${isSelectedDate(date) ? 'bg-primary bg-opacity-10' : ''}`}
              onClick={() => handleDateChange(date)}
              style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            >
              <div className="card-header text-center p-2">
                <div className={`fw-bold ${isToday(date) ? 'text-primary' : ''}`}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className={`${isToday(date) ? 'text-primary fw-bold' : 'text-muted'}`}>
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
              <div className="card-body p-2 text-center">
                {(() => {
                  const dateAppointments = getAppointmentsForDate(date);
                  if (dateAppointments.length === 0) {
                    return (
                      <div>
                        <i className="bi bi-calendar-x text-muted fs-5"></i>
                        <div className="small text-muted mt-1">No appointments</div>
                      </div>
                    );
                  }
                  
                  const pendingCount = dateAppointments.filter(apt => apt.status === 'pending').length;
                  const scheduledCount = dateAppointments.filter(apt => apt.status === 'scheduled').length;
                  const ongoingCount = dateAppointments.filter(apt => apt.status === 'ongoing').length;
                  const completedCount = dateAppointments.filter(apt => apt.status === 'done').length;
                  
                  return (
                    <div>
                      <div className="badge bg-primary rounded-pill mb-1">
                        {dateAppointments.length} {dateAppointments.length === 1 ? 'appt' : 'appts'}
                      </div>
                      <div className="d-flex flex-column gap-1">
                        {pendingCount > 0 && (
                          <div className="badge bg-warning rounded-pill small">
                            <i className="bi bi-clock me-1"></i>
                            {pendingCount} pending
                          </div>
                        )}
                        {ongoingCount > 0 && (
                          <div className="badge bg-info rounded-pill small">
                            <i className="bi bi-scissors me-1"></i>
                            {ongoingCount} ongoing
                          </div>
                        )}
                        {completedCount > 0 && (
                          <div className="badge bg-success rounded-pill small">
                            <i className="bi bi-check-circle me-1"></i>
                            {completedCount} done
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Enhanced Day Schedule with Modern UI */}
      <div className="card shadow-lg border-0">
        <div className="card-header bg-gradient bg-primary text-white position-relative overflow-hidden">
          <div className="position-absolute top-0 end-0 w-100 h-100 opacity-10">
            <i className="bi bi-calendar3" style={{ fontSize: '8rem', position: 'absolute', top: '-2rem', right: '-2rem' }}></i>
          </div>
          <div className="d-flex align-items-center justify-content-between position-relative">
            <div className="flex-grow-1">
              <h4 className="mb-1 fw-bold">
              <i className="bi bi-calendar3 me-2"></i>
                <span className="d-none d-sm-inline">
              {selectedDate.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
                </span>
                <span className="d-sm-none">
                  {selectedDate.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </span>
              </h4>
              <p className="mb-0 text-white-50 fw-medium">Your daily appointment schedule</p>
            </div>
            {(() => {
              const dateAppointments = getAppointmentsForDate(selectedDate);
              return dateAppointments.length > 0 && (
                <div className="text-center d-none d-md-block">
                  <div className="bg-white bg-opacity-20 rounded-pill px-3 py-2">
                    <span className="fw-bold fs-4 text-dark">{dateAppointments.length}</span>
                    <div className="small text-dark opacity-75">
                      {dateAppointments.length === 1 ? 'appointment' : 'appointments'}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        
        {/* Mobile Stats Section */}
        {(() => {
          const dateAppointments = getAppointmentsForDate(selectedDate);
          return dateAppointments.length > 0 && (
            <div className="d-md-none p-3 bg-light border-bottom">
              <div className="row g-3">
                <div className="col-6">
                  <div className="stat-card-mobile text-center">
                    <div className="stat-number">{dateAppointments.length}</div>
                    <div className="stat-label">
                      {dateAppointments.length === 1 ? 'Appointment' : 'Appointments'}
                    </div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="stat-card-mobile text-center">
                    <div className="stat-number">{dateAppointments.reduce((total, apt) => total + (apt.total_duration || apt.service?.duration || 30), 0)}</div>
                    <div className="stat-label">Minutes</div>
                  </div>
                </div>
              </div>
              
              {/* Enhanced Timeline Stats */}
              {enhancedTimeline && (
                <div className="row g-2 mt-2">
                  <div className="col-3">
                    <div className="text-center">
                      <div className="small text-muted">Scheduled</div>
                      <div className="fw-bold text-primary">{enhancedTimeline.stats.totalScheduled}</div>
                    </div>
                  </div>
                  <div className="col-3">
                    <div className="text-center">
                      <div className="small text-muted">Queue</div>
                      <div className="fw-bold text-info">{enhancedTimeline.stats.totalQueue}</div>
                    </div>
                  </div>
                  <div className="col-3">
                    <div className="text-center">
                      <div className="small text-muted">Pending</div>
                      <div className="fw-bold text-warning">{enhancedTimeline.stats.totalPending}</div>
                    </div>
                  </div>
                  <div className="col-3">
                    <div className="text-center">
                      <div className="small text-muted">Utilization</div>
                      <div className="fw-bold text-success">{enhancedTimeline.stats.utilization}%</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        
        <div className="card-body p-0">
          {(() => {
            const dateAppointments = getAppointmentsForDate(selectedDate);
            
            if (loading) {
              return (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="text-muted">Loading appointments...</p>
                </div>
              );
            }
            
            if (dateAppointments.length === 0) {
              return (
                <div className="text-center py-5">
                  <div className="display-1 text-muted mb-4">
                    <i className="bi bi-calendar-x"></i>
                  </div>
                  <h5 className="text-muted mb-3">No appointments scheduled</h5>
                  <p className="text-muted">You have a free day! Enjoy your time off.</p>
                </div>
              );
            }

            // Get pending appointments that need barber acceptance
            const pendingAppointments = dateAppointments.filter(apt => apt.status === 'pending');
            
            return (
              <div className="p-0">
                {/* Pending Appointments Section */}
                {pendingAppointments.length > 0 && (
                  <div className="pending-appointments-section p-3 bg-warning bg-opacity-10 border-bottom">
                    <h6 className="mb-3 text-warning">
                      <i className="bi bi-clock-history me-2"></i>
                      Pending Approval ({pendingAppointments.length})
                    </h6>
                    <div className="alert alert-warning mb-0">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      <strong>Action Required:</strong> These appointments need your approval before they can be scheduled.
                    </div>
                  </div>
                )}

                {dateAppointments.map((appointment, index) => (
                  <div key={appointment.id} className={`appointment-card mobile-optimized ${appointment.status === 'ongoing' ? 'current-appointment' : ''} ${appointment.is_urgent ? 'urgent-appointment' : ''}`}>
                    {/* Mobile-Optimized Appointment Card */}
                    <div className="appointment-card-mobile">
                      {/* Top Row - Time and Status */}
                      <div className="appointment-header-mobile">
                        <div className="d-flex align-items-center justify-content-between">
                          {/* Time and Queue Position */}
                          <div className="d-flex align-items-center gap-2">
                            <div className={`time-badge-mobile ${!appointment.appointment_time && appointment.appointment_type === 'queue' ? 'queue-badge' : ''}`}>
                              <span className="fw-bold">
                                {appointment.appointment_time ? 
                                  appointment.appointment_time.substring(0, 5) : 
                                  (appointment.appointment_type === 'queue' ? 'QUEUE' : '—')
                                }
                              </span>
                            </div>
                            
                            {/* Appointment Type Badge */}
                            {appointment.status === 'pending' ? (
                              <div className="queue-position-badge-mobile pending">
                                <span className="fw-bold">PENDING</span>
                              </div>
                            ) : appointment.queue_position ? (
                              <div className="queue-position-badge-mobile">
                                <span className="fw-bold">#{appointment.queue_position}</span>
                              </div>
                            ) : (
                              <div className="queue-position-badge-mobile scheduled">
                                <span className="fw-bold">SCHED</span>
                              </div>
                         )}
                       </div>
                          
                          {/* Status Badge */}
                          <div className={`status-badge-mobile status-${appointment.status}`}>
                            <i className={`bi ${getStatusIcon(appointment.status)} me-1`}></i>
                            <span className="d-none d-sm-inline">{appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}</span>
                         </div>
                       </div>
                     </div>

                      {/* Middle Row - Customer and Service */}
                      <div className="appointment-content-mobile">
                        <div className="row g-2">
                          <div className="col-8">
                            <h6 className="customer-name-mobile mb-1 fw-bold text-dark">
                              {appointment.customer?.full_name || 'Unknown Customer'}
                            </h6>
                            <p className="service-name-mobile mb-1 text-muted">
                              {getServicesDisplay(appointment)}
                            </p>
                            <div className="d-flex align-items-center gap-2 flex-wrap">
                              <span className="duration-badge">
                                <i className="bi bi-clock me-1"></i>
                                {appointment.total_duration || appointment.service?.duration || '—'} min
                     </span>
                              {appointment.is_urgent && (
                                <span className="urgent-badge">
                                  <i className="bi bi-lightning-fill me-1"></i>
                                  URGENT
                                </span>
                              )}
                   </div>
                 </div>
                          <div className="col-4 text-end">
                            {appointment.customer?.phone && (
                              <a href={`tel:${appointment.customer.phone}`} className="btn btn-primary btn-mobile-call">
                                <i className="bi bi-telephone"></i>
                                <span className="d-none d-sm-inline ms-1">Call</span>
                              </a>
                            )}
                        </div>
                        </div>
                       </div>
                     </div>

                    {/* Add-ons (if any) - Compact Display */}
                    <div className="addons-section px-3 pb-2">
                      <AddOnsDisplay appointment={appointment} />
                    </div>

                   {/* Customer Rating Display */}
                   {appointment.status === 'done' && appointment.is_reviewed && appointment.customer_rating && (
                      <div className="rating-section px-3 pb-2">
                        <div className="rating-card">
                         <div className="d-flex align-items-center justify-content-between">
                           <div className="d-flex align-items-center">
                             <i className="bi bi-star-fill text-warning me-2"></i>
                              <strong>Customer Rating</strong>
                           </div>
                           <div className="d-flex align-items-center">
                             {[...Array(5)].map((_, i) => (
                               <i
                                 key={i}
                                 className={`bi bi-star-fill ${
                                   i < appointment.customer_rating ? 'text-warning' : 'text-muted'
                                 }`}
                               ></i>
                             ))}
                              <span className="ms-2 fw-bold text-warning">
                               {appointment.customer_rating}/5
                             </span>
                           </div>
                         </div>
                         {appointment.review_text && (
                           <div className="mt-2">
                              <p className="text-muted fst-italic mb-0">
                               "{appointment.review_text}"
                              </p>
                           </div>
                         )}
                       </div>
                     </div>
                   )}
                   
                   {/* Friend/Child Booking Information */}
                    <div className="friend-booking-section px-3 pb-2">
                   <FriendBookingDisplay appointment={appointment} variant="compact" />
                      </div>
                      
                    {/* Mobile-Optimized Action Buttons */}
                    <div className="appointment-actions-mobile">
                      <div className="row g-2">
                            {appointment.status === 'pending' && (
                              <>
                            <div className="col-6">
                                <button
                                className="btn btn-success btn-mobile-action w-100"
                                  onClick={() => handleBookingResponse(appointment.id, 'accept')}
                                >
                                  <i className="bi bi-check-circle me-1"></i>
                                  <span className="d-none d-sm-inline">
                                    {appointment.appointment_type === 'queue' ? 'Accept to Queue' : 'Accept'}
                                  </span>
                                <span className="d-sm-none">Accept</span>
                                </button>
                            </div>
                            <div className="col-6">
                                <button
                                className="btn btn-outline-danger btn-mobile-action w-100"
                                  onClick={() => {
                                    const reason = prompt('Reason for declining (optional):');
                                    if (reason !== null) {
                                      handleBookingResponse(appointment.id, 'decline', reason);
                                    }
                                  }}
                                >
                                  <i className="bi bi-x-circle me-1"></i>
                                  <span className="d-none d-sm-inline">Decline</span>
                                <span className="d-sm-none">Decline</span>
                                </button>
                            </div>
                              </>
                            )}
                            
                            {appointment.status === 'scheduled' && (
                          <div className="col-12">
                              <button
                              className="btn btn-primary btn-mobile-action w-100"
                                onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                              >
                                <i className="bi bi-play-fill me-1"></i>
                              <span className="d-none d-sm-inline">Start Appointment</span>
                              <span className="d-sm-none">Start</span>
                              </button>
                          </div>
                            )}
                            
                            {appointment.status === 'ongoing' && (
                          <div className="col-12">
                              <button
                              className="btn btn-success btn-mobile-action w-100"
                                onClick={() => handleAppointmentStatus(appointment.id, 'done')}
                              >
                                <i className="bi bi-check-lg me-1"></i>
                              <span className="d-none d-sm-inline">Complete Service</span>
                              <span className="d-sm-none">Complete</span>
                              </button>
                          </div>
                        )}

                        {/* Queue Management for Scheduled Appointments */}
                        {appointment.status === 'scheduled' && appointment.appointment_type === 'scheduled' && (
                          <div className="col-12">
                            <div className="btn-group w-100 mb-2">
                              <button
                                className="btn btn-warning btn-sm"
                                onClick={() => handleAddToQueue(appointment.id, true)}
                                title="Add to queue as urgent (front of line)"
                              >
                                <i className="bi bi-lightning-fill me-1"></i>
                                <span className="d-none d-sm-inline">Urgent Queue</span>
                                <span className="d-sm-none">Urgent</span>
                              </button>
                              <button
                                className="btn btn-info btn-sm"
                                onClick={() => handleAddToQueue(appointment.id, false)}
                                title="Add to queue (normal priority)"
                              >
                                <i className="bi bi-arrow-right-circle me-1"></i>
                                <span className="d-none d-sm-inline">Join Queue</span>
                                <span className="d-sm-none">Queue</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Priority Control for Queue Appointments */}
                        {appointment.appointment_type === 'queue' && appointment.queue_position && (
                          <div className="col-12 mb-2">
                            <label className="form-label small mb-1">Priority Level:</label>
                            <select
                              className="form-select form-select-sm"
                              value={appointment.priority_level || 'normal'}
                              onChange={(e) => handleChangePriority(appointment.id, e.target.value)}
                            >
                              <option value="urgent">🔴 Urgent</option>
                              <option value="high">🟠 High</option>
                              <option value="normal">🟢 Normal</option>
                              <option value="low">🔵 Low</option>
                            </select>
                          </div>
                            )}

                            {(appointment.status === 'scheduled' || appointment.status === 'pending') && (
                          <div className="col-12">
                              <button
                              className="btn btn-outline-danger btn-mobile-action w-100"
                                onClick={() => handleCancelAppointment(appointment.id)}
                              >
                                <i className="bi bi-x-circle me-1"></i>
                              <span className="d-none d-sm-inline">Cancel Appointment</span>
                              <span className="d-sm-none">Cancel</span>
                              </button>
                          </div>
                            )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Bulk Cancellation Modal */}
      <BulkCancellationModal
        isOpen={showBulkCancelModal}
        onClose={() => setShowBulkCancelModal(false)}
        barberId={user?.id}
        selectedDate={toISODateString(selectedDate)}
        onSuccess={(cancelledCount) => {
          console.log(`✅ Bulk cancelled ${cancelledCount} appointments`);
          fetchAppointments(); // Refresh the schedule
        }}
      />

      {/* Cancellation Reason Modal */}
      {showCancelModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-exclamation-triangle text-warning me-2"></i>
                  Cancel Appointment
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={closeCancelModal}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-3">Are you sure you want to cancel this appointment?</p>
                <div className="mb-3">
                  <label htmlFor="cancelReason" className="form-label">
                    <i className="bi bi-chat-text me-1"></i>
                    Reason for cancellation (optional)
                  </label>
                  <textarea
                    className="form-control"
                    id="cancelReason"
                    rows="3"
                    placeholder="Enter reason for cancellation..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                  <div className="form-text">
                    This reason will be shared with the customer.
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={closeCancelModal}
                >
                  <i className="bi bi-x-circle me-1"></i>
                  Keep Appointment
                </button>
                <button 
                  type="button" 
                  className="btn btn-danger" 
                  onClick={confirmCancelAppointment}
                >
                  <i className="bi bi-check-circle me-1"></i>
                  Cancel Appointment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default BarberSchedule;