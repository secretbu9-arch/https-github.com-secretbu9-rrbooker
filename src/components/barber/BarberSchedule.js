// components/barber/BarberSchedule.js (Complete Enhanced Version)
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import LoadingSpinner from '../common/LoadingSpinner';
import addOnsService from '../../services/booking/AddOnsService';
import { PushService } from '../../services/notifications/PushService';
import BulkCancellationModal from './BulkCancellationModal';
import RescheduleModal from './RescheduleModal';
import FriendBookingDisplay from '../common/FriendBookingDisplay';
import ComprehensiveQueueManager from '../../services/queue/ComprehensiveQueueManager';
import { toISODateString, getStatusColor, getStatusIcon } from '../utils/helpers';
import '../../styles/barber-appointments.css';

const barberScheduleStyles = `
  :root {
    --barber-black: #121212;
    --barber-dark-brown: #3d2b1f;
    --barber-brown: #5c4033;
    --barber-light-brown: #a67c52;
    --barber-white: #ffffff;
    --barber-light-gray: #f5f5f5;
    --barber-medium-gray: #e0e0e0;
  }

  .schedule-container {
    background-color: var(--barber-light-gray);
    min-height: 100vh;
    padding-top: 1rem !important;
  }

  /* Refined Header Card */
  .schedule-header-card {
    background: var(--barber-white) !important;
    border: 1px solid var(--barber-medium-gray) !important;
    border-left: 6px solid var(--barber-brown) !important;
    border-radius: 20px !important;
    margin-bottom: 2.5rem;
    overflow: visible;
  }

  .schedule-header-content {
    padding: 1rem;
  }

  .schedule-header-card h2 {
    color: var(--barber-black) !important;
    font-weight: 900 !important;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
  }

  .schedule-header-card .text-muted {
    color: #666666 !important;
    font-weight: 500;
  }

  .header-accent-icon {
    width: 50px;
    height: 50px;
    background: var(--barber-light-gray);
    color: var(--barber-brown);
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    margin-right: 1.25rem;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
  }

  .schedule-header-actions .btn {
    border-radius: 12px !important;
    padding: 8px 16px !important;
    font-weight: 600 !important;
    transition: all 0.2s ease !important;
  }

  /* Week Day Cards */
  .nav-day-card {
    border-radius: 20px !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    position: relative;
    overflow: visible !important;
  }

  .nav-day-card.selected-day {
    background: linear-gradient(135deg, var(--barber-black) 0%, var(--barber-dark-brown) 100%) !important;
    color: var(--barber-white) !important;
    transform: translateY(-8px);
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.2) !important;
  }

  .appt-count-badge {
    position: absolute;
    top: -10px;
    right: -10px;
    background: var(--barber-brown);
    color: white;
    font-size: 0.7rem;
    padding: 4px 8px;
    border-radius: 10px;
    font-weight: 800;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    border: 2px solid white;
    z-index: 5;
  }

  .selected-day .appt-count-badge {
    background: var(--barber-light-brown);
  }

  .nav-day-card.today-day:not(.selected-day) {
    border: 2px solid var(--barber-brown) !important;
  }

  /* Appointment Cards */
  .appointment-card-premium {
    border-radius: 20px !important;
    border: 1px solid var(--barber-medium-gray) !important;
    background: var(--barber-white) !important;
    transition: all 0.3s ease !important;
  }

  .appointment-card-premium:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08) !important;
  }

  /* Status Colors Mapping */
  .status-ongoing-card { border-left: 6px solid var(--barber-light-brown) !important; }
  .status-pending-card { border-left: 6px solid var(--barber-brown) !important; }
  .status-completed-card { border-left: 6px solid var(--barber-black) !important; }
  .status-confirmed-card { border-left: 6px solid var(--barber-dark-brown) !important; }

  /* Avatar/Icon Circle */
  .avatar-circle {
    border-radius: 14px !important;
    background-color: var(--barber-light-gray) !important;
    color: var(--barber-black) !important;
  }

  .status-ongoing-card .avatar-circle { background-color: var(--barber-light-brown) !important; color: var(--barber-white) !important; }
  .status-pending-card .avatar-circle { background-color: var(--barber-brown) !important; color: var(--barber-white) !important; }
  .status-completed-card .avatar-circle { background-color: var(--barber-black) !important; color: var(--barber-white) !important; }
  .status-confirmed-card .avatar-circle { background-color: var(--barber-dark-brown) !important; color: var(--barber-white) !important; }

  /* Buttons */
  .schedule-container .btn-primary {
    background-color: var(--barber-black) !important;
    border-color: var(--barber-black) !important;
    color: var(--barber-white) !important;
  }

  .schedule-container .btn-primary:hover {
    background-color: var(--barber-dark-brown) !important;
    border-color: var(--barber-dark-brown) !important;
  }

  .schedule-container .btn-outline-primary {
    color: var(--barber-brown) !important;
    border-color: var(--barber-brown) !important;
  }

  .schedule-container .btn-outline-primary:hover {
    background-color: var(--barber-brown) !important;
    color: var(--barber-white) !important;
  }

  .schedule-container .btn-outline-danger {
    color: var(--barber-brown) !important;
    border-color: var(--barber-brown) !important;
  }

  .schedule-container .btn-outline-danger:hover {
    background-color: var(--barber-brown) !important;
    color: var(--barber-white) !important;
  }

  .schedule-container .btn-success {
    background-color: var(--barber-black) !important;
    border-color: var(--barber-black) !important;
  }

  .schedule-container .btn-dark-finish {
    background-color: var(--barber-black) !important;
    color: var(--barber-white) !important;
  }

  /* Badges */
  .schedule-container .badge.bg-primary { background-color: var(--barber-dark-brown) !important; }
  .schedule-container .badge.bg-success { background-color: var(--barber-black) !important; }
  .schedule-container .badge.bg-info { background-color: var(--barber-light-brown) !important; }
  .schedule-container .badge.bg-warning { background-color: var(--barber-brown) !important; color: var(--barber-white) !important; }
  .schedule-container .badge.bg-danger { background-color: var(--barber-brown) !important; }

  /* Text Colors */
  .text-primary { color: var(--barber-brown) !important; }
  .text-success { color: var(--barber-black) !important; }
  .text-warning { color: var(--barber-brown) !important; }
  .text-info { color: var(--barber-light-brown) !important; }
  .text-muted { color: #888888 !important; }

  .stat-icon-small.text-success { color: var(--barber-black) !important; }
  .stat-icon-small.text-primary { color: var(--barber-brown) !important; }
  .stat-icon-small.text-warning { color: var(--barber-brown) !important; }
  .stat-icon-small.text-info { color: var(--barber-light-brown) !important; }

  /* Service Details Box */
  .service-details-box {
    background-color: var(--barber-light-gray) !important;
    border: 1px solid var(--barber-medium-gray) !important;
  }

  .service-details-box i.bi-scissors {
    color: var(--barber-brown) !important;
  }

  /* Appointment Action Buttons */
  .appointment-action-buttons .btn {
    border-radius: 10px !important;
    font-weight: 700 !important;
    text-transform: uppercase;
    font-size: 0.75rem !important;
    letter-spacing: 0.5px;
  }

  /* Status Badge Overrides */
  .bg-orange-subtle { background-color: rgba(166, 124, 82, 0.15) !important; }
  .text-orange { color: var(--barber-light-brown) !important; }

  /* Dashboard-like Welcome Card Override */
  .schedule-container .card.mb-4.shadow-sm:first-child {
    background: var(--barber-white) !important;
    color: var(--barber-black) !important;
    border-left: 6px solid var(--barber-brown) !important;
  }

  /* Modals */
  .modal-content {
    border-radius: 24px !important;
    border: none !important;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
  }

  .schedule-container .modal-header,
  .modal-header.bg-danger {
    background: linear-gradient(135deg, var(--barber-black) 0%, var(--barber-dark-brown) 100%) !important;
    color: var(--barber-white) !important;
    border: none !important;
    padding: 1.5rem !important;
  }

  .modal-title {
    font-weight: 800 !important;
    letter-spacing: -0.5px;
  }

  .schedule-container .modal-header .btn-close,
  .modal-header.bg-danger .btn-close {
    filter: invert(1) brightness(2);
  }

  .modal-body {
    padding: 1.5rem !important;
  }

  .modal-footer {
    padding: 1.5rem !important;
    border-top: 1px solid var(--barber-light-gray) !important;
  }

  .modal-footer .btn {
    border-radius: 12px !important;
    padding: 10px 20px !important;
    font-weight: 600 !important;
  }

  .bg-black {
    background-color: var(--barber-black) !important;
  }

  .custom-scrollbar::-webkit-scrollbar {
    height: 4px;
  }

  .custom-scrollbar::-webkit-scrollbar-track {
    background: var(--barber-light-gray);
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--barber-medium-gray);
    border-radius: 10px;
  }
`;

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
  const [highlightedId, setHighlightedId] = useState(null);
  const location = useLocation();

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

    if (canonicalStatus === 'cancelled') {
      payload.queue_position = null;
      if (reason) payload.cancellation_reason = reason;
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

      // Check for requestId in navigation state
      if (location.state?.requestId) {
        console.log('📍 Highlighting appointment from navigation state:', location.state.requestId);
        setHighlightedId(location.state.requestId);
      }

      return () => {
        console.log('🧹 Cleaning up schedule subscriptions');
        subscription.unsubscribe();
        clearTimeout(window.scheduleUpdateTimeout);
        window.removeEventListener('appointmentStatusChanged', handleAppointmentChange);
        window.removeEventListener('forceRefreshBarberData', handleForceRefresh);
      };
    }
  }, [user, selectedDate]);

  // Effect to scroll selected day into view in the horizontal picker
  useEffect(() => {
    if (weekDays.length > 0) {
      const selectedIndex = weekDays.findIndex(date => isSelectedDate(date));
      if (selectedIndex !== -1) {
        const dayElement = document.getElementById(`day-picker-${selectedIndex}`);
        if (dayElement) {
          dayElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    }
  }, [selectedDate, weekDays]);

  // Effect to scroll highlighted appointment into view
  useEffect(() => {
    if (highlightedId && !loading && appointments.length > 0) {
      console.log('📜 Scrolling to highlighted appointment:', highlightedId);
      const timer = setTimeout(() => {
        const element = document.getElementById(`appointment-${highlightedId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [highlightedId, loading, appointments]);

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
          const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');

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
          const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
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
          const { default: ComprehensiveQueueManager } = await import('../../services/queue/ComprehensiveQueueManager');
          await ComprehensiveQueueManager.collapseQueuePositions(
            appointment.barber_id,
            appointment.appointment_date,
            appointment.queue_position
          );
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
      const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
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
    // Scroll to top when date changes to ensure schedule is visible
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
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

    return appointments
      .filter(apt => apt.appointment_date === formattedDate)
      .sort((a, b) => {
        const isCancelledA = a.status === 'cancelled' || a.status === 'cancel';
        const isCancelledB = b.status === 'cancelled' || b.status === 'cancel';
        if (isCancelledA && !isCancelledB) return 1;
        if (!isCancelledA && isCancelledB) return -1;
        return 0; // Keep existing order for others
      });
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

    // Adjust (Reschedule) button - show for confirmed, scheduled, pending or any reschedulable status
    // Exclude: ongoing, completed, cancelled
    if (status !== 'ongoing' && status !== 'completed' && status !== 'cancelled' && status !== 'cancel' && status !== 'done') {
      buttons.push(
        <button
          key="reschedule"
          className="btn btn-warning btn-sm"
          onClick={() => {
            console.log('Adjust button clicked for appointment:', appointment);
            setRescheduleModal({ isOpen: true, appointment: appointment });
          }}
          title="Adjust Booking (Reschedule)"
        >
          <i className="bi bi-arrow-repeat me-1"></i>
          Adjust
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

    const updatedButtons = buttons.map(btn => {
      if (!React.isValidElement(btn)) return btn;
      const originalClass = btn.props.className || '';
      return React.cloneElement(btn, {
        className: `${originalClass} rounded-2 px-3 py-2 fw-bold btn-sm flex-grow-1 shadow-sm d-flex align-items-center justify-content-center`,
        style: { minHeight: '44px' }
      });
    });

    return (
      <div className="d-flex gap-2 flex-wrap w-100">
        {updatedButtons}
      </div>
    );
  };

  if (loading && !weekDays.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container-fluid px-2 px-md-4 py-3 py-md-4 schedule-container">
      <style>{barberScheduleStyles}</style>
      {/* Refined Header Section */}
      <div className="schedule-header-card shadow-sm">
        <div className="schedule-header-content">
          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
            <div className="d-flex align-items-center">
              <div className="header-accent-icon">
                <i className="bi bi-calendar2-week-fill"></i>
              </div>
              <div>
                <h2 className="mb-0">My Schedule</h2>
                <div className="text-muted small">
                  <i className="bi bi-clock-history me-1"></i>
                  {selectedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
              </div>
            </div>

            <div className="schedule-header-actions d-flex gap-2">
              <button
                className="btn btn-primary d-flex align-items-center"
                onClick={fetchAppointments}
              >
                <i className="bi bi-arrow-clockwise me-2"></i>
                Refresh
              </button>
              {getAppointmentsForDate(selectedDate).length > 0 && (
                <button
                  className="btn btn-outline-danger d-flex align-items-center"
                  onClick={() => setShowBulkCancelModal(true)}
                >
                  <i className="bi bi-calendar-x me-2"></i>
                  Bulk Cancel
                </button>
              )}
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

        {/* Enhanced Week View - Horizontal Scroll on Mobile */}
        <div className="week-view-container mb-2">
          <div className="d-flex flex-nowrap overflow-auto gap-2 pb-2 custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
            {weekDays.map((date, index) => {
              const dateAppointments = getAppointmentsForDate(date);
              const isSelected = isSelectedDate(date);
              const today = isToday(date);

              return (
                <div
                  key={index}
                  id={`day-picker-${index}`}
                  className="flex-shrink-0 py-3"
                  style={{ width: 'clamp(90px, 22vw, 130px)' }}
                  onClick={() => handleDateChange(date)}
                >
                  <div
                    className={`nav-day-card card h-100 border-0 shadow-sm text-center ${isSelected ? 'selected-day' : ''} ${today ? 'today-day' : ''}`}
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      borderRadius: '20px',
                      background: isSelected ? 'linear-gradient(135deg, var(--barber-black), var(--barber-dark-brown))' : '#fff'
                    }}
                  >
                    {dateAppointments.length > 0 && (
                      <span className="appt-count-badge">
                        {dateAppointments.length}
                      </span>
                    )}
                    <div className="card-body p-2 d-flex flex-column align-items-center justify-content-center">
                      <div className={`small fw-bold mb-1 ${isSelected ? 'text-white-50' : 'text-muted'}`}>
                        {date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                      </div>
                      <div className={`fs-4 fw-bold mb-1 ${isSelected ? 'text-white' : 'text-dark'}`}>
                        {date.getDate()}
                      </div>
                      <div className="d-flex gap-1 justify-content-center mt-1 flex-wrap" style={{ minHeight: '8px' }}>
                        {dateAppointments.slice(0, 3).map((apt, i) => (
                          <span
                            key={i}
                            className={`badge p-0 rounded-circle ${apt.status === 'ongoing' ? 'bg-info' :
                              (apt.status === 'confirmed' || apt.status === 'scheduled' ? 'bg-primary' : 'bg-warning')
                              }`}
                            style={{ width: '6px', height: '6px' }}
                          ></span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Enhanced Day Schedule with Modern UI */}
        <div className="card shadow-sm border-0 bg-transparent">
          {/* Blue Header Section */}
          {/* Minimalist Header Section */}
          <div className="bg-white text-dark p-3 p-md-4 rounded-top-4 border-bottom">
            <div className="d-flex align-items-center justify-content-between position-relative z-1">
              <div className="d-flex align-items-center gap-3">
                <div className="bg-light text-dark p-2 rounded-3">
                  <i className="bi bi-calendar3 fs-4"></i>
                </div>
                <div>
                  <h4 className="mb-0 fw-bold fs-5" style={{ letterSpacing: '-0.5px' }}>
                    {selectedDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </h4>
                  <p className="text-muted small mb-0">Daily schedule overview</p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Bar Container */}
          {(() => {
            const dateAppointments = getAppointmentsForDate(selectedDate);
            if (dateAppointments.length === 0) return null;

            const totalMinutes = dateAppointments.reduce((total, apt) => total + (apt.total_duration || apt.service?.duration || 30), 0);
            const confirmedCount = dateAppointments.filter(apt => apt.status === 'confirmed').length;
            const completedCount = dateAppointments.filter(apt => apt.status === 'completed' || apt.status === 'done').length;

            return (
              <div className="bg-white px-3 py-2 border-start border-end">
                <div className="d-flex align-items-center justify-content-between p-3 bg-light rounded-4 shadow-sm mb-2">
                  <div className="text-center flex-grow-1">
                    <div className="fw-bold text-warning fs-5">{dateAppointments.filter(a => a.status === 'pending').length}</div>
                    <div className="text-muted small" style={{ fontSize: '0.6rem' }}>PENDING</div>
                  </div>
                  <div className="border-end h-100" style={{ width: '1px', alignSelf: 'stretch', opacity: '0.1' }}></div>
                  <div className="text-center flex-grow-1">
                    <div className="fw-bold text-primary fs-5">{dateAppointments.filter(a => a.status === 'confirmed' || a.status === 'scheduled').length}</div>
                    <div className="text-muted small" style={{ fontSize: '0.6rem' }}>CONFIRMED</div>
                  </div>
                  <div className="border-end h-100" style={{ width: '1px', alignSelf: 'stretch', opacity: '0.1' }}></div>
                  <div className="text-center flex-grow-1">
                    <div className="fw-bold text-info fs-5">{dateAppointments.filter(a => a.status === 'ongoing').length}</div>
                    <div className="text-muted small" style={{ fontSize: '0.6rem' }}>ONGOING</div>
                  </div>
                  <div className="border-end h-100" style={{ width: '1px', alignSelf: 'stretch', opacity: '0.1' }}></div>
                  <div className="text-center flex-grow-1">
                    <div className="fw-bold text-success fs-5">{completedCount}</div>
                    <div className="text-muted small" style={{ fontSize: '0.6rem' }}>DONE</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="card-body p-0 border-start border-end border-bottom bg-white rounded-bottom-4">
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

                  <div className="appointment-card-list p-3 bg-light bg-opacity-50">
                    {dateAppointments.map((appointment) => {
                      const statusColor = getStatusColor(appointment.status);
                      const totalPrice = getTotalPrice(appointment);
                      
                      // Separate handling for numbering: 
                      // 1. Ongoing is "Serving"
                      // 2. Confirmed/Pending start from 1 for the first person WAITING
                      let displayQueueNumber = null;
                      if (appointment.status === 'ongoing') {
                        displayQueueNumber = 'LIVE';
                      } else if (appointment.status !== 'cancelled' && appointment.status !== 'cancel' && appointment.appointment_type === 'queue') {
                        const waitingQueue = activeQueueAppointments.filter(apt => apt.status !== 'ongoing');
                        const waitingIndex = waitingQueue.findIndex(apt => apt.id === appointment.id);
                        if (waitingIndex !== -1) {
                          displayQueueNumber = waitingIndex + 1;
                        } else if (appointment.queue_position) {
                          displayQueueNumber = appointment.queue_position;
                        }
                      }

                      const serviceLabel = [
                        appointment.service?.name,
                        getAddOnsDisplayString(appointment.add_ons_data)
                      ].filter(Boolean).join(' + ');

                      return (
                        <div
                          key={`card-${appointment.id}`}
                          id={`appointment-${appointment.id}`}
                          className={`appointment-card-premium mb-4 border-0 rounded-4 shadow-sm position-relative overflow-hidden ${appointment.status === 'ongoing' ? 'status-ongoing-card' :
                            (appointment.status === 'pending' ? 'status-pending-card' :
                              (appointment.status === 'completed' || appointment.status === 'done' ? 'status-completed-card' : 'status-confirmed-card'))
                            }`}
                          style={{
                            transition: 'all 0.3s ease',
                            background: '#fff',
                            borderLeft: `6px solid ${appointment.status === 'ongoing' ? 'var(--barber-light-brown)' :
                              (appointment.status === 'pending' ? 'var(--barber-brown)' :
                                (appointment.status === 'completed' || appointment.status === 'done' ? 'var(--barber-black)' : 'var(--barber-dark-brown)'))
                              }`
                          }}
                        >
                          <div className="p-3 p-md-4">
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <div className="d-flex align-items-center gap-3">
                                <div className={`avatar-circle d-flex align-items-center justify-content-center fw-bold text-white shadow-sm ${appointment.status === 'ongoing' ? 'bg-info' :
                                  (appointment.status === 'pending' ? 'bg-warning' :
                                    (appointment.status === 'completed' || appointment.status === 'done' ? 'bg-success' : 'bg-primary'))
                                  }`} style={{ 
                                    width: '48px', 
                                    height: '48px', 
                                    borderRadius: '14px', 
                                    fontSize: displayQueueNumber === 'LIVE' ? '0.75rem' : '1.2rem' 
                                  }}>
                                  {displayQueueNumber != null ? displayQueueNumber : (appointment.status === 'pending' ? '?' : '-')}
                                </div>
                                <div>
                                  <h5 className="fw-bold mb-0 text-dark" style={{ letterSpacing: '-0.3px', fontSize: '1.2rem' }}>
                                    {appointment.customer?.full_name || 'Guest Customer'}
                                  </h5>
                                  <div className="d-flex gap-2 align-items-center flex-wrap">
                                    <span className="text-muted small"><i className="bi bi-clock me-1"></i>{appointment.appointment_time ? formatTime(appointment.appointment_time) : (appointment.total_duration || 30) + ' min'}</span>
                                    {appointment.is_urgent && <span className="badge bg-danger text-white rounded-pill px-2 py-1" style={{ fontSize: '0.6rem' }}>URGENT</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="text-end">
                                <div className="fw-bold text-primary fs-4">₱{totalPrice.toLocaleString()}</div>
                                <span className={`badge rounded-pill px-3 py-1 ${appointment.status === 'ongoing' ? 'bg-info-subtle text-info' :
                                  (appointment.status === 'pending' ? 'bg-warning-subtle text-warning' :
                                    (appointment.status === 'completed' || appointment.status === 'done' ? 'bg-black text-white px-3' : 'bg-primary-subtle text-primary'))
                                  }`} style={{ fontSize: '0.75rem', fontWeight: '600' }}>
                                  {formatStatus(appointment.status)}
                                </span>
                              </div>
                            </div>

                            <div className="service-details-box bg-light p-3 rounded-4 mb-3 border border-light-subtle">
                              <div className="d-flex align-items-center gap-2 mb-2">
                                <i className="bi bi-scissors text-primary"></i>
                                <span className="fw-semibold text-dark-emphasis small">Services & Add-ons</span>
                              </div>
                              <p className="mb-0 text-dark small fw-medium">{serviceLabel}</p>
                              {appointment.notes && (
                                <div className="mt-2 pt-2 border-top border-light-subtle">
                                  <small className="text-muted d-block mb-1">Customer Notes:</small>
                                  <p className="mb-0 small font-italic text-secondary">"{appointment.notes}"</p>
                                </div>
                              )}
                            </div>

                            <div className="d-flex flex-wrap items-center justify-content-between gap-3 pt-2">
                              <div>
                                <FriendBookingDisplay appointment={appointment} variant="compact" />
                              </div>
                              <div className="appointment-action-buttons flex-grow-1 flex-md-grow-0 d-flex gap-2">
                                {renderAppointmentActions(appointment)}
                              </div>
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
