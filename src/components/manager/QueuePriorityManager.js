import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/notifications/PushService';
import { QUEUE_SETTINGS } from '../../constants/booking.constants';

const LoadingSpinner = () => (
  <div className="d-flex flex-column align-items-center justify-content-center p-5">
    <div className="spinner-border text-dark mb-3" role="status" style={{ width: '3rem', height: '3rem', borderWidth: '0.2rem' }}>
      <span className="visually-hidden">Loading...</span>
    </div>
    <div className="fw-800 text-muted small text-uppercase letter-spacing-1">Updating Queue...</div>
  </div>
);

const QueuePriorityManager = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBarber, setSelectedBarber] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [barbers, setBarbers] = useState([]);
  const [queueStatus, setQueueStatus] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Premium Styles
  const styles = {
    container: {
      padding: windowWidth < 576 ? '1.5rem 1rem' : '2rem 1.5rem',
      backgroundColor: '#fcfcfc',
      minHeight: '100vh',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    },
    headerCard: {
      background: '#fff',
      padding: '1.25rem',
      borderRadius: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
      border: '1px solid #f0f0f0',
      marginBottom: '1.5rem',
      display: 'flex',
      flexDirection: windowWidth < 650 ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: windowWidth < 650 ? 'stretch' : 'center',
      gap: '1rem'
    },
    card: {
      backgroundColor: '#fff',
      padding: '1.25rem',
      borderRadius: '24px',
      border: '1px solid #eee',
      marginBottom: '1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden'
    },
    statCard: {
      backgroundColor: '#fff',
      padding: '1.5rem',
      borderRadius: '24px',
      border: '1px solid #eee',
      boxShadow: '0 4px 15px rgba(0,0,0,0.02)',
      height: '100%',
      transition: 'transform 0.3s ease',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    },
    badge: (priority) => {
      const colors = {
        urgent: { bg: '#FFEBEE', text: '#B71C1C' },
        normal: { bg: '#E3F2FD', text: '#0D47A1' },
        high: { bg: '#FFF3E0', text: '#E65100' }
      };
      const color = colors[priority] || { bg: '#f5f5f5', text: '#666' };
      return {
        padding: '0.4rem 0.8rem',
        borderRadius: '10px',
        fontSize: '0.7rem',
        fontWeight: '700',
        backgroundColor: color.bg,
        color: color.text,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      };
    },
    statusBadge: (status) => {
      const colors = {
        pending: { bg: '#FFF3E0', text: '#E65100' },
        confirmed: { bg: '#E3F2FD', text: '#0D47A1' },
        ongoing: { bg: '#F3E5F5', text: '#7B1FA2' },
        completed: { bg: '#E8F5E9', text: '#1B5E20' },
        cancelled: { bg: '#FFEBEE', text: '#B71C1C' }
      };
      const color = colors[status] || { bg: '#f5f5f5', text: '#666' };
      return {
        padding: '0.3rem 0.6rem',
        borderRadius: '8px',
        fontSize: '0.65rem',
        fontWeight: '700',
        backgroundColor: color.bg,
        color: color.text,
        textTransform: 'uppercase'
      };
    },
    primaryBtn: {
      backgroundColor: '#1a1a1a',
      color: '#fff',
      border: 'none',
      padding: '0.8rem 1.25rem',
      borderRadius: '16px',
      fontWeight: '600',
      fontSize: '0.9rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.6rem',
      transition: 'all 0.3s'
    },
    secondaryBtn: {
      backgroundColor: '#f5f5f5',
      color: '#1a1a1a',
      border: 'none',
      padding: '0.5rem 0.8rem',
      borderRadius: '12px',
      fontWeight: '600',
      fontSize: '0.8rem',
      transition: 'all 0.2s',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(8px)',
      zIndex: 1060,
      display: 'flex',
      alignItems: windowWidth < 576 ? 'flex-end' : 'center',
      justifyContent: 'center',
    },
    modalContent: {
      width: '100%',
      maxWidth: windowWidth < 576 ? '100%' : '500px',
      backgroundColor: '#fff',
      borderRadius: windowWidth < 576 ? '32px 32px 0 0' : '28px',
      boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
      maxHeight: windowWidth < 576 ? '92vh' : '90vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: windowWidth < 576 ? 'slideUp 0.4s cubic-bezier(0, 0, 0.2, 1)' : 'scaleIn 0.3s ease-out'
    }
  };

  // Priority update modal state
  const [priorityModal, setPriorityModal] = useState({
    isOpen: false,
    appointment: null,
    newPriority: 'normal',
    isLoading: false
  });

  // Track updating appointments
  const [updatingAppointments, setUpdatingAppointments] = useState(new Set());

  // Get currently ongoing appointment
  const ongoingAppointment = appointments.find(apt => apt.status === 'ongoing');

  // Fetch barbers
  const fetchBarbers = async () => {
    try {
      console.log('🔍 Fetching barbers...');
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'barber')
        .neq('archived', true)
        .order('full_name');

      if (error) throw error;
      console.log('👥 Active barbers found:', data?.length || 0, data);
      setBarbers(data || []);
      
      // Auto-select first barber if none selected
      if (data && data.length > 0 && !selectedBarber) {
        setSelectedBarber(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching barbers:', error);
    }
  };

  // Fetch appointments for the selected date and barber
  const fetchAppointments = async () => {
    if (!selectedDate) return;

    setLoading(true);
    try {
      console.log('🔍 Fetching appointments for:', { selectedDate, selectedBarber });

      // Try query with priority request fields first, fallback to base fields if columns don't exist
      let query;
      let data, error;

      try {
        // Try with priority request fields
        query = supabase
          .from('appointments')
          .select(`
            id,
            customer_id,
            barber_id,
            appointment_date,
            appointment_time,
            status,
            queue_position,
            priority_level,
            estimated_wait_time,
            auto_inserted_at,
            manager_adjusted_at,
            created_at,
            total_duration,
            services_data,
            add_ons_data,
            is_double_booking,
            double_booking_data,
            is_urgent,
            total_price,
            priority_request_status,
            priority_requested_at,
            priority_request_notes,
            customer:customer_id(full_name, email, phone),
            barber:barber_id(full_name),
            service:service_id(name, duration)
          `);

        if (selectedBarber) {
          query = query.eq('barber_id', selectedBarber);
        }

        if (selectedPriority !== 'all') {
          query = query.eq('priority_level', selectedPriority);
        }

        query = query
          .eq('appointment_date', selectedDate)
          .in('status', ['confirmed', 'pending', 'ongoing', 'completed', 'scheduled'])
          .not('queue_position', 'is', null)
          .order('queue_position', { ascending: true })
          .order('estimated_wait_time', { ascending: true });

        const result = await query;
        data = result.data;
        error = result.error;

        // If error is about missing columns, retry without priority request fields
        if (error && error.message && error.message.includes('column') && error.message.includes('does not exist')) {
          console.warn('Priority request columns not found. Using base query. Run migration: scripts/add-priority-request-feature.sql');

          query = supabase
            .from('appointments')
            .select(`
              id,
              customer_id,
              barber_id,
              appointment_date,
              appointment_time,
              status,
              queue_position,
              priority_level,
              estimated_wait_time,
              auto_inserted_at,
              manager_adjusted_at,
              created_at,
              total_duration,
              services_data,
              add_ons_data,
              is_double_booking,
              double_booking_data,
              is_urgent,
              total_price,
              customer:customer_id(full_name, email, phone),
              barber:barber_id(full_name),
              service:service_id(name, duration)
            `);

          if (selectedBarber) {
            query = query.eq('barber_id', selectedBarber);
          }

          if (selectedPriority !== 'all') {
            query = query.eq('priority_level', selectedPriority);
          }

          query = query
            .eq('appointment_date', selectedDate)
            .in('status', ['confirmed', 'pending', 'confirmed', 'ongoing'])
            .not('queue_position', 'is', null)
            .order('queue_position', { ascending: true })
            .order('estimated_wait_time', { ascending: true });

          const retryResult = await query;
          data = retryResult.data;
          error = retryResult.error;
        }
      } catch (err) {
        error = err;
      }

      // Check if we got an error
      if (error) throw error;

      console.log('📊 Appointments found:', data?.length || 0, data);

      // Sort appointments by queue_position first, then by estimated_wait_time
      // This ensures urgent appointments (which are at the top of queue) show first
      const sortedData = (data || []).sort((a, b) => {
        // First sort by queue_position
        if (a.queue_position !== b.queue_position) {
          return (a.queue_position || 999) - (b.queue_position || 999);
        }
        // Then by estimated_wait_time
        return (a.estimated_wait_time || 999) - (b.estimated_wait_time || 999);
      });

      // Debug: Check for friend booking data
      if (sortedData && sortedData.length > 0) {
        console.log('🔍 Checking for friend booking data...');
        sortedData.forEach((apt, index) => {
          console.log(`Appointment ${index + 1}:`, {
            id: apt.id,
            customer_name: apt.customer?.full_name,
            queue_position: apt.queue_position,
            estimated_wait_time: apt.estimated_wait_time,
            priority_level: apt.priority_level,
            is_double_booking: apt.is_double_booking,
            double_booking_data: apt.double_booking_data,
            double_booking_data_type: typeof apt.double_booking_data
          });
        });
      }

      setAppointments(sortedData);

      // Test the functions with actual data
      if (data && data.length > 0) {
        console.log('🧪 Testing booking type and friend info functions...');
        data.forEach((apt, index) => {
          const bookingType = getBookingType(apt);
          const friendInfo = getFriendInfo(apt);
          console.log(`Test ${index + 1}:`, {
            customer: apt.customer?.full_name,
            bookingType,
            friendInfo,
            hasFriendData: !!friendInfo
          });
        });
      }

      // Also fetch all appointments for debugging (without queue_position filter)
      const { data: allAppointments, error: allError } = await supabase
        .from('appointments')
        .select('id, appointment_date, status, queue_position, barber_id, appointment_time')
        .eq('appointment_date', selectedDate);

      if (!allError) {
        console.log('📋 All appointments for date:', allAppointments?.length || 0, allAppointments);

        // Check which appointments have queue_position
        const withQueuePosition = allAppointments?.filter(apt => apt.queue_position !== null) || [];
        console.log('🎯 Appointments with queue_position:', withQueuePosition.length, withQueuePosition);

        // Check which appointments have correct status
        const correctStatus = allAppointments?.filter(apt =>
          ['confirmed', 'pending', 'ongoing'].includes(apt.status)
        ) || [];
        console.log('✅ Appointments with correct status:', correctStatus.length, correctStatus);

        // Check which appointments meet ALL criteria
        const meetsAllCriteria = allAppointments?.filter(apt =>
          apt.queue_position !== null &&
          ['confirmed', 'pending', 'ongoing'].includes(apt.status)
        ) || [];
        console.log('🎯 Appointments meeting ALL criteria:', meetsAllCriteria.length, meetsAllCriteria);

        // Check if we have the required related data
        console.log('🔍 Checking related data...');
        const { data: customers } = await supabase.from('users').select('id').eq('role', 'customer').limit(1);
        const { data: barbers } = await supabase.from('users').select('id').eq('role', 'barber').limit(1);
        const { data: services } = await supabase.from('services').select('id').limit(1);
        console.log('👥 Customers available:', customers?.length || 0);
        console.log('👨‍💼 Barbers available:', barbers?.length || 0);
        console.log('🔧 Services available:', services?.length || 0);
      }

      // Fetch queue status if barber is selected
      if (selectedBarber) {
        await fetchQueueStatus(selectedBarber);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
      // Check if error is due to missing columns
      if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
        setError('Database columns missing. Please run the SQL migration: scripts/add-priority-request-feature.sql');
      } else {
        setError(`Failed to fetch appointments: ${error.message || JSON.stringify(error)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch queue status for selected barber
  const fetchQueueStatus = async (barberId) => {
    try {
      const { data, error } = await supabase
        .rpc('get_barber_queue_status', {
          p_barber_id: barberId,
          p_appointment_date: selectedDate
        });

      if (error) throw error;
      setQueueStatus(data?.[0] || null);
    } catch (error) {
      console.error('Error fetching queue status:', error);
    }
  };

  // Open priority update modal
  const openPriorityModal = (appointment, newPriority) => {
    setPriorityModal({
      isOpen: true,
      appointment,
      newPriority,
      isLoading: false
    });
  };

  // Close priority update modal
  const closePriorityModal = () => {
    setPriorityModal({
      isOpen: false,
      appointment: null,
      newPriority: null,
      isLoading: false
    });
  };

  // Update queue priority
  const updateQueuePriority = async (appointmentId, newPriority) => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) return;

      // Add to updating set
      setUpdatingAppointments(prev => new Set(prev).add(appointmentId));

      const { error } = await supabase
        .from('appointments')
        .update({
          priority_level: newPriority,
          manager_adjusted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Reorder queue based on new priority
      // If updating to urgent, pass the appointment ID so it can be placed at the top
      await reorderQueueByPriority(
        appointment.barber_id,
        appointment.appointment_date,
        newPriority === 'urgent' ? appointmentId : null // Pass appointment ID if updating to urgent
      );

      // Send notification to customer about priority change
      try {
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        await centralizedNotificationService.createNotification({
          userId: appointment.customer_id,
          title: 'Queue Priority Updated',
          message: `Your appointment priority has been updated to ${newPriority}. Your position in the queue may have changed.`,
          type: 'queue_priority_update',
          category: 'queue_update',
          priority: 'normal',
          channels: ['app', 'push'],
          data: {
            appointment_id: appointmentId,
            new_priority: newPriority,
            barber_name: appointment.barber?.full_name
          },
          appointmentId: appointmentId
        });
      } catch (pushError) {
        console.warn('Failed to send priority update notification:', pushError);
      }

      setSuccess(`Priority updated to ${newPriority.charAt(0).toUpperCase() + newPriority.slice(1)}`);
      closePriorityModal();
      // Wait a moment for database to update wait times, then refresh
      setTimeout(() => {
        fetchAppointments();
      }, 500);
    } catch (error) {
      console.error('Error updating priority:', error);
      setError('Failed to update queue priority');
      closePriorityModal();
    } finally {
      setUpdatingAppointments(prev => {
        const newSet = new Set(prev);
        newSet.delete(appointmentId);
        return newSet;
      });
    }
  };

  // Handle priority change with confirmation
  const handlePriorityChange = (appointment, newPriority) => {
    if (appointment.priority_level === newPriority) return;
    openPriorityModal(appointment, newPriority);
  };

  // Confirm priority update
  const confirmPriorityUpdate = async () => {
    if (!priorityModal.appointment || !priorityModal.newPriority) return;

    setPriorityModal(prev => ({ ...prev, isLoading: true }));
    await updateQueuePriority(priorityModal.appointment.id, priorityModal.newPriority);
  };

  // Approve priority request (apply fee and activate priority)
  const approvePriorityRequest = async (appointmentId) => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) return;

      setUpdatingAppointments(prev => new Set(prev).add(appointmentId));

      const urgentFee = QUEUE_SETTINGS.URGENT_FEE || 100;
      const newTotalPrice = (appointment.total_price || 0) + urgentFee;

      // Update appointment: approve request, apply fee, activate priority
      const { error } = await supabase
        .from('appointments')
        .update({
          priority_request_status: 'approved',
          priority_level: 'urgent',
          is_urgent: true,
          total_price: newTotalPrice,
          manager_adjusted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Reorder queue with this appointment as newly urgent
      await reorderQueueByPriority(
        appointment.barber_id,
        appointment.appointment_date,
        appointmentId
      );

      // Send notification to customer
      try {
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        await centralizedNotificationService.createNotification({
          userId: appointment.customer_id,
          title: 'Priority Request Approved',
          message: `Your priority request has been approved. A ₱${urgentFee} fee has been applied and your appointment is now urgent.`,
          type: 'priority_request_approved',
          category: 'queue_update',
          priority: 'high',
          channels: ['app', 'push'],
          data: {
            appointment_id: appointmentId,
            fee_applied: urgentFee,
            new_total_price: newTotalPrice,
            barber_name: appointment.barber?.full_name
          },
          appointmentId: appointmentId
        });
      } catch (notifError) {
        console.warn('Failed to send approval notification:', notifError);
      }

      setSuccess(`Priority request approved. ₱${urgentFee} fee applied.`);
      setTimeout(() => {
        fetchAppointments();
      }, 500);
    } catch (error) {
      console.error('Error approving priority request:', error);
      setError('Failed to approve priority request');
    } finally {
      setUpdatingAppointments(prev => {
        const newSet = new Set(prev);
        newSet.delete(appointmentId);
        return newSet;
      });
    }
  };

  // Reject priority request
  const rejectPriorityRequest = async (appointmentId, notes = '') => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) return;

      setUpdatingAppointments(prev => new Set(prev).add(appointmentId));

      // Update appointment: reject request
      const { error } = await supabase
        .from('appointments')
        .update({
          priority_request_status: 'rejected',
          priority_request_notes: notes || null,
          manager_adjusted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Send notification to customer
      try {
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        await centralizedNotificationService.createNotification({
          userId: appointment.customer_id,
          title: 'Priority Request Declined',
          message: `Your priority request has been declined. Your appointment will remain at normal priority.`,
          type: 'priority_request_rejected',
          category: 'queue_update',
          priority: 'normal',
          channels: ['app', 'push'],
          data: {
            appointment_id: appointmentId,
            barber_name: appointment.barber?.full_name,
            notes: notes
          },
          appointmentId: appointmentId
        });
      } catch (notifError) {
        console.warn('Failed to send rejection notification:', notifError);
      }

      setSuccess('Priority request rejected.');
      setTimeout(() => {
        fetchAppointments();
      }, 500);
    } catch (error) {
      console.error('Error rejecting priority request:', error);
      setError('Failed to reject priority request');
    } finally {
      setUpdatingAppointments(prev => {
        const newSet = new Set(prev);
        newSet.delete(appointmentId);
        return newSet;
      });
    }
  };

  // Calculate accurate wait times based on queue position and status
  const calculateAccurateWaitTimes = async (barberId, appointmentDate) => {
    try {
      // Get all appointments in queue with their details
      const { data: queueAppointments, error } = await supabase
        .from('appointments')
        .select('id, queue_position, priority_level, status, total_duration, appointment_time')
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .in('status', ['confirmed', 'pending', 'confirmed', 'ongoing'])
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: true });

      if (error) throw error;

      // Find ongoing appointment
      const ongoingAppointment = queueAppointments.find(apt => apt.status === 'ongoing');

      // Calculate wait times for each appointment
      const waitTimeUpdates = [];
      let cumulativeDuration = 0;

      for (const appointment of queueAppointments) {
        let waitTime = null;

        // Skip ongoing appointment (it's being served)
        if (appointment.status === 'ongoing') {
          waitTime = 0; // Already being served
        } else {
          // Check if this is the next appointment after ongoing (should be 0 wait time if urgent and confirmed)
          const nextPositionAfterOngoing = ongoingAppointment ? (ongoingAppointment.queue_position || 0) + 1 : 1;
          const isNextInLine = appointment.queue_position === nextPositionAfterOngoing;

          // If urgent confirmed and next in line, wait time is 0
          const isUrgentConfirmedNext =
            appointment.priority_level === 'urgent' &&
            appointment.status === 'confirmed' &&
            isNextInLine;

          if (isUrgentConfirmedNext) {
            // Urgent confirmed appointment that's next in line gets 0 wait time
            waitTime = 0;
          } else {
            // Calculate wait time based on appointments ahead
            // Find all appointments before this one (excluding ongoing)
            const appointmentsAhead = queueAppointments.filter(apt =>
              apt.queue_position < appointment.queue_position &&
              apt.status !== 'ongoing' // Don't count ongoing as wait time
            );

            // Sum up durations of appointments ahead
            let totalWaitMinutes = 0;
            for (const aheadApt of appointmentsAhead) {
              const duration = aheadApt.total_duration || 30;
              totalWaitMinutes += duration;
              // Add buffer time between appointments
              totalWaitMinutes += 5; // 5 minute buffer between appointments
            }

            // If there's an ongoing appointment and this is not next in line, add remaining time
            if (ongoingAppointment && !isNextInLine) {
              const ongoingDuration = ongoingAppointment.total_duration || 30;
              // Estimate remaining time (assuming appointment started recently)
              // For simplicity, use half the duration as remaining time
              const estimatedRemaining = Math.max(0, Math.floor(ongoingDuration * 0.5));
              totalWaitMinutes += estimatedRemaining;
            }

            waitTime = Math.max(0, totalWaitMinutes); // Ensure non-negative
          }
        }

        waitTimeUpdates.push({
          id: appointment.id,
          estimated_wait_time: waitTime
        });
      }

      // Update wait times in database
      for (const update of waitTimeUpdates) {
        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            estimated_wait_time: update.estimated_wait_time,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id);

        if (updateError) {
          console.error(`Error updating wait time for appointment ${update.id}:`, updateError);
        }
      }

      console.log('✅ Wait times calculated and updated:', waitTimeUpdates.length, 'appointments');
      return waitTimeUpdates;
    } catch (error) {
      console.error('Error calculating accurate wait times:', error);
      throw error;
    }
  };

  // Reorder queue based on priority levels
  const reorderQueueByPriority = async (barberId, appointmentDate, newlyUrgentAppointmentId = null) => {
    try {
      // Get all appointments in queue for this barber and date
      const { data: queueAppointments, error } = await supabase
        .from('appointments')
        .select('id, queue_position, priority_level, appointment_time, created_at, status, total_duration')
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .in('status', ['confirmed', 'pending', 'confirmed', 'ongoing'])
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: true });

      if (error) throw error;

      // Find the currently ongoing appointment
      const ongoingAppointment = queueAppointments.find(apt => apt.status === 'ongoing');

      // Separate appointments by priority
      const urgentAppointments = queueAppointments.filter(apt =>
        apt.priority_level === 'urgent' && apt.status !== 'ongoing'
      );
      const normalAppointments = queueAppointments.filter(apt =>
        (apt.priority_level !== 'urgent' || !apt.priority_level) && apt.status !== 'ongoing'
      );

      // If there's a newly urgent appointment, place it at the top of urgent list
      if (newlyUrgentAppointmentId) {
        const newlyUrgentIndex = urgentAppointments.findIndex(apt => apt.id === newlyUrgentAppointmentId);
        if (newlyUrgentIndex !== -1) {
          // Remove from current position
          const newlyUrgent = urgentAppointments.splice(newlyUrgentIndex, 1)[0];
          // Place at the beginning of urgent list
          urgentAppointments.unshift(newlyUrgent);
        }
      }

      // Rebuild queue positions
      let newPosition = 1;
      const updates = [];

      // First, place ongoing appointment if it exists
      if (ongoingAppointment) {
        updates.push({
          id: ongoingAppointment.id,
          queue_position: newPosition
        });
        newPosition++;
      }

      // Then place urgent appointments (newly urgent will be first)
      for (const apt of urgentAppointments) {
        updates.push({
          id: apt.id,
          queue_position: newPosition
        });
        newPosition++;
      }

      // Finally, place normal appointments
      for (const apt of normalAppointments) {
        updates.push({
          id: apt.id,
          queue_position: newPosition
        });
        newPosition++;
      }

      // Execute all updates
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            queue_position: update.queue_position,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id);

        if (updateError) throw updateError;
      }

      // Calculate and update accurate wait times based on new queue positions
      await calculateAccurateWaitTimes(barberId, appointmentDate);

    } catch (error) {
      console.error('Error reordering queue by priority:', error);
      throw error;
    }
  };

  // Move appointment to specific position in queue
  const moveToPosition = async (appointmentId, newPosition) => {
    try {
      const appointment = appointments.find(apt => apt.id === appointmentId);
      if (!appointment) return;

      const currentPosition = appointment.queue_position;
      if (currentPosition === newPosition) return;

      // Get all appointments for this barber and date
      const { data: allAppointments, error: fetchError } = await supabase
        .from('appointments')
        .select('id, queue_position')
        .eq('barber_id', appointment.barber_id)
        .eq('appointment_date', appointment.appointment_date)
        .in('status', ['confirmed', 'pending', 'confirmed', 'ongoing'])
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: true });

      if (fetchError) throw fetchError;

      // Create updates array
      const updates = [];

      if (newPosition < currentPosition) {
        // Moving up - shift others down
        for (const apt of allAppointments) {
          if (apt.queue_position >= newPosition && apt.queue_position < currentPosition && apt.id !== appointmentId) {
            updates.push({
              id: apt.id,
              queue_position: apt.queue_position + 1
            });
          }
        }
      } else {
        // Moving down - shift others up
        for (const apt of allAppointments) {
          if (apt.queue_position > currentPosition && apt.queue_position <= newPosition && apt.id !== appointmentId) {
            updates.push({
              id: apt.id,
              queue_position: apt.queue_position - 1
            });
          }
        }
      }

      // Add the moved appointment
      updates.push({
        id: appointmentId,
        queue_position: newPosition
      });

      // Execute all updates
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            queue_position: update.queue_position,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.id);

        if (updateError) throw updateError;
      }

      // Recalculate wait times after moving appointment
      await calculateAccurateWaitTimes(appointment.barber_id, appointment.appointment_date);

      // Send notification to customer about position change
      try {
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        await centralizedNotificationService.createQueuePositionNotification({
          userId: appointment.customer_id,
          appointmentId: appointmentId,
          queuePosition: newPosition,
          reason: 'Position updated by manager',
          barberName: appointment.barber?.full_name
        });
      } catch (pushError) {
        console.warn('Failed to send position update notification:', pushError);
      }

      setSuccess(`Appointment moved to position #${newPosition}`);
      setTimeout(() => {
        fetchAppointments();
      }, 500);
    } catch (error) {
      console.error('Error moving appointment:', error);
      setError('Failed to move appointment');
    }
  };

  // Move appointment up in queue
  const moveUp = async (appointmentId) => {
    const appointment = appointments.find(a => a.id === appointmentId);
    if (!appointment) return;
    const currentPosition = appointment.queue_position;
    if (currentPosition <= (ongoingAppointment ? 2 : 1)) return;
    await moveToPosition(appointmentId, currentPosition - 1);
  };

  // Move appointment down in queue
  const moveDown = async (appointmentId) => {
    const appointment = appointments.find(a => a.id === appointmentId);
    if (!appointment) return;
    const currentPosition = appointment.queue_position;
    const maxPosition = Math.max(...appointments.map(apt => apt.queue_position));
    if (currentPosition >= maxPosition) return;
    await moveToPosition(appointmentId, currentPosition + 1);
  };

  // Process scheduled appointments for queue insertion
  const processScheduledAppointments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .rpc('process_scheduled_appointments_for_queue');

      if (error) throw error;

      setSuccess(`Processed ${data} scheduled appointments for queue insertion`);
      fetchAppointments();
    } catch (error) {
      console.error('Error processing scheduled appointments:', error);
      setError('Failed to process scheduled appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBarbers();
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [selectedDate, selectedBarber, selectedPriority]);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchAppointments();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, selectedDate, selectedBarber, selectedPriority]);

  const formatTime = (timeString) => {
    if (!timeString) return 'Queue-based';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatWaitTime = (minutes) => {
    if (minutes === null || minutes === undefined) return 'N/A';
    if (minutes === 0) return '0 min'; // Next in line
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Calculate actual estimated time based on queue position and service duration
  const calculateEstimatedTime = (appointment, allAppointments) => {
    if (!appointment.queue_position) return 'N/A';

    // Get current time safely
    const now = new Date();
    const isToday = selectedDate === now.toISOString().split('T')[0];

    // Start time is 8:00 AM (480 minutes from midnight)
    const openingTime = 8 * 60;

    // For today, the 'baseline' is the current time or opening time, whichever is later
    let baselineTime = openingTime;
    if (isToday) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
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

    let currentTime = baselineTime;
    const buffer = 5; // 5 minute buffer between appointments

    // Calculate time for all appointments before this one
    const sortedAppointments = [...allAppointments].sort((a, b) =>
      (a.queue_position || 999) - (b.queue_position || 999)
    );

    for (const apt of sortedAppointments) {
      if (apt.queue_position < appointment.queue_position) {
        // If there's an ongoing appointment, we don't know exactly when it ends, 
        // but we can estimate based on duration
        const duration = apt.total_duration || 30;
        currentTime += (duration + buffer);

        // Skip lunch break (12:00 PM - 1:00 PM)
        if (currentTime >= 12 * 60 && currentTime < 13 * 60) {
          currentTime = 13 * 60;
        }
      }
    }

    const hours = Math.floor(currentTime / 60);
    const minutes = currentTime % 60;
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const ampm = hours >= 12 ? 'PM' : 'AM';

    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  // Determine booking type and get friend info
  const getBookingType = (appointment) => {
    console.log('🔍 Checking booking type for appointment:', appointment.id, {
      is_double_booking: appointment.is_double_booking,
      double_booking_data: appointment.double_booking_data
    });

    if (appointment.is_double_booking) {
      console.log('✅ Found is_double_booking flag');
      return 'Book for Friend';
    }
    if (appointment.double_booking_data) {
      // Check if it's already an object or needs parsing
      let data = appointment.double_booking_data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
          console.log('📋 Parsed double_booking_data for type check:', data);
        } catch (e) {
          console.error('❌ Error parsing double_booking_data for type:', e);
          return 'Single Booking';
        }
      } else {
        console.log('📋 double_booking_data is already an object:', data);
      }

      if (data && (data.book_for_friend || data.friend_name)) {
        console.log('✅ Found friend booking in data');
        return 'Book for Friend';
      }
    }
    console.log('❌ No friend booking found, returning Single Booking');
    return 'Single Booking';
  };

  // Get friend contact information
  const getFriendInfo = (appointment) => {
    console.log('🔍 Checking friend info for appointment:', appointment.id, appointment.double_booking_data);

    if (appointment.double_booking_data) {
      // Check if it's already an object or needs parsing
      let data = appointment.double_booking_data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
          console.log('📋 Parsed double_booking_data:', data);
        } catch (e) {
          console.error('❌ Error parsing double_booking_data:', e);
          return null;
        }
      } else {
        console.log('📋 double_booking_data is already an object:', data);
      }

      if (data && data.friend_name) {
        const friendInfo = {
          name: data.friend_name,
          phone: data.friend_phone || 'No phone',
          email: data.friend_email || 'No email'
        };
        console.log('✅ Friend info found:', friendInfo);
        return friendInfo;
      }
    }

    console.log('❌ No friend info found');
    return null;
  };

  const getPriorityBadgeClass = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-danger';
      case 'normal': return 'bg-primary';
      default: return 'bg-primary';
    }
  };

  return (
    <div style={styles.container}>
      {/* Header Section */}
      <div style={styles.headerCard}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
            <i className="bi bi-arrow-up-down me-2" style={{ color: '#1a1a1a' }}></i>
            Queue Priority Manager
          </h2>
          <p className="text-muted small mb-0">Manage queue tiers and appointment positions</p>
        </div>
        <div className="d-flex gap-2">
            <button 
                style={styles.primaryBtn} 
                className="touch-btn"
                onClick={fetchAppointments}
                disabled={loading}
            >
                {loading ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-arrow-clockwise"></i>}
                <span className="d-none d-sm-inline">REFRESH QUEUE</span>
            </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger rounded-4 border-0 shadow-sm d-flex align-items-center mb-4">
          <i className="bi bi-exclamation-circle-fill me-2"></i>
          <span className="small fw-bold">{error}</span>
          <button className="btn-close ms-auto" onClick={() => setError('')}></button>
        </div>
      )}

      {success && (
        <div className="alert alert-success rounded-4 border-0 shadow-sm d-flex align-items-center mb-4">
          <i className="bi bi-check-circle-fill me-2"></i>
          <span className="small fw-bold">{success}</span>
          <button className="btn-close ms-auto" onClick={() => setSuccess('')}></button>
        </div>
      )}

      {/* Priority Statistics Summary */}
      <div className="row g-3 mb-4">
          <div className="col-md-4">
            <div style={styles.statCard} className="hover-lift">
              <div className="text-muted small fw-bold text-uppercase mb-1">Total in Queue</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1a1a1a' }}>
                  {appointments.length}
              </div>
              <div className="small text-muted mt-1">Live current appointments</div>
            </div>
          </div>
          <div className="col-md-4">
            <div style={styles.statCard} className="hover-lift">
              <div className="text-muted small fw-bold text-uppercase mb-1">Urgent Tier</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#B71C1C' }}>
                 {appointments.filter(apt => apt.priority_level === 'urgent').length}
              </div>
              <div className="small text-muted mt-1">Requiring immediate attention</div>
            </div>
          </div>
          <div className="col-md-4">
            <div style={styles.statCard} className="hover-lift">
              <div className="text-muted small fw-bold text-uppercase mb-1">Pending Requests</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#E65100' }}>
                {appointments.filter(apt => apt.priority_request_status === 'pending' && !apt.is_urgent).length}
              </div>
              <div className="small text-muted mt-1">User requested priority upgrades</div>
            </div>
          </div>
      </div>

      {/* Modern Filters & Queue Status */}
      <div style={styles.card}>
        <div className="row g-3 align-items-center">
          <div className="col-md-3">
            <label className="text-muted small fw-bold mb-1 text-uppercase">Queue Date</label>
            <input 
              type="date" 
              className="form-control rounded-4 bg-light border-0" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="text-muted small fw-bold mb-1 text-uppercase">Assigned Barber</label>
            <select 
              className="form-select rounded-4 bg-light border-0" 
              value={selectedBarber}
              onChange={(e) => setSelectedBarber(e.target.value)}
            >
              {barbers.length === 0 && <option value="">No Active Barbers</option>}
              {barbers.map(barber => (
                <option key={barber.id} value={barber.id}>{barber.full_name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="text-muted small fw-bold mb-1 text-uppercase">Priority Filter</label>
            <select 
              className="form-select rounded-4 bg-light border-0" 
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent Tier</option>
              <option value="normal">Normal Tier</option>
            </select>
          </div>
          {queueStatus && (
              <div className="col-md-3">
                  <div className="p-3 bg-light rounded-4 border d-flex justify-content-between align-items-center">
                      <div>
                          <div className="text-muted" style={{ fontSize: '0.65rem', fontWeight: '800' }}>EST. WAIT</div>
                          <div className="fw-800" style={{ color: '#0D47A1' }}>{formatWaitTime(queueStatus.estimated_wait_time)}</div>
                      </div>
                      <div className="text-end">
                          <div className="text-muted" style={{ fontSize: '0.65rem', fontWeight: '800' }}>SERVING</div>
                          <div className="fw-800">{queueStatus.currently_serving || 0}</div>
                      </div>
                  </div>
              </div>
          )}
        </div>
      </div>

      {/* Queue Appointments List */}
      <div style={styles.card} className="p-0 overflow-hidden mt-4">
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h5 className="mb-0 fw-800">Queue List</h5>
          <span className="badge rounded-pill bg-light text-dark border px-3 py-2 fw-bold" style={{ fontSize: '0.7rem' }}>
            {appointments.length} TOTAL APPOINTMENTS
          </span>
        </div>

        <div className="table-responsive premium-scroll">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr style={{ borderBottom: '2px solid #f8f9fa' }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#888', fontWeight: '800', width: '80px' }}>POS</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#888', fontWeight: '800' }}>CUSTOMER</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#888', fontWeight: '800' }}>BARBER / SERVICE</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#888', fontWeight: '800' }}>TIME & WAIT</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#888', fontWeight: '800', textAlign: 'center' }}>TIER</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#888', fontWeight: '800', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center py-5"><LoadingSpinner /></td></tr>
              ) : appointments.length === 0 ? (
                <tr>
                   <td colSpan="6" className="text-center py-5">
                      <i className="bi bi-inbox text-muted opacity-25" style={{ fontSize: '3rem' }}></i>
                      <p className="text-muted fw-bold mt-2">No active queue appointments</p>
                   </td>
                </tr>
              ) : (
                appointments.map((appointment) => {
                  const friendInfo = getFriendInfo(appointment);
                  const isOngoing = appointment.status === 'ongoing';
                  
                  return (
                    <tr key={appointment.id} style={{ transition: 'all 0.2s', backgroundColor: isOngoing ? '#f0f7ff' : 'transparent' }}>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div className={`d-flex align-items-center justify-content-center fw-800 rounded-circle`} 
                             style={{ 
                               width: '32px', 
                               height: '32px', 
                               fontSize: '0.85rem',
                               background: isOngoing ? '#0D47A1' : '#f5f5f5',
                               color: isOngoing ? '#fff' : '#1a1a1a',
                               border: isOngoing ? 'none' : '1px solid #eee'
                             }}>
                          {appointment.queue_position}
                        </div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div className="d-flex align-items-center gap-3">
                          <div className="avatar-placeholder rounded-circle bg-light d-flex align-items-center justify-content-center fw-bold text-muted border" style={{ width: '40px', height: '40px', flexShrink: 0 }}>
                            {appointment.customer?.full_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <div className="fw-800 text-dark" style={{ fontSize: '0.95rem' }}>{appointment.customer?.full_name || 'Walk-in Guest'}</div>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{appointment.customer?.phone || 'No phone'}</div>
                            
                            {friendInfo && (
                                <div className="mt-1 d-inline-flex align-items-center gap-1 bg-info bg-opacity-10 text-info px-2 py-0.5 rounded-pill" style={{ fontSize: '0.65rem', fontWeight: '700' }}>
                                    <i className="bi bi-person-fill"></i> BOOKED FOR: {friendInfo.name}
                                </div>
                            )}

                            {appointment.priority_request_status === 'pending' && !appointment.is_urgent && (
                                <div className="mt-2 d-flex flex-column gap-2 p-2 bg-warning bg-opacity-10 border border-warning border-opacity-25 rounded-3">
                                    <div className="text-warning fw-800" style={{ fontSize: '0.65rem' }}>
                                        <i className="bi bi-lightning-charge-fill"></i> PRIORITY REQUESTED
                                    </div>
                                    <div className="d-flex gap-1">
                                        <button 
                                            className="btn btn-xs btn-success w-100 rounded-2 py-1 fw-800" 
                                            style={{ fontSize: '0.6rem' }}
                                            onClick={() => approvePriorityRequest(appointment.id)}
                                            disabled={updatingAppointments.has(appointment.id)}
                                        >APPROVE</button>
                                        <button 
                                            className="btn btn-xs btn-danger w-100 rounded-2 py-1 fw-800" 
                                            style={{ fontSize: '0.6rem' }}
                                            onClick={() => {
                                                const notes = window.prompt('Rejection reason:');
                                                if (notes !== null) rejectPriorityRequest(appointment.id, notes);
                                            }}
                                            disabled={updatingAppointments.has(appointment.id)}
                                        >DECLINE</button>
                                    </div>
                                </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div className="fw-700 text-dark" style={{ fontSize: '0.85rem' }}>{appointment.barber?.full_name || 'Any Barber'}</div>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{appointment.service?.name || 'Standard Service'}</div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div className="d-flex flex-column">
                            <div className="fw-800" style={{ fontSize: '0.85rem', color: '#1a1a1a' }}>{calculateEstimatedTime(appointment, appointments)}</div>
                            <div className="d-flex align-items-center gap-1 mt-1">
                                <span className={`status-dot ${isOngoing ? 'serving' : 'waiting'}`}></span>
                                <span className="text-muted fw-700" style={{ fontSize: '0.65rem' }}>
                                    {isOngoing ? 'CURRENTLY SERVING' : `EST. WAIT: ${formatWaitTime(appointment.estimated_wait_time)}`}
                                </span>
                            </div>
                        </div>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'center' }}>
                         <span style={styles.badge(appointment.priority_level || 'normal')}>
                            {appointment.priority_level || 'normal'}
                         </span>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <div className="d-flex gap-2 justify-content-end">
                            {appointment.priority_level !== 'urgent' ? (
                                <button 
                                    style={{ ...styles.secondaryBtn, color: '#B71C1C', background: '#FFEBEE' }} 
                                    className="touch-btn" 
                                    title="Upgrade to Urgent"
                                    onClick={() => handlePriorityChange(appointment, 'urgent')}
                                    disabled={updatingAppointments.has(appointment.id)}
                                >
                                    <i className="bi bi-lightning-fill"></i>
                                </button>
                            ) : (
                                <button 
                                    style={{ ...styles.secondaryBtn, color: '#0D47A1', background: '#E3F2FD' }} 
                                    className="touch-btn" 
                                    title="Downgrade to Normal"
                                    onClick={() => handlePriorityChange(appointment, 'normal')}
                                    disabled={updatingAppointments.has(appointment.id)}
                                >
                                    <i className="bi bi-arrow-down-circle"></i>
                                </button>
                            )}
                            
                            {/* Position Controls (Simplified) */}
                            <div className="d-flex bg-light rounded-3 p-1">
                                <button 
                                    className="btn btn-xs p-1" 
                                    disabled={appointment.queue_position <= (ongoingAppointment ? 2 : 1) || updatingAppointments.has(appointment.id)}
                                    onClick={() => moveUp(appointment.id)}
                                >
                                    <i className="bi bi-chevron-up"></i>
                                </button>
                                <button 
                                    className="btn btn-xs p-1"
                                    disabled={appointment.queue_position >= appointments.length || updatingAppointments.has(appointment.id)}
                                    onClick={() => moveDown(appointment.id)}
                                >
                                    <i className="bi bi-chevron-down"></i>
                                </button>
                            </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Priority Update Modal */}
      {priorityModal.isOpen && priorityModal.appointment && (
        <div style={styles.modalOverlay} onClick={closePriorityModal}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h5 className="mb-0 fw-800">Update Queue Tier</h5>
                <p className="text-muted small mb-0">Re-order queue by changing tier</p>
              </div>
              <button className="btn-close" onClick={closePriorityModal}></button>
            </div>
            
            <div className="p-4 premium-scroll" style={{ overflowY: 'auto' }}>
                <div className="d-flex align-items-center gap-3 mb-4 p-3 bg-light rounded-4 border">
                    <div className="avatar-placeholder rounded-circle bg-white d-flex align-items-center justify-content-center fw-bold text-muted border" style={{ width: '50px', height: '50px' }}>
                        {priorityModal.appointment.customer?.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                        <div className="fw-800 fs-5">{priorityModal.appointment.customer?.full_name || 'Customer'}</div>
                        <div className="badge rounded-pill bg-white text-dark border px-2 py-1 small fw-bold">
                            CURRENT POSITION: #{priorityModal.appointment.queue_position}
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                  <label className="text-muted small fw-bold mb-3 d-block text-uppercase">Select New Tier</label>
                  <div className="row g-3">
                    <div className="col-6">
                      <div 
                        className={`p-3 rounded-4 border text-center touch-btn cursor-pointer transition-all ${priorityModal.newPriority === 'normal' ? 'border-primary bg-primary bg-opacity-10' : 'bg-white'}`}
                        onClick={() => setPriorityModal(prev => ({ ...prev, newPriority: 'normal' }))}
                        style={{ cursor: 'pointer' }}
                      >
                        <i className={`bi bi-circle-fill fs-3 mb-2 d-block ${priorityModal.newPriority === 'normal' ? 'text-primary' : 'text-muted opacity-25'}`}></i>
                        <div className="fw-800">NORMAL</div>
                        <small className="text-muted">Standard Queue</small>
                      </div>
                    </div>
                    <div className="col-6">
                      <div 
                        className={`p-3 rounded-4 border text-center touch-btn cursor-pointer transition-all ${priorityModal.newPriority === 'urgent' ? 'border-danger bg-danger bg-opacity-10' : 'bg-white'}`}
                        onClick={() => setPriorityModal(prev => ({ ...prev, newPriority: 'urgent' }))}
                        style={{ cursor: 'pointer' }}
                      >
                        <i className={`bi bi-lightning-charge-fill fs-3 mb-2 d-block ${priorityModal.newPriority === 'urgent' ? 'text-danger' : 'text-muted opacity-25'}`}></i>
                        <div className="fw-800">URGENT</div>
                        <small className="text-muted">High Priority</small>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="alert alert-info rounded-4 border-0 small py-3 px-3 d-flex gap-2">
                    <i className="bi bi-info-circle-fill"></i>
                    <div>Changing the tier will automatically shift other appointments to maintain queue integrity. The customer will be notified.</div>
                </div>
            </div>

            <div className="p-4 border-top">
              <button 
                style={styles.primaryBtn} 
                className="w-100 touch-btn"
                onClick={confirmPriorityUpdate}
                disabled={priorityModal.isLoading}
              >
                {priorityModal.isLoading ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-check2-circle"></i>}
                CONFIRM TIER UPDATE
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .fw-800 { font-weight: 800; }
        .fw-700 { font-weight: 700; }
        .touch-btn:active { transform: scale(0.96); }
        .hover-lift:hover { transform: translateY(-3px); }
        .cursor-pointer { cursor: pointer; }
        .transition-all { transition: all 0.2s ease; }
        
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
        }
        .status-dot.serving { background-color: #4CAF50; box-shadow: 0 0 8px #4CAF50; animation: blink 1.5s infinite; }
        .status-dot.waiting { background-color: #888; }
        
        @keyframes blink {
            0% { opacity: 1; }
            50% { opacity: 0.4; }
            100% { opacity: 1; }
        }

        .table-hover tbody tr:hover {
          background-color: #fcfcfc !important;
          transform: scale(1.002);
        }
        .premium-scroll::-webkit-scrollbar { width: 4px; }
        .premium-scroll::-webkit-scrollbar-thumb { background: #eee; border-radius: 10px; }
        
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .btn-xs {
            padding: 0.2rem 0.4rem;
            font-size: 0.7rem;
        }

        @media (max-width: 575.98px) {
          .modal-dialog {
            display: flex !important;
            align-items: flex-end !important;
            margin: 0 !important;
            height: 100% !important;
          }
        }
      `}</style>
    </div>
  );
};

export default QueuePriorityManager;
