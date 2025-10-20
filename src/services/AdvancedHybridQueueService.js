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

import { supabase } from '../supabaseClient';
import { APPOINTMENT_FIELDS, BOOKING_STATUS, BOOKING_TYPES, PRIORITY_LEVELS } from '../constants/booking.constants';

class AdvancedHybridQueueService {
  constructor() {
    this.WORK_START = '08:00'; // 8:00 AM - Start of morning session
    this.WORK_END = '17:00';   // 5:00 PM - End of afternoon session
    this.LUNCH_START = '12:00'; // 12:00 PM (Noon) - End of morning session
    this.LUNCH_END = '13:00';   // 1:00 PM - Start of afternoon session
    this.SLOT_INTERVAL = 30; // minutes
    this.BUFFER_TIME = 0; // minutes between appointments (removed 5-minute gap)
    this.subscriptions = new Map(); // Real-time subscriptions
  }

  // ============================================================================
  // CORE: GET UNIFIED QUEUE (Scheduled + Queue Merged)
  // ============================================================================

  /**
   * Get unified queue that intelligently merges scheduled and queue appointments
   * 
   * @param {string} barberId - Barber UUID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Unified queue data
   */
  async getUnifiedQueue(barberId, date) {
    try {
      console.log('🔄 [Advanced Hybrid] Getting unified queue:', { barberId, date });

      // Fetch all appointments
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:${APPOINTMENT_FIELDS.CUSTOMER_ID}(id, full_name, email, phone),
          barber:${APPOINTMENT_FIELDS.BARBER_ID}(id, full_name),
          service:${APPOINTMENT_FIELDS.SERVICE_ID}(id, name, duration, price)
        `)
        .eq(APPOINTMENT_FIELDS.BARBER_ID, barberId)
        .eq(APPOINTMENT_FIELDS.APPOINTMENT_DATE, date)
        .in(APPOINTMENT_FIELDS.STATUS, [
          BOOKING_STATUS.PENDING,
          BOOKING_STATUS.SCHEDULED,
          BOOKING_STATUS.CONFIRMED,
          BOOKING_STATUS.ONGOING
        ])
        .order(APPOINTMENT_FIELDS.CREATED_AT, { ascending: true });

      if (error) throw error;

      // Separate by type
      const scheduled = appointments.filter(apt => 
        apt[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] === BOOKING_TYPES.SCHEDULED
      );
      const queue = appointments.filter(apt => 
        apt[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] === BOOKING_TYPES.QUEUE
      );

      // Build unified timeline
      const timeline = await this.buildUnifiedTimeline(scheduled, queue, date);

      // Calculate stats
      const stats = this.calculateQueueStats(timeline, date);

      // Get current appointment
      const current = timeline.find(apt => 
        apt[APPOINTMENT_FIELDS.STATUS] === BOOKING_STATUS.ONGOING
      );

      return {
        success: true,
        timeline,
        scheduled,
        queue,
        current,
        stats,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ [Advanced Hybrid] Error getting unified queue:', error);
      return {
        success: false,
        error: error.message,
        timeline: [],
        scheduled: [],
        queue: [],
        current: null,
        stats: {}
      };
    }
  }

  // ============================================================================
  // BUILD UNIFIED TIMELINE (Smart Merge)
  // ============================================================================

  /**
   * Builds a unified timeline that intelligently merges scheduled and queue appointments
   * 
   * Algorithm:
   * 1. Sort scheduled appointments by time
   * 2. Insert queue appointments in available slots
   * 3. Calculate estimated times for all
   * 4. Handle priority levels
   * 5. Auto-adjust for delays
   */
  async buildUnifiedTimeline(scheduled, queue, date) {
    const timeline = [];
    let currentTime = this.timeToMinutes(this.WORK_START);
    const workEnd = this.timeToMinutes(this.WORK_END);
    const lunchStart = this.timeToMinutes(this.LUNCH_START);
    const lunchEnd = this.timeToMinutes(this.LUNCH_END);

    // Sort scheduled by time
    const sortedScheduled = [...scheduled].sort((a, b) => {
      const timeA = a[APPOINTMENT_FIELDS.APPOINTMENT_TIME] || '00:00';
      const timeB = b[APPOINTMENT_FIELDS.APPOINTMENT_TIME] || '00:00';
      return this.timeToMinutes(timeA) - this.timeToMinutes(timeB);
    });

    // Sort queue by priority and position
    const sortedQueue = [...queue].sort((a, b) => {
      // Priority first (urgent = 0, normal = 1, low = 2)
      const priorityA = this.getPriorityWeight(a[APPOINTMENT_FIELDS.PRIORITY_LEVEL]);
      const priorityB = this.getPriorityWeight(b[APPOINTMENT_FIELDS.PRIORITY_LEVEL]);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Then by queue position
      const posA = a[APPOINTMENT_FIELDS.QUEUE_POSITION] || 999;
      const posB = b[APPOINTMENT_FIELDS.QUEUE_POSITION] || 999;
      return posA - posB;
    });

    let queueIndex = 0;
    let position = 1;

    // First, add all queue appointments starting from work start time
    while (queueIndex < sortedQueue.length) {
      // Check for lunch break - skip if current time is during lunch
      if (currentTime >= lunchStart && currentTime < lunchEnd) {
        console.log(`🕐 Skipping lunch break period: ${this.LUNCH_BREAK.start} - ${this.LUNCH_BREAK.end}`);
        currentTime = lunchEnd;
        continue;
      }

      // Check if we've reached work end time
      if (currentTime >= workEnd) {
        break;
      }

      const queueApt = sortedQueue[queueIndex];
      const duration = queueApt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30;

      // Check if appointment fits in remaining work time
      if (currentTime + duration <= workEnd) {
        const estimatedTime = this.minutesToTime(currentTime);
        const estimatedEnd = this.minutesToTime(currentTime + duration);
        
        timeline.push({
          ...queueApt,
          estimated_time: estimatedTime,
          estimated_end: estimatedEnd,
          timeline_position: position++,
          wait_time: this.calculateWaitTime(currentTime, queueApt),
          estimated_arrival: this.calculateEstimatedArrivalTime(timeline, position - 1),
          type: 'queue',
          can_start: true
        });
        currentTime += duration + this.BUFFER_TIME;
        queueIndex++;
      } else {
        break; // Can't fit in remaining time
      }
    }

    // Then add scheduled appointments at their specific times
    for (const scheduledApt of sortedScheduled) {
      const scheduledTime = this.timeToMinutes(scheduledApt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]);

      // Add scheduled appointment
      const scheduledDuration = scheduledApt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30;
      
      // Adjust start time if we're behind schedule
      const adjustedStart = Math.max(currentTime, scheduledTime);
      
      timeline.push({
        ...scheduledApt,
        estimated_time: this.minutesToTime(adjustedStart),
        estimated_end: this.minutesToTime(adjustedStart + scheduledDuration),
        timeline_position: position++,
        wait_time: adjustedStart > scheduledTime ? (adjustedStart - scheduledTime) : 0,
        delay_minutes: adjustedStart > scheduledTime ? (adjustedStart - scheduledTime) : 0,
        type: 'scheduled',
        can_start: currentTime >= scheduledTime,
        is_delayed: adjustedStart > scheduledTime
      });

      currentTime = adjustedStart + scheduledDuration + this.BUFFER_TIME;

      // Check for lunch break after scheduled appointment
      if (currentTime >= lunchStart && currentTime < lunchEnd) {
        console.log(`🕐 Moving to after lunch break after scheduled appointment`);
        currentTime = lunchEnd;
      }
    }

    // Add remaining queue appointments
    while (queueIndex < sortedQueue.length && currentTime < workEnd) {
      // Check for lunch break - skip if current time is during lunch
      if (currentTime >= lunchStart && currentTime < lunchEnd) {
        console.log(`🕐 Skipping lunch break for remaining queue appointments`);
        currentTime = lunchEnd;
        continue;
      }

      const queueApt = sortedQueue[queueIndex];
      const duration = queueApt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30;

      if (currentTime + duration <= workEnd) {
        const estimatedTime = this.minutesToTime(currentTime);
        const estimatedEnd = this.minutesToTime(currentTime + duration);
        
        timeline.push({
          ...queueApt,
          estimated_time: estimatedTime,
          estimated_end: estimatedEnd,
          timeline_position: position++,
          wait_time: this.calculateWaitTime(currentTime, queueApt),
          estimated_arrival: this.calculateEstimatedArrivalTime(timeline, position - 1),
          type: 'queue',
          can_start: true
        });
        currentTime += duration + this.BUFFER_TIME;
        queueIndex++;
      } else {
        // Can't fit today - mark as overflow
        timeline.push({
          ...sortedQueue[queueIndex],
          estimated_time: null,
          estimated_end: null,
          timeline_position: position++,
          wait_time: null,
          type: 'queue',
          can_start: false,
          overflow: true,
          message: 'May need to reschedule to next available day'
        });
        queueIndex++;
      }
    }

    return timeline;
  }

  // ============================================================================
  // SMART QUEUE INSERTION
  // ============================================================================

  /**
   * Intelligently insert a new appointment into the queue
   * 
   * @param {Object} appointmentData - New appointment data
   * @returns {Promise<Object>} Insertion result with position and estimated time
   */
  async smartInsertAppointment(appointmentData) {
    try {
      const { barber_id, appointment_date, appointment_type, priority_level, total_duration } = appointmentData;

      console.log('🎯 [Smart Insert] Inserting appointment:', appointmentData);

      // Validate required fields
      if (!barber_id) {
        throw new Error('Barber ID is required');
      }
      if (!appointment_date) {
        throw new Error('Appointment date is required');
      }
      if (!appointment_type) {
        throw new Error('Appointment type is required');
      }
      if (!total_duration) {
        throw new Error('Total duration is required');
      }

      // Get current queue state
      const queueState = await this.getUnifiedQueue(barber_id, appointment_date);

      if (!queueState.success) {
        throw new Error('Failed to get queue state');
      }

      // Determine insertion point
      let insertionPoint;
      let estimatedTime;

      if (appointment_type === BOOKING_TYPES.SCHEDULED) {
        // Scheduled: Use specified time
        insertionPoint = this.findScheduledPosition(queueState.timeline, appointmentData);
        estimatedTime = appointmentData[APPOINTMENT_FIELDS.APPOINTMENT_TIME];
      } else {
        // Queue: Find best position based on priority
        insertionPoint = this.findQueuePosition(queueState.timeline, priority_level);
        estimatedTime = this.calculateEstimatedTime(queueState.timeline, insertionPoint, total_duration);
      }

      // Check for conflicts only for scheduled appointments
      if (appointment_type === BOOKING_TYPES.SCHEDULED) {
        const hasConflict = await this.checkForConflicts(
          barber_id,
          appointment_date,
          estimatedTime,
          total_duration
        );

        if (hasConflict) {
          return {
            success: false,
            error: 'Time slot conflict detected',
            suggested_times: await this.suggestAlternativeTimes(barber_id, appointment_date, total_duration)
          };
        }
      }

      // Calculate queue position and estimated wait time
      const queuePosition = await this.calculateQueuePosition(barber_id, appointment_date, appointment_type, priority_level);
      const estimatedWaitTime = await this.calculateEstimatedWaitTime(barber_id, appointment_date, total_duration);

      // Convert standardized field names to database column names
      const insertData = {
        customer_id: appointmentData[APPOINTMENT_FIELDS.CUSTOMER_ID],
        barber_id: appointmentData[APPOINTMENT_FIELDS.BARBER_ID],
        service_id: appointmentData[APPOINTMENT_FIELDS.SERVICE_ID],
        services_data: appointmentData[APPOINTMENT_FIELDS.SERVICES_DATA],
        add_ons_data: appointmentData[APPOINTMENT_FIELDS.ADD_ONS_DATA],
        appointment_date: appointmentData[APPOINTMENT_FIELDS.APPOINTMENT_DATE],
        appointment_time: appointmentData[APPOINTMENT_FIELDS.APPOINTMENT_TIME],
        appointment_type: appointmentData[APPOINTMENT_FIELDS.APPOINTMENT_TYPE],
        priority_level: appointmentData[APPOINTMENT_FIELDS.PRIORITY_LEVEL],
        status: appointmentData[APPOINTMENT_FIELDS.STATUS],
        total_price: appointmentData[APPOINTMENT_FIELDS.TOTAL_PRICE],
        total_duration: appointmentData[APPOINTMENT_FIELDS.TOTAL_DURATION],
        notes: appointmentData[APPOINTMENT_FIELDS.NOTES],
        is_urgent: appointmentData[APPOINTMENT_FIELDS.IS_URGENT],
        is_double_booking: appointmentData.is_double_booking,
        primary_customer_id: appointmentData.primary_customer_id,
        double_booking_data: appointmentData.double_booking_data || (appointmentData[APPOINTMENT_FIELDS.BOOK_FOR_FRIEND] ? {
          friend_name: appointmentData[APPOINTMENT_FIELDS.FRIEND_NAME],
          friend_phone: appointmentData[APPOINTMENT_FIELDS.FRIEND_PHONE],
          booked_by: appointmentData[APPOINTMENT_FIELDS.CUSTOMER_ID]
        } : null),
        queue_position: queuePosition,
        estimated_wait_time: estimatedWaitTime,
        created_at: new Date().toISOString()
      };

      console.log('📤 [Smart Insert] Inserting data:', insertData);

      const { data: newAppointment, error } = await supabase
        .from('appointments')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      // Reorder queue if necessary
      if (appointment_type === BOOKING_TYPES.QUEUE && priority_level === PRIORITY_LEVELS.URGENT) {
        await this.reorderQueue(barber_id, appointment_date, newAppointment.id);
      }

      // Notify affected appointments
      await this.notifyQueueChanges(barber_id, appointment_date, insertionPoint);

      return {
        success: true,
        appointment_id: newAppointment.id,
        position: appointment_type === BOOKING_TYPES.SCHEDULED ? insertionPoint : null, // Only return position for scheduled appointments
        estimated_time: appointment_type === BOOKING_TYPES.SCHEDULED ? estimatedTime : null, // Only return estimated time for scheduled appointments
        message: appointment_type === BOOKING_TYPES.SCHEDULED ? 
          `Appointment scheduled for ${estimatedTime}` : 
          `Appointment request submitted and pending barber approval`
      };

    } catch (error) {
      console.error('❌ [Smart Insert] Error:', error);
      console.error('❌ [Smart Insert] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        appointmentData: appointmentData
      });
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        details: error.details || null
      };
    }
  }

  // ============================================================================
  // REAL-TIME QUEUE UPDATES
  // ============================================================================

  /**
   * Subscribe to real-time queue updates
   * 
   * @param {string} barberId - Barber UUID
   * @param {string} date - Date
   * @param {Function} callback - Callback function for updates
   * @returns {Object} Subscription object
   */
  subscribeToQueue(barberId, date, callback) {
    const subscriptionKey = `${barberId}-${date}`;

    // Unsubscribe if already subscribed
    if (this.subscriptions.has(subscriptionKey)) {
      this.unsubscribeFromQueue(subscriptionKey);
    }

    console.log('📡 [Real-time] Subscribing to queue:', subscriptionKey);

    const subscription = supabase
      .channel(`queue:${subscriptionKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `${APPOINTMENT_FIELDS.BARBER_ID}=eq.${barberId}`
        },
        async (payload) => {
          console.log('🔔 [Real-time] Queue update:', payload);

          // Fetch fresh queue data
          const queueData = await this.getUnifiedQueue(barberId, date);

          // Call callback with updated data
          callback({
            event: payload.eventType,
            appointment: payload.new || payload.old,
            queueData
          });
        }
      )
      .subscribe();

    this.subscriptions.set(subscriptionKey, subscription);

    return subscription;
  }

  /**
   * Unsubscribe from queue updates
   */
  unsubscribeFromQueue(subscriptionKey) {
    const subscription = this.subscriptions.get(subscriptionKey);
    
    if (subscription) {
      supabase.removeChannel(subscription);
      this.subscriptions.delete(subscriptionKey);
      console.log('📴 [Real-time] Unsubscribed from:', subscriptionKey);
    }
  }

  // ============================================================================
  // AUTO-ADJUSTMENT FOR DELAYS
  // ============================================================================

  /**
   * Automatically adjust queue when appointments run late
   * 
   * @param {string} barberId - Barber UUID
   * @param {string} date - Date
   * @param {number} delayMinutes - Delay in minutes
   * @returns {Promise<Object>} Adjustment result
   */
  async autoAdjustForDelay(barberId, date, delayMinutes) {
    try {
      console.log(`⏰ [Auto-Adjust] Adjusting for ${delayMinutes} min delay`);

      // Get current queue
      const { timeline } = await this.getUnifiedQueue(barberId, date);

      // Find appointments that need adjustment (future appointments)
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const adjustments = [];

      for (const apt of timeline) {
        if (!apt.estimated_time) continue;

        const aptTime = this.timeToMinutes(apt.estimated_time);

        if (aptTime > currentMinutes) {
          const newTime = this.minutesToTime(aptTime + delayMinutes);

          adjustments.push({
            id: apt.id,
            old_time: apt.estimated_time,
            new_time: newTime,
            customer_id: apt[APPOINTMENT_FIELDS.CUSTOMER_ID]
          });
        }
      }

      // Apply adjustments
      for (const adj of adjustments) {
        await supabase
          .from('appointments')
          .update({ estimated_time: adj.new_time })
          .eq('id', adj.id);

        // Notify customer
        await this.notifyCustomerOfDelay(adj.customer_id, adj.old_time, adj.new_time);
      }

      return {
        success: true,
        adjusted_count: adjustments.length,
        adjustments
      };

    } catch (error) {
      console.error('❌ [Auto-Adjust] Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  timeToMinutes(time) {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  getPriorityWeight(priority) {
    const weights = {
      [PRIORITY_LEVELS.URGENT]: 0,
      [PRIORITY_LEVELS.VIP]: 0,
      'high': 1,
      [PRIORITY_LEVELS.NORMAL]: 2,
      'low': 3
    };
    return weights[priority] || 2;
  }

  calculateWaitTime(estimatedMinutes, appointment) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // If estimated time is in the past, return 0
    if (estimatedMinutes <= currentTime) {
      return 0;
    }
    
    // Calculate wait time from now to estimated time
    return Math.max(0, estimatedMinutes - currentTime);
  }

  calculateEstimatedArrivalTime(timeline, position) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // If position is 1 and no current appointment, estimate immediate start
    if (position === 1) {
      const currentApt = timeline.find(apt => apt[APPOINTMENT_FIELDS.STATUS] === BOOKING_STATUS.ONGOING);
      if (!currentApt) {
        return this.minutesToTime(currentTime);
      }
    }
    
    // Calculate based on timeline position
    let estimatedTime = currentTime;
    
    // Add duration of all appointments before this position
    for (let i = 0; i < position - 1; i++) {
      const apt = timeline[i];
      if (apt) {
        const duration = apt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30;
        estimatedTime += duration + this.BUFFER_TIME;
      }
    }
    
    // Add current appointment duration if ongoing
    const currentApt = timeline.find(apt => apt[APPOINTMENT_FIELDS.STATUS] === BOOKING_STATUS.ONGOING);
    if (currentApt && position > 1) {
      const currentDuration = currentApt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30;
      estimatedTime += currentDuration + this.BUFFER_TIME;
    }
    
    return this.minutesToTime(estimatedTime);
  }

  calculateQueueStats(timeline, date) {
    const total = timeline.length;
    const completed = timeline.filter(apt => 
      apt[APPOINTMENT_FIELDS.STATUS] === BOOKING_STATUS.DONE
    ).length;
    const ongoing = timeline.filter(apt => 
      apt[APPOINTMENT_FIELDS.STATUS] === BOOKING_STATUS.ONGOING
    ).length;
    const pending = total - completed - ongoing;

    const totalDuration = timeline.reduce((sum, apt) => 
      sum + (apt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30), 0
    );

    return {
      total,
      completed,
      ongoing,
      pending,
      total_duration: totalDuration,
      avg_wait_time: timeline.length > 0 ? 
        timeline.reduce((sum, apt) => sum + (apt.wait_time || 0), 0) / timeline.length : 0,
      efficiency: total > 0 ? (completed / total) * 100 : 0
    };
  }

  findScheduledPosition(timeline, appointmentData) {
    // For scheduled, position is based on time order
    const time = this.timeToMinutes(appointmentData[APPOINTMENT_FIELDS.APPOINTMENT_TIME]);
    let position = 1;

    for (const apt of timeline) {
      if (apt.type === 'scheduled') {
        const aptTime = this.timeToMinutes(apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]);
        if (time > aptTime) {
          position++;
        }
      }
    }

    return position;
  }

  findQueuePosition(timeline, priority) {
    const priorityWeight = this.getPriorityWeight(priority);
    let position = 1;

    for (const apt of timeline) {
      if (apt.type === 'queue') {
        const aptWeight = this.getPriorityWeight(apt[APPOINTMENT_FIELDS.PRIORITY_LEVEL]);
        if (priorityWeight >= aptWeight) {
          position++;
        }
      }
    }

    return position;
  }

  calculateEstimatedTime(timeline, position, duration) {
    if (timeline.length === 0) {
      return this.WORK_START;
    }

    // Find appointments before this position
    const before = timeline.slice(0, position - 1);
    
    if (before.length === 0) {
      return this.WORK_START;
    }

    // Get last appointment's end time
    const lastApt = before[before.length - 1];
    if (lastApt.estimated_end) {
      const endMinutes = this.timeToMinutes(lastApt.estimated_end);
      return this.minutesToTime(endMinutes + this.BUFFER_TIME);
    }

    return this.WORK_START;
  }

  async checkForConflicts(barberId, date, time, duration) {
    // Queue appointments don't have specific times, so no conflict check needed
    if (!time) return false;
    
    const startMinutes = this.timeToMinutes(time);
    const endMinutes = startMinutes + duration;

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq(APPOINTMENT_FIELDS.BARBER_ID, barberId)
      .eq(APPOINTMENT_FIELDS.APPOINTMENT_DATE, date)
      .in(APPOINTMENT_FIELDS.STATUS, [
        BOOKING_STATUS.SCHEDULED,
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.ONGOING
      ])
      .not(APPOINTMENT_FIELDS.APPOINTMENT_TIME, 'is', null); // Only check scheduled appointments

    if (error || !data) return false;

    for (const apt of data) {
      if (!apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]) continue;

      const aptStart = this.timeToMinutes(apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]);
      const aptEnd = aptStart + (apt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30);

      // Check overlap with scheduled appointments only
      if (
        (startMinutes >= aptStart && startMinutes < aptEnd) ||
        (endMinutes > aptStart && endMinutes <= aptEnd) ||
        (startMinutes <= aptStart && endMinutes >= aptEnd)
      ) {
        return true; // Conflict found
      }
    }

    return false;
  }

  async suggestAlternativeTimes(barberId, date, duration) {
    const { timeline } = await this.getUnifiedQueue(barberId, date);
    const suggestions = [];
    
    // Get all scheduled appointments for the day
    const scheduledAppts = timeline.filter(apt => 
      apt[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] === 'scheduled' && 
      apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]
    ).sort((a, b) => 
      this.timeToMinutes(a[APPOINTMENT_FIELDS.APPOINTMENT_TIME]) - 
      this.timeToMinutes(b[APPOINTMENT_FIELDS.APPOINTMENT_TIME])
    );

    console.log('🔍 Analyzing gaps for queue appointment suggestions:', {
      barberId,
      date,
      duration,
      scheduledAppts: scheduledAppts.map(apt => ({
        time: apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME],
        duration: apt[APPOINTMENT_FIELDS.TOTAL_DURATION],
        customer: apt[APPOINTMENT_FIELDS.CUSTOMER_NAME]
      }))
    });

    // Find gaps between scheduled appointments
    let currentTime = this.timeToMinutes(this.WORK_START);
    const workEnd = this.timeToMinutes(this.WORK_END);

    for (const apt of scheduledAppts) {
      const aptStart = this.timeToMinutes(apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]);
      const aptEnd = aptStart + (apt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30);
      
      // Check if we can fit in the gap before this appointment
      const gapDuration = aptStart - currentTime;
      if (gapDuration >= duration) {
        const gapStart = this.minutesToTime(currentTime);
        const gapEnd = this.minutesToTime(currentTime + duration);
        
        suggestions.push({
          time: gapStart,
          end_time: gapEnd,
          type: 'gap_before_scheduled',
          before_appointment: apt[APPOINTMENT_FIELDS.CUSTOMER_NAME] || 'Scheduled appointment',
          gap_duration: gapDuration,
          description: `Available ${gapDuration}min gap before ${apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]} appointment`,
          priority: gapDuration >= duration * 1.5 ? 'high' : 'medium' // High priority if gap is 1.5x service duration
        });
        
        console.log(`✅ Found gap: ${gapStart} - ${gapEnd} (${gapDuration}min) before ${apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]} appointment`);
      } else if (gapDuration > 0) {
        console.log(`⚠️ Gap too small: ${gapDuration}min < ${duration}min required`);
      }
      
      currentTime = aptEnd;
    }

    // Check if we can fit after the last scheduled appointment
    const remainingTime = workEnd - currentTime;
    if (remainingTime >= duration) {
      const afterStart = this.minutesToTime(currentTime);
      const afterEnd = this.minutesToTime(currentTime + duration);
      
      suggestions.push({
        time: afterStart,
        end_time: afterEnd,
        type: 'after_scheduled',
        after_appointment: 'All scheduled appointments',
        gap_duration: remainingTime,
        description: `Available ${remainingTime}min after last scheduled appointment`,
        priority: 'medium'
      });
      
      console.log(`✅ Found time after scheduled: ${afterStart} - ${afterEnd} (${remainingTime}min remaining)`);
    }

    // Add queue position option with estimated time
    const queueAppts = timeline.filter(apt => 
      apt[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] === 'queue'
    );
    const queuePosition = queueAppts.length + 1;
    const estimatedWait = this.calculateQueueWaitTime(timeline, duration);
    
    suggestions.push({
      time: null,
      end_time: null,
      type: 'queue_position',
      position: queuePosition,
      estimated_wait: estimatedWait,
      description: `Join queue at position #${queuePosition}`,
      priority: 'low'
    });

    // Sort suggestions by priority and time
    suggestions.sort((a, b) => {
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      if (priorityOrder[b.priority] !== priorityOrder[a.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      if (a.time && b.time) {
        return this.timeToMinutes(a.time) - this.timeToMinutes(b.time);
      }
      return 0;
    });

    console.log('📋 Queue appointment suggestions:', suggestions);
    return suggestions.slice(0, 5); // Return max 5 suggestions
  }

  /**
   * Get intelligent queue slot suggestions for a specific scenario
   * Example: 8AM (30min) -> 9AM (45min) -> Queue appointment (30min)
   * Will suggest: 8:30AM-9:00AM (30min gap) or join queue
   */
  async getIntelligentQueueSlots(barberId, date, serviceDuration) {
    console.log('🧠 Getting intelligent queue slots:', { barberId, date, serviceDuration });
    
    const { timeline } = await this.getUnifiedQueue(barberId, date);
    const suggestions = [];
    
    // Get all scheduled appointments sorted by time
    const scheduledAppts = timeline.filter(apt => 
      apt[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] === 'scheduled' && 
      apt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]
    ).sort((a, b) => 
      this.timeToMinutes(a[APPOINTMENT_FIELDS.APPOINTMENT_TIME]) - 
      this.timeToMinutes(b[APPOINTMENT_FIELDS.APPOINTMENT_TIME])
    );

    // Analyze gaps between consecutive appointments
    for (let i = 0; i < scheduledAppts.length; i++) {
      const currentApt = scheduledAppts[i];
      const nextApt = scheduledAppts[i + 1];
      
      const currentStart = this.timeToMinutes(currentApt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]);
      const currentEnd = currentStart + (currentApt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30);
      
      let gapStart = currentEnd;
      let gapEnd;
      
      if (nextApt) {
        // Gap between two scheduled appointments
        gapEnd = this.timeToMinutes(nextApt[APPOINTMENT_FIELDS.APPOINTMENT_TIME]);
      } else {
        // Gap after last appointment until end of day
        gapEnd = this.timeToMinutes(this.WORK_END);
      }
      
      const gapDuration = gapEnd - gapStart;
      
      if (gapDuration >= serviceDuration) {
        const slotStart = this.minutesToTime(gapStart);
        const slotEnd = this.minutesToTime(gapStart + serviceDuration);
        
        suggestions.push({
          time: slotStart,
          end_time: slotEnd,
          type: 'intelligent_gap',
          gap_duration: gapDuration,
          before_appointment: currentApt[APPOINTMENT_FIELDS.CUSTOMER_NAME] || 'Scheduled appointment',
          after_appointment: nextApt ? (nextApt[APPOINTMENT_FIELDS.CUSTOMER_NAME] || 'Scheduled appointment') : 'End of day',
          description: `${gapDuration}min gap between appointments`,
          priority: gapDuration >= serviceDuration * 1.5 ? 'high' : 'medium',
          efficiency: this.calculateGapEfficiency(gapDuration, serviceDuration)
        });
        
        console.log(`🎯 Intelligent gap found: ${slotStart}-${slotEnd} (${gapDuration}min) between appointments`);
      }
    }
    
    // Add queue option
    const queueAppts = timeline.filter(apt => 
      apt[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] === 'queue'
    );
    
    suggestions.push({
      time: null,
      end_time: null,
      type: 'queue_position',
      position: queueAppts.length + 1,
      estimated_wait: this.calculateQueueWaitTime(timeline, serviceDuration),
      description: `Join queue at position #${queueAppts.length + 1}`,
      priority: 'low',
      efficiency: 0.5 // Lower efficiency than specific time slots
    });
    
    // Sort by efficiency and priority
    suggestions.sort((a, b) => {
      if (a.efficiency !== b.efficiency) {
        return b.efficiency - a.efficiency;
      }
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    console.log('🧠 Intelligent queue slot suggestions:', suggestions);
    return suggestions;
  }

  /**
   * Calculate efficiency of using a gap for a service
   * Higher efficiency = better use of time
   */
  calculateGapEfficiency(gapDuration, serviceDuration) {
    if (gapDuration < serviceDuration) return 0;
    
    const utilization = serviceDuration / gapDuration;
    const waste = (gapDuration - serviceDuration) / gapDuration;
    
    // Efficiency = utilization - waste penalty
    return Math.max(0, utilization - (waste * 0.3));
  }

  calculateQueueWaitTime(timeline, duration) {
    const queueAppts = timeline.filter(apt => 
      apt[APPOINTMENT_FIELDS.APPOINTMENT_TYPE] === 'queue'
    );
    
    let totalWaitTime = 0;
    for (const apt of queueAppts) {
      totalWaitTime += apt[APPOINTMENT_FIELDS.TOTAL_DURATION] || 30;
    }
    
    return totalWaitTime + duration;
  }

  async reorderQueue(barberId, date, newAppointmentId) {
    // Shift all appointments after the new one
    await supabase.rpc('shift_queue_positions', {
      p_barber_id: barberId,
      p_date: date,
      p_new_appointment_id: newAppointmentId
    });
  }

  async notifyQueueChanges(barberId, date, fromPosition) {
    // This will be handled by real-time subscriptions
    console.log(`📢 [Notify] Queue changed from position ${fromPosition}`);
  }

  async notifyCustomerOfDelay(customerId, oldTime, newTime) {
    console.log(`📱 [Notify] Delay notification: ${oldTime} → ${newTime}`);
    // Implementation: Send push notification or SMS
  }

  // ============================================================================
  // REAL-TIME SUBSCRIPTIONS
  // ============================================================================

  /**
   * Subscribe to queue updates for a specific barber
   * @param {string} barberId - Barber UUID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Function} callback - Callback function for updates
   * @returns {Object} Subscription object
   */
  subscribeToQueue(barberId, date, callback) {
    const channelName = `barber-queue-${barberId}-${date}`;
    console.log(`📡 [Subscription] Setting up queue subscription: ${channelName}`);

    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'appointments',
          filter: `${APPOINTMENT_FIELDS.BARBER_ID}=eq.${barberId}`
        }, 
        async (payload) => {
          console.log('🔔 [Real-time] Queue update received:', payload);
          
          // Get updated queue data
          const queueData = await this.getUnifiedQueue(barberId, date);
          
          // Call the callback with the update
          callback({
            event: payload.eventType,
            queueData: queueData,
            payload: payload
          });
        }
      )
      .subscribe((status, err) => {
        console.log(`📡 [Subscription] Queue subscription status: ${status}`, err);
        if (status === 'SUBSCRIBED') {
          console.log('✅ [Subscription] Queue real-time subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [Subscription] Queue subscription error:', err);
        }
      });

    // Store subscription for cleanup
    this.subscriptions.set(`${barberId}-${date}`, subscription);
    
    return subscription;
  }

  /**
   * Subscribe to customer-specific updates
   * @param {string} customerId - Customer UUID
   * @param {Function} callback - Callback function for updates
   * @returns {Object} Subscription object
   */
  subscribeToCustomerUpdates(customerId, callback) {
    const channelName = `customer-updates-${customerId}`;
    console.log(`📡 [Subscription] Setting up customer subscription: ${channelName}`);

    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'appointments',
          filter: `${APPOINTMENT_FIELDS.CUSTOMER_ID}=eq.${customerId}`
        }, 
        async (payload) => {
          console.log('🔔 [Real-time] Customer update received:', payload);
          
          // Call the callback with the update
          callback({
            event: payload.eventType,
            payload: payload
          });
        }
      )
      .subscribe((status, err) => {
        console.log(`📡 [Subscription] Customer subscription status: ${status}`, err);
        if (status === 'SUBSCRIBED') {
          console.log('✅ [Subscription] Customer real-time subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [Subscription] Customer subscription error:', err);
        }
      });

    // Store subscription for cleanup
    this.subscriptions.set(`customer-${customerId}`, subscription);
    
    return subscription;
  }

  /**
   * Subscribe to manager-level updates (all appointments)
   * @param {Function} callback - Callback function for updates
   * @returns {Object} Subscription object
   */
  subscribeToManagerUpdates(callback) {
    const channelName = 'manager-updates';
    console.log(`📡 [Subscription] Setting up manager subscription: ${channelName}`);

    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'appointments'
        }, 
        async (payload) => {
          console.log('🔔 [Real-time] Manager update received:', payload);
          
          // Call the callback with the update
          callback({
            event: payload.eventType,
            payload: payload
          });
        }
      )
      .subscribe((status, err) => {
        console.log(`📡 [Subscription] Manager subscription status: ${status}`, err);
        if (status === 'SUBSCRIBED') {
          console.log('✅ [Subscription] Manager real-time subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [Subscription] Manager subscription error:', err);
        }
      });

    // Store subscription for cleanup
    this.subscriptions.set('manager', subscription);
    
    return subscription;
  }

  /**
   * Unsubscribe from queue updates
   * @param {string} key - Subscription key (barberId-date or customer-customerId or manager)
   */
  unsubscribeFromQueue(key) {
    const subscription = this.subscriptions.get(key);
    if (subscription) {
      console.log(`🧹 [Subscription] Unsubscribing from: ${key}`);
      subscription.unsubscribe();
      this.subscriptions.delete(key);
    }
  }

  /**
   * Unsubscribe from customer updates
   * @param {string} customerId - Customer UUID
   */
  unsubscribeFromCustomerUpdates(customerId) {
    this.unsubscribeFromQueue(`customer-${customerId}`);
  }

  /**
   * Unsubscribe from manager updates
   */
  unsubscribeFromManagerUpdates() {
    this.unsubscribeFromQueue('manager');
  }

  /**
   * Get queue analytics for managers
   * @returns {Promise<Object>} Analytics data
   */
  async getQueueAnalytics() {
    try {
      console.log('📊 [Analytics] Fetching queue analytics...');

      // Get today's date
      const today = new Date().toISOString().split('T')[0];

      // Fetch all appointments for today
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:${APPOINTMENT_FIELDS.CUSTOMER_ID}(id, full_name),
          barber:${APPOINTMENT_FIELDS.BARBER_ID}(id, full_name)
        `)
        .eq(APPOINTMENT_FIELDS.APPOINTMENT_DATE, today)
        .in(APPOINTMENT_FIELDS.STATUS, ['scheduled', 'confirmed', 'ongoing', 'pending', 'done']);

      if (error) throw error;

      // Calculate analytics
      const analytics = {
        totalAppointments: appointments.length,
        completed: appointments.filter(apt => apt.status === 'done').length,
        pending: appointments.filter(apt => apt.status === 'pending').length,
        scheduled: appointments.filter(apt => apt.appointment_type === 'scheduled').length,
        queue: appointments.filter(apt => apt.appointment_type === 'queue').length,
        urgent: appointments.filter(apt => apt.is_urgent).length,
        byBarber: {},
        efficiency: 0
      };

      // Group by barber
      appointments.forEach(apt => {
        const barberId = apt.barber_id;
        if (!analytics.byBarber[barberId]) {
          analytics.byBarber[barberId] = {
            name: apt.barber?.full_name || 'Unknown',
            total: 0,
            completed: 0,
            pending: 0,
            efficiency: 0
          };
        }
        analytics.byBarber[barberId].total++;
        if (apt.status === 'done') analytics.byBarber[barberId].completed++;
        if (apt.status === 'pending') analytics.byBarber[barberId].pending++;
      });

      // Calculate efficiency for each barber
      Object.keys(analytics.byBarber).forEach(barberId => {
        const barber = analytics.byBarber[barberId];
        barber.efficiency = barber.total > 0 ? Math.round((barber.completed / barber.total) * 100) : 0;
      });

      // Calculate overall efficiency
      analytics.efficiency = analytics.totalAppointments > 0 
        ? Math.round((analytics.completed / analytics.totalAppointments) * 100) 
        : 0;

      return {
        success: true,
        data: analytics,
        efficiency: analytics.efficiency
      };

    } catch (error) {
      console.error('❌ [Analytics] Error fetching queue analytics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Calculate queue position for new appointment
   */
  async calculateQueuePosition(barberId, appointmentDate, appointmentType, priorityLevel) {
    try {
      // Get current appointments for this barber and date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('queue_position, appointment_type, priority_level')
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing'])
        .order('queue_position', { ascending: true });

      if (error) throw error;

      // For scheduled appointments, use a high position number (they get priority)
      if (appointmentType === BOOKING_TYPES.SCHEDULED) {
        return 999; // Scheduled appointments get priority
      }

      // For queue appointments, calculate next position
      const queueAppointments = appointments?.filter(apt => 
        apt.appointment_type === BOOKING_TYPES.QUEUE && apt.queue_position
      ) || [];

      const maxPosition = queueAppointments.length > 0 
        ? Math.max(...queueAppointments.map(apt => apt.queue_position || 0))
        : 0;

      // Urgent appointments get priority (lower position number)
      if (priorityLevel === PRIORITY_LEVELS.URGENT) {
        return Math.max(1, maxPosition - 1);
      }

      return maxPosition + 1;

    } catch (error) {
      console.error('❌ Error calculating queue position:', error);
      return 1; // Default to position 1
    }
  }

  /**
   * Calculate estimated wait time for new appointment
   */
  async calculateEstimatedWaitTime(barberId, appointmentDate, totalDuration) {
    try {
      // Get current appointments for this barber and date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('total_duration, queue_position, appointment_type, status')
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing'])
        .order('queue_position', { ascending: true });

      if (error) throw error;

      // Calculate total wait time based on appointments before this one
      let totalWaitTime = 0;
      
      for (const appointment of appointments || []) {
        if (appointment.status === 'ongoing') continue; // Skip current appointment
        
        const duration = appointment.total_duration || 30;
        totalWaitTime += duration + 5; // Add 5 minutes buffer between appointments
      }

      return totalWaitTime;

    } catch (error) {
      console.error('❌ Error calculating estimated wait time:', error);
      return 0; // Default to no wait time
    }
  }
}

// Export singleton instance
export default new AdvancedHybridQueueService();