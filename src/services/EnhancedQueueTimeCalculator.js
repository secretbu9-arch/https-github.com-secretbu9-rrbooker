// services/EnhancedQueueTimeCalculator.js
import { supabase } from '../supabaseClient';

class EnhancedQueueTimeCalculator {
  constructor() {
    this.BUSINESS_HOURS = { start: '08:00', end: '17:00' };
    this.LUNCH_BREAK = { start: '12:00', end: '13:00' };
    this.BUFFER_TIME = 5; // 5 minutes buffer between appointments
  }

  /**
   * Calculate comprehensive queue information for a new appointment
   * @param {string} barberId - Barber ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} serviceDuration - Duration of the new service in minutes
   * @param {boolean} isUrgent - Whether the appointment is urgent
   * @returns {Promise<Object>} Queue information with estimated times
   */
  async calculateQueueInfo(barberId, date, serviceDuration, isUrgent = false) {
    try {
      console.log('🕐 Calculating queue info for:', { barberId, date, serviceDuration, isUrgent });

      // Get all existing appointments for the barber on this date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
        .order('appointment_time', { ascending: true, nullsLast: true })
        .order('queue_position', { ascending: true, nullsLast: true });

      if (error) throw error;

      // Separate scheduled and queue appointments
      const scheduledAppointments = appointments?.filter(apt => 
        apt.appointment_type === 'scheduled' && apt.appointment_time
      ) || [];
      
      const queueAppointments = appointments?.filter(apt => 
        apt.appointment_type === 'queue' && apt.queue_position
      ) || [];

      console.log('📅 Existing appointments:', {
        scheduled: scheduledAppointments.length,
        queue: queueAppointments.length
      });

      // Calculate timeline and find the best position for the new appointment
      const timeline = this.buildTimeline(scheduledAppointments, queueAppointments);
      const newAppointmentInfo = this.findBestPosition(timeline, serviceDuration, isUrgent);

      return {
        queuePosition: newAppointmentInfo.queuePosition,
        estimatedStartTime: newAppointmentInfo.estimatedStartTime,
        estimatedEndTime: newAppointmentInfo.estimatedEndTime,
        estimatedWaitTime: newAppointmentInfo.estimatedWaitTime,
        totalInQueue: newAppointmentInfo.totalInQueue,
        timeline: timeline,
        recommendations: this.generateRecommendations(timeline, serviceDuration, newAppointmentInfo)
      };

    } catch (error) {
      console.error('❌ Error calculating queue info:', error);
      throw error;
    }
  }

  /**
   * Build a timeline of all appointments considering lunch breaks
   */
  buildTimeline(scheduledAppointments, queueAppointments) {
    const timeline = [];
    let currentTime = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const workEnd = this.timeToMinutes(this.BUSINESS_HOURS.end);
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);

    // Sort scheduled appointments by time
    const sortedScheduled = [...scheduledAppointments].sort((a, b) => 
      this.timeToMinutes(a.appointment_time) - this.timeToMinutes(b.appointment_time)
    );

    // Sort queue appointments by position
    const sortedQueue = [...queueAppointments].sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));

    let scheduledIndex = 0;
    let queueIndex = 0;

    // Process appointments in chronological order
    while (currentTime < workEnd && (scheduledIndex < sortedScheduled.length || queueIndex < sortedQueue.length)) {
      // Check for lunch break
      if (currentTime >= lunchStart && currentTime < lunchEnd) {
        timeline.push({
          type: 'lunch_break',
          startTime: this.LUNCH_BREAK.start,
          endTime: this.LUNCH_BREAK.end,
          startMinutes: lunchStart,
          endMinutes: lunchEnd,
          duration: 60,
          isBreak: true
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
        const duration = nextScheduled.total_duration || 30;
        const endTime = nextScheduledTime + duration;

        timeline.push({
          ...nextScheduled,
          type: 'scheduled',
          startTime: nextScheduled.appointment_time,
          endTime: this.minutesToTime(endTime),
          startMinutes: nextScheduledTime,
          endMinutes: endTime,
          duration,
          isScheduled: true
        });

        currentTime = Math.max(currentTime, endTime) + this.BUFFER_TIME;
        scheduledIndex++;
      } else if (nextQueue) {
        // Process queue appointment
        const duration = nextQueue.total_duration || 30;
        const endTime = currentTime + duration;

        if (endTime <= workEnd) {
          timeline.push({
            ...nextQueue,
            type: 'queue',
            startTime: this.minutesToTime(currentTime),
            endTime: this.minutesToTime(endTime),
            startMinutes: currentTime,
            endMinutes: endTime,
            duration,
            isQueue: true,
            queuePosition: nextQueue.queue_position
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
   * Find the best position for a new appointment
   */
  findBestPosition(timeline, serviceDuration, isUrgent) {
    const queueAppointments = timeline.filter(item => item.isQueue);
    const totalInQueue = queueAppointments.length;

    let queuePosition;
    let estimatedStartTime;
    let estimatedEndTime;
    let estimatedWaitTime;

    if (isUrgent) {
      // Urgent appointments go to position 1
      queuePosition = 1;
      
      // Calculate start time based on current time or first available slot
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentMinutes = currentHour * 60 + currentMinute;
      
      const workStart = this.timeToMinutes(this.BUSINESS_HOURS.start);
      const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
      const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);
      
      // Start from work start or current time, whichever is later
      let startTime = Math.max(workStart, currentMinutes);
      
      // If we're in lunch break, start after lunch
      if (startTime >= lunchStart && startTime < lunchEnd) {
        startTime = lunchEnd;
      }
      
      estimatedStartTime = this.minutesToTime(startTime);
      estimatedEndTime = this.minutesToTime(startTime + serviceDuration);
      estimatedWaitTime = Math.max(0, startTime - currentMinutes);
    } else {
      // Regular appointments go to the end
      queuePosition = totalInQueue + 1;
      
      // Calculate start time based on existing timeline
      let startTime = this.timeToMinutes(this.BUSINESS_HOURS.start);
      
      // Find the end of the last appointment
      if (timeline.length > 0) {
        const lastAppointment = timeline[timeline.length - 1];
        startTime = lastAppointment.endMinutes + this.BUFFER_TIME;
      }
      
      // Check for lunch break
      const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
      const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);
      
      if (startTime >= lunchStart && startTime < lunchEnd) {
        startTime = lunchEnd;
      }
      
      estimatedStartTime = this.minutesToTime(startTime);
      estimatedEndTime = this.minutesToTime(startTime + serviceDuration);
      
      // Calculate wait time based on all appointments before this one
      const waitTime = this.calculateWaitTime(timeline, serviceDuration);
      estimatedWaitTime = waitTime;
    }

    return {
      queuePosition,
      estimatedStartTime,
      estimatedEndTime,
      estimatedWaitTime,
      totalInQueue: totalInQueue + 1
    };
  }

  /**
   * Calculate wait time based on existing appointments
   */
  calculateWaitTime(timeline, serviceDuration) {
    let totalWaitTime = 0;
    
    // Add time for all existing appointments
    timeline.forEach(appointment => {
      if (appointment.isScheduled || appointment.isQueue) {
        totalWaitTime += appointment.duration + this.BUFFER_TIME;
      }
    });
    
    return totalWaitTime;
  }

  /**
   * Generate recommendations for better timing
   */
  generateRecommendations(timeline, serviceDuration, appointmentInfo) {
    const recommendations = [];
    
    // Check if appointment would cross lunch break
    const startMinutes = this.timeToMinutes(appointmentInfo.estimatedStartTime);
    const endMinutes = startMinutes + serviceDuration;
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);
    
    if (startMinutes < lunchEnd && endMinutes > lunchStart) {
      recommendations.push({
        type: 'lunch_conflict',
        message: 'Your appointment would cross the lunch break (12:00 PM - 1:00 PM)',
        suggestion: 'Consider booking after 1:00 PM for better availability',
        alternativeTime: '1:00 PM'
      });
    }
    
    // Check for early morning availability
    const earlyMorningSlots = this.findEarlyMorningSlots(timeline, serviceDuration);
    if (earlyMorningSlots.length > 0) {
      recommendations.push({
        type: 'early_availability',
        message: 'Earlier time slots are available',
        suggestion: 'Book earlier for shorter wait time',
        alternativeTimes: earlyMorningSlots
      });
    }
    
    return recommendations;
  }

  /**
   * Find early morning available slots
   */
  findEarlyMorningSlots(timeline, serviceDuration) {
    const slots = [];
    const workStart = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    
    // Check slots from 8:00 AM to 11:30 AM
    for (let time = workStart; time < lunchStart - serviceDuration; time += 30) {
      const slotTime = this.minutesToTime(time);
      const slotEnd = time + serviceDuration;
      
      // Check if this slot is available
      const hasConflict = timeline.some(appointment => {
        if (appointment.isBreak) return false;
        return (time < appointment.endMinutes && slotEnd > appointment.startMinutes);
      });
      
      if (!hasConflict) {
        slots.push(slotTime);
      }
    }
    
    return slots.slice(0, 3); // Return first 3 available slots
  }

  /**
   * Calculate estimated times for scheduled appointments
   */
  async calculateScheduledAppointmentTimes(barberId, date, timeSlot, serviceDuration) {
    try {
      // Get existing appointments
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      const scheduledAppointments = appointments?.filter(apt => 
        apt.appointment_type === 'scheduled' && apt.appointment_time
      ) || [];

      const startTime = this.timeToMinutes(timeSlot);
      const endTime = startTime + serviceDuration;

      // Check for conflicts
      const conflicts = scheduledAppointments.filter(apt => {
        const aptStart = this.timeToMinutes(apt.appointment_time);
        const aptEnd = aptStart + (apt.total_duration || 30);
        return (startTime < aptEnd && endTime > aptStart);
      });

      if (conflicts.length > 0) {
        return {
          hasConflict: true,
          conflictMessage: `Time slot conflicts with existing appointment at ${conflicts[0].appointment_time}`,
          recommendedSlots: this.findAlternativeSlots(scheduledAppointments, serviceDuration)
        };
      }

      // Check for lunch break conflict
      const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
      const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);
      
      if (startTime < lunchEnd && endTime > lunchStart) {
        return {
          hasConflict: true,
          conflictMessage: 'Time slot crosses lunch break (12:00 PM - 1:00 PM)',
          recommendedSlots: this.findAlternativeSlots(scheduledAppointments, serviceDuration)
        };
      }

      return {
        hasConflict: false,
        startTime: timeSlot,
        endTime: this.minutesToTime(endTime),
        duration: serviceDuration
      };

    } catch (error) {
      console.error('❌ Error calculating scheduled appointment times:', error);
      throw error;
    }
  }

  /**
   * Find alternative time slots
   */
  findAlternativeSlots(existingAppointments, serviceDuration) {
    const slots = [];
    const workStart = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const workEnd = this.timeToMinutes(this.BUSINESS_HOURS.end);
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);

    // Check morning slots (8:00 AM - 11:30 AM)
    for (let time = workStart; time < lunchStart - serviceDuration; time += 30) {
      const slotTime = this.minutesToTime(time);
      const slotEnd = time + serviceDuration;
      
      const hasConflict = existingAppointments.some(apt => {
        const aptStart = this.timeToMinutes(apt.appointment_time);
        const aptEnd = aptStart + (apt.total_duration || 30);
        return (time < aptEnd && slotEnd > aptStart);
      });
      
      if (!hasConflict) {
        slots.push({
          time: slotTime,
          display: this.convertTo12Hour(slotTime),
          period: 'morning'
        });
      }
    }

    // Check afternoon slots (1:00 PM - 4:30 PM)
    for (let time = lunchEnd; time < workEnd - serviceDuration; time += 30) {
      const slotTime = this.minutesToTime(time);
      const slotEnd = time + serviceDuration;
      
      const hasConflict = existingAppointments.some(apt => {
        const aptStart = this.timeToMinutes(apt.appointment_time);
        const aptEnd = aptStart + (apt.total_duration || 30);
        return (time < aptEnd && slotEnd > aptStart);
      });
      
      if (!hasConflict) {
        slots.push({
          time: slotTime,
          display: this.convertTo12Hour(slotTime),
          period: 'afternoon'
        });
      }
    }

    return slots.slice(0, 5); // Return first 5 available slots
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

  /**
   * Convert 24-hour time to 12-hour format
   */
  convertTo12Hour(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  }
}

export default new EnhancedQueueTimeCalculator();
