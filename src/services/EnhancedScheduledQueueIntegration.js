// services/EnhancedScheduledQueueIntegration.js
import { supabase } from '../supabaseClient';

class EnhancedScheduledQueueIntegration {
  constructor() {
    this.BUSINESS_HOURS = { start: '08:00', end: '17:00' };
    this.LUNCH_BREAK = { start: '12:00', end: '13:00' };
    this.MAX_QUEUE_CAPACITY = 15;
    this.BUFFER_TIME = 5; // 5 minutes buffer between appointments
  }

  /**
   * Get comprehensive timeline that intelligently integrates scheduled and queue appointments
   * @param {string} barberId - Barber ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Integrated timeline with both appointment types
   */
  async getIntegratedTimeline(barberId, date) {
    try {
      console.log('🔄 Getting integrated timeline for barber:', barberId, 'date:', date);

      // Fetch all appointments for the day
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, phone, email),
          service:service_id(id, name, duration, price)
        `)
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'pending', 'ongoing', 'confirmed'])
        .order('appointment_time', { ascending: true, nullsLast: true })
        .order('queue_position', { ascending: true, nullsLast: true });

      if (error) throw error;

      // Separate scheduled and queue appointments
      const scheduled = appointments?.filter(apt => 
        apt.appointment_type === 'scheduled' && apt.appointment_time && apt.status === 'scheduled'
      ) || [];
      
      const queue = appointments?.filter(apt => 
        apt.appointment_type === 'queue' && apt.status === 'scheduled' && apt.queue_position
      ) || [];
      
      // Get pending appointments (both scheduled and queue that need barber acceptance)
      const pending = appointments?.filter(apt => 
        apt.status === 'pending'
      ) || [];

      console.log('📅 Scheduled appointments:', scheduled.length);
      console.log('👥 Queue appointments:', queue.length);

      // Build integrated timeline
      const timeline = this.buildIntegratedTimeline(scheduled, queue);
      
      // Calculate statistics
      const stats = this.calculateTimelineStats(timeline, scheduled, queue, pending);

      return {
        timeline,
        scheduled,
        queue,
        pending,
        stats,
        lunchBreak: {
          start: this.LUNCH_BREAK.start,
          end: this.LUNCH_BREAK.end,
          duration: 60 // 1 hour
        },
        businessHours: this.BUSINESS_HOURS
      };

    } catch (error) {
      console.error('❌ Error getting integrated timeline:', error);
      throw error;
    }
  }

  /**
   * Build integrated timeline that respects lunch breaks and appointment priorities
   */
  buildIntegratedTimeline(scheduled, queue) {
    const timeline = [];
    let currentTime = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const workEnd = this.timeToMinutes(this.BUSINESS_HOURS.end);
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);

    // Sort scheduled appointments by time
    const sortedScheduled = [...scheduled].sort((a, b) => 
      this.timeToMinutes(a.appointment_time) - this.timeToMinutes(b.appointment_time)
    );

    // Sort queue appointments by position
    const sortedQueue = [...queue].sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));

    let scheduledIndex = 0;
    let queueIndex = 0;

    // Process appointments in chronological order
    while (currentTime < workEnd && (scheduledIndex < sortedScheduled.length || queueIndex < sortedQueue.length)) {
      // Check for lunch break
      if (currentTime >= lunchStart && currentTime < lunchEnd) {
        timeline.push({
          type: 'lunch_break',
          start_time: this.LUNCH_BREAK.start,
          end_time: this.LUNCH_BREAK.end,
          start_minutes: lunchStart,
          end_minutes: lunchEnd,
          duration: 60,
          is_break: true
        });
        currentTime = lunchEnd;
        continue;
      }

      // Get next scheduled appointment
      const nextScheduled = scheduledIndex < sortedScheduled.length ? sortedScheduled[scheduledIndex] : null;
      const nextScheduledTime = nextScheduled ? this.timeToMinutes(nextScheduled.appointment_time) : Infinity;

      // Get next queue appointment
      const nextQueue = queueIndex < sortedQueue.length ? sortedQueue[queueIndex] : null;

      // Determine which appointment comes next
      if (nextScheduled && nextScheduledTime <= currentTime) {
        // Process scheduled appointment
        const duration = nextScheduled.total_duration || nextScheduled.service?.duration || 30;
        const endTime = nextScheduledTime + duration;

        timeline.push({
          ...nextScheduled,
          type: 'scheduled',
          start_time: nextScheduled.appointment_time,
          end_time: this.minutesToTime(endTime),
          start_minutes: nextScheduledTime,
          end_minutes: endTime,
          duration,
          is_scheduled: true
        });

        currentTime = Math.max(currentTime, endTime) + this.BUFFER_TIME;
        scheduledIndex++;
      } else if (nextQueue) {
        // Process queue appointment
        const duration = nextQueue.total_duration || nextQueue.service?.duration || 30;
        const endTime = currentTime + duration;

        if (endTime <= workEnd) {
          timeline.push({
            ...nextQueue,
            type: 'queue',
            start_time: this.minutesToTime(currentTime),
            end_time: this.minutesToTime(endTime),
            start_minutes: currentTime,
            end_minutes: endTime,
            duration,
            is_queue: true,
            estimated_start: this.minutesToTime(currentTime)
          });

          currentTime = endTime + this.BUFFER_TIME;
          queueIndex++;
        } else {
          // Can't fit more queue appointments today
          break;
        }
      } else {
        // No more appointments
        break;
      }
    }

    return timeline;
  }

  /**
   * Calculate comprehensive timeline statistics
   */
  calculateTimelineStats(timeline, scheduled, queue, pending = []) {
    const totalScheduled = scheduled.length;
    const totalQueue = queue.length;
    const totalPending = pending.length;
    const totalAppointments = totalScheduled + totalQueue + totalPending;

    // Calculate total work time
    const workStart = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const workEnd = this.timeToMinutes(this.BUSINESS_HOURS.end);
    const lunchDuration = 60; // 1 hour
    const totalWorkTime = workEnd - workStart - lunchDuration;

    // Calculate booked time
    const bookedTime = timeline
      .filter(item => item.is_scheduled || item.is_queue)
      .reduce((total, item) => total + (item.duration || 0), 0);

    // Calculate utilization
    const utilization = totalWorkTime > 0 ? (bookedTime / totalWorkTime) * 100 : 0;

    // Calculate estimated wait times for queue
    const queueWithWaitTimes = queue.map((apt, index) => {
      const estimatedWaitTime = this.calculateQueueWaitTime(timeline, apt, index);
      return {
        ...apt,
        estimated_wait_time: estimatedWaitTime,
        estimated_start_time: this.minutesToTime(estimatedWaitTime + workStart)
      };
    });

    return {
      totalAppointments,
      totalScheduled,
      totalQueue,
      totalPending,
      bookedTime,
      totalWorkTime,
      utilization: Math.round(utilization * 100) / 100,
      availableTime: totalWorkTime - bookedTime,
      queueWithWaitTimes,
      isFullyBooked: utilization >= 95,
      hasCapacity: totalQueue < this.MAX_QUEUE_CAPACITY,
      pendingScheduled: pending.filter(apt => apt.appointment_type === 'scheduled').length,
      pendingQueue: pending.filter(apt => apt.appointment_type === 'queue').length
    };
  }

  /**
   * Calculate wait time for a specific queue appointment
   */
  calculateQueueWaitTime(timeline, appointment, queueIndex) {
    let waitTime = 0;
    let currentTime = this.timeToMinutes(this.BUSINESS_HOURS.start);

    // Count appointments that come before this one in the queue
    for (let i = 0; i < queueIndex; i++) {
      const duration = 30; // Default duration
      waitTime += duration + this.BUFFER_TIME;
    }

    // Add time for scheduled appointments that might delay this queue appointment
    const scheduledBefore = timeline.filter(item => 
      item.is_scheduled && 
      this.timeToMinutes(item.start_time) > currentTime
    );

    scheduledBefore.forEach(apt => {
      waitTime += (apt.duration || 30) + this.BUFFER_TIME;
    });

    return waitTime;
  }

  /**
   * Check if a new appointment can be added without conflicts
   */
  async canAddAppointment(barberId, date, appointmentType, timeSlot = null, duration = 30) {
    try {
      const timeline = await this.getIntegratedTimeline(barberId, date);
      
      if (appointmentType === 'scheduled') {
        return this.canAddScheduledAppointment(timeline, timeSlot, duration);
      } else {
        return this.canAddQueueAppointment(timeline);
      }
    } catch (error) {
      console.error('❌ Error checking appointment availability:', error);
      return { canAdd: false, reason: 'Error checking availability' };
    }
  }

  /**
   * Check if a scheduled appointment can be added
   */
  canAddScheduledAppointment(timeline, timeSlot, duration) {
    if (!timeSlot) {
      return { canAdd: false, reason: 'Time slot is required for scheduled appointments' };
    }

    const startTime = this.timeToMinutes(timeSlot);
    const endTime = startTime + duration;

    // Check for lunch break conflict
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);

    if (startTime < lunchEnd && endTime > lunchStart) {
      return { 
        canAdd: false, 
        reason: 'Appointment would cross lunch break period (12:00 PM - 1:00 PM)' 
      };
    }

    // Check for conflicts with existing appointments
    const conflicts = timeline.filter(item => {
      if (item.is_break) return false;
      
      const itemStart = item.start_minutes;
      const itemEnd = item.end_minutes;

      return (startTime < itemEnd && endTime > itemStart);
    });

    if (conflicts.length > 0) {
      return { 
        canAdd: false, 
        reason: `Conflicts with existing appointment at ${conflicts[0].start_time}` 
      };
    }

    return { canAdd: true };
  }

  /**
   * Check if a queue appointment can be added
   */
  canAddQueueAppointment(timeline) {
    const queueCount = timeline.filter(item => item.is_queue).length;
    
    if (queueCount >= this.MAX_QUEUE_CAPACITY) {
      return { 
        canAdd: false, 
        reason: `Queue is at maximum capacity (${this.MAX_QUEUE_CAPACITY})` 
      };
    }

    return { canAdd: true };
  }

  /**
   * Utility function to convert time string to minutes
   */
  timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Utility function to convert minutes to time string
   */
  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}

export default new EnhancedScheduledQueueIntegration();
