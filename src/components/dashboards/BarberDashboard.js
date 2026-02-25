// components/dashboards/BarberDashboard.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import logoImage from '../../assets/images/raf-rok-logo.png';
import { ROUTES, QUEUE_SETTINGS } from '../utils/constants';
import RescheduleModal from '../barber/RescheduleModal';
import addOnsService from '../../services/booking/AddOnsService';
import FriendBookingDisplay from '../common/FriendBookingDisplay';

const BarberDashboard = () => {
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [queueStatus, setQueueStatus] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [currentAppointment, setCurrentAppointment] = useState(null);
  const [todayStats, setTodayStats] = useState({
    totalAppointments: 0,
    completedAppointments: 0,
    revenue: 0,
    pendingRequests: 0,
    queueLength: 0,
    averageWaitTime: 0
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [barberInfo, setBarberInfo] = useState(null);
  const [animateCards, setAnimateCards] = useState(false);
  const [animateActions, setAnimateActions] = useState(false);
  const [barberStatus, setBarberStatus] = useState('available');
  const [recentReviews, setRecentReviews] = useState([]);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState(null);
  const [rescheduleModal, setRescheduleModal] = useState({ isOpen: false, appointment: null });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [availableServices, setAvailableServices] = useState([]);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ customerName: '', serviceId: '', notes: '' });

  useEffect(() => {
    getCurrentUser();
    setTimeout(() => {
      setAnimateCards(true);
      setTimeout(() => {
        setAnimateActions(true);
      }, 300);
    }, 300);
  }, []);

  useEffect(() => {
    if (user) {
      getBarberInfo();
      fetchBarberData();
      fetchRecentReviews();
      fetchServices();

      // Set up real-time subscription with enhanced error handling
      const channelName = `barber-dashboard-${user.id}-${Date.now()}`;
      console.log(`📡 Setting up dashboard subscription: ${channelName}`);

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
            console.log(`📥 Dashboard received real-time update:`, payload);

            // Debounce rapid updates
            clearTimeout(window.dashboardUpdateTimeout);
            window.dashboardUpdateTimeout = setTimeout(() => {
              console.log('🔄 Dashboard refreshing data...');
              debouncedRefresh();
            }, 800);
          }
        )
        .subscribe((status, err) => {
          console.log(`📡 Dashboard subscription status: ${status}`, err);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Dashboard real-time subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Dashboard subscription error:', err);
          }
        });

      // Set up periodic refresh as backup
      const interval = setInterval(() => {
        console.log('🔄 Dashboard periodic refresh');
        debouncedRefresh();
      }, 30000);

      // Listen for custom events from other components
      const handleAppointmentChange = (event) => {
        const { appointmentId, newStatus, barberId, timestamp } = event.detail;
        console.log(`📢 Dashboard received custom event:`, event.detail);

        if (barberId === user.id) {
          // Update immediately if it's our barber
          clearTimeout(window.dashboardUpdateTimeout);
          window.dashboardUpdateTimeout = setTimeout(() => {
            console.log('🔄 Dashboard updating from custom event...');
            fetchBarberData();
          }, 500);
        }
      };

      // Listen for force refresh events
      const handleForceRefresh = (event) => {
        if (event.detail.barberId === user.id) {
          console.log('🔄 Dashboard force refresh triggered');
          fetchBarberData();
        }
      };

      window.addEventListener('appointmentStatusChanged', handleAppointmentChange);
      window.addEventListener('forceRefreshBarberData', handleForceRefresh);

      // Listen for notification dropdown toggle
      const handleNotificationsToggle = (event) => {
        setNotificationsOpen(event.detail.isOpen);
      };
      window.addEventListener('notificationsToggle', handleNotificationsToggle);

      return () => {
        console.log('🧹 Cleaning up dashboard subscriptions');
        clearInterval(interval);
        clearTimeout(window.dashboardUpdateTimeout);
        subscription.unsubscribe();
        window.removeEventListener('appointmentStatusChanged', handleAppointmentChange);
        window.removeEventListener('forceRefreshBarberData', handleForceRefresh);
        window.removeEventListener('notificationsToggle', handleNotificationsToggle);
      };
    }
  }, [user]);

  const getCurrentUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (error) {
      console.error('Error getting current user:', error);
      setError('Failed to load user data');
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAvailableServices(data || []);
    } catch (err) {
      console.error('Error fetching services:', err);
    }
  };

  // Debounced refresh function to prevent rapid successive calls
  const debouncedRefresh = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    const timeout = setTimeout(() => {
      fetchBarberData();
    }, 1000); // 1 second debounce

    setDebounceTimeout(timeout);
  };

  const getBarberInfo = async () => {
    try {
      if (!user) return;

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setBarberInfo(data);
      setBarberStatus(data.barber_status || 'available');

    } catch (error) {
      console.error('Error getting barber info:', error);
      setError('Failed to load barber info');
    }
  };

  const fetchBarberData = async () => {
    if (isFetchingData) {
      console.log('⚠️ fetchBarberData already in progress, skipping...');
      return; // Prevent multiple simultaneous calls
    }

    try {
      setIsFetchingData(true);
      if (!user) {
        console.log('⚠️ No user, setting loading to false and returning');
        setLoading(false);
        setIsFetchingData(false);
        return;
      }

      setError('');
      const today = new Date().toISOString().split('T')[0];

      console.log('Fetching barber data for:', user.id, 'on:', today);

      // Fetch today's schedule (all appointments) with optimized query
      // Limit reduced to 100 for better performance (should be more than enough for one day)
      const { data: schedule, error: scheduleError } = await supabase
        .from('appointments')
        .select(`
          id,
          barber_id,
          customer_id,
          service_id,
          appointment_date,
          appointment_time,
          status,
          queue_position,
          total_price,
          total_duration,
          is_urgent,
          is_rebooking,
          notes,
          created_at,
          updated_at,
          services_data,
          add_ons_data,
          customer:customer_id(full_name, email, phone),
          service:service_id(name, price, duration)
        `)
        .eq('barber_id', user.id)
        .eq('appointment_date', today)
        .order('created_at', { ascending: false })
        .limit(100); // Reduced limit for better performance

      if (scheduleError) {
        console.error('Schedule fetch error:', scheduleError);
        throw scheduleError;
      }

      console.log('Fetched schedule:', schedule);

      const safeSchedule = Array.isArray(schedule) ? schedule : [];

      // Separate appointments by status with better filtering
      const current = safeSchedule.find(apt => apt.status === 'ongoing') || null;

      // Include all reschedulable appointments (scheduled, confirmed, and any other non-completed/non-cancelled statuses)
      // Only exclude: completed, cancelled, ongoing, pending (pending needs acceptance first)
      const reschedulableStatuses = ['scheduled', 'confirmed', 'done']; // 'done' is sometimes used instead of 'completed'
      const queue = safeSchedule
        .filter(apt => {
          const status = apt.status?.toLowerCase();
          // Include appointments that are scheduled, confirmed, or any status that's not pending, completed, cancelled, or ongoing
          return reschedulableStatuses.includes(status) ||
            (status !== 'pending' && status !== 'completed' && status !== 'cancelled' && status !== 'ongoing' && status !== 'cancel');
        })
        .sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));
      const pending = safeSchedule
        .filter(apt => apt.status === 'pending')
        .sort((a, b) => {
          // Sort urgent requests first, then by creation time
          if (a.is_urgent && !b.is_urgent) return -1;
          if (!a.is_urgent && b.is_urgent) return 1;
          return new Date(b.created_at) - new Date(a.created_at);
        });
      const completed = Array.isArray(safeSchedule) ? safeSchedule.filter(apt => apt.status === 'completed') : [];

      console.log('Separated appointments:', {
        current,
        queue: queue.length,
        pending: pending.length,
        completed: completed.length,
        allStatuses: safeSchedule.map(apt => ({ id: apt.id, status: apt.status, date: apt.appointment_date }))
      });

      // Debug: Log all appointments and their statuses
      console.log('📊 All appointments today:', safeSchedule.map(apt => ({
        id: apt.id,
        status: apt.status,
        customer: apt.customer?.full_name,
        date: apt.appointment_date
      })));

      setTodaySchedule(safeSchedule);
      setCurrentAppointment(current);
      setQueueStatus(queue);
      setPendingRequests(pending);

      // Calculate revenue - ensure proper number conversion and handle edge cases
      let revenueToday = 0;
      try {
        revenueToday = completed.reduce((sum, apt) => {
          try {
            // Calculate total price: base price + urgent fee
            const basePrice = Number(apt.total_price) || Number(apt.service?.price) || 0;
            const urgentFee = apt.is_urgent ? (QUEUE_SETTINGS.URGENT_FEE || 100) : 0;
            const total = basePrice + urgentFee;

            // Ensure it's a valid number
            const revenue = Number(total);
            if (isNaN(revenue) || revenue < 0) {
              console.warn('Invalid revenue value for appointment:', apt.id, {
                total_price: apt.total_price,
                service_price: apt.service?.price,
                is_urgent: apt.is_urgent,
                calculated: total
              });
              return sum;
            }
            return sum + revenue;
          } catch (error) {
            console.error('Error calculating revenue for appointment:', apt.id, error);
            return sum;
          }
        }, 0);
      } catch (error) {
        console.error('Error in revenue calculation:', error);
        revenueToday = 0; // Fallback to 0 if calculation fails
      }

      console.log('💰 Revenue calculation:', {
        completedCount: completed.length,
        revenueToday,
        appointments: completed.map(apt => ({
          id: apt.id,
          total_price: apt.total_price,
          service_price: apt.service?.price,
          is_urgent: apt.is_urgent,
          calculated: (Number(apt.total_price) || Number(apt.service?.price) || 0) + (apt.is_urgent ? (QUEUE_SETTINGS.URGENT_FEE || 100) : 0)
        }))
      });

      // Calculate average wait time
      const totalWaitTime = queue.reduce((total, apt) => {
        const serviceDuration = apt.total_duration || apt.service?.duration || 30;
        return total + serviceDuration;
      }, 0);
      const averageWaitTime = queue.length > 0 ? Math.ceil(totalWaitTime / queue.length) : 0;

      // Update stats with revenue - ensure it's always a number
      setTodayStats({
        totalAppointments: safeSchedule.length,
        completedAppointments: completed.length,
        revenue: Number(revenueToday) || 0,
        pendingRequests: pending.length,
        queueLength: queue.length,
        averageWaitTime
      });

      console.log('✅ fetchBarberData completed successfully, revenue:', revenueToday);

    } catch (error) {
      console.error('Error fetching barber data:', error);

      // Provide more specific error messages
      let errorMessage = 'Failed to load appointments. Please try again.';
      if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
        errorMessage = 'Request timed out. Please check your internet connection and try again.';
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.code === 'PGRST116') {
        errorMessage = 'No appointments found for today.';
      }

      setError(errorMessage);

      // Ensure stats are set even on error to prevent infinite loading
      setTodayStats(prev => ({
        ...prev,
        revenue: prev.revenue || 0 // Keep previous revenue or default to 0
      }));
    } finally {
      // Always set loading to false and reset fetching flag
      console.log('🔄 Setting loading to false and resetting isFetchingData');
      setLoading(false);
      setIsFetchingData(false);
    }
  };

  const fetchRecentReviews = async () => {
    try {
      if (!user) return;

      console.log('Fetching recent reviews for barber:', user.id);

      const { data: reviews, error } = await supabase
        .from('appointments')
        .select(`
          id,
          customer_rating,
          review_text,
          rating_created_at,
          appointment_date,
          customer:customer_id(full_name)
        `)
        .eq('barber_id', user.id)
        .eq('is_reviewed', true)
        .not('customer_rating', 'is', null)
        .order('rating_created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching reviews:', error);
        return;
      }

      console.log('Fetched recent reviews:', reviews);
      setRecentReviews(reviews || []);
    } catch (error) {
      console.error('Error fetching recent reviews:', error);
    }
  };

  const getServicesDisplay = (appointment) => {
    const services = [];

    if (appointment.service?.name) {
      services.push(appointment.service.name);
    }

    if (appointment.services_data) {
      try {
        let parsed;
        const raw = appointment.services_data;
        if (Array.isArray(raw)) {
          parsed = raw;
        } else if (typeof raw === 'string') {
          const t = raw.trim();
          if (t.startsWith('[') || t.startsWith('{')) {
            parsed = JSON.parse(t);
          } else {
            // Fallback: comma-separated list
            parsed = t.split(',').map(s => s.trim()).filter(Boolean);
          }
        } else if (typeof raw === 'object') {
          parsed = raw;
        }

        let totalCount = 0;
        if (Array.isArray(parsed)) {
          totalCount = parsed.length;
        } else if (parsed && Array.isArray(parsed.ids)) {
          totalCount = parsed.ids.length;
        }

        const shown = appointment.service?.name ? 1 : 0;
        const extra = Math.max(totalCount - shown, 0);
        if (extra > 0) {
          services.push(`+${extra} more`);
        }
      } catch (e) {
        console.error('Error parsing services data:', e);
      }
    }

    return services.join(', ');
  };

  // Async function to get add-ons display using AddOnsService
  const getAddOnsDisplay = async (appointment) => {
    if (!appointment?.add_ons_data) return '';
    try {
      return await addOnsService.getAddOnsDisplay(appointment.add_ons_data);
    } catch (error) {
      console.error('Error getting add-ons display:', error);
      return '';
    }
  };

  // Component to display add-ons with async loading
  const AddOnsDisplay = ({ appointment }) => {
    const [addOnsText, setAddOnsText] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const loadAddOns = async () => {
        if (!appointment?.add_ons_data) {
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
    }, [appointment?.add_ons_data]);

    if (loading) {
      return <span className="text-muted small">Loading add-ons...</span>;
    }

    if (!addOnsText) {
      return null;
    }

    return <span className="text-info addon-display">{addOnsText}</span>;
  };

  const getTotalPrice = (appointment) => {
    let total = appointment.total_price || appointment.service?.price || 0;
    if (appointment.is_urgent) {
      total += (QUEUE_SETTINGS.URGENT_FEE || 100);
    }
    return total;
  };

  const formatStatus = (status) => {
    if (!status) return '';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  const handleBookingResponse = async (appointmentId, action, reason = '') => {
    try {
      const appointment = pendingRequests.find(req => req.id === appointmentId);
      if (!appointment) return;

      console.log(`🔄 Dashboard ${action} booking request:`, appointmentId);

      if (action === 'accept') {
        const updates = {
          status: 'confirmed',
          updated_at: new Date().toISOString()
        };

        if (appointment.is_urgent) {
          updates.queue_position = 1;

          // Increment all existing queue numbers
          // Fetch appointments that need their queue positions incremented
          const { data: existingAppointments, error: fetchError } = await supabase
            .from('appointments')
            .select('id, queue_position')
            .eq('barber_id', user.id)
            .eq('appointment_date', appointment.appointment_date)
            .eq('status', 'confirmed')
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
          const maxQueueNumber = Math.max(0, ...queueStatus.map(apt => apt.queue_position || 0));
          updates.queue_position = maxQueueNumber + 1;
        }

        const { error } = await supabase
          .from('appointments')
          .update(updates)
          .eq('id', appointmentId);

        if (error) throw error;

        // Create notification using centralized service (handles both database and push)
        try {
          const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');

          // Determine appointment type from the appointment data
          const appointmentType = appointment.appointment_type || 'queue';

          if (appointmentType === 'queue') {
            // For queue appointments, send queue-specific notification
            await centralizedNotificationService.createBookingConfirmationNotification({
              userId: appointment.customer_id,
              appointmentId: appointmentId,
              queuePosition: updates.queue_position,
              estimatedTime: null,
              appointmentType: 'queue'
            });
            console.log('✅ Queue appointment approval notification sent from dashboard');
          } else {
            // For scheduled appointments, send scheduled-specific notification
            await centralizedNotificationService.createBookingConfirmationNotification({
              userId: appointment.customer_id,
              appointmentId: appointmentId,
              queuePosition: null,
              estimatedTime: appointment.appointment_time,
              appointmentType: 'scheduled'
            });
            console.log('✅ Scheduled appointment approval notification sent from dashboard');
          }
        } catch (notificationError) {
          console.warn('Failed to send dashboard approval notification:', notificationError);
        }

        // Log the action
        await supabase.from('system_logs').insert({
          user_id: user.id,
          action: 'booking_request_accepted',
          details: {
            appointment_id: appointmentId,
            customer_id: appointment.customer_id,
            queue_position: updates.queue_position
          }
        });

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

        // Create notification using centralized service (handles both database and push)
        try {
          const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
          await centralizedNotificationService.createNotification({
            userId: appointment.customer_id,
            title: 'Booking Request Declined',
            message: `Your appointment request has been declined. ${reason ? `Reason: ${reason}` : 'Please try booking with another barber or a different time.'}`,
            type: 'appointment',
            data: {
              appointment_id: appointmentId,
              status: 'declined',
              reason
            }
          });
        } catch (notificationError) {
          console.warn('Failed to send booking declined notification:', notificationError);
        }

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

      console.log(`✅ Dashboard booking ${action} completed`);

      // Refresh data
      setTimeout(() => fetchBarberData(), 1000);
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

  const handleAppointmentStatus = async (appointmentId, status) => {
    try {
      const appointment = todaySchedule.find(apt => apt.id === appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      console.log(`🔄 Dashboard starting status change: ${appointment.status} → ${status} for appointment ${appointmentId}`);

      // Optimistic update - update UI immediately
      if (status === 'ongoing') {
        setCurrentAppointment(appointment);
        setQueueStatus(prev => prev.filter(apt => apt.id !== appointmentId));
      } else if (status === 'completed' && currentAppointment?.id === appointmentId) {
        setCurrentAppointment(null);
      }

      const { error } = await supabase
        .from('appointments')
        .update({
          status,
          updated_at: new Date().toISOString(),
          queue_position: status === 'completed' || status === 'cancelled' ? null :
            status === 'ongoing' ? 0 : undefined
        })
        .eq('id', appointmentId);

      if (error) throw error;

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
        case 'completed':
          notificationData.title = 'Appointment Completed ✅';
          notificationData.message = 'Thank you for visiting us! Please rate your experience.';
          break;
        case 'cancelled':
          notificationData.title = 'Appointment Cancelled ❌';
          notificationData.message = 'Your appointment has been cancelled.';
          break;
        default:
          notificationData.title = `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`;
          notificationData.message = `Your appointment status has been updated to ${status}`;
      }

      // Create notification using centralized service (ONLY way to create notifications)
      const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
      await centralizedNotificationService.createAppointmentStatusNotification({
        userId: appointment.customer_id,
        appointmentId: appointmentId,
        status: status,
        changedBy: 'barber'
      });

      // Push notification is now handled by CentralizedNotificationService

      // Notify next customer if completing appointment
      if (status === 'completed' && queueStatus.length > 0) {
        const nextAppointment = queueStatus[0];
        await centralizedNotificationService.createQueuePositionNotification({
          userId: nextAppointment.customer_id,
          appointmentId: nextAppointment.id,
          queuePosition: 1,
          reason: 'Previous appointment completed'
        });

        // Push notification is now handled by CentralizedNotificationService
      }

      // Broadcast change to all components
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

      console.log(`✅ Dashboard status change completed: ${appointment.status} → ${status}`);

      // Refresh data
      setTimeout(() => fetchBarberData(), 1000);
    } catch (error) {
      console.error('Error updating appointment status:', error);
      setError('Failed to update appointment status. Please try again.');

      // Revert optimistic updates on error
      fetchBarberData();
    }
  };

  const updateBarberStatus = async (newStatus) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          barber_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;
      setBarberStatus(newStatus);

    } catch (error) {
      console.error('Error updating barber status:', error);
      setError('Failed to update status. Please try again.');
    }
  };

  const handleServeWalkIn = async (e) => {
    e.preventDefault();
    if (!walkInForm.customerName || !walkInForm.serviceId) {
      alert('Please provide customer name and select a service');
      return;
    }

    try {
      setLoading(true);
      const selectedService = availableServices.find(s => s.id === walkInForm.serviceId);

      // We use the notes field to store the walk-in name for now as there's no manual name field 
      // or we can just prepend it to the notes.
      const walkInNotes = `WALK-IN: ${walkInForm.customerName}${walkInForm.notes ? ' - ' + walkInForm.notes : ''}`;

      const { data, error: insertError } = await supabase
        .from('appointments')
        .insert({
          barber_id: user.id,
          customer_id: null,
          appointment_date: new Date().toISOString().split('T')[0],
          appointment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          status: 'ongoing',
          service_id: walkInForm.serviceId,
          total_price: selectedService?.price || 0,
          total_duration: selectedService?.duration || 30,
          is_walk_in: true,
          notes: walkInNotes,
          appointment_type: 'queue',
          queue_position: 0
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setShowWalkInModal(false);
      setWalkInForm({ customerName: '', serviceId: '', notes: '' });
      fetchBarberData();

      window.dispatchEvent(new CustomEvent('appointmentStatusChanged', {
        detail: { appointmentId: data.id, newStatus: 'ongoing', barberId: user.id, timestamp: Date.now() }
      }));

    } catch (err) {
      console.error('Error adding walk-in:', err);
      setError('Failed to start walk-in service: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'success';
      case 'day_off': return 'info';
      case 'offline': return 'secondary';
      default: return 'primary';
    }
  };

  const formatTimeRemaining = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`;
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-grow text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger shadow-sm" role="alert">
          <div className="d-flex align-items-center">
            <i className="bi bi-exclamation-triangle-fill me-2 fs-4"></i>
            <div>
              <h4 className="alert-heading">Error</h4>
              <p className="mb-1">{error}</p>
            </div>
          </div>
          <button className="btn btn-danger mt-2" onClick={fetchBarberData}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4 dashboard-container">
      {/* Barber Welcome Header */}
      <div className="row mb-1">
        <div className="col">
          <div className="barber-welcome-header rounded shadow-sm d-flex align-items-center" style={{ padding: 'clamp(1rem, 3vw, 1.5rem)' }}>
            <div>
              <div className="d-flex align-items-center mb-2">
                <img
                  src={logoImage}
                  alt="Raf & Rok"
                  className="dashboard-logo me-3"
                  style={{
                    height: 'clamp(30px, 5vw, 40px)',
                    backgroundColor: '#ffffff',
                    padding: '3px',
                    borderRadius: '5px'
                  }}
                />
                <h1 className="mb-0 text-white" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>Welcome, {barberInfo?.full_name || 'Barber'}</h1>
              </div>
              <p className="text-light mb-0" style={{ fontSize: 'clamp(0.875rem, 2vw, 1rem)' }}>
                <i className="bi bi-calendar3 me-2"></i>
                Manage your queue and booking requests
              </p>
            </div>
            <div className="ms-auto text-end">
              <div className="mb-1 text-white" style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1.25rem)', fontWeight: '600' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>

              {/* Barber Status Toggle */}
              <div
                className="dropdown"
                style={{
                  position: 'relative',
                  zIndex: 1050,
                  opacity: notificationsOpen ? 0 : 1,
                  visibility: notificationsOpen ? 'hidden' : 'visible',
                  transition: 'opacity 0.2s ease, visibility 0.2s ease'
                }}
              >
                <button
                  className={`btn btn-${getStatusColor(barberStatus)} dropdown-toggle`}
                  type="button"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.875rem)' }}
                >
                  <i className="bi bi-person-badge me-2"></i>
                  {barberStatus === 'day_off' ? 'Day Off' : barberStatus.charAt(0).toUpperCase() + barberStatus.slice(1)}
                </button>
                <ul className="dropdown-menu" style={{ zIndex: 1051 }}>
                  <li><button className="dropdown-item" onClick={() => updateBarberStatus('available')}>
                    <i className="bi bi-check-circle me-2 text-success"></i>Available
                  </button></li>
                  <li><button className="dropdown-item" onClick={() => updateBarberStatus('day_off')}>
                    <i className="bi bi-calendar-x me-2 text-info"></i>Day Off
                  </button></li>
                  <li><button className="dropdown-item" onClick={() => updateBarberStatus('offline')}>
                    <i className="bi bi-x-circle me-2 text-secondary"></i>Offline
                  </button></li>
                </ul>
              </div>

              <button
                className="btn btn-primary d-flex align-items-center shadow-sm ms-2"
                onClick={() => setShowWalkInModal(true)}
                style={{ borderRadius: '10px', fontWeight: '600', fontSize: 'clamp(0.75rem, 1.8vw, 0.875rem)' }}
              >
                <i className="bi bi-person-plus-fill me-2"></i>
                <span className="d-none d-sm-inline">Serve Walk-in</span>
                <span className="d-sm-none">Walk-in</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions-container mb-2" style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
        <div className="quick-actions-grid">
          <Link
            to="/queue"
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.1s' }}
          >
            <div className="quick-action-icon-wrapper primary-action">
              <i className="bi bi-people"></i>
            </div>
            <span className="quick-action-name">Queue</span>
            <span className="quick-action-description d-none d-md-block">Manage your queue</span>
          </Link>

          <Link
            to="/schedule"
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="quick-action-icon-wrapper info-action">
              <i className="bi bi-calendar-week"></i>
            </div>
            <span className="quick-action-name">Schedule</span>
            <span className="quick-action-description d-none d-md-block">View full schedule</span>
          </Link>

          <Link
            to="/appointment-requests"
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="quick-action-icon-wrapper warning-action">
              <i className="bi bi-clipboard-check"></i>
            </div>
            <span className="quick-action-name">Requests</span>
            <span className="quick-action-description d-none d-md-block">Appointment requests</span>
          </Link>

          <Link
            to="/day-off-manager"
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.4s' }}
          >
            <div className="quick-action-icon-wrapper info-action" style={{ background: 'rgba(108, 117, 125, 0.15)', color: '#6c757d' }}>
              <i className="bi bi-calendar-x"></i>
            </div>
            <span className="quick-action-name">Day Off</span>
            <span className="quick-action-description d-none d-md-block">Manage days off</span>
          </Link>

          <Link
            to={ROUTES.BARBER_REVENUE}
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.5s' }}
          >
            <div className="quick-action-icon-wrapper success-action">
              <i className="bi bi-cash-coin"></i>
            </div>
            <span className="quick-action-name">Revenue</span>
            <span className="quick-action-description d-none d-md-block">View revenue details</span>
          </Link>
        </div>

        {todayStats.queueLength > 0 && (
          <div className="mt-3 p-2 bg-light rounded">
            <small className="text-muted">
              <i className="bi bi-info-circle me-1"></i>
              Estimated time to clear queue: {formatTimeRemaining(todayStats.queueLength * todayStats.averageWaitTime)}
            </small>
          </div>
        )}
      </div>

      {/* Urgent Pending Requests Alert */}
      {pendingRequests.filter(req => req.is_urgent).length > 0 && (
        <div className="alert alert-danger shadow-sm mb-4" role="alert">
          <div className="d-flex align-items-center">
            <div className="me-3">
              <i className="bi bi-lightning-fill fs-4"></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="alert-heading mb-1">🚨 URGENT Booking Requests!</h5>
              <p className="mb-0">
                You have {pendingRequests.filter(req => req.is_urgent).length} urgent booking request{pendingRequests.filter(req => req.is_urgent).length > 1 ? 's' : ''} that need immediate attention.
              </p>
            </div>
            <button className="btn btn-danger" onClick={() => document.getElementById('pending-requests').scrollIntoView({ behavior: 'smooth' })}>
              <i className="bi bi-eye me-1"></i>
              Review Now
            </button>
          </div>
        </div>
      )}

      {/* Regular Pending Requests Alert */}
      {pendingRequests.length > 0 && pendingRequests.filter(req => !req.is_urgent).length > 0 && (
        <div className="alert alert-warning shadow-sm mb-4" role="alert">
          <div className="d-flex align-items-center">
            <div className="me-3">
              <i className="bi bi-bell-fill fs-4"></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="alert-heading mb-1">New Booking Requests!</h5>
              <p className="mb-0">
                You have {pendingRequests.filter(req => !req.is_urgent).length} booking request{pendingRequests.filter(req => !req.is_urgent).length > 1 ? 's' : ''} waiting for your confirmation.
              </p>
            </div>
            <button className="btn btn-warning" onClick={() => document.getElementById('pending-requests').scrollIntoView({ behavior: 'smooth' })}>
              <i className="bi bi-eye me-1"></i>
              Review Requests
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="row mb-4 g-2 g-md-3">
        <div className="col-6 col-sm-6 col-md-4 col-lg-3 mb-2 mb-md-3">
          <div className={`card stats-card bg-gradient-primary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`} style={{ cursor: 'pointer' }}>
            <div className="card-body text-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Total Today</h6>
              <h2 className="mb-0" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>{todayStats.totalAppointments}</h2>
            </div>
          </div>
        </div>

        <div className="col-6 col-sm-6 col-md-4 col-lg-3 mb-2 mb-md-3">
          <div className={`card stats-card bg-gradient-success text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`} style={{ cursor: 'pointer' }}>
            <div className="card-body text-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Completed</h6>
              <h2 className="mb-0" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>{todayStats.completedAppointments}</h2>
            </div>
          </div>
        </div>

        <div className="col-6 col-sm-6 col-md-4 col-lg-3 mb-2 mb-md-3">
          <Link
            to={ROUTES.BARBER_REVENUE}
            style={{ textDecoration: 'none' }}
            title="View revenue details"
          >
            <div className={`card stats-card bg-gradient-info text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`} style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = ''; }}>
              <div className="card-body text-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
                <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Revenue</h6>
                <h2 className="mb-0" style={{ fontSize: 'clamp(1rem, 3vw, 1.5rem)', fontWeight: 'bold', lineHeight: '1.2' }}>
                  <span className="currency-amount-large">
                    ₱{(todayStats.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </h2>
              </div>
            </div>
          </Link>
        </div>

        <div className="col-6 col-sm-6 col-md-4 col-lg-3 mb-2 mb-md-3">
          <div className={`card stats-card ${pendingRequests.length > 0 ? 'bg-gradient-warning' : 'bg-gradient-secondary'} text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`} style={{ cursor: 'pointer' }}>
            <div className="card-body text-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Pending</h6>
              <h2 className="mb-0" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>{todayStats.pendingRequests}</h2>
            </div>
          </div>
        </div>

        <div className="col-6 col-sm-6 col-md-4 col-lg-3 mb-2 mb-md-3">
          <div className={`card stats-card bg-gradient-dark text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`} style={{ cursor: 'pointer' }}>
            <div className="card-body text-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Queue</h6>
              <h2 className="mb-0" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>{todayStats.queueLength}</h2>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-4 col-lg-3 mb-2 mb-md-3">
          <div className={`card stats-card bg-gradient-secondary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`} style={{ cursor: 'pointer' }}>
            <div className="card-body text-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Avg Wait</h6>
              <h2 className="mb-0" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>{todayStats.averageWaitTime}m</h2>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-8 col-lg-6 mb-2 mb-md-3">
          <div className={`card stats-card bg-gradient-warning text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`} style={{ cursor: 'pointer' }}>
            <div className="card-body text-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Rating</h6>
              <h2 className="mb-0" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>
                {barberInfo?.average_rating || '0'}
                <small className="fs-6" style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1rem)' }}>/5</small>
              </h2>
              <small className="opacity-75 d-block mt-1" style={{ fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)' }}>
                {barberInfo?.total_ratings || 0} reviews
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Booking Requests */}
      {pendingRequests.length > 0 && (
        <div id="pending-requests" className="card mb-4 border-warning">
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
          <div className="card-body">
            <div className="row">
              {pendingRequests.map((request) => (
                <div key={request.id} className="col-md-6 mb-3">
                  <div className={`card h-100 ${request.is_urgent ? 'border-danger border-2' : 'border-secondary'}`}>
                    <div className="card-body">
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
                          <i className="bi bi-clock ms-2 me-1"></i>
                          {new Date(request.created_at).toLocaleTimeString()}
                        </small>
                      </div>

                      <div className="mb-2">
                        <strong>Services:</strong>
                        <div className="text-muted small">{getServicesDisplay(request)}</div>
                      </div>

                      <div className="mb-2">
                        <small className="text-muted">Add-ons:</small>
                        <div className="text-muted small">
                          <AddOnsDisplay appointment={request} />
                        </div>
                      </div>

                      <div className="mb-2">
                        <strong>Total:</strong>
                        <span className="text-success ms-1 fw-bold currency-amount">₱{Number(getTotalPrice(request)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <small className="text-muted ms-2">
                          ({request.total_duration || (request.service?.duration || 30)} min)
                        </small>
                      </div>

                      {request.notes && (
                        <div className="mb-3">
                          <strong>Notes:</strong>
                          <div className="text-muted small bg-light p-2 rounded">{request.notes}</div>
                        </div>
                      )}

                      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
                        <button
                          className={`btn ${request.is_urgent ? 'btn-danger' : 'btn-success'} btn-sm flex-fill`}
                          onClick={() => handleBookingResponse(request.id, 'accept')}
                          style={{
                            minHeight: 'clamp(36px, 8vw, 40px)',
                            fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                            padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                            fontWeight: '500',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <i className="bi bi-check-circle me-1"></i>
                          <span className="d-none d-sm-inline">{request.is_urgent ? 'Accept URGENT' : 'Accept'}</span>
                          <span className="d-sm-none">Accept</span>
                        </button>
                        <button
                          className="btn btn-outline-danger btn-sm flex-fill flex-sm-none"
                          onClick={() => {
                            const reason = prompt('Reason for declining (optional):');
                            if (reason !== null) { // Allow empty string but not null (cancelled)
                              handleBookingResponse(request.id, 'decline', reason);
                            }
                          }}
                          style={{
                            minHeight: 'clamp(36px, 8vw, 40px)',
                            fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                            padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                            fontWeight: '500',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <i className="bi bi-x-circle me-1"></i>
                          Decline
                        </button>
                      </div>

                      {/* Note: Reschedule option will be available after accepting the appointment */}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Current Customer / Next Up Section */}
      <div className="mb-4">
        {!currentAppointment && queueStatus.length > 0 ? (
          <div className="card serve-next-card shadow-sm">
            <div className="card-header bg-success text-white border-0">
              <h5 className="mb-0 fw-bold">
                <i className="bi bi-play-circle me-2"></i>
                Ready to Serve Next
              </h5>
            </div>
            <div className="card-body">
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
                <div className="d-flex align-items-center flex-grow-1">
                  <div className="rounded-circle bg-success bg-opacity-10 p-3 d-flex align-items-center justify-content-center me-3" style={{ width: '60px', height: '60px' }}>
                    <i className="bi bi-person fs-2 text-success"></i>
                  </div>
                  <div>
                    <h5 className="mb-1">{queueStatus[0].customer?.full_name}</h5>
                    <p className="mb-0 text-muted small">
                      <i className="bi bi-scissors me-1"></i>
                      {getServicesDisplay(queueStatus[0])}
                      <span className="ms-2">
                        <i className="bi bi-clock me-1"></i>
                        {queueStatus[0].total_duration || queueStatus[0].service?.duration || 30} min
                      </span>
                    </p>
                  </div>
                </div>
                <div className="d-grid gap-2 d-md-block">
                  <button
                    className="btn btn-success btn-lg px-4"
                    onClick={() => handleAppointmentStatus(queueStatus[0].id, 'ongoing')}
                    style={{ fontWeight: '600' }}
                  >
                    <i className="bi bi-scissors me-2"></i>
                    Start Service Now
                  </button>
                  {queueStatus[0].customer?.phone && (
                    <a href={`tel:${queueStatus[0].customer.phone}`} className="btn btn-outline-secondary ms-md-2 mt-2 mt-md-0">
                      <i className="bi bi-telephone"></i>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : currentAppointment ? (
          <div className="card currently-serving-card shadow-sm">
            <div className="card-header bg-primary text-white border-0">
              <h5 className="mb-0 fw-bold">
                <i className="bi bi-scissors me-2"></i>
                Currently Serving
              </h5>
            </div>
            <div className="card-body">
              <div className="row align-items-center">
                <div className="col-md-4">
                  <div className="text-center">
                    <div className="rounded-circle bg-primary bg-opacity-10 p-4 d-inline-block mb-3">
                      <i className="bi bi-person-circle fs-1 text-primary"></i>
                    </div>
                    <h4>{currentAppointment.customer?.full_name}</h4>
                    <p className="text-muted">{currentAppointment.customer?.phone}</p>
                    {currentAppointment.customer?.phone && (
                      <a href={`tel:${currentAppointment.customer.phone}`} className="btn btn-outline-primary btn-sm">
                        <i className="bi bi-telephone me-1"></i>Call
                      </a>
                    )}
                  </div>
                </div>

                <div className="col-md-5">
                  <h5>Service Details</h5>
                  <p className="mb-1"><strong>Services:</strong> {getServicesDisplay(currentAppointment)}</p>
                  <p className="mb-1"><strong>Add-ons:</strong> <AddOnsDisplay appointment={currentAppointment} /></p>
                  <p className="mb-1"><strong>Total:</strong> <span className="text-success fw-bold">₱{Number(getTotalPrice(currentAppointment)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>
                  <p className="mb-1"><strong>Duration:</strong> {(currentAppointment.total_duration || currentAppointment.service?.duration)} min</p>
                  {currentAppointment.notes && (
                    <div className="mt-2 text-start">
                      <strong>Notes:</strong>
                      <div className="bg-light p-2 rounded small text-muted mt-1">{currentAppointment.notes}</div>
                    </div>
                  )}
                  <FriendBookingDisplay appointment={currentAppointment} variant="compact" />
                </div>

                <div className="col-md-3 text-center">
                  <div className="d-grid gap-2">
                    <button
                      className="btn btn-warning w-100"
                      onClick={() => setRescheduleModal({ isOpen: true, appointment: currentAppointment })}
                      title="Reschedule Appointment"
                      style={{
                        minHeight: 'clamp(40px, 9vw, 48px)',
                        fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                        padding: 'clamp(0.625rem, 2vw, 0.75rem) clamp(1rem, 3vw, 1.5rem)',
                        fontWeight: '500',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <i className="bi bi-arrow-repeat me-2"></i>
                      Reschedule
                    </button>
                    <button
                      className="btn btn-success w-100"
                      onClick={() => handleAppointmentStatus(currentAppointment.id, 'completed')}
                      style={{
                        minHeight: 'clamp(40px, 9vw, 48px)',
                        fontSize: 'clamp(0.875rem, 2.5vw, 1rem)',
                        padding: 'clamp(0.625rem, 2vw, 0.75rem) clamp(1rem, 3vw, 1.5rem)',
                        fontWeight: '500',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <i className="bi bi-check-circle me-2"></i>
                      Complete Service
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="row">
        {/* All Today's Appointments - Reschedule Section */}
        <div className="col-md-12 mb-4">
          <div className="card shadow-sm" style={{ border: 'none', borderRadius: '12px' }}>
            <div className="card-header" style={{
              background: '#f3f4f6',
              border: 'none',
              borderRadius: '12px 12px 0 0',
              padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)'
            }}>
              <div className="d-flex justify-content-between align-items-center gap-2 mb-2 mb-md-0">
                <h5 className="mb-0 flex-grow-1" style={{ fontWeight: '600', fontSize: 'clamp(0.9rem, 2.5vw, 1.25rem)', color: '#1f2937' }}>
                  <i className="bi bi-calendar-check me-2" style={{ color: '#6366f1' }}></i>
                  Reschedule Appointments
                  {todaySchedule.length > 0 && (
                    <span className="badge ms-2" style={{
                      background: '#818cf8',
                      color: '#ffffff',
                      fontSize: 'clamp(0.65rem, 1.5vw, 0.75rem)',
                      fontWeight: '600',
                      padding: 'clamp(0.25rem, 1vw, 0.35rem) clamp(0.4rem, 1.5vw, 0.65rem)'
                    }}>
                      {todaySchedule.filter(apt => {
                        const status = apt.status?.toLowerCase();
                        return status !== 'completed' && status !== 'cancelled' && status !== 'cancel' && status !== 'done';
                      }).length} Available
                    </span>
                  )}
                </h5>
                <button
                  className="btn btn-sm flex-shrink-0"
                  onClick={fetchBarberData}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: 'clamp(0.5rem, 1.5vw, 0.625rem)',
                    minHeight: 'clamp(36px, 8vw, 40px)',
                    minWidth: 'clamp(36px, 8vw, 40px)',
                    transition: 'all 0.2s ease'
                  }}
                  title="Refresh"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f8f9fa';
                    e.currentTarget.style.borderColor = '#6366f1';
                    e.currentTarget.style.transform = 'rotate(180deg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.transform = 'rotate(0deg)';
                  }}
                >
                  <i className="bi bi-arrow-clockwise" style={{ fontSize: 'clamp(0.8rem, 2vw, 0.875rem)' }}></i>
                </button>
              </div>
            </div>
            <div className="card-body" style={{ padding: '0' }}>
              {todaySchedule.length === 0 ? (
                <div className="text-center py-5" style={{ padding: '2rem' }}>
                  <div className="mb-3" style={{ fontSize: '3rem', color: '#d1d5db' }}>
                    <i className="bi bi-calendar-x"></i>
                  </div>
                  <p className="text-muted mb-0">No appointments found for today</p>
                </div>
              ) : todaySchedule.filter(apt => {
                const status = apt.status?.toLowerCase();
                return status !== 'completed' && status !== 'cancelled' && status !== 'cancel' && status !== 'done';
              }).length === 0 ? (
                <div className="text-center py-5" style={{ padding: '2rem' }}>
                  <div className="mb-3" style={{ fontSize: '3rem', color: '#d1d5db' }}>
                    <i className="bi bi-check-circle"></i>
                  </div>
                  <p className="text-muted mb-0">No reschedulable appointments today</p>
                </div>
              ) : (
                <div style={{ padding: '0' }}>
                  {todaySchedule
                    .filter(apt => {
                      const status = apt.status?.toLowerCase();
                      return status !== 'completed' && status !== 'cancelled' && status !== 'cancel' && status !== 'done';
                    })
                    .map((appointment, index) => (
                      <div
                        key={appointment.id}
                        style={{
                          padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)',
                          borderBottom: index < todaySchedule.filter(apt => {
                            const status = apt.status?.toLowerCase();
                            return status !== 'completed' && status !== 'cancelled' && status !== 'cancel' && status !== 'done';
                          }).length - 1 ? '1px solid #e5e7eb' : 'none',
                          background: '#ffffff'
                        }}
                      >
                        <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-3">
                          {/* Left Side - Customer Info */}
                          <div className="flex-grow-1 w-100" style={{ minWidth: 0 }}>
                            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                              <h6 className="mb-0" style={{
                                fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                                fontWeight: '500',
                                color: '#1f2937'
                              }}>
                                {appointment.customer?.full_name || 'Unknown'}
                              </h6>
                              {appointment.is_urgent && (
                                <span className="badge" style={{
                                  background: '#ef4444',
                                  fontSize: 'clamp(0.6rem, 1.5vw, 0.7rem)',
                                  padding: 'clamp(0.2rem, 0.8vw, 0.25rem) clamp(0.4rem, 1.2vw, 0.5rem)'
                                }}>
                                  URGENT
                                </span>
                              )}
                              <span className={`badge`} style={{
                                background: appointment.status === 'ongoing' ? '#3b82f6' :
                                  appointment.status === 'pending' ? '#6366f1' :
                                    '#10b981',
                                fontSize: 'clamp(0.6rem, 1.5vw, 0.7rem)',
                                padding: 'clamp(0.2rem, 0.8vw, 0.25rem) clamp(0.4rem, 1.2vw, 0.5rem)',
                                color: '#ffffff'
                              }}>
                                {formatStatus(appointment.status)}
                              </span>
                            </div>
                            <div className="d-flex flex-wrap align-items-center gap-2 mb-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', color: '#6b7280' }}>
                              <span>
                                <i className="bi bi-scissors me-1"></i>
                                {getServicesDisplay(appointment) || 'Service'}
                              </span>
                              {appointment.queue_position && (
                                <span>
                                  <i className="bi bi-list-ol me-1"></i>
                                  Queue #{appointment.queue_position}
                                </span>
                              )}
                              {appointment.appointment_time && (
                                <span>
                                  <i className="bi bi-clock me-1"></i>
                                  {new Date(`2000-01-01T${appointment.appointment_time}`).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 mb-2" style={{ fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)' }}>
                              <AddOnsDisplay appointment={appointment} />
                            </div>
                          </div>

                          {/* Right Side - Price & Action */}
                          <div className="d-flex flex-row align-items-center justify-content-end gap-2" style={{ minWidth: 'fit-content' }}>
                            <div className="text-end d-none d-md-block">
                              <div className="fw-bold" style={{
                                fontSize: 'clamp(0.9rem, 2.5vw, 1rem)',
                                color: '#10b981'
                              }}>
                                ₱{getTotalPrice(appointment)}
                              </div>
                              <small style={{ color: '#6b7280', fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)' }}>
                                {appointment.total_duration || appointment.service?.duration || 30} min
                              </small>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              <div className="text-end d-md-none">
                                <div className="fw-bold" style={{
                                  fontSize: 'clamp(0.85rem, 2vw, 0.95rem)',
                                  color: '#10b981'
                                }}>
                                  ₱{getTotalPrice(appointment)}
                                </div>
                                <small style={{ color: '#6b7280', fontSize: 'clamp(0.65rem, 1.5vw, 0.75rem)' }}>
                                  {appointment.total_duration || appointment.service?.duration || 30} min
                                </small>
                              </div>
                              {appointment.status?.toLowerCase() !== 'ongoing' ? (
                                <div className="d-flex gap-2">
                                  <button
                                    className="btn btn-sm btn-success"
                                    onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                                    title="Start Service"
                                    style={{
                                      borderRadius: '8px',
                                      padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                                      fontWeight: '500',
                                      fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                                      minHeight: 'clamp(36px, 8vw, 40px)',
                                      transition: 'all 0.2s ease'
                                    }}
                                  >
                                    <i className="bi bi-play-fill"></i>
                                    <span className="ms-1">Start</span>
                                  </button>
                                  <button
                                    className="btn btn-sm"
                                    onClick={() => {
                                      console.log('Reschedule button clicked for appointment:', appointment);
                                      setRescheduleModal({ isOpen: true, appointment: appointment });
                                    }}
                                    title="Reschedule Appointment"
                                    style={{
                                      background: '#6366f1',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '8px',
                                      padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                                      fontWeight: '500',
                                      fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                                      whiteSpace: 'nowrap',
                                      minHeight: 'clamp(36px, 8vw, 40px)',
                                      transition: 'all 0.2s ease'
                                    }}
                                  >
                                    <i className="bi bi-arrow-repeat me-1 d-none d-sm-inline"></i>
                                    <span>Reschedule</span>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="btn btn-sm"
                                  disabled
                                  title="Cannot reschedule ongoing appointment"
                                  style={{
                                    background: '#e5e7eb',
                                    color: '#6b7280',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                                    fontWeight: '500',
                                    fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                                    whiteSpace: 'nowrap',
                                    minHeight: 'clamp(36px, 8vw, 40px)'
                                  }}
                                >
                                  <i className="bi bi-info-circle me-1 d-none d-sm-inline"></i>
                                  <span>Serving</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Queue Status (Legacy View) */}
        <div className="col-md-12 mb-4">
          <div className="card shadow-sm">
            <div className="card-header" style={{ padding: 'clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem)' }}>
              <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                <h5 className="mb-0 flex-grow-1" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.25rem)' }}>
                  <i className="bi bi-list-ol me-2"></i>
                  Today's Queue ({queueStatus.length})
                </h5>
                <div className="d-flex gap-2 align-items-center">
                  <Link
                    to="/queue"
                    className="btn btn-primary btn-sm"
                    style={{
                      minHeight: 'clamp(36px, 8vw, 40px)',
                      fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                      padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                      fontWeight: '500',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <i className="bi bi-list-ol me-1 d-none d-sm-inline"></i>
                    <span className="d-sm-none">Queue</span>
                    <span className="d-none d-sm-inline">Manage Queue</span>
                  </Link>
                  <button
                    className="btn btn-outline-primary btn-sm flex-shrink-0"
                    onClick={fetchBarberData}
                    style={{
                      minHeight: 'clamp(36px, 8vw, 40px)',
                      minWidth: 'clamp(36px, 8vw, 40px)',
                      padding: 'clamp(0.5rem, 1.5vw, 0.625rem)',
                      transition: 'all 0.2s ease'
                    }}
                    title="Refresh"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'rotate(180deg)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'rotate(0deg)';
                    }}
                  >
                    <i className="bi bi-arrow-clockwise" style={{ fontSize: 'clamp(0.8rem, 2vw, 0.875rem)' }}></i>
                  </button>
                </div>
              </div>
            </div>
            <div className="card-body">
              {queueStatus.length === 0 ? (
                <div className="text-center py-5">
                  <div className="display-4 text-muted mb-3">
                    <i className="bi bi-list-ul"></i>
                  </div>
                  <h5>Queue is Empty</h5>
                  <p className="text-muted">No confirmed appointments today. Check pending requests above.</p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {queueStatus.slice(0, 5).map((appointment, index) => (
                    <div key={appointment.id} className={`list-group-item px-3 py-3 border-bottom ${index === 0 ? 'bg-light-subtle' : ''}`} style={{ transition: 'background-color 0.2s ease' }}>
                      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                        <div className="d-flex align-items-center w-100 w-md-auto" style={{ minWidth: 0 }}>
                          <div className={`rounded-circle ${appointment.is_urgent ? 'bg-danger' : 'bg-primary'} text-white d-flex align-items-center justify-content-center me-3 flex-shrink-0`} style={{ width: 'clamp(35px, 8vw, 40px)', height: 'clamp(35px, 8vw, 40px)', fontSize: 'clamp(0.8rem, 2vw, 1rem)' }}>
                            {appointment.is_urgent ? <i className="bi bi-lightning-fill"></i> : (appointment.queue_position || index + 1)}
                          </div>
                          <div className="flex-grow-1" style={{ minWidth: 0 }}>
                            <h6 className="mb-1" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1rem)' }}>{appointment.customer?.full_name}</h6>
                            <p className="mb-1 text-muted" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>{getServicesDisplay(appointment)}</p>
                            <small className="text-info addon-display" style={{ fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)' }}>
                              Add-ons: <AddOnsDisplay appointment={appointment} />
                            </small>
                          </div>
                        </div>
                        <div className="d-flex flex-row flex-md-column align-items-center align-items-md-end justify-content-between justify-content-md-end gap-2" style={{ minWidth: 'fit-content', width: '100%' }}>
                          <div className="text-end">
                            <div className="text-success fw-bold" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1rem)' }}>₱{getTotalPrice(appointment)}</div>
                            <small className="text-muted" style={{ fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)' }}>
                              {appointment.total_duration || appointment.service?.duration} min
                            </small>
                            {appointment.is_urgent && (
                              <div className="mt-1">
                                <span className="badge bg-danger" style={{ fontSize: 'clamp(0.65rem, 1.5vw, 0.75rem)' }}>URGENT</span>
                              </div>
                            )}
                            <FriendBookingDisplay appointment={appointment} variant="inline" />
                          </div>
                          <div className="d-flex gap-2 w-100 w-md-auto">
                            <button
                              className="btn btn-sm btn-success flex-fill"
                              onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                              title="Start Service"
                              style={{
                                minHeight: 'clamp(36px, 8vw, 40px)',
                                fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                                fontWeight: '500',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <i className="bi bi-play-fill me-1"></i>
                              Serve
                            </button>
                            <button
                              className="btn btn-sm btn-warning flex-fill"
                              onClick={() => setRescheduleModal({ isOpen: true, appointment: appointment })}
                              title="Reschedule Appointment"
                              style={{
                                minHeight: 'clamp(36px, 8vw, 40px)',
                                fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                                whiteSpace: 'nowrap',
                                fontWeight: '500',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <i className="bi bi-arrow-repeat-none"></i>
                              Resched
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {queueStatus.length > 5 && (
                    <div className="list-group-item text-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
                      <Link
                        to="/queue"
                        className="btn btn-outline-primary w-100 w-md-auto"
                        style={{
                          minHeight: 'clamp(36px, 8vw, 40px)',
                          fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
                          padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                          fontWeight: '500',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <i className="bi bi-arrow-right me-1 d-none d-sm-inline"></i>
                        <span className="d-sm-none">View All ({queueStatus.length})</span>
                        <span className="d-none d-sm-inline">View All {queueStatus.length} Customers</span>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Reviews Section */}
      {recentReviews.length > 0 && (
        <div className="row mt-4">
          <div className="col-12">
            <div className="card shadow-sm">
              <div className="card-header bg-warning text-dark">
                <h6 className="mb-0">
                  <i className="bi bi-star-fill me-2"></i>
                  Recent Customer Reviews
                </h6>
              </div>
              <div className="card-body">
                <div className="row">
                  {recentReviews.map((review) => (
                    <div key={review.id} className="col-md-6 col-lg-4 mb-3">
                      <div className="card h-100 review-card-premium" style={{ borderRadius: '15px' }}>
                        <div className="card-body p-3">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div className="d-flex align-items-center">
                              <div className="avatar-circle-sm bg-primary-subtle text-primary me-2 d-flex align-items-center justify-content-center fw-bold" style={{ width: '30px', height: '30px', borderRadius: '50%', fontSize: '0.8rem' }}>
                                {(review.customer?.full_name || 'A').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h6 className="card-title mb-0" style={{ fontSize: '0.9rem', fontWeight: '600' }}>{review.customer?.full_name || 'Anonymous'}</h6>
                                <div className="d-flex align-items-center mt-1">
                                  {[...Array(5)].map((_, i) => (
                                    <i
                                      key={i}
                                      className={`bi bi-star-fill ${i < (review.customer_rating || 0) ? 'text-warning' : 'text-muted'}`}
                                      style={{ fontSize: '0.75rem' }}
                                    ></i>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                              {new Date(review.rating_created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </small>
                          </div>
                          {review.review_text ? (
                            <p className="card-text mt-2 text-dark" style={{ fontSize: '0.85rem', fontStyle: 'italic', lineHeight: '1.4' }}>
                              "{review.review_text}"
                            </p>
                          ) : (
                            <p className="card-text mt-2 text-muted small">No written review provided.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {recentReviews.length >= 5 && (
                  <div className="text-center mt-3">
                    <small className="text-muted">
                      Showing latest 5 reviews • Total: {barberInfo?.total_ratings || 0} reviews
                    </small>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      <RescheduleModal
        isOpen={rescheduleModal.isOpen}
        onClose={() => setRescheduleModal({ isOpen: false, appointment: null })}
        appointment={rescheduleModal.appointment}
        onRescheduleSuccess={fetchBarberData}
      />

      {/* Walk-in Modal */}
      {showWalkInModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '20px' }}>
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold">Serve Walk-in Customer</h5>
                <button type="button" className="btn-close" onClick={() => setShowWalkInModal(false)}></button>
              </div>
              <form onSubmit={handleServeWalkIn}>
                <div className="modal-body py-4">
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Customer Name</label>
                    <input
                      type="text"
                      className="form-control form-control-lg"
                      placeholder="Enter customer name"
                      value={walkInForm.customerName}
                      onChange={(e) => setWalkInForm({ ...walkInForm, customerName: e.target.value })}
                      required
                      style={{ borderRadius: '12px' }}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">Select Service</label>
                    <select
                      className="form-select form-select-lg"
                      value={walkInForm.serviceId}
                      onChange={(e) => setWalkInForm({ ...walkInForm, serviceId: e.target.value })}
                      required
                      style={{ borderRadius: '12px' }}
                    >
                      <option value="">Choose a service...</option>
                      {availableServices.map(service => (
                        <option key={service.id} value={service.id}>
                          {service.name} - ₱{service.price} ({service.duration}m)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-0">
                    <label className="form-label fw-semibold">Notes (Optional)</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      placeholder="e.g., Special styling, fade style..."
                      value={walkInForm.notes}
                      onChange={(e) => setWalkInForm({ ...walkInForm, notes: e.target.value })}
                      style={{ borderRadius: '12px' }}
                    ></textarea>
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button type="button" className="btn btn-light px-4" onClick={() => setShowWalkInModal(false)} style={{ borderRadius: '10px' }}>Cancel</button>
                  <button type="submit" className="btn btn-success px-4" style={{ borderRadius: '10px', fontWeight: '600' }}>
                    <i className="bi bi-play-fill me-1"></i> Start Service
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BarberDashboard;
