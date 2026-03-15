// components/customer/CustomerAppointments.js (Clean Rating System)
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import LoadingSpinner from '../common/LoadingSpinner';
import RescheduleCancelModal from './RescheduleCancelModal';
import RatingForm from '../common/RatingForm';
import addOnsService from '../../services/booking/AddOnsService';
import AdvancedHybridQueueService from '../../services/queue/AdvancedHybridQueueService';

const CustomerAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [filteredAppointments, setFilteredAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(null);
  const [queuePositions, setQueuePositions] = useState({});
  const [ratingAppointment, setRatingAppointment] = useState(null);
  const [modalData, setModalData] = useState({ isOpen: false, appointment: null, action: null });
  const [rejectedRequests, setRejectedRequests] = useState(new Set());
  const [pendingRescheduleRequests, setPendingRescheduleRequests] = useState([]);

  // Priority request modal state
  const [priorityRequestModal, setPriorityRequestModal] = useState({
    isOpen: false,
    appointment: null
  });

  // Advanced Hybrid Queue System state
  const [realTimeUpdates, setRealTimeUpdates] = useState(false);
  const [queueStats, setQueueStats] = useState({});

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6); // Show 6 appointments per page
  const [dateFilter, setDateFilter] = useState('today'); // all, today, this_week, this_month, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const navigate = useNavigate();

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

  const normalizeAppointmentRecord = (appointment = {}) => {
    const originalStatus = appointment.status?.toLowerCase() || '';
    return {
      ...appointment,
      original_status: originalStatus,
      status: normalizeStatus(appointment.status)
    };
  };

  const matchesStatus = (appointment, ...statuses) => {
    if (!appointment) return false;
    const targets = statuses.map(status => status?.toLowerCase()).filter(Boolean);
    return (
      targets.includes(appointment.status) ||
      targets.includes(appointment.original_status)
    );
  };

  useEffect(() => {
    getUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAppointments();
      fetchRejectedRequests();
      fetchPendingRescheduleRequests();

      // Set up Advanced Hybrid Queue real-time updates
      const handleAppointmentUpdate = (update) => {
        console.log('🔔 Customer received Advanced Hybrid Queue update:', update);

        // Refresh appointments when there's an update
        clearTimeout(window.customerUpdateTimeout);
        window.customerUpdateTimeout = setTimeout(() => {
          console.log('🔄 Customer refreshing appointments from Advanced Hybrid Queue...');
          fetchAppointments();
          fetchPendingRescheduleRequests();

          // Show notification if it's a queue position update
          if (update.event === 'queue_position_updated') {
            setSuccess(`Your queue position has been updated!`);
            setTimeout(() => setSuccess(''), 3000);
          }
        }, 500);
      };

      // Subscribe to customer-specific updates
      const subscription = AdvancedHybridQueueService.subscribeToCustomerUpdates(
        user.id,
        handleAppointmentUpdate
      );

      setRealTimeUpdates(true);

      return () => {
        console.log('🧹 Cleaning up Advanced Hybrid Queue customer subscription');
        AdvancedHybridQueueService.unsubscribeFromCustomerUpdates(user.id);
        clearTimeout(window.customerUpdateTimeout);
        setRealTimeUpdates(false);
      };
    }
  }, [user]);

  useEffect(() => {
    const runFilters = async () => {
      await applyFilters();
    };
    runFilters();
  }, [appointments, filter, searchQuery, dateFilter, customStartDate, customEndDate]);

  useEffect(() => {
    if (user && appointments.length > 0) {
      fetchQueuePositions();
    }
  }, [user, appointments]);

  const getUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (error) {
      console.error('Error getting user:', error);
      setError('Failed to authenticate user');
    }
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);

      console.log('Fetching customer appointments for:', user.id);

      // Try to fetch with priority request fields, fallback if they don't exist
      let data, error;

      try {
        const result = await supabase
          .from('appointments')
          .select(`
            *,
            barber:barber_id(id, full_name, email, phone),
            service:service_id(id, name, price, duration, description)
          `)
          .eq('customer_id', user.id)
          .order('appointment_date', { ascending: false })
          .order('created_at', { ascending: false });

        data = result.data;
        error = result.error;

        // If error is about missing columns, that's okay - fields will be undefined
        if (error && error.message &&
          error.message.includes('column') &&
          error.message.includes('does not exist')) {
          // Retry without the problematic fields (they'll be undefined)
          const retryResult = await supabase
            .from('appointments')
            .select(`
              *,
              barber:barber_id(id, full_name, email, phone),
              service:service_id(id, name, price, duration, description)
            `)
            .eq('customer_id', user.id)
            .order('appointment_date', { ascending: false })
            .order('created_at', { ascending: false });

          data = retryResult.data;
          error = retryResult.error;
        }
      } catch (err) {
        error = err;
      }

      if (error) throw error;

      console.log('Customer appointments fetched:', data?.length || 0);

      // Debug: Check for completed appointments
      const completedAppointments = data?.filter(apt => apt.status === 'completed') || [];
      const rateableAppointments = completedAppointments.filter(apt => !apt.is_reviewed);
      console.log('Completed appointments:', completedAppointments.length);
      console.log('Rateable appointments:', rateableAppointments.length);
      console.log('All appointments statuses:', data?.map(apt => ({ id: apt.id, status: apt.status, is_reviewed: apt.is_reviewed })));

      const normalizedAppointments = (data || []).map(normalizeAppointmentRecord);
      setAppointments(normalizedAppointments);
      setFilteredAppointments(normalizedAppointments);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load appointments. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRejectedRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('appointment_requests')
        .select('appointment_id')
        .eq('customer_id', user.id)
        .eq('status', 'rejected');

      if (error) throw error;

      const rejectedAppointmentIds = new Set(data?.map(req => req.appointment_id) || []);
      setRejectedRequests(rejectedAppointmentIds);
      console.log('Rejected requests fetched:', rejectedAppointmentIds);
    } catch (err) {
      console.error('Error fetching rejected requests:', err);
    }
  };

  const fetchPendingRescheduleRequests = async () => {
    try {
      if (!user) return;

      // Fetch all pending reschedule requests for this customer
      const { data, error } = await supabase
        .from('appointment_requests')
        .select(`
          *,
          appointment:appointment_id(
            id,
            appointment_date,
            appointment_time,
            appointment_type,
            status,
            barber_id,
            barber:barber_id(id, full_name, email)
          )
        `)
        .eq('customer_id', user.id)
        .eq('action_type', 'reschedule')
        .eq('status', 'pending_approval')
        .order('requested_at', { ascending: false });

      if (error) throw error;

      // Filter to only show barber-initiated requests (those that require customer confirmation)
      // These have requested_by: 'barber' or requires_customer_confirmation: true in current_appointment_data
      const barberInitiatedRequests = (data || []).filter(request => {
        const currentData = request.current_appointment_data || {};
        return currentData.requested_by === 'barber' || currentData.requires_customer_confirmation === true;
      });

      setPendingRescheduleRequests(barberInitiatedRequests);
      console.log('Pending reschedule requests fetched:', barberInitiatedRequests?.length || 0);
    } catch (err) {
      console.error('Error fetching pending reschedule requests:', err);
    }
  };

  // Track processed request IDs to prevent duplicates (React StrictMode protection)
  const processedRequestIdsRef = useRef(new Set());

  const handleRescheduleResponse = async (requestId, response) => {
    // Prevent duplicate processing
    const processKey = `${requestId}-${response}`;
    if (processedRequestIdsRef.current.has(processKey)) {
      console.log(`🔄 Duplicate reschedule response detected: ${processKey} - skipping`);
      return;
    }
    processedRequestIdsRef.current.add(processKey);

    // Clean up old entries after 1 minute
    setTimeout(() => {
      processedRequestIdsRef.current.delete(processKey);
    }, 60000);

    try {
      setLoading(true);
      setError(null);

      // Import notification service at the start (used in multiple places)
      const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');

      // Get the request
      const { data: request, error: requestError } = await supabase
        .from('appointment_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (requestError) throw requestError;

      if (!request) {
        throw new Error('Reschedule request not found');
      }

      if (response === 'confirm') {
        // Update appointment with new date/time
        // Check if new appointment data is in new_appointment_data or current_appointment_data
        const currentData = request.current_appointment_data || {};
        const newAppointmentData = request.new_appointment_data || {};

        // Get new date from either new_appointment_data or current_appointment_data (where we stored it)
        const newDate = newAppointmentData.appointment_date || currentData.new_appointment_date;
        const newTime = newAppointmentData.appointment_time !== undefined ? newAppointmentData.appointment_time : (currentData.new_appointment_time !== undefined ? currentData.new_appointment_time : null);
        const appointmentType = newAppointmentData.appointment_type || currentData.new_appointment_type || request.appointment?.appointment_type || 'queue';

        // Determine the appropriate status based on appointment type
        // For scheduled appointments, use 'scheduled', for queue use 'confirmed'
        const newStatus = appointmentType === 'scheduled' ? 'scheduled' : 'confirmed';

        const updateData = {
          appointment_date: newDate || request.appointment?.appointment_date,
          appointment_time: newTime !== undefined ? newTime : (request.appointment?.appointment_time || null),
          appointment_type: appointmentType,
          status: newStatus,
          is_rebooking: true, // Mark as rebooked
          updated_at: new Date().toISOString()
        };

        // For queue appointments, assign queue position using AdvancedHybridQueueService
        if (appointmentType === 'queue') {
          try {
            // Get the appointment to get barber_id and other details
            const { data: appointment, error: appointmentError } = await supabase
              .from('appointments')
              .select('barber_id, appointment_date, priority_level, is_urgent, total_duration')
              .eq('id', request.appointment_id)
              .single();

            if (appointmentError) throw appointmentError;

            // Get next queue position for the new date
            const { data: queuePosition, error: positionError } = await supabase
              .rpc('get_next_queue_position', {
                p_barber_id: appointment.barber_id,
                p_appointment_date: updateData.appointment_date,
                p_priority_level: appointment.priority_level || 'normal'
              });

            if (positionError) {
              console.warn('Failed to get queue position via RPC, calculating manually:', positionError);

              // Fallback: Calculate queue position manually
              const { data: existingQueue, error: queueError } = await supabase
                .from('appointments')
                .select('queue_position')
                .eq('barber_id', appointment.barber_id)
                .eq('appointment_date', updateData.appointment_date)
                .eq('appointment_type', 'queue')
                .in('status', ['pending', 'confirmed', 'scheduled'])
                .not('queue_position', 'is', null)
                .order('queue_position', { ascending: false })
                .limit(1);

              if (!queueError && existingQueue && existingQueue.length > 0) {
                updateData.queue_position = (existingQueue[0].queue_position || 0) + 1;
              } else {
                updateData.queue_position = 1;
              }
            } else {
              updateData.queue_position = queuePosition;
            }

            // Calculate estimated wait time based on queue position
            const { data: queueAppointments, error: waitTimeError } = await supabase
              .from('appointments')
              .select('total_duration')
              .eq('barber_id', appointment.barber_id)
              .eq('appointment_date', updateData.appointment_date)
              .eq('appointment_type', 'queue')
              .in('status', ['pending', 'confirmed', 'scheduled', 'ongoing'])
              .not('queue_position', 'is', null)
              .lt('queue_position', updateData.queue_position)
              .order('queue_position', { ascending: true });

            if (!waitTimeError && queueAppointments) {
              const estimatedWait = queueAppointments.reduce((total, apt) => {
                return total + (apt.total_duration || 30) + 5; // Add 5 minutes buffer per appointment
              }, 0);
              updateData.estimated_wait_time = estimatedWait;
            }
          } catch (queueError) {
            console.error('Error assigning queue position:', queueError);
            // Continue without queue position - it will be assigned later
          }
        } else {
          // Remove queue_position if it's now a scheduled appointment
          updateData.queue_position = null;
          updateData.estimated_wait_time = null;
        }

        const { error: updateError } = await supabase
          .from('appointments')
          .update(updateData)
          .eq('id', request.appointment_id);

        if (updateError) throw updateError;

        // Update request status
        const { error: requestUpdateError } = await supabase
          .from('appointment_requests')
          .update({ status: 'approved' })
          .eq('id', requestId);

        if (requestUpdateError) throw requestUpdateError;

        // Send notification to barber
        // Check for existing notification first to prevent duplicates
        const { data: existingNotif, error: notifCheckError } = await supabase
          .from('notifications')
          .select('id, created_at')
          .eq('user_id', request.barber_id)
          .eq('type', 'appointment_reschedule_confirmed')
          .eq('title', 'Reschedule Request Confirmed')
          .eq('data->>appointment_id', request.appointment_id)
          .eq('data->>request_id', requestId)
          .gte('created_at', new Date(Date.now() - 30000).toISOString()) // Last 30 seconds
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (notifCheckError) {
          console.warn('Error checking for existing notification:', notifCheckError);
        }

        if (existingNotif) {
          const age = Date.now() - new Date(existingNotif.created_at).getTime();
          console.log(`🔄 Duplicate "Reschedule Request Confirmed" notification exists (${Math.round(age / 1000)}s ago) - skipping`);
        } else {
          await centralizedNotificationService.createNotification({
            userId: request.barber_id,
            title: 'Reschedule Request Confirmed',
            message: `Customer has confirmed the reschedule request for appointment.`,
            type: 'appointment_reschedule_confirmed',
            category: 'request',
            priority: 'normal',
            channels: ['app', 'push'],
            data: {
              request_id: requestId,
              appointment_id: request.appointment_id,
              customer_name: request.current_appointment_data?.customer_name || 'Customer',
              action_type: 'reschedule'
            },
            appointmentId: request.appointment_id
          });
        }

        setSuccess('Reschedule request confirmed! Your appointment has been updated.');
      } else if (response === 'decline') {
        // Cancel the appointment
        const { error: cancelError } = await supabase
          .from('appointments')
          .update({
            status: 'cancelled',
            cancellation_reason: 'Reschedule request declined by customer',
            updated_at: new Date().toISOString()
          })
          .eq('id', request.appointment_id);

        if (cancelError) throw cancelError;

        // Update request status
        const { error: requestUpdateError } = await supabase
          .from('appointment_requests')
          .update({ status: 'rejected' })
          .eq('id', requestId);

        if (requestUpdateError) throw requestUpdateError;

        // Send notification to barber
        // Check for existing notification first to prevent duplicates
        const { data: existingNotif, error: notifCheckError } = await supabase
          .from('notifications')
          .select('id, created_at')
          .eq('user_id', request.barber_id)
          .eq('type', 'appointment_reschedule_declined')
          .eq('title', 'Reschedule Request Declined')
          .eq('data->>appointment_id', request.appointment_id)
          .eq('data->>request_id', requestId)
          .gte('created_at', new Date(Date.now() - 30000).toISOString()) // Last 30 seconds
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (notifCheckError) {
          console.warn('Error checking for existing notification:', notifCheckError);
        }

        if (existingNotif) {
          const age = Date.now() - new Date(existingNotif.created_at).getTime();
          console.log(`🔄 Duplicate "Reschedule Request Declined" notification exists (${Math.round(age / 1000)}s ago) - skipping`);
        } else {
          await centralizedNotificationService.createNotification({
            userId: request.barber_id,
            title: 'Reschedule Request Declined',
            message: `Customer has declined the reschedule request. Appointment has been cancelled.`,
            type: 'appointment_reschedule_declined',
            category: 'request',
            priority: 'normal',
            channels: ['app', 'push'],
            data: {
              request_id: requestId,
              appointment_id: request.appointment_id,
              customer_name: request.current_appointment_data?.customer_name || 'Customer',
              action_type: 'reschedule'
            },
            appointmentId: request.appointment_id
          });
        }

        // Also send cancellation notification to customer
        await centralizedNotificationService.createAppointmentStatusNotification({
          userId: user.id,
          appointmentId: request.appointment_id,
          status: 'cancelled',
          changedBy: 'customer'
        });

        setSuccess('Reschedule request declined. Appointment has been cancelled.');
      }

      // Refresh data
      await fetchAppointments();
      await fetchPendingRescheduleRequests();

      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Error handling reschedule response:', err);
      setError(`Failed to ${response === 'confirm' ? 'confirm' : 'decline'} reschedule request. ${err.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  };



  const fetchQueuePositions = async () => {
    try {
      // Get all queue appointments (not just today)
      const queueAppointments = appointments.filter(apt =>
        apt.appointment_type === 'queue' &&
        (matchesStatus(apt, 'scheduled', 'confirmed', 'pending', 'ongoing'))
      );

      const positions = {};

      // Helper function to calculate add-ons duration
      const calculateAddOnsDuration = (addOnsData) => {
        try {
          if (!addOnsData) return 0;

          let addOnItems;
          if (Array.isArray(addOnsData)) {
            addOnItems = addOnsData;
          } else if (typeof addOnsData === 'string') {
            addOnItems = JSON.parse(addOnsData);
          } else {
            return 0;
          }

          if (!Array.isArray(addOnItems) || addOnItems.length === 0) return 0;

          const legacyDurationMapping = {
            'addon1': 15, 'addon2': 10, 'addon3': 20, 'addon4': 15, 'addon5': 10,
            'addon6': 15, 'addon7': 10, 'addon8': 10, 'addon9': 15, 'addon10': 20
          };

          let totalDuration = 0;
          addOnItems.forEach(item => {
            if (legacyDurationMapping[item]) {
              totalDuration += legacyDurationMapping[item];
            }
          });

          return totalDuration;
        } catch (error) {
          console.error('Error calculating add-ons duration:', error);
          return 0;
        }
      };

      // Group appointments by barber and date
      const appointmentsByBarberAndDate = {};
      queueAppointments.forEach(apt => {
        const key = `${apt.barber_id}_${apt.appointment_date}`;
        if (!appointmentsByBarberAndDate[key]) {
          appointmentsByBarberAndDate[key] = [];
        }
        appointmentsByBarberAndDate[key].push(apt);
      });

      // Calculate wait time for each appointment
      for (const appointment of queueAppointments) {
        const key = `${appointment.barber_id}_${appointment.appointment_date}`;
        const sameBarberDateAppointments = appointmentsByBarberAndDate[key] || [];

        // Sort by queue position
        const sortedAppointments = sameBarberDateAppointments
          .filter(apt => apt.queue_position != null)
          .sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));

        const appointmentPosition = appointment.queue_position;
        if (appointmentPosition == null) continue;

        // Find position in sorted list
        const position = sortedAppointments.findIndex(apt => apt.id === appointment.id) + 1;

        // Calculate wait time based on all appointments before this one
        let totalWaitTime = 0;
        const appointmentsAhead = sortedAppointments.filter(apt => apt.id !== appointment.id && apt.queue_position < appointmentPosition);

        for (let i = 0; i < appointmentsAhead.length; i++) {
          const apt = appointmentsAhead[i];

          // Use total_duration if available, otherwise calculate from service + add-ons
          let duration = apt.total_duration;
          if (!duration || duration === 0) {
            const serviceDuration = apt.service?.duration || 30;
            const addOnsDuration = calculateAddOnsDuration(apt.add_ons_data);
            duration = serviceDuration + addOnsDuration;
          }

          totalWaitTime += duration;

          // Add buffer time between appointments (5 minutes) - only between appointments, not after the last one
          // Add buffer after each appointment except the last one
          if (i < appointmentsAhead.length - 1) {
            totalWaitTime += 5;
          }
        }

        // Format wait time
        let estimatedWaitText;
        if (totalWaitTime < 60) {
          estimatedWaitText = `${totalWaitTime} min`;
        } else {
          const hours = Math.floor(totalWaitTime / 60);
          const minutes = totalWaitTime % 60;
          estimatedWaitText = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }

        positions[appointment.id] = {
          position,
          estimatedWait: estimatedWaitText
        };
      }

      setQueuePositions(positions);
    } catch (err) {
      console.error('Error fetching queue positions:', err);
    }
  };

  const applyFilters = async () => {
    if (!appointments.length) return;

    const today = new Date().toISOString().split('T')[0];

    let filtered = [...appointments];

    // Apply quick status filter (upcoming/past/etc.)
    switch (filter) {
      case 'upcoming':
        filtered = filtered.filter(apt =>
          (apt.appointment_date >= today && (matchesStatus(apt, 'scheduled', 'confirmed') || matchesStatus(apt, 'pending'))) ||
          matchesStatus(apt, 'ongoing')
        );
        break;
      case 'past':
        filtered = filtered.filter(apt =>
          apt.appointment_date < today || apt.status === 'completed'
        );
        break;
      case 'completed':
        filtered = filtered.filter(apt => apt.status === 'completed');
        break;
      case 'pending':
        filtered = filtered.filter(apt => apt.status === 'pending');
        break;
      case 'cancelled':
        filtered = filtered.filter(apt => apt.status === 'cancelled');
        break;
      default:
        // 'all' - no filtering needed
        break;
    }

    // Note: explicit status filter removed as requested

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();

      // Filter with async add-ons display
      const filteredWithAddOns = await Promise.all(
        filtered.map(async (apt) => {
          const addOnsText = await getAddOnsDisplay(apt);
          const matchesSearch =
            apt.barber?.full_name.toLowerCase().includes(query) ||
            apt.service?.name.toLowerCase().includes(query) ||
            (apt.notes && apt.notes.toLowerCase().includes(query)) ||
            getServicesDisplay(apt).toLowerCase().includes(query) ||
            addOnsText.toLowerCase().includes(query);

          return matchesSearch ? apt : null;
        })
      );

      filtered = filteredWithAddOns.filter(apt => apt !== null);
    }

    setFilteredAppointments(filtered);
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
        let serviceIds;

        // Check if services_data is already an array (object)
        if (Array.isArray(appointment.services_data)) {
          serviceIds = appointment.services_data;
        } else if (typeof appointment.services_data === 'string') {
          // Try to parse as JSON
          serviceIds = JSON.parse(appointment.services_data);
        } else {
          // Handle other data types
          serviceIds = [appointment.services_data];
        }

        if (Array.isArray(serviceIds) && serviceIds.length > 1) {
          services.push(`+${serviceIds.length - 1} more services`);
        }
      } catch (e) {
        console.error('Error parsing services data:', e);
        console.log('Raw services_data:', appointment.services_data);
        console.log('Type of services_data:', typeof appointment.services_data);

        // Fallback: treat as single service ID
        if (typeof appointment.services_data === 'string' && appointment.services_data.length > 0) {
          services.push('+1 more service');
        }
      }
    }

    return services.join(', ');
  };

  const getAddOnsDisplay = async (appointment) => {
    return await addOnsService.getAddOnsDisplay(appointment.add_ons_data);
  };

  // Component to display add-ons with async loading (inline version)
  const AddOnsDisplayInline = ({ appointment }) => {
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
      return <small className="text-muted ms-2">Loading add-ons...</small>;
    }

    if (!addOnsText) {
      return null;
    }

    return (
      <small className="text-info ms-2">
        <span className="text-muted">•</span> {addOnsText}
      </small>
    );
  };

  // Component to display add-ons with async loading (block version - kept for backward compatibility)
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
      <div className="mb-2">
        <small className="text-muted">Add-ons:</small>
        <div className="small text-info addon-display">{addOnsText}</div>
      </div>
    );
  };

  const getTotalPrice = (appointment) => {
    let total = appointment.total_price || appointment.service?.price || 0;

    // Add urgent fee only if appointment is urgent but total_price doesn't already include it
    // When priority_request_status is 'approved', the total_price in DB already includes the fee
    // When appointment is created as urgent from start, total_price should already include it
    // Only add fee if is_urgent is true AND we don't have a total_price (fallback case)
    if (appointment.is_urgent && !appointment.total_price && appointment.priority_request_status !== 'approved') {
      // This is a fallback - if total_price exists, it should already include the urgent fee
      total += 100;
    }

    return total;
  };

  const openPriorityRequestModal = (appointment) => {
    setPriorityRequestModal({
      isOpen: true,
      appointment: appointment
    });
  };

  const closePriorityRequestModal = () => {
    setPriorityRequestModal({
      isOpen: false,
      appointment: null
    });
  };

  const handleRequestPriority = async (appointmentId) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          priority_request_status: 'pending',
          priority_requested_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Send notification to managers
      try {
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        const appointment = appointments.find(apt => apt.id === appointmentId);

        // Get all managers
        const { data: managers } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'manager');

        if (managers && managers.length > 0) {
          await Promise.all(managers.map(manager =>
            centralizedNotificationService.createNotification({
              userId: manager.id,
              title: 'Priority Request',
              message: `${user.user_metadata?.full_name || user.email} has requested priority for an appointment.`,
              type: 'priority_request',
              category: 'queue_update',
              priority: 'high',
              channels: ['app', 'push'],
              data: {
                appointment_id: appointmentId,
                customer_name: user.user_metadata?.full_name || user.email,
                barber_name: appointment?.barber?.full_name
              },
              appointmentId: appointmentId
            })
          ));
        }
      } catch (notifError) {
        console.warn('Failed to send priority request notification:', notifError);
      }

      setSuccess('Priority request submitted! Manager will review and notify you.');
      setTimeout(() => setSuccess(''), 5000);
      closePriorityRequestModal();
      fetchAppointments();
    } catch (err) {
      console.error('Error requesting priority:', err);
      setError('Failed to submit priority request. Please try again.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    try {
      console.log('🔄 Customer cancelling appointment:', appointmentId);

      // Find appointment details to compute queue collapse
      const appointment = appointments.find(apt => apt.id === appointmentId);

      // Store original queue position before updating
      const originalQueuePosition = appointment?.queue_position;

      // First cancel the appointment
      const { error: cancelError } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
          queue_position: null,
          cancellation_reason: 'Cancelled by customer'
        })
        .eq('id', appointmentId);

      if (cancelError) throw cancelError;

      // Collapse queue positions if needed
      if (appointment && originalQueuePosition != null) {
        try {
          console.log(`🔄 Collapsing queue positions after cancelling position ${originalQueuePosition}`);

          const { data: affected, error: fetchErr } = await supabase
            .from('appointments')
            .select('id, queue_position')
            .eq('barber_id', appointment.barber_id)
            .eq('appointment_date', appointment.appointment_date)
            .in('status', ['scheduled', 'pending', 'confirmed', 'ongoing'])
            .gt('queue_position', originalQueuePosition)
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
          console.warn('Queue collapse warning:', collapseErr);
        }
      }

      // Create notification for barber using CentralizedNotificationService
      if (appointment) {
        const { CentralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        await CentralizedNotificationService.createNotification({
          userId: appointment.barber_id,
          title: 'Appointment Cancelled',
          message: `${user.user_metadata?.full_name || user.email} has cancelled their appointment.`,
          type: 'appointment_cancelled',
          appointmentId: appointmentId,
          data: {
            customer_name: user.user_metadata?.full_name || user.email
          }
        });
      }

      // Add log entry
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'appointment_cancelled_by_customer',
        details: {
          appointment_id: appointmentId
        }
      });

      console.log('✅ Customer appointment cancelled successfully');

      // Refresh appointments
      setTimeout(() => fetchAppointments(), 1000);
    } catch (err) {
      console.error('❌ Error cancelling appointment:', err);
      setError('Failed to cancel appointment. Please try again.');
    }
  };

  const handleCancel = (appointment) => {
    setModalData({
      isOpen: true,
      appointment: appointment,
      action: 'cancel'
    });
  };

  const handleModalClose = () => {
    setModalData({ isOpen: false, appointment: null, action: null });
  };

  const handleModalSuccess = (request) => {
    setSuccess('Cancellation request submitted successfully!');
    fetchAppointments(); // Refresh appointments
    fetchRejectedRequests(); // Refresh rejected requests list
  };

  const handleCloneAppointment = async (appointment) => {
    // Navigate to booking page with pre-filled data
    const searchParams = new URLSearchParams({
      barber: appointment.barber_id,
      service: appointment.service_id,
      services: appointment.services_data || JSON.stringify([appointment.service_id]),
      addons: appointment.add_ons_data || '[]',
      notes: appointment.notes || ''
    });

    navigate(`/book?${searchParams.toString()}`);
  };

  const formatAppointmentDate = (dateString) => {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-status-completed border-0';
      case 'ongoing':
        return 'bg-brown-premium text-white pulse-badge';
      case 'cancelled':
        return 'bg-status-cancelled border-0';
      case 'pending':
        return 'bg-status-pending border-0';
      case 'scheduled':
      case 'confirmed':
        return 'bg-status-confirmed border-0';
      default:
        return 'bg-light text-muted';
    }
  };

  // Filter appointments by date
  const filterAppointmentsByDate = (appointments) => {
    if (dateFilter === 'all') return appointments;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return appointments.filter(appointment => {
      const appointmentDate = new Date(appointment.appointment_date);
      const appointmentDateOnly = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate());

      switch (dateFilter) {
        case 'today':
          return appointmentDateOnly.getTime() === today.getTime();
        case 'this_week':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          return appointmentDateOnly >= weekStart && appointmentDateOnly <= weekEnd;
        case 'this_month':
          return appointmentDate.getMonth() === now.getMonth() && appointmentDate.getFullYear() === now.getFullYear();
        case 'custom':
          if (!customStartDate || !customEndDate) return true;
          {
            const start = new Date(customStartDate);
            const end = new Date(customEndDate);
            // Normalize times to date-only
            const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
            return appointmentDateOnly >= startOnly && appointmentDateOnly <= endOnly;
          }
        default:
          return true;
      }
    });
  };

  // Get paginated appointments
  const getPaginatedAppointments = () => {
    const dateFilteredAppointments = filterAppointmentsByDate(filteredAppointments);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return dateFilteredAppointments.slice(startIndex, endIndex);
  };

  // Get total pages
  const getTotalPages = () => {
    const dateFilteredAppointments = filterAppointmentsByDate(filteredAppointments);
    return Math.ceil(dateFilteredAppointments.length / itemsPerPage);
  };

  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle date filter change
  const handleDateFilterChange = (filter) => {
    setDateFilter(filter);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return 'bi-check-circle-fill';
      case 'ongoing':
        return 'bi-scissors';
      case 'cancelled':
        return 'bi-x-circle-fill';
      case 'pending':
        return 'bi-clock-fill';
      case 'scheduled':
        return 'bi-calendar-check';
      case 'confirmed':
        return 'bi-check-circle'; // Confirmed but not yet done
      default:
        return 'bi-circle';
    }
  };

  const getPendingStatusText = (appointment) => {
    if (appointment.status === 'pending') {
      return 'Waiting for barber confirmation';
    }
    return '';
  };

  const getEstimatedWaitTime = (appointment) => {
    // Check for queue appointments with queue positions
    if (appointment.appointment_type === 'queue' && queuePositions[appointment.id]) {
      return queuePositions[appointment.id].estimatedWait;
    }
    // Also check for scheduled/confirmed appointments with queue positions
    if (matchesStatus(appointment, 'scheduled', 'confirmed', 'pending') && queuePositions[appointment.id]) {
      return queuePositions[appointment.id].estimatedWait;
    }
    return null;
  };

  const getQueuePosition = (appointment) => {
    // Check for queue appointments with queue positions
    if (appointment.appointment_type === 'queue' && queuePositions[appointment.id]) {
      return queuePositions[appointment.id].position;
    }
    // Also check for scheduled/confirmed appointments with queue positions
    if (matchesStatus(appointment, 'scheduled', 'confirmed', 'pending') && queuePositions[appointment.id]) {
      return queuePositions[appointment.id].position;
    }
    return null;
  };

  if (loading && !appointments.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-3 py-md-4">
      <style>{`
        :root {
          --premium-black: #000000;
          --premium-brown: #3d2c24;
          --premium-brown-dark: #261a15;
          --premium-brown-light: #5d4a41;
          --premium-gray-light: #fdfdfd;
          --premium-gray-medium: #f0f0f0;
          --premium-green-dark: #004d40;
          --premium-red-dark: #b71c1c;
          --premium-blue-dark: #01579b;
          --premium-bronze-dark: #f9a825;
        }
        .bg-brown-premium {
          background-color: var(--premium-brown);
        }
        .bg-brown-light {
          background-color: var(--premium-brown-light);
        }
        .text-brown-premium {
          color: var(--premium-brown);
        }
        .bg-status-completed {
          background-color: var(--premium-green-dark);
          color: #e0f2f1;
        }
        .bg-status-cancelled {
          background-color: var(--premium-red-dark);
          color: #ffebee;
        }
        .text-status-completed {
          color: var(--premium-green-dark);
        }
        .text-status-cancelled {
          color: var(--premium-red-dark);
        }
        .bg-status-confirmed {
          background-color: var(--premium-blue-dark);
          color: #e1f5fe;
        }
        .bg-status-pending {
          background-color: var(--premium-bronze-dark);
          color: #fffde7;
        }
        .text-status-confirmed {
          color: var(--premium-blue-dark);
        }
        .text-status-pending {
          color: var(--premium-bronze-dark);
        }
        .btn-brown-premium {
          background-color: var(--premium-brown);
          color: white;
          border: none;
          transition: all 0.3s ease;
        }
        .btn-brown-premium:hover {
          background-color: var(--premium-brown-dark);
          color: white;
          transform: translateY(-1px);
        }
        .btn-outline-brown {
          border: 1px solid var(--premium-brown);
          color: var(--premium-brown);
          background: transparent;
        }
        .btn-outline-brown:hover {
          background-color: var(--premium-brown);
          color: white;
        }
        .queue-status-card {
          padding: 1.25rem;
          background: var(--premium-gray-light);
          border-radius: 16px;
          border-left: 5px solid var(--premium-brown);
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          transition: all 0.3s ease;
        }
        .queue-status-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(0,0,0,0.06);
          background: #ffffff;
        }
        .queue-mini-number {
          width: 50px;
          height: 50px;
          background: linear-gradient(135deg, var(--premium-brown) 0%, var(--premium-brown-dark) 100%);
          color: white;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1.2rem;
          box-shadow: 0 4px 10px rgba(139, 94, 60, 0.2);
        }
        .appointment-card-premium {
          border: 1px solid var(--premium-gray-medium);
          border-radius: 16px;
          overflow: hidden;
          transition: all 0.3s ease;
          background: #fff;
          cursor: default;
        }
        .appointment-card-premium:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.06) !important;
          border-color: var(--premium-brown-light);
        }
        .appointment-card-premium:active {
          transform: translateY(-5px) scale(0.99);
        }
        .card-header-premium {
          background: white;
          border-bottom: 1px solid var(--premium-gray-light);
          padding: 1.25rem;
        }
        .currency-amount {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          letter-spacing: -0.5px;
          color: var(--premium-brown-dark);
        }
        .extra-small {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .pagination .page-link {
          color: var(--premium-brown);
          border-color: var(--premium-gray-medium);
          transition: all 0.2s ease;
        }
        .pagination .page-link:hover {
          background-color: var(--premium-gray-light);
          color: var(--premium-brown-dark);
        }
        .pagination .page-item.active .page-link {
          background-color: var(--premium-brown);
          border-color: var(--premium-brown);
        }
        .filter-section {
          background: var(--premium-gray-light);
          border-radius: 15px;
          border: 1px solid var(--premium-gray-medium);
          transition: all 0.3s ease;
        }
        .badge-urgent {
          background-color: #000;
          color: var(--premium-brown-light);
          border: 1px solid var(--premium-brown-light);
        }
        .stats-card-interactive {
          cursor: pointer;
          transition: all 0.3s ease;
          border: 1px solid transparent;
        }
        .stats-card-interactive:hover {
          background: #fff !important;
          border-color: var(--premium-brown-light);
          transform: translateY(-3px);
          box-shadow: 0 5px 15px rgba(0,0,0,0.05);
        }
        .stats-card-interactive.active {
          background: #fff !important;
          border-color: var(--premium-brown);
          box-shadow: 0 5px 15px rgba(139, 94, 60, 0.1);
        }
        .pulse-ongoing {
          animation: pulse-border 2s infinite;
        }
        @keyframes pulse-border {
          0% { box-shadow: 0 0 0 0 rgba(139, 94, 60, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(139, 94, 60, 0); }
          100% { box-shadow: 0 0 0 0 rgba(139, 94, 60, 0); }
        }
        .pulse-badge {
          animation: badge-flicker 2s infinite;
        }
        @keyframes badge-flicker {
          0% { opacity: 1; }
          50% { opacity: 0.8; }
          100% { opacity: 1; }
        }
        .btn-action-micro {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .btn-action-micro:hover {
          transform: scale(1.05);
          letter-spacing: 0.2px;
        }
        .btn-action-micro:active {
          transform: scale(0.95);
        }
        .hover-scale-110:hover {
          transform: scale(1.1);
        }
      `}</style>
      <div className="d-flex flex-column gap-3 mb-4">
        <div className="bg-dark text-white p-4 rounded-4 shadow-lg d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3" style={{ background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)' }}>
          <div>
            <h2 className="h3 h4-md mb-0 fw-bold text-white">Customer Appointments</h2>
          </div>
          <div className="d-flex gap-2 w-100 w-md-auto ms-md-auto justify-content-end">
            <button
              className={`btn px-3 py-2 rounded-pill fw-bold transition-all shadow-sm small ${showFilterDropdown ? 'btn-light text-dark' : 'btn-outline-light'}`}
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            >
              <i className={`bi bi-${showFilterDropdown ? 'chevron-up' : 'sliders2'} me-2`}></i>
              <span className="d-none d-sm-inline">{showFilterDropdown ? 'Close Filters' : 'Filters'}</span>
              <span className="d-sm-none fs-7"><i className="bi bi-funnel"></i></span>
              {(filter !== 'all' || dateFilter !== 'all' || searchQuery) && (
                <span className="ms-2 badge rounded-circle p-1 bg-brown-premium" style={{ width: '6px', height: '6px', display: 'inline-block' }}> </span>
              )}
            </button>
            <Link to="/book" className="btn btn-brown-premium px-3 py-2 rounded-pill fw-bold shadow-sm btn-action-micro small">
              <i className="bi bi-plus-lg me-2"></i>
              Book session
            </Link>
          </div>
        </div>

        {/* Dashboard Stats Summary (Desktop Interactive) */}
        <div className="row g-3 mb-1">
          <div className="col-6 col-md-3">
            <div
              className={`p-3 rounded-4 bg-light stats-card-interactive ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              <div className="d-flex justify-content-between align-items-center mb-1">
                <i className="bi bi-grid text-muted"></i>
                <span className="fw-bold fs-5">{appointments.filter(a => a.status === 'completed').length}</span>
              </div>
              <p className="text-muted extra-small mb-0 fw-bold">Visits</p>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div
              className={`p-3 rounded-4 bg-light stats-card-interactive ${filter === 'upcoming' ? 'active' : ''}`}
              onClick={() => setFilter('upcoming')}
            >
              <div className="d-flex justify-content-between align-items-center mb-1">
                <i className="bi bi-calendar-event text-status-confirmed"></i>
                <span className="fw-bold fs-5 text-status-confirmed">
                  {appointments.filter(apt => ['scheduled', 'confirmed', 'pending', 'ongoing'].includes(apt.status)).length}
                </span>
              </div>
              <p className="text-muted extra-small mb-0 fw-bold">Active</p>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div
              className={`p-3 rounded-4 bg-light stats-card-interactive ${filter === 'completed' ? 'active' : ''}`}
              onClick={() => setFilter('completed')}
            >
              <div className="d-flex justify-content-between align-items-center mb-1">
                <i className="bi bi-check-all text-status-completed"></i>
                <span className="fw-bold fs-5 text-status-completed">
                  {appointments.filter(apt => apt.status === 'completed').length}
                </span>
              </div>
              <p className="text-muted extra-small mb-0 fw-bold">Completed</p>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div
              className={`p-3 rounded-4 bg-light stats-card-interactive ${filter === 'cancelled' ? 'active' : ''}`}
              onClick={() => setFilter('cancelled')}
            >
              <div className="d-flex justify-content-between align-items-center mb-1">
                <i className="bi bi-dash-circle text-status-cancelled"></i>
                <span className="fw-bold fs-5 text-status-cancelled">
                  {appointments.filter(apt => apt.status === 'cancelled').length}
                </span>
              </div>
              <p className="text-muted extra-small mb-0 fw-bold">Cancelled</p>
            </div>
          </div>
        </div>

        {/* Collapsible Filter Section */}
        {showFilterDropdown && (
          <div className="card border-0 shadow-sm filter-section">
            <div className="card-body p-4">
              <div className="row g-3">
                {/* Search */}
                <div className="col-12 col-md-4">
                  <label className="form-label small fw-bold text-muted mb-1">Search</label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-search text-muted"></i>
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0"
                      placeholder="Barber, Service..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        className="btn btn-outline-secondary border-start-0"
                        type="button"
                        onClick={() => setSearchQuery('')}
                      >
                        <i className="bi bi-x-lg"></i>
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Filter */}
                <div className="col-6 col-md-4">
                  <label className="form-label small fw-bold text-muted mb-1">Status</label>
                  <select
                    className="form-select form-select-sm"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="past">Past</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Date Filter */}
                <div className="col-6 col-md-4">
                  <label className="form-label small fw-bold text-muted mb-1">Date</label>
                  <select
                    className="form-select form-select-sm"
                    value={dateFilter}
                    onChange={(e) => handleDateFilterChange(e.target.value)}
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today</option>
                    <option value="this_week">This Week</option>
                    <option value="this_month">This Month</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                {/* Custom Date Inputs */}
                {dateFilter === 'custom' && (
                  <div className="col-12 border-top pt-2 mt-2">
                    <label className="form-label small fw-bold text-muted mb-1">Custom Range</label>
                    <div className="d-flex gap-2">
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                      />
                      <span className="align-self-center text-muted">-</span>
                      <input
                        type="date"
                        className="form-control form-control-sm"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>


      {error && (
        <div className="alert alert-dark border-0 shadow-sm alert-dismissible fade show" role="alert" style={{ borderLeft: '5px solid #000' }}>
          <div className="d-flex align-items-center">
            <i className="bi bi-exclamation-triangle-fill me-2 fs-4 text-warning"></i>
            <div>{error}</div>
          </div>
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      {success && (
        <div className="alert alert-white border-0 shadow-sm alert-dismissible fade show" role="alert" style={{ borderLeft: '5px solid var(--premium-brown)' }}>
          <div className="d-flex align-items-center">
            <i className="bi bi-check-circle-fill me-2 fs-4 text-brown-premium"></i>
            <div className="fw-bold">{success}</div>
          </div>
          <button type="button" className="btn-close" onClick={() => setSuccess('')}></button>
        </div>
      )}

      {/* Pending Reschedule Requests */}
      {pendingRescheduleRequests.length > 0 && (
        <div className="card mb-4 border-0 shadow-lg overflow-hidden rounded-4">
          <div className="card-header bg-dark text-white p-3">
            <h5 className="mb-0 d-flex align-items-center">
              <i className="bi bi-calendar2-range me-2 text-brown-premium"></i>
              Pending Reschedule Requests
              <span className="badge bg-brown-premium ms-auto">{pendingRescheduleRequests.length}</span>
            </h5>
          </div>
          <div className="card-body">
            <div className="alert alert-info mb-3">
              <i className="bi bi-info-circle me-2"></i>
              Your barber has requested to reschedule these appointments. Please confirm or decline each request.
            </div>
            <div className="row">
              {pendingRescheduleRequests.map((request) => (
                <div key={request.id} className="col-md-6 mb-3">
                  <div className="card border-warning">
                    <div className="card-body">
                      <h6 className="card-title">
                        <i className="bi bi-person-badge me-2"></i>
                        {request.appointment?.barber?.full_name || 'Barber'}
                      </h6>

                      <div className="mb-3">
                        <div className="d-flex justify-content-between mb-2">
                          <small className="text-muted">Current Date:</small>
                          <strong className="text-dark">
                            {new Date(request.current_appointment_data?.appointment_date || request.appointment?.appointment_date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </strong>
                        </div>
                        {request.current_appointment_data?.appointment_time && (
                          <div className="d-flex justify-content-between mb-2">
                            <small className="text-muted">Current Time:</small>
                            <strong className="text-dark">
                              {new Date(`2000-01-01T${request.current_appointment_data.appointment_time}`).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </strong>
                          </div>
                        )}
                      </div>

                      <div className="mb-3 p-3 border-start border-brown border-4 bg-light rounded-e-3">
                        <small className="text-brown-premium fw-bold d-block mb-2">New Proposed Schedule:</small>
                        <div className="d-flex justify-content-between mb-2">
                          <small className="text-muted">New Date:</small>
                          <strong className="text-brown-premium">
                            {new Date(
                              request.new_appointment_data?.appointment_date ||
                              request.current_appointment_data?.new_appointment_date ||
                              request.appointment?.appointment_date
                            ).toLocaleDateString('en-US', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </strong>
                        </div>
                        {(request.new_appointment_data?.appointment_time || request.current_appointment_data?.new_appointment_time) && (
                          <div className="d-flex justify-content-between">
                            <small className="text-muted">New Time:</small>
                            <strong className="text-brown-premium">
                              {new Date(`2000-01-01T${request.new_appointment_data?.appointment_time || request.current_appointment_data?.new_appointment_time}`).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </strong>
                          </div>
                        )}
                        {(request.new_appointment_data?.appointment_type || request.current_appointment_data?.new_appointment_type || 'queue') === 'queue' && (
                          <div className="d-flex justify-content-between">
                            <small className="text-muted">Type:</small>
                            <strong className="text-success">Queue</strong>
                          </div>
                        )}
                      </div>

                      {request.reason && (
                        <div className="mb-3">
                          <small className="text-muted d-block mb-1">Reason:</small>
                          <p className="mb-0 small">{request.reason}</p>
                        </div>
                      )}

                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-brown-premium btn-sm flex-fill rounded-pill"
                          onClick={() => handleRescheduleResponse(request.id, 'confirm')}
                          disabled={loading}
                        >
                          <i className="bi bi-check-circle me-1"></i>
                          Accept
                        </button>
                        <button
                          className="btn btn-outline-dark btn-sm flex-fill rounded-pill"
                          onClick={() => handleRescheduleResponse(request.id, 'decline')}
                          disabled={loading}
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



      {filterAppointmentsByDate(filteredAppointments).length === 0 ? (
        <div className="text-center py-5 filter-section p-5 shadow-sm border-light">
          <div className="display-4 text-brown-premium mb-4 animate-bounce">
            <i className="bi bi-calendar2-x"></i>
          </div>
          <h4 className="text-dark fw-bold mb-3">
            {filter !== 'all' ?
              `No ${filter} appointments found` :
              "Your Journey Awaits"}
          </h4>
          <p className="text-muted mb-4 max-w-md mx-auto fs-6">
            {filter !== 'all' ?
              `Try adjusting your filter or search terms to rediscover your style history.` :
              "Ready for a transformation? Book your first premium session today and step into a new look."}
          </p>
          <Link to="/book" className="btn btn-brown-premium btn-lg px-5 rounded-pill shadow-lg btn-action-micro">
            <i className="bi bi-calendar-plus me-2"></i>
            Book Now
          </Link>
        </div>
      ) : (
        <div>
          <div className="row g-3 g-md-4">
            {getPaginatedAppointments().map((appointment) => (
              <div key={appointment.id} className="col-12 col-sm-6 col-lg-4">
                <div className={`card appointment-card-premium h-100 shadow-sm ${appointment.status === 'ongoing' ? 'pulse-ongoing border-brown border-2' : ''}`}>
                  <div className="card-header-premium p-3 border-bottom border-light">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <span className={`badge ${getStatusBadgeClass(appointment.status)} px-2 py-1 rounded-4 extra-small fw-bold`}>
                        <i className={`bi ${getStatusIcon(appointment.status)} me-1`}></i>
                        {appointment.status.toUpperCase()}
                      </span>
                      <div className="text-end">
                        <div className="text-dark extra-small fw-bold mb-1">
                          <i className="bi bi-calendar3 me-1 text-brown-premium"></i>
                          {formatAppointmentDate(appointment.appointment_date)}
                        </div>
                        {appointment.appointment_type === 'scheduled' && appointment.appointment_time && (
                          <div className="extra-small text-muted">
                            <i className="bi bi-clock-fill me-1 text-brown-premium"></i>
                            {new Date(`2000-01-01T${appointment.appointment_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="card-body p-3">
                    <div className="d-flex align-items-start justify-content-between mb-2">
                      <div className="flex-grow-1">
                        <h6 className="mb-1 d-flex align-items-center flex-wrap gap-1 fw-bold text-dark" style={{ fontSize: '0.9rem' }}>
                          {getServicesDisplay(appointment)}
                          <AddOnsDisplayInline appointment={appointment} />
                        </h6>
                        <div className="d-flex align-items-center gap-2 extra-small text-muted">
                          <span><i className="bi bi-person me-1"></i>{appointment.barber?.full_name}</span>
                          <span>•</span>
                          <span><i className="bi bi-clock me-1"></i>{appointment.total_duration || appointment.service?.duration}m</span>
                        </div>
                      </div>
                      <div className="text-end ms-2">
                        <div className="currency-amount fw-bold" style={{ fontSize: '1rem' }}>₱{Number(getTotalPrice(appointment)).toLocaleString('en-US')}</div>
                        {appointment.is_urgent && (
                          <span className="badge badge-urgent p-1 rounded-circle extra-small border-0 shadow-sm" title="Priority Access Managed" style={{ width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="bi bi-lightning-charge-fill" style={{ fontSize: '0.6rem' }}></i>
                          </span>
                        )}
                      </div>
                    </div>

                    {appointment.status === 'pending' && (
                      <div className="alert bg-light border-0 py-1 px-2 mb-2 rounded-3">
                        <small className="extra-small fw-bold text-dark">
                          <i className="bi bi-hourglass-split me-1 text-brown-premium"></i>
                          {getPendingStatusText(appointment)}
                        </small>
                      </div>
                    )}

                    {appointment.appointment_type === 'queue' && (appointment.queue_position || getQueuePosition(appointment)) && (
                      <div className="queue-status-card mb-3">
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center">
                            <div className="queue-mini-number me-3">
                              #{appointment.queue_position || getQueuePosition(appointment)}
                            </div>
                            <div>
                              <p className="mb-0 fw-bold small">Queue Position</p>
                              <p className="mb-0 text-muted extra-small">Live Tracking</p>
                            </div>
                          </div>
                          {getEstimatedWaitTime(appointment) && (
                            <div className="text-end">
                              <p className="mb-0 fw-bold small text-brown-premium">
                                <i className="bi bi-hourglass-bottom me-1"></i>
                                {getEstimatedWaitTime(appointment)}
                              </p>
                              <p className="mb-0 text-muted extra-small uppercase">Wait Time</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {appointment.status === 'confirmed' && (
                      <div className="alert bg-dark text-white py-1 px-2 mb-2 border-0 opacity-90 rounded-3 d-flex align-items-center">
                        <i className="bi bi-calendar-check me-2 text-brown-premium"></i>
                        <small className="extra-small">Confirmed for today</small>
                      </div>
                    )}

                    {appointment.status === 'ongoing' && (
                      <div className="alert bg-dark text-white py-1 px-2 mb-2 border-0 d-flex align-items-center rounded-3">
                        <div className="spinner-grow spinner-grow-sm me-2 text-brown-premium" style={{ width: '10px', height: '10px' }}></div>
                        <span className="extra-small fw-bold">Live: In progress</span>
                      </div>
                    )}

                    {appointment.status === 'completed' && (
                      <div className="alert bg-light border-0 py-2 mb-2 d-flex align-items-center rounded-3">
                        <i className="bi bi-check2-all me-2 text-brown-premium fs-5"></i>
                        <small className="text-muted fw-semi-bold">
                          Service completed
                        </small>
                      </div>
                    )}

                    {appointment.status === 'cancelled' && (
                      <div className="alert bg-light py-2 mb-2 border-start border-dark border-3">
                        <small className="text-muted">
                          <i className="bi bi-dash-circle me-1"></i>
                          Session cancelled
                          {appointment.cancellation_reason && (
                            <><br /><span className="extra-small">Reason: {appointment.cancellation_reason}</span></>
                          )}
                        </small>
                      </div>
                    )}

                    {/* Priority Request Status */}
                    {appointment.priority_request_status === 'pending' && (
                      <div className="alert bg-dark text-brown-premium py-2 mb-2 border-0">
                        <small className="fw-bold">
                          <i className="bi bi-stars me-1"></i>
                          Requesting Priority Access...
                        </small>
                      </div>
                    )}
                    {appointment.priority_request_status === 'approved' && appointment.is_urgent && (
                      <div className="alert bg-brown-premium text-white py-2 mb-2 border-0">
                        <small className="fw-bold">
                          <i className="bi bi-lightning-charge-fill me-1"></i>
                          Priority Access Confirmed
                        </small>
                      </div>
                    )}
                    {appointment.priority_request_status === 'rejected' && (
                      <div className="alert bg-light text-muted py-2 mb-2 border-0">
                        <small>
                          <i className="bi bi-info-circle me-1"></i>
                          Priority request unavailable
                        </small>
                      </div>
                    )}

                    {/* Double Booking Details */}
                    {appointment.is_double_booking && appointment.double_booking_data && (
                      <div className="alert alert-info py-2 mb-2">
                        <small>
                          <i className="bi bi-person-plus me-1"></i>
                          <strong>Booked for:</strong> {appointment.double_booking_data.friend_name}
                          {appointment.double_booking_data.friend_email && (
                            <>
                              <br />
                              <i className="bi bi-envelope me-1"></i><strong>Email: </strong>
                              {appointment.double_booking_data.friend_email}
                            </>
                          )}
                          <br />
                          <i className="bi bi-telephone me-1"></i>
                          <strong>Contact:</strong> {appointment.double_booking_data.friend_phone}
                        </small>
                      </div>
                    )}

                    {appointment.notes && (
                      <div className="mb-2">
                        <small className="text-muted">Notes:</small>
                        <p className="small mb-0 bg-light p-2 rounded">{appointment.notes}</p>
                      </div>
                    )}

                    {/* Inline Rating Form for Completed Appointments */}
                    {appointment.status === 'completed' && ratingAppointment?.id === appointment.id && (
                      <div className="mt-3">
                        <RatingForm
                          appointment={appointment}
                          onRatingSubmitted={() => {
                            setRatingAppointment(null);
                            fetchAppointments(); // Refresh to show updated rating
                            setSuccess('Thank you for your rating!');
                          }}
                          onCancel={() => setRatingAppointment(null)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="card-footer bg-transparent">
                    <div className="d-flex justify-content-between align-items-center">
                      {/* Action buttons based on status */}
                      <div className="d-flex gap-2 flex-wrap">
                        {/* Request Priority Button */}
                        {['scheduled', 'confirmed', 'pending'].includes(appointment.status) &&
                          !appointment.is_urgent &&
                          appointment.priority_request_status !== 'approved' && // Don't show if already approved (becomes urgent)
                          (appointment.priority_request_status === null ||
                            appointment.priority_request_status === undefined ||
                            appointment.priority_request_status === '' ||
                            appointment.priority_request_status === 'rejected') && // Allow showing again if rejected
                          appointment.queue_position !== null && (
                            <button
                              className="btn btn-sm btn-brown-premium px-3 rounded-pill fw-bold btn-action-micro"
                              onClick={() => openPriorityRequestModal(appointment)}
                            >
                              <i className="bi bi-lightning-charge-fill me-1"></i>
                              Get Priority
                            </button>
                          )}

                        {matchesStatus(appointment, 'scheduled', 'confirmed') && (
                          <button
                            className="btn btn-sm btn-outline-dark px-3 rounded-pill"
                            onClick={() => handleCancel(appointment)}
                          >
                            <i className="bi bi-x me-1"></i>
                            Cancel
                          </button>
                        )}

                        {appointment.status === 'pending' && (
                          <button
                            className="btn btn-sm btn-outline-dark px-3 rounded-pill"
                            onClick={() => handleCancel(appointment)}
                          >
                            <i className="bi bi-x me-1"></i>
                            Retract Request
                          </button>
                        )}

                        {appointment.status === 'completed' && (
                          <>
                            <button
                              className="btn btn-sm btn-brown-premium px-3 rounded-pill fw-bold btn-action-micro"
                              onClick={() => handleCloneAppointment(appointment)}
                            >
                              <i className="bi bi-arrow-repeat me-1"></i>
                              Rebook
                            </button>
                            {!appointment.is_reviewed ? (
                              <button
                                className="btn btn-sm btn-outline-brown px-3 rounded-pill btn-action-micro"
                                onClick={() => setRatingAppointment(appointment)}
                              >
                                <i className="bi bi-pencil-square me-1"></i>
                                Rate Session
                              </button>
                            ) : (
                              <div className="d-flex align-items-center">
                                <div className="me-2">
                                  {[...Array(5)].map((_, i) => (
                                    <i
                                      key={i}
                                      className={`bi bi-star-fill ${i < (appointment.customer_rating || 0) ? 'text-brown-premium' : 'text-light'
                                        }`}
                                      style={{ fontSize: '0.9rem' }}
                                    ></i>
                                  ))}
                                </div>
                                <small className="text-muted">Rated</small>
                              </div>
                            )}
                          </>
                        )}


                        {appointment.status === 'cancelled' && (
                          <button
                            className="btn btn-sm btn-brown-premium px-3 rounded-pill"
                            onClick={() => handleCloneAppointment(appointment)}
                          >
                            <i className="bi bi-arrow-repeat me-1"></i>
                            Try Again
                          </button>
                        )}

                        {appointment.status === 'ongoing' && (
                          <span className="text-brown-premium fw-bold small">
                            <i className="bi bi-scissors me-1"></i>
                            In Progress
                          </span>
                        )}
                      </div>

                      <small className="text-muted">
                        {new Date(appointment.created_at).toLocaleDateString()}
                      </small>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {getTotalPages() > 1 && (
            <div className="d-flex justify-content-center mt-4">
              <nav aria-label="Appointments pagination">
                <ul className="pagination">
                  <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                    <button
                      className="page-link"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <i className="bi bi-chevron-left"></i>
                    </button>
                  </li>

                  {Array.from({ length: getTotalPages() }, (_, i) => i + 1).map(page => (
                    <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                      <button
                        className="page-link"
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    </li>
                  ))}

                  <li className={`page-item ${currentPage === getTotalPages() ? 'disabled' : ''}`}>
                    <button
                      className="page-link"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === getTotalPages()}
                    >
                      <i className="bi bi-chevron-right"></i>
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          )}

          {/* Pagination Info */}
          {getTotalPages() > 1 && (
            <div className="text-center mt-2">
              <small className="text-muted">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filterAppointmentsByDate(filteredAppointments).length)} of {filterAppointmentsByDate(filteredAppointments).length} appointments
              </small>
            </div>
          )}
        </div>
      )}

      {/* Reschedule/Cancel Modal */}
      <RescheduleCancelModal
        isOpen={modalData.isOpen}
        onClose={handleModalClose}
        appointment={modalData.appointment}
        action={modalData.action}
        onSuccess={handleModalSuccess}
      />

      {/* Priority Request Confirmation Modal */}
      {priorityRequestModal.isOpen && priorityRequestModal.appointment && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title">
                  <i className="bi bi-lightning-fill me-2"></i>
                  Request Priority Service
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closePriorityRequestModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info mb-3">
                  <i className="bi bi-info-circle me-2"></i>
                  <strong>Priority service</strong> moves your appointment to the front of the queue. A ₱100 fee will be applied if approved by the manager.
                </div>

                <div className="card border-0 bg-light mb-3">
                  <div className="card-body">
                    <h6 className="card-title mb-3">Appointment Details</h6>
                    <div className="row g-2">
                      <div className="col-6">
                        <small className="text-muted d-block">Service</small>
                        <strong>{getServicesDisplay(priorityRequestModal.appointment)}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Barber</small>
                        <strong>{priorityRequestModal.appointment.barber?.full_name}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Date</small>
                        <strong>{formatAppointmentDate(priorityRequestModal.appointment.appointment_date)}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Current Position</small>
                        <strong>#{priorityRequestModal.appointment.queue_position}</strong>
                      </div>
                      <div className="col-12">
                        <small className="text-muted d-block">Current Price</small>
                        <strong className="text-success text-end d-block">₱{Number(getTotalPrice(priorityRequestModal.appointment)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card border-warning mb-3">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-1">Priority Fee</h6>
                        <small className="text-muted">Applied if approved</small>
                      </div>
                      <div className="text-end">
                        <h5 className="mb-0 text-warning">+₱100.00</h5>
                      </div>
                    </div>
                    <hr />
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-0">Total (if approved)</h6>
                      </div>
                      <div className="text-end">
                        <h5 className="mb-0 text-success">
                          ₱{(Number(getTotalPrice(priorityRequestModal.appointment)) + 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h5>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="alert alert-warning mb-0">
                  <small>
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    <strong>Note:</strong> Your request will be reviewed by a manager. You will be notified once a decision is made.
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closePriorityRequestModal}
                >
                  <i className="bi bi-x-circle me-1"></i>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={() => handleRequestPriority(priorityRequestModal.appointment.id)}
                >
                  <i className="bi bi-lightning-fill me-1"></i>
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default CustomerAppointments;
