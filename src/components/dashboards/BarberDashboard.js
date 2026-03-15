// components/dashboards/BarberDashboard.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import logoImage from '../../assets/images/raf-rok-logo.png';
import { ROUTES, QUEUE_SETTINGS } from '../utils/constants';
import RescheduleModal from '../barber/RescheduleModal';
import addOnsService from '../../services/booking/AddOnsService';
import FriendBookingDisplay from '../common/FriendBookingDisplay';
import NotificationPermission from '../common/NotificationPermission';
import './BarberDashboard.css';

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
    ongoingCount: 0
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
  const [customerDetailsModal, setCustomerDetailsModal] = useState({ isOpen: false, request: null });
  const [declineModal, setDeclineModal] = useState({ isOpen: false, requestId: null, reason: '' });

  const navigate = useNavigate();

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
        .order('price', { ascending: true });

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
      const todayObj = new Date();
      const today = todayObj.getFullYear() + '-' + String(todayObj.getMonth() + 1).padStart(2, '0') + '-' + String(todayObj.getDate()).padStart(2, '0');

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
        .or(`appointment_date.eq.${today},status.eq.pending`)
        .order('created_at', { ascending: false })
        .limit(200); // Increased limit to accommodate more pending requests

      if (scheduleError) {
        console.error('Schedule fetch error:', scheduleError);
        throw scheduleError;
      }

      console.log('Fetched schedule:', schedule);

      const safeSchedule = Array.isArray(schedule) ? schedule : [];

      // Separate appointments by status with better filtering
      const current = safeSchedule.find(apt => apt.status === 'ongoing' && apt.appointment_date === today) || null;

      // Include all reschedulable appointments (scheduled, confirmed, and any other non-completed/non-cancelled statuses)
      const reschedulableStatuses = ['scheduled', 'confirmed', 'done'];
      const queue = safeSchedule
        .filter(apt => {
          const status = apt.status?.toLowerCase();
          const isToday = apt.appointment_date === today;
          if (!isToday) return false;

          return reschedulableStatuses.includes(status) ||
            (status !== 'pending' && status !== 'completed' && status !== 'cancelled' && status !== 'ongoing' && status !== 'cancel');
        })
        .sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));

      const pending = safeSchedule
        .filter(apt => apt.status === 'pending')
        .sort((a, b) => {
          if (a.is_urgent && !b.is_urgent) return -1;
          if (!a.is_urgent && b.is_urgent) return 1;
          return new Date(b.created_at) - new Date(a.created_at);
        });

      const completed = safeSchedule.filter(apt => apt.status === 'completed' && apt.appointment_date === today);

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
          // First source of truth: total_price from database (already includes services + add-ons + urgent fee)
          if (apt.total_price !== null && apt.total_price !== undefined && Number(apt.total_price) > 0) {
            return sum + Number(apt.total_price);
          }

          // Fallback for older appointments without total_price: service price + urgent fee
          const basePrice = Number(apt.service?.price) || 0;
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
      const sortedSchedule = safeSchedule.sort((a, b) => {
        // Status priority: ongoing > confirmed > scheduled > pending > completed > cancelled
        const statusOrder = { ongoing: 1, confirmed: 2, scheduled: 3, pending: 4, completed: 5, cancelled: 6 };
        const statusA = statusOrder[a.status?.toLowerCase()] || 99;
        const statusB = statusOrder[b.status?.toLowerCase()] || 99;

        if (statusA !== statusB) return statusA - statusB;

        // Secondary: Urgent
        if (a.is_urgent && !b.is_urgent) return -1;
        if (!a.is_urgent && b.is_urgent) return 1;

        // Tertiary: Queue position (Queue 1 always first)
        if (a.queue_position !== null && b.queue_position !== null) {
          return a.queue_position - b.queue_position;
        }
        if (a.queue_position !== null) return -1;
        if (b.queue_position !== null) return 1;

        // Quaternary: Time
        if (a.appointment_time && b.appointment_time) {
          return a.appointment_time.localeCompare(b.appointment_time);
        }

        // Final: Creation time
        return new Date(b.created_at) - new Date(a.created_at);
      });

      setTodaySchedule(sortedSchedule);
      setCurrentAppointment(current);
      setQueueStatus(queue.sort((a, b) => (a.queue_position || 999) - (b.queue_position || 999)));
      setPendingRequests(pending.sort((a, b) => {
        if (a.is_urgent && !b.is_urgent) return -1;
        if (!a.is_urgent && b.is_urgent) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      }));

      setTodayStats({
        totalAppointments: safeSchedule.filter(apt => apt.appointment_date === today).length,
        completedAppointments: completed.length,
        revenue: Number(revenueToday) || 0,
        pendingRequests: pending.length,
        queueLength: queue.length,
        ongoingCount: current ? 1 : 0
      });

      // 4. Auto-cancel No-shows (Appointments more than 15 mins late)
      const hasCancelledAny = await checkAndAutoCancelNoShows(safeSchedule, today);
      if (hasCancelledAny) {
        console.log('🔄 Data changed by auto-cancel, re-fetching to update UI state...');
        // We set isFetchingData back to false so the next call can proceed
        setIsFetchingData(false);
        return fetchBarberData();
      }

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
      return <small className="text-muted opacity-50"><i className="bi bi-hourglass-split me-1"></i></small>;
    }

    if (!addOnsText) {
      return null;
    }

    return <span className="text-info addon-display">{addOnsText}</span>;
  };

  const getTotalPrice = (appointment) => {
    // If total_price exists and is > 0, use it as is (it includes service + add-ons + urgent fee)
    if (appointment.total_price !== null && appointment.total_price !== undefined && Number(appointment.total_price) > 0) {
      return Number(appointment.total_price);
    }

    // Fallback for older appointments: service price + urgent fee
    let total = Number(appointment.service?.price) || 0;
    if (appointment.is_urgent) {
      total += (QUEUE_SETTINGS.URGENT_FEE || 100);
    }
    return total;
  };

  const formatStatus = (status) => {
    if (!status) return '';
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    try {
      const [hours, minutes] = timeString.split(':');
      let h = parseInt(hours);
      const m = minutes || '00';
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m} ${ampm}`;
    } catch (e) {
      return timeString;
    }
  };

  const parseTimeToMinutes = (timeString) => {
    if (!timeString) return 0;
    try {
      const parts = timeString.split(':');
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      return hours * 60 + minutes;
    } catch (e) {
      console.error('Error parsing time to minutes:', e);
      return 0;
    }
  };

  const checkAndAutoCancelNoShows = async (schedule, todayDateStr) => {
    try {
      if (!schedule || schedule.length === 0) return;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const NO_SHOW_THRESHOLD = 15; // 15 minutes grace period

      const appointmentsToCancel = schedule.filter(apt => {
        // Only cancel confirmed/scheduled appointments for TODAY
        const isTargetStatus = ['confirmed', 'scheduled', 'pending'].includes(apt.status?.toLowerCase());
        const isToday = apt.appointment_date === todayDateStr;

        if (!isTargetStatus || !isToday || !apt.appointment_time) return false;

        const appointmentMinutes = parseTimeToMinutes(apt.appointment_time);
        const diff = currentMinutes - appointmentMinutes;

        // Condition: Current time is > 15 mins past the scheduled appointment time
        return diff > NO_SHOW_THRESHOLD;
      });

      if (appointmentsToCancel.length > 0) {
        console.log(`🕒 Auto-cancelling ${appointmentsToCancel.length} late appointments:`, appointmentsToCancel.map(a => a.id));

        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');

        for (const apt of appointmentsToCancel) {
          // 1. Update status in database
          const { error } = await supabase
            .from('appointments')
            .update({
              status: 'cancelled',
              cancellation_reason: 'Auto-cancelled: Customer was late by more than 15 minutes.',
              updated_at: new Date().toISOString()
            })
            .eq('id', apt.id);

          if (error) {
            console.error(`Error auto-cancelling appointment ${apt.id}:`, error);
            continue;
          }

          // 2. Notify the customer
          try {
            await centralizedNotificationService.createNotification({
              userId: apt.customer_id,
              title: 'Appointment Auto-Cancelled ❌',
              message: `Your appointment at ${formatTime(apt.appointment_time)} was auto-cancelled because you were more than 15 minutes late.`,
              type: 'appointment',
              data: {
                appointment_id: apt.id,
                status: 'cancelled'
              }
            });
          } catch (notifErr) {
            console.warn('Silent failure sending auto-cancel notification:', notifErr);
          }

          // 3. Broadcast status change (so other UI components can react)
          window.dispatchEvent(new CustomEvent('appointmentStatusChanged', {
            detail: {
              appointmentId: apt.id,
              newStatus: 'cancelled',
              barberId: user.id,
              appointmentDate: apt.appointment_date,
              timestamp: Date.now()
            }
          }));
        }

        // Return true to indicate we made changes
        return true;
      }
    } catch (err) {
      console.error('Error in checkAndAutoCancelNoShows:', err);
    }
    return false;
  };

  // Calculate actual estimated time based on queue position and service duration
  const calculateEstimatedTime = (appointment) => {
    if (!appointment.queue_position) return '';

    // Get current time safely
    const today = new Date();
    const getLocalDateString = (d) => {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const todayStr = getLocalDateString(today);
    const targetIsToday = appointment.appointment_date === todayStr;

    // Start time is 8:00 AM (480 minutes from midnight)
    const openingTime = 8 * 60;

    // For today, the 'baseline' is the current time or opening time, whichever is later
    let baselineTime = openingTime;
    if (targetIsToday) {
      const currentMinutes = today.getHours() * 60 + today.getMinutes();
      baselineTime = Math.max(openingTime, currentMinutes);
    }

    // If we have an actual estimated_wait_time from the database, use it relative to our real-time baseline
    if (appointment.estimated_wait_time !== null && appointment.estimated_wait_time !== undefined) {
      // If ongoing, the wait time is 0, so it will show 'baselineTime' or we should use its actual start time if available
      if (appointment.status === 'ongoing' && appointment.appointment_time) {
        return formatTime(appointment.appointment_time);
      }

      const totalMinutes = baselineTime + appointment.estimated_wait_time;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    }

    return '';
  };

  const handleBookingResponse = async (appointmentId, action, reason = '') => {
    try {
      const appointment = pendingRequests.find(req => req.id === appointmentId);
      if (!appointment) return;

      console.log(`🔄 Dashboard ${action} booking request:`, appointmentId);

      if (action === 'accept') {
        const updates = {
          status: 'confirmed',
          appointment_type: 'queue', // Force to queue as per user configuration
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
          // Calculate max queue number for the appointment's date
          const { data: dateAppointments } = await supabase
            .from('appointments')
            .select('queue_position')
            .eq('barber_id', user.id)
            .eq('appointment_date', appointment.appointment_date)
            .in('status', ['confirmed', 'ongoing', 'scheduled'])
            .not('queue_position', 'is', null);

          const maxQueueNumber = dateAppointments && dateAppointments.length > 0
            ? Math.max(0, ...dateAppointments.map(apt => apt.queue_position || 0))
            : 0;

          // If the appointment already has a queue position (e.g. it was confirmed), keep it
          // OR if it's new, give it the next available slot
          updates.queue_position = appointment.queue_position || (maxQueueNumber + 1);
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

      const updateData = {
        status,
        updated_at: new Date().toISOString()
      };

      // Clear queue position if cancelled
      if (status === 'cancelled') {
        updateData.queue_position = null;
      }

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', appointmentId);

      if (error) throw error;

      // Handle queue collapse if cancelled
      if (status === 'cancelled' && appointment.queue_position != null) {
        try {
          const { default: ComprehensiveQueueManager } = await import('../../services/queue/ComprehensiveQueueManager');
          await ComprehensiveQueueManager.collapseQueuePositions(
            appointment.barber_id,
            appointment.appointment_date,
            appointment.queue_position
          );
        } catch (collapseErr) {
          console.warn('Queue collapse error:', collapseErr);
        }
      }

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


  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'success';
      case 'day_off': return 'info';
      case 'offline': return 'secondary';
      case 'pending': return 'warning';
      case 'urgent': return 'danger';
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

  const statsCards = [
    { label: 'COMPLETED', value: todayStats.completedAppointments, icon: 'check2-circle', color: 'success' },
    { label: "TODAY'S REVENUE", value: `₱${todayStats.revenue.toLocaleString()}`, icon: 'cash-stack', color: 'primary' },
    { label: 'PENDING', value: todayStats.pendingRequests, icon: 'hourglass-split', color: 'warning' },
    { label: 'QUEUE', value: todayStats.queueLength, icon: 'people-fill', color: 'info' }
  ];

  return (
    <div className="container-fluid py-4 dashboard-container">
      {/* Notification Permission Banner */}
      <div className="row mb-1 mt-1">
        <div className="col">
          <NotificationPermission />
        </div>
      </div>
      {/* Barber Welcome Header */}
      <div className="row">
        <div className="col">
          <div className="barber-welcome-header rounded shadow-sm d-flex align-items-center" style={{ padding: 'clamp(1rem, 3vw, 1.5rem)' }}>
            <div>
              <div className="d-flex align-items-center mb-2">
                <img
                  src={logoImage}
                  alt="RAF & ROX"
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
                  <li><button className="dropdown-item" onClick={() => updateBarberStatus('offline')}>
                    <i className="bi bi-x-circle me-2 text-secondary"></i>Offline
                  </button></li>
                </ul>
              </div>
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
            style={{
              animationDelay: '0.2s',
              position: 'relative'
            }}
          >
            <div className="quick-action-icon-wrapper info-action">
              <i className="bi bi-calendar-week"></i>
            </div>
            <span className="quick-action-name">My Schedule</span>
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
      </div>

      {/* NEW COMPACT COCKPIT LAYOUT */}
      <div className="cockpit-wrapper fade-in-up">
        <div className="row g-3 stats-row-compact mb-3">
          {statsCards.map((card, index) => (
            <div key={index} className="col-6 col-md-3">
              <div className={`card border-0 shadow-sm h-100 rounded-4 overflow-hidden stat-card-minimal`}>
                <div className="card-body p-3 d-flex align-items-center gap-3">
                  <div className={`stat-icon-small bg-light`} style={{ color: card.color === 'success' ? 'var(--barber-black)' : 'var(--barber-brown)' }}>
                    <i className={`bi bi-${card.icon}`} style={{ fontSize: '1.5rem' }}></i>
                  </div>
                  <div>
                    <div className="text-muted small fw-bold text-uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.5px' }}>{card.label}</div>
                    <div className="h5 mb-0 fw-black">{card.value}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="row g-3">
          {/* LEFT COLUMN: SERVING & QUEUE */}
          <div className="col-lg-8">
            {/* COMPACT SERVING CARD */}
            {currentAppointment ? (
              <div className="card border-0 shadow-premium overflow-hidden mb-3 rounded-4 bg-white serving-card-cockpit">
                <div className="card-body p-0">
                  <div className="d-flex flex-column flex-md-row">
                    <div className="serving-accent-mini p-4 d-flex align-items-center justify-content-center">
                      <div className="position-relative">
                        <div className="avatar-serving-mini shadow-sm">
                          <i className="bi bi-person-fill text-white fs-4"></i>
                        </div>
                        <span className="position-absolute top-100 start-50 translate-middle badge rounded-pill bg-danger shadow-sm border border-2 border-white" style={{ fontSize: '0.5rem' }}>LIVE</span>
                      </div>
                    </div>
                    <div className="p-3 flex-grow-1">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <h5 className="fw-black mb-0">{currentAppointment.customer?.full_name}</h5>
                          <p className="text-muted small mb-0"><i className="bi bi-clock me-1 text-primary"></i>Started {formatTime(currentAppointment.appointment_time)}</p>
                        </div>
                        <div className="h4 mb-0 fw-black text-success">₱{Number(getTotalPrice(currentAppointment)).toLocaleString()}</div>
                      </div>
                      <div className="d-flex flex-wrap gap-2 mb-3">
                        <span className="badge bg-light text-dark border-0 rounded-pill px-2 py-1 small fw-medium">{getServicesDisplay(currentAppointment)}</span>
                        <AddOnsDisplay appointment={currentAppointment} variant="compact" />
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-dark-finish btn-sm flex-grow-1 rounded-pill py-2"
                          onClick={() => handleAppointmentStatus(currentAppointment.id, 'completed')}
                        >
                          <i className="bi bi-check-circle-fill me-2"></i>Finish Job
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card border-0 shadow-sm rounded-4 mb-3 p-4 text-center bg-white">
                <div className="p-2 bg-light d-inline-block rounded-circle mb-2 mx-auto" style={{ width: '50px', height: '50px' }}>
                  <i className="bi bi-cup-hot text-primary fs-4"></i>
                </div>
                <h6 className="fw-bold mb-1">Break Time?</h6>
                <p className="small text-muted mb-0">No active sessions. Start a job from the queue below.</p>
              </div>
            )}

            {/* COMPACT QUEUE LIST */}
            <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
              <div className="card-header bg-white border-0 p-3 pt-4 d-flex justify-content-between align-items-center">
                <h6 className="fw-black mb-0 text-uppercase" style={{ letterSpacing: '1px' }}>
                  Queue <span className="text-primary">({queueStatus.length})</span>
                </h6>
                <Link to="/queue" className="small fw-bold text-decoration-none text-primary">View All <i className="bi bi-arrow-right"></i></Link>
              </div>
              <div className="card-body p-0">
                <div className="cockpit-queue-scroll scroll-container-minimal" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  {queueStatus.length === 0 ? (
                    <div className="text-center py-5">
                      <p className="text-muted small">Queue is empty</p>
                    </div>
                  ) : (
                    queueStatus.map((appointment, index) => (
                      <div key={appointment.id} className="modern-queue-item-mini p-3 border-bottom border-light-subtle d-flex align-items-center gap-3">
                        <div className="queue-num-mini">{appointment.queue_position || index + 1}</div>
                        <div className="flex-grow-1">
                          <div className="fw-bold text-dark small">{appointment.customer?.full_name}</div>
                          <div className="text-muted" style={{ fontSize: '0.7rem' }}>{getServicesDisplay(appointment).split(',')[0]} • {appointment.total_duration || 30}m</div>
                        </div>
                        <div className="text-end">
                          <div className="fw-bold text-success small">₱{Number(getTotalPrice(appointment)).toLocaleString()}</div>
                          <button
                            className="btn btn-primary btn-sm rounded-circle p-0 mt-1"
                            style={{ width: '28px', height: '28px' }}
                            onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                            title="Start serving"
                          >
                            <i className="bi bi-play-fill" style={{ fontSize: '0.8rem' }}></i>
                          </button>
                          <button
                            className="btn btn-warning btn-sm rounded-circle p-0 mt-1 ms-1"
                            style={{ width: '28px', height: '28px' }}
                            onClick={() => setRescheduleModal({ isOpen: true, appointment: appointment })}
                            title="Adjust booking"
                          >
                            <i className="bi bi-arrow-repeat" style={{ fontSize: '0.8rem' }}></i>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: ACTIONS & REQUESTS */}
          <div className="col-lg-4">
            {/* MINI QUICK ACTIONS GRID */}
            <div className="card border-0 shadow-sm rounded-4 mb-3 overflow-hidden">
              <div className="card-body p-3">
                <div className="row g-2">
                  {[
                    { to: "/queue", icon: "people", label: "Queue", color: "primary" },
                    { to: "/schedule", icon: "calendar-week", label: "Schedule", color: "info" },
                    { to: "/appointment-requests", icon: "clipboard-check", label: "Requests", color: "warning" },
                    { to: ROUTES.BARBER_REVENUE, icon: "cash-coin", label: "Revenue", color: "success" }
                  ].map((action, i) => (
                    <div key={i} className="col-6">
                      <Link to={action.to} className="action-button-mini text-decoration-none">
                        <div className={`action-icon-mini bg-${action.color}-subtle text-${action.color}`}>
                          <i className={`bi bi-${action.icon}`}></i>
                        </div>
                        <span className="small fw-bold text-dark mt-1">{action.label}</span>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* REQUESTS SCROLLABLE LIST */}
            <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-3">
              <div className="card-header bg-white border-0 p-3 pt-4">
                <h6 className="fw-black mb-0 text-uppercase" style={{ letterSpacing: '1px' }}>Requests</h6>
              </div>
              <div className="card-body p-0">
                <div className="cockpit-requests-scroll scroll-container-minimal" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  {pendingRequests.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-muted small">No new requests</p>
                    </div>
                  ) : (
                    pendingRequests.map(request => (
                      <div key={request.id} className="p-3 border-bottom border-light-subtle">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="fw-bold small text-dark truncate pe-2">{request.customer?.full_name}</span>
                          <span className="text-muted text-nowrap" style={{ fontSize: '0.65rem' }}>{new Date(request.appointment_date).toLocaleDateString()}</span>
                        </div>
                        <div className="d-flex gap-1">
                          <button className="btn btn-success btn-sm flex-grow-1 py-1" style={{ fontSize: '0.7rem' }} onClick={() => handleBookingResponse(request.id, 'accept')}>Accept</button>
                          <button className="btn btn-warning btn-sm flex-grow-1 py-1" style={{ fontSize: '0.7rem' }} onClick={() => setRescheduleModal({ isOpen: true, appointment: request })}>Adjust</button>
                          <button className="btn btn-outline-danger btn-sm px-2 py-1" style={{ fontSize: '0.7rem' }} onClick={() => setDeclineModal({ isOpen: true, requestId: request.id, reason: '' })}><i className="bi bi-x"></i></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>


          </div>
        </div>
      </div>

      {/* Recent Reviews Section */}
      {
        recentReviews.length > 0 && (
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
        )
      }

      {/* Reschedule Modal */}
      <RescheduleModal
        isOpen={rescheduleModal.isOpen}
        onClose={() => setRescheduleModal({ isOpen: false, appointment: null })}
        appointment={rescheduleModal.appointment}
        onSuccess={fetchBarberData}
      />

      {/* Customer Details Modal */}
      {
        customerDetailsModal.isOpen && (
          <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1060 }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
                <div className="modal-header bg-gradient-primary text-white border-0 py-3">
                  <h5 className="modal-title d-flex align-items-center">
                    <i className="bi bi-person-circle me-2"></i>
                    Customer Details
                  </h5>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    onClick={() => setCustomerDetailsModal({ isOpen: false, request: null })}
                  ></button>
                </div>
                <div className="modal-body p-4">
                  {customerDetailsModal.request && (
                    <>
                      <div className="text-center mb-4">
                        <div className="avatar-large mx-auto mb-3 bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center fw-bold" style={{ width: '80px', height: '80px', borderRadius: '50%', fontSize: '2rem' }}>
                          {(customerDetailsModal.request.customer?.full_name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <h4 className="mb-1">{customerDetailsModal.request.customer?.full_name || 'Customer'}</h4>
                        <p className="text-muted small mb-0">{customerDetailsModal.request.customer?.email || 'No email provided'}</p>
                        {customerDetailsModal.request.customer?.phone && (
                          <p className="text-muted small mb-0">
                            <i className="bi bi-telephone me-1"></i>
                            {customerDetailsModal.request.customer.phone}
                          </p>
                        )}
                      </div>

                      <div className="row g-3">
                        <div className="col-12">
                          <div className="p-3 bg-light rounded-3">
                            <h6 className="text-primary mb-2 small fw-bold text-uppercase">Appointment Info</h6>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-muted small">Date:</span>
                              <span className="fw-semibold small">{new Date(customerDetailsModal.request.appointment_date).toLocaleDateString()}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-muted small">Time:</span>
                              <span className="fw-semibold small">{customerDetailsModal.request.appointment_time ? formatTime(customerDetailsModal.request.appointment_time) : 'Queue'}</span>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-muted small">Status:</span>
                              <span className={`badge ${customerDetailsModal.request.status === 'pending' ? 'bg-warning text-dark' : 'bg-success'} small`}>
                                {formatStatus(customerDetailsModal.request.status)}
                              </span>
                            </div>
                            {customerDetailsModal.request.queue_position && (
                              <div className="d-flex justify-content-between">
                                <span className="text-muted small">Queue Position:</span>
                                <span className="badge bg-primary small">#{customerDetailsModal.request.queue_position}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="col-12">
                          <div className="p-3 bg-light rounded-3">
                            <h6 className="text-primary mb-2 small fw-bold text-uppercase">Service Details</h6>
                            <div className="mb-2">
                              <span className="text-muted small d-block">Services:</span>
                              <span className="fw-semibold small">{getServicesDisplay(customerDetailsModal.request)}</span>
                            </div>
                            <div className="mb-2">
                              <span className="text-muted small d-block">Add-ons:</span>
                              <div className="small text-info">
                                <AddOnsDisplay appointment={customerDetailsModal.request} />
                              </div>
                            </div>
                            <div className="d-flex justify-content-between border-top pt-2 mt-2">
                              <span className="fw-bold small">Total Price:</span>
                              <span className="fw-bold text-success">₱{getTotalPrice(customerDetailsModal.request)}</span>
                            </div>
                          </div>
                        </div>

                        {customerDetailsModal.request.notes && (
                          <div className="col-12">
                            <div className="p-3 bg-light rounded-3">
                              <h6 className="text-primary mb-2 small fw-bold text-uppercase">Customer Notes</h6>
                              <p className="small mb-0 text-muted italic">"{customerDetailsModal.request.notes}"</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="modal-footer border-0 p-4 pt-0">
                  <button
                    type="button"
                    className="btn btn-outline-secondary w-100 mb-2"
                    onClick={() => setCustomerDetailsModal({ isOpen: false, request: null })}
                    style={{ borderRadius: '10px', padding: '10px' }}
                  >
                    Close
                  </button>
                  {customerDetailsModal.request?.status === 'pending' && (
                    <button
                      type="button"
                      className="btn btn-primary w-100"
                      onClick={() => {
                        setCustomerDetailsModal({ isOpen: false, request: null });
                        navigate(ROUTES.SCHEDULE, { state: { requestId: customerDetailsModal.request.id } });
                      }}
                      style={{ borderRadius: '10px', padding: '10px', fontWeight: '600' }}
                    >
                      <i className="bi bi-calendar-check me-2"></i>
                      Accept in Schedule
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Decline Reason Modal */}
      {declineModal.isOpen && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content overflow-hidden border-0 shadow-lg">
              <div className="modal-header bg-danger text-white border-0 p-4">
                <h5 className="modal-title fw-black">
                  <i className="bi bi-x-circle me-2"></i>
                  Decline Request
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setDeclineModal({ isOpen: false, requestId: null, reason: '' })}
                ></button>
              </div>
              <div className="modal-body p-4">
                <p className="text-muted small mb-3">Please provide a reason for declining this request. This will be sent to the customer.</p>
                <div className="form-group mb-3">
                  <label className="form-label small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>Reason (Required)</label>
                  <textarea
                    className="form-control border-light-subtle rounded-3"
                    rows="3"
                    placeholder="e.g. Fully booked for today, please try another day."
                    value={declineModal.reason}
                    onChange={(e) => setDeclineModal(prev => ({ ...prev, reason: e.target.value }))}
                  ></textarea>
                </div>
              </div>
              <div className="modal-footer border-0 p-4 pt-0">
                <button
                  type="button"
                  className="btn btn-outline-secondary flex-grow-1 rounded-pill py-2"
                  onClick={() => setDeclineModal({ isOpen: false, requestId: null, reason: '' })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger flex-grow-1 rounded-pill py-2"
                  disabled={!declineModal.reason.trim()}
                  onClick={() => {
                    handleBookingResponse(declineModal.requestId, 'reject', declineModal.reason);
                    setDeclineModal({ isOpen: false, requestId: null, reason: '' });
                  }}
                >
                  Decline Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BarberDashboard;
