import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/PushService';

const QueuePriorityManager = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBarber, setSelectedBarber] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('all'); // Add priority filter
  const [barbers, setBarbers] = useState([]);
  const [queueStatus, setQueueStatus] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Priority update modal state
  const [priorityModal, setPriorityModal] = useState({
    isOpen: false,
    appointment: null,
    newPriority: null,
    isLoading: false
  });
  
  // Track updating appointments
  const [updatingAppointments, setUpdatingAppointments] = useState(new Set());

  // Fetch barbers
  const fetchBarbers = async () => {
    try {
      console.log('🔍 Fetching barbers...');
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'barber')
        .order('full_name');

      if (error) throw error;
      console.log('👥 Barbers found:', data?.length || 0, data);
      setBarbers(data || []);
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
          .in('status', ['scheduled', 'pending', 'confirmed', 'ongoing'])
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
            .in('status', ['scheduled', 'pending', 'confirmed', 'ongoing'])
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
          ['scheduled', 'pending', 'ongoing'].includes(apt.status)
        ) || [];
        console.log('✅ Appointments with correct status:', correctStatus.length, correctStatus);
        
        // Check which appointments meet ALL criteria
        const meetsAllCriteria = allAppointments?.filter(apt => 
          apt.queue_position !== null && 
          ['scheduled', 'pending', 'ongoing'].includes(apt.status)
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
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
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

      const urgentFee = 100; // From QUEUE_SETTINGS.URGENT_FEE
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
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
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
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
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
        .in('status', ['scheduled', 'pending', 'confirmed', 'ongoing'])
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
        .in('status', ['scheduled', 'pending', 'confirmed', 'ongoing'])
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
        .in('status', ['scheduled', 'pending', 'confirmed', 'ongoing'])
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
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
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
  const moveUp = async (appointmentId, currentPosition) => {
    if (currentPosition <= 1) return;
    await moveToPosition(appointmentId, currentPosition - 1);
  };

  // Move appointment down in queue
  const moveDown = async (appointmentId, currentPosition) => {
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
    
    // Start time is 8:00 AM (480 minutes from midnight)
    const startTime = 8 * 60; // 8:00 AM in minutes
    let currentTime = startTime;
    
    // Calculate time for all appointments before this one
    for (let i = 1; i < appointment.queue_position; i++) {
      const prevAppointment = allAppointments.find(apt => apt.queue_position === i);
      if (prevAppointment) {
        const duration = prevAppointment.total_duration || 30; // Default 30 minutes
        currentTime += duration;
        
        // Skip lunch break (12:00 PM - 1:00 PM)
        if (currentTime >= 12 * 60 && currentTime < 13 * 60) {
          currentTime = 13 * 60; // Move to 1:00 PM
        }
      }
    }
    
    // Convert minutes back to time format
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
    <div className="container-fluid py-4">
      <div className="row">
        <div className="col">
          <div className="d-flex justify-content-between align-items-center mb-4 p-3 rounded shadow-sm" style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' }}>
            <div>
              <h2 className="mb-1 fw-bold">
                <i className="bi bi-arrow-up-down me-2"></i>
                Queue Priority Manager
              </h2>
              <p className="text-muted mb-0">Manage queue priorities and positions</p>
            </div>
          </div>
          {/* Filters */}
          <div className="card mb-4">
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-2">
                  <label htmlFor="selectedDate" className="form-label">
                    <i className="bi bi-calendar3 me-2"></i>
                    Select Date
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    id="selectedDate"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
                <div className="col-md-2">
                  <label htmlFor="selectedBarber" className="form-label">
                    <i className="bi bi-scissors me-2"></i>
                    Select Barber
                  </label>
                  <select
                    className="form-select"
                    id="selectedBarber"
                    value={selectedBarber}
                    onChange={(e) => setSelectedBarber(e.target.value)}
                  >
                    <option value="">All Barbers</option>
                    {barbers.map(barber => (
                      <option key={barber.id} value={barber.id}>
                        {barber.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-2">
                  <label htmlFor="selectedPriority" className="form-label">
                    <i className="bi bi-flag me-2"></i>
                    Priority Status
                  </label>
                  <select
                    className="form-select"
                    id="selectedPriority"
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                  >
                    <option value="all">All Priorities</option>
                    <option value="urgent">Urgent</option>
                    <option value="normal">Normal</option>
                  </select>
                </div>
                <div className="col-md-3 d-flex align-items-end">
                  <button
                    className="btn btn-primary w-100"
                    onClick={fetchAppointments}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Loading...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-arrow-clockwise me-2"></i>
                        Refresh Queue
                      </>
                    )}
                  </button>
                </div>
                <div className="col-md-3 d-flex align-items-end">
                  <div className="form-check form-switch w-100">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="autoRefreshSwitch"
                      checked={autoRefresh}
                      onChange={() => setAutoRefresh(!autoRefresh)}
                    />
                    <label className="form-check-label" htmlFor="autoRefreshSwitch">
                      <i className="bi bi-arrow-repeat me-2"></i>
                      Auto-refresh (30s)
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Queue Status */}
          {queueStatus && (
            <div className="row mb-4">
              <div className="col-12">
                <div className="card bg-light border-0">
                  <div className="card-body">
                    <h6 className="card-title text-primary mb-3">
                      <i className="bi bi-info-circle me-2"></i>
                      Queue Status
                    </h6>
                    <div className="row g-3">
                      <div className="col-md-2">
                        <div className="text-center p-2 bg-white rounded">
                          <div className="fw-bold text-primary fs-4">{queueStatus.total_in_queue}</div>
                          <small className="text-muted">Total in Queue</small>
                        </div>
                      </div>
                      <div className="col-md-2">
                        <div className="text-center p-2 bg-white rounded">
                          <div className="fw-bold text-success fs-4">{queueStatus.currently_serving}</div>
                          <small className="text-muted">Currently Serving</small>
                        </div>
                      </div>
                      <div className="col-md-2">
                        <div className="text-center p-2 bg-white rounded">
                          <div className="fw-bold text-warning fs-4">{queueStatus.waiting}</div>
                          <small className="text-muted">Waiting</small>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-center p-2 bg-white rounded">
                          <div className="fw-bold text-dark">{queueStatus.next_customer_name || 'None'}</div>
                          <small className="text-muted">Next Customer</small>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <div className="text-center p-2 bg-white rounded">
                          <div className="fw-bold text-info fs-4">{formatWaitTime(queueStatus.estimated_wait_time)}</div>
                          <small className="text-muted">Est. Wait Time</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-danger" role="alert">
              <i className="bi bi-exclamation-triangle me-2"></i>
              {error}
            </div>
          )}

          {/* Priority Statistics */}
          {appointments.length > 0 && (
            <div className="row mb-4">
              <div className="col-md-4">
                <div className="card border-0 bg-primary bg-opacity-10">
                  <div className="card-body">
                    <div className="d-flex align-items-center">
                      <div>
                        <h6 className="card-title text-muted mb-1">Total Appointments</h6>
                        <h3 className="mb-0 text-primary">{appointments.length}</h3>
                      </div>
                      <div className="ms-auto">
                        <i className="bi bi-people-fill text-primary fs-1"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card border-0 bg-danger bg-opacity-10">
                  <div className="card-body">
                    <div className="d-flex align-items-center">
                      <div>
                        <h6 className="card-title text-muted mb-1">Urgent Priority</h6>
                        <h3 className="mb-0 text-danger">
                          {appointments.filter(apt => apt.priority_level === 'urgent').length}
                        </h3>
                      </div>
                      <div className="ms-auto">
                        <i className="bi bi-exclamation-triangle-fill text-danger fs-1"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card border-0 bg-info bg-opacity-10">
                  <div className="card-body">
                    <div className="d-flex align-items-center">
                      <div>
                        <h6 className="card-title text-muted mb-1">Normal Priority</h6>
                        <h3 className="mb-0 text-info">
                          {appointments.filter(apt => (apt.priority_level || 'normal') === 'normal').length}
                        </h3>
                      </div>
                      <div className="ms-auto">
                        <i className="bi bi-circle-fill text-info fs-1"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="alert alert-success alert-dismissible fade show" role="alert">
              <i className="bi bi-check-circle me-2"></i>
              {success}
              <button
                type="button"
                className="btn-close"
                onClick={() => setSuccess('')}
              ></button>
            </div>
          )}

          {/* Pending Priority Requests Alert */}
          {appointments.filter(apt => apt.priority_request_status === 'pending' && !apt.is_urgent).length > 0 && (
            <div className="alert alert-warning mb-4" role="alert">
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <h5 className="alert-heading mb-1">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    Pending Priority Requests
                  </h5>
                  <p className="mb-0">
                    {appointments.filter(apt => apt.priority_request_status === 'pending' && !apt.is_urgent).length} customer(s) have requested priority. Review and approve/reject below.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Queue List */}
          <div className="card">
                <div className="card-header">
                  <h5 className="mb-0">Queue Appointments ({appointments.length})</h5>
                </div>
                <div className="card-body p-0">
                  {loading ? (
                    <div className="text-center py-4">
                      <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : appointments.length === 0 ? (
                    <div className="text-center py-5">
                      <i className="bi bi-queue-list display-1 text-muted mb-3"></i>
                      <h5>No appointments in queue</h5>
                      <p className="text-muted">Select a date to view the queue for that day.</p>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th className="text-center" style={{width: '80px'}}>Queue #</th>
                            <th>Customer</th>
                            <th>Barber</th>
                            <th>Service</th>
                            <th>Estimated Time</th>
                            <th>Status</th>
                            <th className="text-center">Priority Status</th>
                            <th className="text-center">Priority</th>
                            <th className="text-center">Wait Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {appointments.map((appointment, index) => (
                            <tr key={appointment.id}>
                              <td className="text-center">
                                <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold mx-auto" 
                                     style={{width: '40px', height: '40px', fontSize: '16px'}}>
                                  {appointment.queue_position}
                                </div>
                              </td>
                              <td>
                                <div>
                                  <div className="fw-bold">{appointment.customer?.full_name || 'Unknown'}</div>
                                  <small className="text-muted d-block">{appointment.customer?.email}</small>
                                  {appointment.customer?.phone && (
                                    <small className="text-muted d-block">
                                      <i className="bi bi-telephone me-1"></i>
                                      {appointment.customer.phone}
                                    </small>
                                  )}
                                  
                                  {/* Priority Request Status */}
                                  {appointment.priority_request_status === 'pending' && !appointment.is_urgent && (
                                    <div className="mt-2 p-2 bg-warning bg-opacity-10 rounded border border-warning">
                                      <small className="text-warning fw-bold d-block">
                                        <i className="bi bi-clock-history me-1"></i>
                                        Priority Request Pending
                                      </small>
                                      <small className="text-muted d-block">
                                        Requested: {appointment.priority_requested_at ? new Date(appointment.priority_requested_at).toLocaleString() : 'N/A'}
                                      </small>
                                      <div className="mt-2 d-flex gap-1">
                                        <button
                                          className="btn btn-sm btn-success"
                                          onClick={() => approvePriorityRequest(appointment.id)}
                                          disabled={updatingAppointments.has(appointment.id)}
                                          title="Approve (₱100 fee)"
                                        >
                                          {updatingAppointments.has(appointment.id) ? (
                                            <span className="spinner-border spinner-border-sm" role="status"></span>
                                          ) : (
                                            <>
                                              <i className="bi bi-check-circle me-1"></i>
                                              Approve
                                            </>
                                          )}
                                        </button>
                                        <button
                                          className="btn btn-sm btn-danger"
                                          onClick={() => {
                                            const notes = window.prompt('Rejection reason (optional):');
                                            rejectPriorityRequest(appointment.id, notes);
                                          }}
                                          disabled={updatingAppointments.has(appointment.id)}
                                          title="Reject"
                                        >
                                          <i className="bi bi-x-circle me-1"></i>
                                          Reject
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {appointment.priority_request_status === 'approved' && appointment.is_urgent && (
                                    <div className="mt-2 p-2 bg-success bg-opacity-10 rounded border border-success">
                                      <small className="text-success fw-bold d-block">
                                        <i className="bi bi-check-circle me-1"></i>
                                        Priority Approved - ₱100 urgent fee applied
                                      </small>
                                      {appointment.total_price && (
                                        <small className="text-muted d-block mt-1">
                                          Total: ₱{Number(appointment.total_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </small>
                                      )}
                                    </div>
                                  )}
                                  {appointment.priority_request_status === 'rejected' && (
                                    <div className="mt-2">
                                      <small className="text-danger fw-bold d-block">
                                        <i className="bi bi-x-circle me-1"></i>
                                        Priority Rejected
                                      </small>
                                    </div>
                                  )}
                                  
                                  {/* Show friend contact info if it's a "Book for Friend" appointment */}
                                  {(() => {
                                    const bookingType = getBookingType(appointment);
                                    const friendInfo = getFriendInfo(appointment);
                                    
                                    if (bookingType === 'Book for Friend' && friendInfo) {
                                      return (
                                        <div className="mt-2 p-2 bg-info bg-opacity-10 rounded border border-info">
                                          <small className="text-info fw-bold d-block">
                                            <i className="bi bi-person-heart me-1"></i>
                                            Friend: {friendInfo.name}
                                          </small>
                                          <small className="text-muted d-block">
                                            <i className="bi bi-telephone me-1"></i>
                                            {friendInfo.phone}
                                          </small>
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              </td>
                              <td>
                                <div className="fw-medium">{appointment.barber?.full_name || 'Unknown'}</div>
                              </td>
                              <td>
                                <div className="fw-medium">{appointment.service?.name || 'Unknown'}</div>
                                {appointment.service?.duration && (
                                  <small className="text-muted d-block">
                                    {appointment.service.duration} min
                                  </small>
                                )}
                              </td>
                              <td>
                                <div className="fw-medium">{calculateEstimatedTime(appointment, appointments)}</div>
                                {appointment.auto_inserted_at && (
                                  <small className="text-success d-block">
                                    <i className="bi bi-arrow-right-circle me-1"></i>
                                    Auto-inserted
                                  </small>
                                )}
                              </td>
                              <td>
                                <span className={`badge bg-${
                                  appointment.status === 'scheduled' ? 'success' :
                                  appointment.status === 'pending' ? 'warning' :
                                  appointment.status === 'ongoing' ? 'primary' :
                                  'secondary'
                                }`}>
                                  {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                                </span>
                              </td>
                              <td className="text-center">
                                <span className={`badge ${appointment.priority_level === 'urgent' ? 'bg-danger' : 'bg-primary'} fs-6 px-3 py-2`}>
                                  <i className={`bi bi-${appointment.priority_level === 'urgent' ? 'exclamation-triangle-fill' : 'circle-fill'} me-1`}></i>
                                  {appointment.priority_level ? appointment.priority_level.charAt(0).toUpperCase() + appointment.priority_level.slice(1) : 'Normal'}
                                </span>
                              </td>
                              <td>
                                <div className="d-flex flex-column gap-2">
                                  <div className="d-flex gap-1">
                                    <button
                                      className={`btn btn-sm ${appointment.priority_level === 'normal' ? 'btn-primary' : 'btn-outline-primary'} ${updatingAppointments.has(appointment.id) ? 'disabled' : ''}`}
                                      onClick={() => handlePriorityChange(appointment, 'normal')}
                                      disabled={updatingAppointments.has(appointment.id) || appointment.priority_level === 'normal'}
                                      title="Set to Normal Priority"
                                      style={{minWidth: '70px'}}
                                    >
                                      {updatingAppointments.has(appointment.id) && appointment.priority_level === 'normal' ? (
                                        <span className="spinner-border spinner-border-sm" role="status"></span>
                                      ) : (
                                        <>
                                          <i className="bi bi-circle-fill me-1"></i>
                                          Normal
                                        </>
                                      )}
                                    </button>
                                    <button
                                      className={`btn btn-sm ${appointment.priority_level === 'urgent' ? 'btn-danger' : 'btn-outline-danger'} ${updatingAppointments.has(appointment.id) ? 'disabled' : ''}`}
                                      onClick={() => handlePriorityChange(appointment, 'urgent')}
                                      disabled={updatingAppointments.has(appointment.id) || appointment.priority_level === 'urgent'}
                                      title="Set to Urgent Priority"
                                      style={{minWidth: '70px'}}
                                    >
                                      {updatingAppointments.has(appointment.id) && appointment.priority_level === 'urgent' ? (
                                        <span className="spinner-border spinner-border-sm" role="status"></span>
                                      ) : (
                                        <>
                                          <i className="bi bi-exclamation-triangle-fill me-1"></i>
                                          Urgent
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className="text-muted">
                                  {formatWaitTime(appointment.estimated_wait_time)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
        </div>
      </div>

      {/* Priority Update Confirmation Modal */}
      {priorityModal.isOpen && priorityModal.appointment && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className={`bi bi-${priorityModal.newPriority === 'urgent' ? 'exclamation-triangle-fill text-danger' : 'circle-fill text-primary'} me-2`}></i>
                  Update Priority Level
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closePriorityModal}
                  disabled={priorityModal.isLoading}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info">
                  <i className="bi bi-info-circle me-2"></i>
                  Changing priority will automatically reorder the queue.
                </div>
                
                <div className="card mb-3">
                  <div className="card-body">
                    <h6 className="card-title">Appointment Details</h6>
                    <div className="row">
                      <div className="col-6">
                        <small className="text-muted d-block">Customer</small>
                        <strong>{priorityModal.appointment.customer?.full_name || 'Unknown'}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Queue Position</small>
                        <strong>#{priorityModal.appointment.queue_position}</strong>
                      </div>
                    </div>
                    <div className="row mt-2">
                      <div className="col-6">
                        <small className="text-muted d-block">Barber</small>
                        <strong>{priorityModal.appointment.barber?.full_name || 'Unknown'}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Current Priority</small>
                        <span className={`badge ${priorityModal.appointment.priority_level === 'urgent' ? 'bg-danger' : 'bg-primary'}`}>
                          {priorityModal.appointment.priority_level || 'normal'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card border-0 bg-light">
                  <div className="card-body">
                    <h6 className="card-title">Change Priority To:</h6>
                    <div className="d-flex gap-2">
                      <div className={`card flex-fill text-center ${priorityModal.newPriority === 'normal' ? 'border-primary bg-primary bg-opacity-10' : 'border'}`}>
                        <div className="card-body p-3">
                          <i className="bi bi-circle-fill text-primary fs-4"></i>
                          <div className="mt-2 fw-bold">Normal</div>
                          <small className="text-muted">Standard priority</small>
                        </div>
                      </div>
                      <div className={`card flex-fill text-center ${priorityModal.newPriority === 'urgent' ? 'border-danger bg-danger bg-opacity-10' : 'border'}`}>
                        <div className="card-body p-3">
                          <i className="bi bi-exclamation-triangle-fill text-danger fs-4"></i>
                          <div className="mt-2 fw-bold">Urgent</div>
                          <small className="text-muted">High priority</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closePriorityModal}
                  disabled={priorityModal.isLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn ${priorityModal.newPriority === 'urgent' ? 'btn-danger' : 'btn-primary'}`}
                  onClick={confirmPriorityUpdate}
                  disabled={priorityModal.isLoading}
                >
                  {priorityModal.isLoading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Updating...
                    </>
                  ) : (
                    <>
                      <i className={`bi bi-${priorityModal.newPriority === 'urgent' ? 'exclamation-triangle-fill' : 'check-circle-fill'} me-2`}></i>
                      Update to {priorityModal.newPriority.charAt(0).toUpperCase() + priorityModal.newPriority.slice(1)}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QueuePriorityManager;
