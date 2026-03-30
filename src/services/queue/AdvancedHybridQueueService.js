/**
 * Advanced Hybrid Queue Service
 * 
 * Next-generation queue system that intelligently manages:
 * - Scheduled appointments (fixed time slots)
 * - Queue appointments (walk-ins)
 * - Smart auto-scheduling
 * - Real-time updates
 * - Predictive wait times
 * - Automatic delay handling
 * 
 * @version 2.0.0
 */

import { supabase } from '../../supabaseClient';
import { APPOINTMENT_FIELDS, BOOKING_STATUS, BOOKING_TYPES } from '../../constants/booking.constants';

const ACTIVE_STATUSES = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.SCHEDULED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ONGOING,
  BOOKING_STATUS.COMPLETED
];

class QueueOnlyService {
  constructor() {
    this.managerChannel = null;
    this.customerChannels = new Map();
    this.queueChannels = new Map();
  }

  subscribeToManagerUpdates(callback) {
    if (this.managerChannel) {
      this.managerChannel.unsubscribe();
      this.managerChannel = null;
    }

    this.managerChannel = supabase
      .channel('manager-queue-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        payload => {
          callback?.({
            event: payload.eventType,
            data: payload.new || payload.old
          });
        }
      )
      .subscribe();

    return this.managerChannel;
  }

  unsubscribeFromManagerUpdates() {
    if (this.managerChannel) {
      this.managerChannel.unsubscribe();
      this.managerChannel = null;
    }
  }

  subscribeToCustomerUpdates(customerId, callback) {
    if (!customerId) return null;

    const channelName = `customer-queue-${customerId}`;

    if (this.customerChannels.has(customerId)) {
      const existing = this.customerChannels.get(customerId);
      existing.unsubscribe();
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `customer_id=eq.${customerId}`
        },
        payload => {
          callback?.({
            event: payload.eventType,
            data: payload.new || payload.old
          });
        }
      )
      .subscribe();

    this.customerChannels.set(customerId, channel);
    return channel;
  }

  unsubscribeFromCustomerUpdates(customerId) {
    const channel = this.customerChannels.get(customerId);
    if (channel) {
      channel.unsubscribe();
      this.customerChannels.delete(customerId);
    }
  }

  subscribeToQueue(barberId, date, callback) {
    if (!barberId) return null;

    const subscriptionKey = `${barberId}-${date || 'all'}`;

    if (this.queueChannels.has(subscriptionKey)) {
      const existing = this.queueChannels.get(subscriptionKey);
      existing.unsubscribe();
    }

    const channel = supabase
      .channel(`barber-queue-${subscriptionKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `barber_id=eq.${barberId}`
        },
        async payload => {
          const queueData = await this.getUnifiedQueue(barberId, date);
          callback?.({
            event: payload.eventType,
            queueData
          });
        }
      )
      .subscribe();

    this.queueChannels.set(subscriptionKey, channel);
    return channel;
  }

  unsubscribeFromQueue(subscriptionKey) {
    const channel = this.queueChannels.get(subscriptionKey);
    if (channel) {
      channel.unsubscribe();
      this.queueChannels.delete(subscriptionKey);
    }
  }

  async getUnifiedQueue(barberId, date) {
    try {
      if (!barberId || !date) {
        throw new Error('Barber ID and date are required');
      }

      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:${APPOINTMENT_FIELDS.CUSTOMER_ID}(id, full_name, email, phone),
          service:${APPOINTMENT_FIELDS.SERVICE_ID}(id, name, duration, price)
        `)
        .eq(APPOINTMENT_FIELDS.BARBER_ID, barberId)
        .eq(APPOINTMENT_FIELDS.APPOINTMENT_DATE, date)
        .in(APPOINTMENT_FIELDS.STATUS, ACTIVE_STATUSES)
        .order(APPOINTMENT_FIELDS.CREATED_AT, { ascending: true });

      if (error) throw error;

      const allAppointments = appointments || [];

      const scheduled = allAppointments
        .filter(apt => apt[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] === BOOKING_TYPES.SCHEDULED)
        .sort((a, b) => (a[APPOINTMENT_FIELDS.APPOINTMENT_TIME] || '').localeCompare(b[APPOINTMENT_FIELDS.APPOINTMENT_TIME] || ''));

      const queue = allAppointments
        .filter(apt => apt[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] === BOOKING_TYPES.QUEUE)
        .sort((a, b) => {
          const posA = a[APPOINTMENT_FIELDS.QUEUE_POSITION] || 0;
          const posB = b[APPOINTMENT_FIELDS.QUEUE_POSITION] || 0;
          if (posA === posB) {
            return new Date(a[APPOINTMENT_FIELDS.CREATED_AT] || 0) - new Date(b[APPOINTMENT_FIELDS.CREATED_AT] || 0);
          }
          return posA - posB;
        });

      const timeline = this._buildTimeline(scheduled, queue);
      const current = allAppointments.find(apt => apt[APPOINTMENT_FIELDS.STATUS] === BOOKING_STATUS.ONGOING) || null;

      const stats = {
        scheduled: scheduled.length,
        queue: queue.length,
        pending: allAppointments.filter(apt => apt[APPOINTMENT_FIELDS.STATUS] === BOOKING_STATUS.PENDING).length,
        ongoing: allAppointments.filter(apt => apt[APPOINTMENT_FIELDS.STATUS] === BOOKING_STATUS.ONGOING).length,
        confirmed: allAppointments.filter(apt => apt[APPOINTMENT_FIELDS.STATUS] === BOOKING_STATUS.CONFIRMED).length
      };

      return {
        success: true,
        timeline,
        scheduled,
        queue,
        current,
        stats,
        total: timeline.length,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Queue service error (getUnifiedQueue):', error);
      return {
        success: false,
        error: error.message,
        timeline: [],
        scheduled: [],
        queue: [],
        current: null,
        stats: {},
        total: 0
      };
    }
  }

  async smartInsertAppointment(appointmentData) {
    try {
      const barberId = appointmentData[APPOINTMENT_FIELDS.BARBER_ID] || appointmentData.barber_id;
      const appointmentDate = appointmentData[APPOINTMENT_FIELDS.APPOINTMENT_DATE] || appointmentData.appointment_date;
      const appointmentType = appointmentData[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] || appointmentData.appointment_type || BOOKING_TYPES.QUEUE;
      const totalDuration = appointmentData[APPOINTMENT_FIELDS.TOTAL_DURATION] || appointmentData.total_duration || 30;

      if (!barberId) {
        throw new Error('Barber ID is required');
      }
      if (!appointmentDate) {
        throw new Error('Appointment date is required');
      }
      if (appointmentType !== BOOKING_TYPES.QUEUE) {
        throw new Error('Only queue appointments are supported at this time');
      }

      // Get all queue appointments including pending ones to calculate correct position
      const { data: existingQueue, error: queueError } = await supabase
        .from('appointments')
        .select('queue_position')
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .eq('appointment_type', BOOKING_TYPES.QUEUE)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing']) // Include pending appointments
        .not('queue_position', 'is', null) // Only count appointments with queue positions
        .order('queue_position', { ascending: false })
        .limit(1);

      if (queueError) throw queueError;

      const nextPosition = existingQueue && existingQueue.length && existingQueue[0].queue_position
        ? existingQueue[0].queue_position + 1
        : 1;

      const estimatedWait = Math.max((nextPosition - 1) * totalDuration, 0);
      const customerId = appointmentData[APPOINTMENT_FIELDS.CUSTOMER_ID] || appointmentData.customer_id || null;

      const insertData = {
        customer_id: customerId && customerId !== '' ? customerId : null,
        barber_id: barberId,
        service_id: appointmentData[APPOINTMENT_FIELDS.SERVICE_ID] || appointmentData.service_id || null,
        services_data: appointmentData[APPOINTMENT_FIELDS.SERVICES_DATA] || appointmentData.services_data || [],
        add_ons_data: appointmentData[APPOINTMENT_FIELDS.ADD_ONS_DATA] || appointmentData.add_ons_data || [],
        appointment_date: appointmentDate,
        appointment_time: appointmentData[APPOINTMENT_FIELDS.APPOINTMENT_TIME] || appointmentData.appointment_time || null,
        appointment_type: BOOKING_TYPES.QUEUE,
        priority_level: appointmentData[APPOINTMENT_FIELDS.PRIORITY_LEVEL] || appointmentData.priority_level || 'normal',
        status: appointmentData[APPOINTMENT_FIELDS.STATUS] || BOOKING_STATUS.PENDING,
        total_price: appointmentData[APPOINTMENT_FIELDS.TOTAL_PRICE] || appointmentData.total_price || 0,
        total_duration: totalDuration,
        notes: appointmentData[APPOINTMENT_FIELDS.NOTES] || appointmentData.notes || null,
        is_urgent: appointmentData[APPOINTMENT_FIELDS.IS_URGENT] || appointmentData.is_urgent || false,
        is_walk_in: appointmentData.is_walk_in || false,
        is_double_booking: appointmentData.is_double_booking || false,
        primary_customer_id: appointmentData.primary_customer_id || null,
        double_booking_data: appointmentData.double_booking_data || null,
        queue_position: nextPosition,
        estimated_wait_time: estimatedWait,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('appointments')
        .insert([insertData])
        .select('id, queue_position, appointment_time, estimated_wait_time')
        .single();

      if (error) throw error;

      return {
        success: true,
        appointment_id: data.id,
        position: data.queue_position,
        estimated_time: data.appointment_time,
        estimated_wait_time: data.estimated_wait_time
      };
    } catch (error) {
      console.error('Queue service error (smartInsertAppointment):', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getQueueAnalytics(date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })) {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('status')
        .eq('appointment_date', date)
        .eq('appointment_type', BOOKING_TYPES.QUEUE);

      if (error) throw error;

      const total = data?.length || 0;
      const pending = data?.filter(apt => apt.status === BOOKING_STATUS.PENDING).length || 0;
      const confirmed = data?.filter(apt => apt.status === BOOKING_STATUS.CONFIRMED).length || 0;
      const ongoing = data?.filter(apt => apt.status === BOOKING_STATUS.ONGOING).length || 0;

      return {
        success: true,
        data: {
          date,
          totalQueue: total,
          pending,
          confirmed,
          ongoing
        },
        efficiency: {
          utilization_percent: total ? Math.min(100, Math.round(((confirmed + ongoing) / total) * 100)) : 0
        }
      };
    } catch (error) {
      console.error('Queue service error (getQueueAnalytics):', error);
      return {
        success: false,
        error: error.message,
        data: {},
        efficiency: {}
      };
    }
  }

  async getIntelligentQueueSlots(barberId, date, serviceDuration = 30) {
    try {
      if (!barberId || !date) return [];

      const { data: queueAppointments, error } = await supabase
        .from('appointments')
        .select('total_duration')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .eq('appointment_type', BOOKING_TYPES.QUEUE)
        .in('status', ACTIVE_STATUSES)
        .order('queue_position', { ascending: true });

      if (error) throw error;

      const totalDuration = (queueAppointments || []).reduce((sum, apt) => {
        return sum + (apt.total_duration || serviceDuration);
      }, 0);

      const estimatedWaitMinutes = totalDuration;

      return [
        {
          type: 'queue',
          description: 'Join the queue. Estimated wait time based on current queue length.',
          position: (queueAppointments?.length || 0) + 1,
          estimated_wait: estimatedWaitMinutes,
          priority: 'normal',
          time: null,
          end_time: null,
          before_appointment: null,
          after_appointment: null,
          gap_duration: null,
          efficiency: null
        }
      ];
    } catch (error) {
      console.error('Queue service error (getIntelligentQueueSlots):', error);
      return [];
    }
  }

  _buildTimeline(scheduled, queue) {
    const timeline = [];

    scheduled.forEach((apt, index) => {
      timeline.push({
        ...apt,
        appointment_type: BOOKING_TYPES.SCHEDULED,
        timeline_position: index + 1,
        estimated_time: apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME] || null,
        estimated_end: null,
        wait_time: 0,
        estimated_arrival: apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME] || null,
        type: BOOKING_TYPES.SCHEDULED
      });
    });

    const offset = timeline.length;

    queue.forEach((apt, index) => {
      timeline.push({
        ...apt,
        appointment_type: BOOKING_TYPES.QUEUE,
        timeline_position: offset + index + 1,
        estimated_time: apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME] || null,
        estimated_end: null,
        wait_time: null,
        estimated_arrival: null,
        type: BOOKING_TYPES.QUEUE
      });
    });

    return timeline;
  }
}

export default new QueueOnlyService();
