// components/barber/BarberSchedule.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import LoadingSpinner from '../common/LoadingSpinner';
import addOnsService from '../../services/AddOnsService';
import { PushService } from '../../services/PushService';
import BulkCancellationModal from './BulkCancellationModal';
import RescheduleModal from './RescheduleModal';
import FriendBookingDisplay from '../common/FriendBookingDisplay';
import ComprehensiveQueueManager from '../../services/ComprehensiveQueueManager';
import { toISODateString, getStatusColor, getStatusIcon } from '../utils/helpers';
import '../../styles/barber-appointments.css';

const LEGACY_ADDON_NAMES = {
  addon1: 'Beard Trim',
  addon2: 'Hot Towel Treatment',
  addon3: 'Scalp Massage',
  addon4: 'Hair Wash',
  addon5: 'Styling',
  addon6: 'Hair Wax Application',
  addon7: 'Eyebrow Trim',
  addon8: 'Mustache Trim',
  addon9: 'Face Mask',
  addon10: 'Hair Treatment'
};

const BarberSchedule = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [weekDays, setWeekDays] = useState([]);
  const [showBulkCancelModal, setShowBulkCancelModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelAppointmentId, setCancelAppointmentId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isFixingDataConsistency, setIsFixingDataConsistency] = useState(false);
  const [addOnsLookup, setAddOnsLookup] = useState({});
  const [rescheduleModal, setRescheduleModal] = useState({ isOpen: false, appointment: null });

  const normalizeStatus = (status) => {
    const value = status?.toLowerCase();
    switch (value) {
      case 'done':
        return 'completed';
      case 'cancel':
        return 'cancelled';
      case 'scheduled':
        return 'confirmed';
      default:
        return value || '';
    }
  };

  const normalizeAppointmentRecord = (appointment = {}) => ({
    ...appointment,
    status: normalizeStatus(appointment.status)
  });

  const getDatabaseStatusOptions = (canonicalStatus) => {
    switch (canonicalStatus) {
      case 'completed':
        return ['done', canonicalStatus];
      case 'confirmed':
        return ['confirmed', 'scheduled'];
      case 'cancelled':
        return ['cancelled', 'cancel'];
      case 'ongoing':
      case 'pending':
        return [canonicalStatus];
      default:
        return [canonicalStatus].filter(Boolean);
    }
  };

  const buildStatusUpdatePayload = (dbStatus, canonicalStatus, reason) => {
    const payload = {
      status: dbStatus,
      updated_at: new Date().toISOString()
    };

    if (canonicalStatus === 'completed' || canonicalStatus === 'cancelled') {
      payload.queue_position = null;
    } else if (canonicalStatus === 'ongoing') {
      payload.queue_position = 0;
    }

    if (canonicalStatus === 'cancelled' && reason) {
      payload.cancellation_reason = reason;
    }

    return payload;
  };


  useEffect(() => {
    getCurrentUser();
  }, []);

  useEffect(() => {
    const loadAddOnNames = async () => {
      try {
        const addOns = await addOnsService.getAddOns();
        const mapping = { ...LEGACY_ADDON_NAMES };
        (addOns || []).forEach(addOn => {
          if (addOn?.id) {
            mapping[addOn.id] = addOn.name || mapping[addOn.id] || addOn.id;
          }
        });
        setAddOnsLookup(mapping);
      } catch (err) {
        console.error('Error loading add-on names:', err);
        setAddOnsLookup(LEGACY_ADDON_NAMES);
      }
    };

    loadAddOnNames();
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
      
      const normalizedData = (data || []).map(normalizeAppointmentRecord);
      setAppointments(normalizedData);
      
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load schedule. Please try again.');
    } finally {
      setLoading(false);
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

  const parseAddOnsData = (addOnsData) => {
    if (!addOnsData) return [];

    if (Array.isArray(addOnsData)) {
      return addOnsData;
    }

    if (typeof addOnsData === 'string') {
      const trimmed = addOnsData.trim();
      if (!trimmed || trimmed === '[]' || trimmed === 'null' || trimmed === 'undefined') {
        return [];
        }

        try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.items)) return parsed.items;
        if (parsed && Array.isArray(parsed.data)) return parsed.data;
        if (parsed && Array.isArray(parsed.ids)) return parsed.ids;
      } catch (err) {
        // Not JSON, maybe comma-separated or single ID
        if (trimmed.includes(',')) {
          return trimmed.split(',').map(item => item.trim()).filter(Boolean);
        }
        return [trimmed];
      }
      return [];
    }

    if (typeof addOnsData === 'object') {
      if (Array.isArray(addOnsData.items)) return addOnsData.items;
      if (Array.isArray(addOnsData.data)) return addOnsData.data;
      if (Array.isArray(addOnsData.ids)) return addOnsData.ids;
      if (Array.isArray(addOnsData)) return addOnsData;
      return Object.values(addOnsData);
    }

    return [];
  };

  const getAddOnsDisplayString = (addOnsData) => {
    const items = parseAddOnsData(addOnsData);
    if (!items.length) return '';

    const names = items.map(item => {
      if (!item) return '';

      if (typeof item === 'string') {
        if (addOnsLookup[item]) return addOnsLookup[item];
        const trimmed = item.trim();
        if (addOnsLookup[trimmed]) return addOnsLookup[trimmed];
        if (trimmed.includes('-')) {
          return '';
        }
        return trimmed;
      }

      if (typeof item === 'object') {
        if (item.name) return item.name;
        if (item.label) return item.label;
        const id = item.id || item.addon_id || item.uuid;
        if (id && addOnsLookup[id]) return addOnsLookup[id];
        if (typeof id === 'string' && id.includes('-')) return '';
      }

      return '';
    }).filter(Boolean);

    const uniqueNames = names.filter((name, index) => names.indexOf(name) === index);

    if (!uniqueNames.length) return '';

    return uniqueNames.join(' + ');
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
          status: 'confirmed',
          updated_at: new Date().toISOString()
        };

        // Handle different appointment types differently
        if (appointment.appointment_type === 'queue') {
          // For queue appointments, assign queue position and calculate estimated time
          console.log('📋 Accepting queue appointment - assigning queue position');
          
          // Get current queue appointments for this barber and date
          const dateAppointments = getAppointmentsForDate(selectedDate).filter(apt => 
            apt.status === 'confirmed' && apt.appointment_type === 'queue'
          );
          
          if (appointment.is_urgent) {
            updates.queue_position = 1;
            
            // Increment all existing queue positions
            // Fetch appointments that need their queue positions incremented
            const { data: existingAppointments, error: fetchError } = await supabase
              .from('appointments')
              .select('id, queue_position')
              .eq('barber_id', user.id)
              .eq('appointment_date', appointment.appointment_date)
              .eq('status', 'confirmed')
              .eq('appointment_type', 'queue')
              .not('queue_position', 'is', null)
              .neq('id', appointmentId);
            
            if (fetchError) {
              console.warn('Warning: Could not fetch appointments for queue position increment:', fetchError);
            } else if (existingAppointments && existingAppointments.length > 0) {
              // Update each appointment's queue position
              for (const apt of existingAppointments) {
                await supabase
                  .from('appointments')
                  .update({ 
                    queue_position: (apt.queue_position || 0) + 1,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', apt.id);
              }
            }
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
        const declineReason = reason || 'Declined by barber';
        let declineError = null;

        for (const dbStatus of getDatabaseStatusOptions('cancelled')) {
          const payload = buildStatusUpdatePayload(dbStatus, 'cancelled', declineReason);
          const { error } = await supabase
            .from('appointments')
            .update(payload)
            .eq('id', appointmentId);

          if (!error) {
            declineError = null;
            break;
          }

          declineError = error;
          if (error.code !== '23514') {
            throw error;
          }
          console.warn('Decline status violated constraint, retrying with fallback value', { appointmentId, attemptedStatus: dbStatus });
        }

        if (declineError) {
          throw declineError;
        }

        // Create notification using centralized service (prevents duplicates)
        try {
          const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
          await centralizedNotificationService.createNotification({
            userId: appointment.customer_id,
            title: 'Booking Request Declined',
            message: `Your appointment request has been declined. ${reason ? `Reason: ${reason}` : 'Please try booking with another barber or a different time.'}`,
            type: 'appointment',
            category: 'cancellation',
            priority: 'high',
            channels: ['app', 'push'],
            appointmentId: appointmentId,
            data: { 
              status: 'declined',
              reason: reason || null
            }
          });
        } catch (notifError) {
          console.warn('Failed to send decline notification:', notifError);
        }
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
          newStatus: action === 'accept' ? 'confirmed' : 'cancelled',
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
      const errorMessage = err?.message || 'Unknown error occurred';
      console.error('Error details:', {
        message: errorMessage,
        code: err?.code,
        details: err?.details,
        hint: err?.hint
      });
      setError(`Failed to process booking request: ${errorMessage}. Please try again.`);
    }
  };

  const handleAppointmentStatus = async (appointmentId, status, reason = '') => {
    try {
      const canonicalStatus = normalizeStatus(status) || status?.toLowerCase();
      if (!canonicalStatus) {
        throw new Error('Invalid appointment status');
      }

      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Check if appointment can be started
      if (canonicalStatus === 'ongoing' && appointment.status !== 'confirmed') {
        throw new Error('Only confirmed appointments can be started');
      }

      console.log(`🔄 Schedule starting status change: ${appointment.status} → ${canonicalStatus} for appointment ${appointmentId}`);

      // Optimistic update - update UI immediately
      setAppointments(prev => prev.map(apt => 
        apt.id === appointmentId 
          ? normalizeAppointmentRecord({ 
              ...apt, 
              status: canonicalStatus, 
              queue_position: canonicalStatus === 'ongoing' ? 0 : 
                           canonicalStatus === 'completed' || canonicalStatus === 'cancelled' ? null : 
                           apt.queue_position,
              cancellation_reason: canonicalStatus === 'cancelled' ? (reason || apt.cancellation_reason) : apt.cancellation_reason,
              updated_at: new Date().toISOString()
            })
          : apt
      ));

      let lastError = null;
      for (const dbStatus of getDatabaseStatusOptions(canonicalStatus)) {
        console.log('Attempting barber status update', { appointmentId, dbStatus, canonicalStatus });
        const payload = buildStatusUpdatePayload(dbStatus, canonicalStatus, reason);
        const { error } = await supabase
          .from('appointments')
          .update(payload)
          .eq('id', appointmentId);

        if (!error) {
          lastError = null;
          break;
        }

        lastError = error;
        if (error.code !== '23514') {
          throw error;
        }
        console.warn('Status update violated constraint, trying fallback value', {
          appointmentId,
          attemptedStatus: dbStatus,
          canonicalStatus,
          error
        });
      }

      if (lastError) {
        throw lastError;
      }

      // If cancelled, collapse queue positions for same barber/date
      if (canonicalStatus === 'cancelled' && appointment.queue_position != null) {
        try {
          console.log(`🔄 Collapsing queue positions after barber cancelling position ${appointment.queue_position}`);
          
          const { data: affected, error: fetchErr } = await supabase
            .from('appointments')
            .select('id, queue_position')
            .eq('barber_id', appointment.barber_id)
            .eq('appointment_date', appointment.appointment_date)
            .gt('queue_position', appointment.queue_position)
            .in('status', ['confirmed', 'pending', 'ongoing']);

          if (fetchErr) {
            console.error('Error fetching appointments to collapse queue:', fetchErr);
          } else if (affected && affected.length > 0) {
            // Update each appointment's queue position individually
            for (const item of affected) {
              await supabase
                .from('appointments')
                .update({ 
                  queue_position: Math.max(1, (item.queue_position || 1) - 1),
                  updated_at: new Date().toISOString()
                })
                .eq('id', item.id);
            }
            console.log(`📝 Found ${affected.length} appointments to update positions`);
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
          new_status: canonicalStatus,
          previous_status: appointment.status
        }
      });

      // Create notification for customer
      const notificationData = {
        user_id: appointment.customer_id,
        type: 'appointment',
        data: { appointment_id: appointmentId, status: canonicalStatus }
      };

      let successMessage = '';
      switch (canonicalStatus) {
        case 'ongoing':
          notificationData.title = 'Your appointment has started! ✂️';
          notificationData.message = 'Your barber is ready for you now.';
          break;
        case 'completed':
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
          notificationData.title = `Appointment ${canonicalStatus.charAt(0).toUpperCase() + canonicalStatus.slice(1)}`;
          notificationData.message = `Your appointment status has been updated to ${canonicalStatus}`;
      }

      // Create notification using centralized service (ONLY way to create notifications)
      const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
      await centralizedNotificationService.createAppointmentStatusNotification({
        userId: appointment.customer_id,
        appointmentId: appointmentId,
        status: canonicalStatus,
        changedBy: 'barber'
      });

      // If starting an appointment, notify other customers in queue about updated wait times
      if (canonicalStatus === 'ongoing') {
        const queuedAppointments = appointments.filter(apt => 
          apt.status === 'confirmed' && 
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
          newStatus: canonicalStatus,
          previousStatus: appointment.status,
          barberId: user.id,
          appointmentDate: appointment.appointment_date,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(changeEvent);

      console.log(`✅ Schedule status change completed: ${appointment.status} → ${canonicalStatus}`);

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

  const formatStatus = (status) => {
    if (!status) return '';
    const lower = status.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  const renderAppointmentActions = (appointment) => {
    const buttons = [];
    const status = appointment.status?.toLowerCase();

    if (status === 'pending') {
      buttons.push(
        <button
          key="accept"
          className="btn btn-success btn-sm"
          onClick={() => handleBookingResponse(appointment.id, 'accept')}
        >
          <i className="bi bi-check-circle me-1"></i>
          Accept
        </button>
      );
    }

    // Reschedule button - show for confirmed, scheduled, or any reschedulable status
    // Exclude: pending (needs acceptance first), ongoing, completed, cancelled
    if (status !== 'pending' && status !== 'ongoing' && status !== 'completed' && status !== 'cancelled' && status !== 'cancel' && status !== 'done') {
      buttons.push(
        <button
          key="reschedule"
          className="btn btn-warning btn-sm"
          onClick={() => {
            console.log('Reschedule button clicked for appointment:', appointment);
            setRescheduleModal({ isOpen: true, appointment: appointment });
          }}
          title="Reschedule Appointment"
        >
          <i className="bi bi-arrow-repeat me-1"></i>
          Reschedule
        </button>
      );
    }

    if (status === 'confirmed' || status === 'scheduled') {
      buttons.push(
        <button
          key="start"
          className="btn btn-primary btn-sm"
          onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
        >
          <i className="bi bi-play-fill me-1"></i>
          Start
        </button>
      );
    }

    if (status === 'ongoing') {
      buttons.push(
        <button
          key="complete"
          className="btn btn-success btn-sm"
          onClick={() => handleAppointmentStatus(appointment.id, 'completed')}
        >
          <i className="bi bi-check-lg me-1"></i>
          Complete
        </button>
      );
    }

    if (status !== 'completed' && status !== 'cancelled' && status !== 'cancel' && status !== 'done') {
      buttons.push(
        <button
          key="cancel"
          className="btn btn-outline-danger btn-sm"
          onClick={() => handleCancelAppointment(appointment.id)}
        >
          <i className="bi bi-x-circle me-1"></i>
          Cancel
        </button>
      );
    }

    if (buttons.length === 0) {
      return <span className="text-muted small">No actions</span>;
    }

    return (
      <div className="d-flex gap-2 flex-wrap">
        {buttons}
      </div>
    );
  };

  if (loading && !weekDays.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container-fluid px-2 px-md-4 py-3 py-md-4">
      {/* Mobile-Optimized Header Card */}
      <div className="card mb-4 shadow-sm">
        <div className="card-body p-3">
          <div className="d-flex flex-row flex-wrap align-items-center justify-content-between gap-2 gap-md-3">
            <div className="flex-grow-1">
              <h2
                className="mb-1"
                style={{ fontSize: 'clamp(1.1rem, 3.2vw, 1.5rem)' }}
              >
                <i className="bi bi-calendar-week me-2 text-primary"></i>
                My Schedule
              </h2>
              <p
                className="text-muted mb-0"
                style={{ fontSize: 'clamp(0.75rem, 2.4vw, 0.9rem)' }}
              >
                <i className="bi bi-clock me-1"></i>
                {selectedDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <div className="d-flex flex-row flex-md-column gap-2 align-items-stretch align-items-md-end justify-content-end ms-auto flex-shrink-0">
              {getAppointmentsForDate(selectedDate).length > 0 && (
                <button
                  className="btn btn-outline-danger btn-sm d-flex align-items-center justify-content-center w-auto"
                  onClick={() => setShowBulkCancelModal(true)}
                  title="Cancel all appointments for this date"
                >
                  <i className="bi bi-x-circle me-1"></i>
                  <span className="d-none d-sm-inline">Bulk Cancel</span>
                  <span className="d-sm-none">Cancel All</span>
                </button>
              )}
              <button
                className="btn btn-outline-primary btn-sm d-flex align-items-center justify-content-center w-auto"
                onClick={fetchAppointments}
              >
                <i className="bi bi-arrow-clockwise me-1"></i>
                <span>Refresh</span>
              </button>
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
                  const confirmedCount = dateAppointments.filter(apt => apt.status === 'confirmed').length;
                  const ongoingCount = dateAppointments.filter(apt => apt.status === 'ongoing').length;
                  const completedCount = dateAppointments.filter(apt => apt.status === 'completed').length;
                  
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
                        {confirmedCount > 0 && (
                          <div className="badge bg-info rounded-pill small">
                            <i className="bi bi-calendar-check me-1"></i>
                            {confirmedCount} confirmed
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
            const activeQueueAppointments = dateAppointments
              .filter(apt => apt.appointment_type === 'queue' && apt.status !== 'completed' && apt.status !== 'cancelled')
              .sort((a, b) => {
                const posA = a.queue_position ?? Infinity;
                const posB = b.queue_position ?? Infinity;
                if (posA !== posB) return posA - posB;
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
              });
            
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

                <div className="appointment-card-list">
                  {dateAppointments.map((appointment) => {
                    const statusColor = getStatusColor(appointment.status);
                    const totalPrice = getTotalPrice(appointment);
                    let queueNumber = appointment.queue_position;
                    if (queueNumber == null && appointment.appointment_type === 'queue') {
                      const computedIndex = activeQueueAppointments.findIndex(apt => apt.id === appointment.id);
                      if (computedIndex !== -1) {
                        queueNumber = computedIndex + 1;
                      }
                    }
 
                    const serviceLabel = [
                      appointment.service?.name,
                      getAddOnsDisplayString(appointment.add_ons_data)
                    ].filter(Boolean).join(' + ');

                    return (
                      <div
                        key={`card-${appointment.id}`}
                        className={`appointment-card-simple mb-3 border rounded-3 shadow-sm ${appointment.status === 'ongoing' ? 'border-primary bg-light' : 'bg-white'}`}
                      >
                        <div className="p-3 position-relative">
                          <div className="d-flex justify-content-between align-items-start mb-3">
                            <div className="d-flex align-items-center gap-3">
                              <div className="rounded-circle bg-primary text-white fw-bold d-flex align-items-center justify-content-center" style={{ width: '48px', height: '48px' }}>
                                {queueNumber != null ? queueNumber : '-'}
                         </div>
                              <div>
                                <h6 className="fw-bold mb-1 text-dark">
                              {appointment.customer?.full_name || 'Unknown Customer'}
                            </h6>
                                {appointment.appointment_time && (
                                  <div className="text-muted small">Time: {appointment.appointment_time.substring(0, 5)}</div>
                                )}
                                {serviceLabel && (
                                  <div className="text-muted small mt-1">{serviceLabel}</div>
                                )}
                                {appointment.status === 'pending' && (
                                  <span className="badge bg-warning-subtle text-warning-emphasis mt-2 me-1">Pending</span>
                                )}
                                {appointment.is_urgent && (
                                  <span className="badge bg-danger-subtle text-danger-emphasis mt-2">Urgent</span>
                                )}
                      </div>
                            </div>
                            <div className="text-end">
                              <span className={`badge bg-${statusColor}`}>{formatStatus(appointment.status)}</span>
                            </div>
                          </div>

                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <div className="text-muted small">
                              {appointment.total_duration || appointment.service?.duration || '—'} min
                          </div>
                            <div className="fw-bold text-success">
                              ₱{totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>

                          <FriendBookingDisplay appointment={appointment} variant="compact" />

                          <div className="mt-3 d-flex justify-content-end">
                            {renderAppointmentActions(appointment)}
                          </div>
                      </div>
                    </div>
                    );
                  })}
                  </div>
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

      {/* Reschedule Modal */}
      <RescheduleModal
        isOpen={rescheduleModal.isOpen}
        onClose={() => setRescheduleModal({ isOpen: false, appointment: null })}
        appointment={rescheduleModal.appointment}
        onSuccess={(request) => {
          console.log('✅ Reschedule request created:', request);
          setRescheduleModal({ isOpen: false, appointment: null });
          fetchAppointments(); // Refresh the schedule after reschedule request
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
    </div>
  );
};

export default BarberSchedule;