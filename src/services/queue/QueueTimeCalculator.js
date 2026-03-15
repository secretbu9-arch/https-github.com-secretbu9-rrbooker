// services/QueueTimeCalculator.js
import { supabase } from '../../supabaseClient';

class QueueTimeCalculator {
  constructor() {
    this.BUSINESS_HOURS = { start: '08:00', end: '17:00' };
    this.LUNCH_BREAK = { start: '12:00', end: '13:00' };
    this.BUFFER_TIME = 5; // 5 minutes buffer between appointments
    this.ARRIVAL_BUFFER = 15; // 15 minutes buffer before service starts (for arrival time)
    this.FIRST_QUEUE_START = '08:00'; // First customer service start time
  }

  /**
   * Calculate comprehensive queue information for a new appointment
   * @param {string} barberId - Barber ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} serviceDuration - Duration of the new service in minutes
   * @param {boolean} isUrgent - Whether the appointment is urgent
   * @returns {Promise<Object>} Queue information with estimated times
   */
  async calculateQueueInfo(barberId, date, serviceDuration, isUrgent = false, customerId = null) {
    try {
      console.log('🕐 Calculating queue info for:', { barberId, date, serviceDuration, isUrgent });

      // Get all existing appointments for the barber on this date
      // Include 'pending' status so unconfirmed appointments are counted in queue positions
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing'])
      // Rule 3: Manual sort in JS is better for complex hierarchy
      let allAppointments = appointments || [];

      // If customerId is provided, exclude their existing appointments from being "ahead" of them
      // This is crucial for rebooking or refreshing status
      const originalAppointments = [...allAppointments];
      if (customerId) {
        allAppointments = allAppointments.filter(apt => apt.customer_id !== customerId);
      }

      const sortedAppointments = allAppointments.sort((a, b) => {
        if (a.status === 'ongoing') return -1;
        if (b.status === 'ongoing') return 1;

        const getPrio = (p) => (p === '1' ? 100 : p === 'urgent' ? 50 : 0);
        const pA = getPrio(a.priority_level);
        const pB = getPrio(b.priority_level);
        if (pA !== pB) return pB - pA;

        return (a.estimated_start_time || a.created_at).localeCompare(b.estimated_start_time || b.created_at);
      });

      // Separate scheduled and queue appointments (after sorting)
      const scheduledAppointments = sortedAppointments.filter(apt =>
        apt.appointment_type === 'scheduled' && apt.appointment_time
      );

      const queueAppointments = sortedAppointments.filter(apt =>
        apt.appointment_type === 'queue'
      );

      console.log('📅 Existing appointments (sorted):', {
        scheduled: scheduledAppointments.length,
        queue: queueAppointments.length
      });

      // Calculate timeline
      const timeline = this.buildTimeline(scheduledAppointments, queueAppointments, date);
      const newAppointmentInfo = this.findBestPosition(timeline, serviceDuration, isUrgent, date, customerId);

      return {
        queuePosition: newAppointmentInfo.queuePosition,
        estimatedStartTime: newAppointmentInfo.estimatedStartTime,
        estimatedArrivalTime: newAppointmentInfo.estimatedArrivalTime,
        estimatedEndTime: newAppointmentInfo.estimatedEndTime,
        estimatedWaitTime: newAppointmentInfo.estimatedWaitTime,
        totalInQueue: newAppointmentInfo.totalInQueue,
        isOverflowingWorkHours: newAppointmentInfo.isOverflowingWorkHours,
        wasPushedByLunch: newAppointmentInfo.wasPushedByLunch,
        availBeforeLunch: newAppointmentInfo.availBeforeLunch,
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
  buildTimeline(scheduledAppointments, queueAppointments, targetDate = null) {
    const timeline = [];

    // Get current time for real-time calculations
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const isToday = targetDate === today;

    const firstQueueStartMinutes = this.timeToMinutes(this.FIRST_QUEUE_START);
    let currentTime = firstQueueStartMinutes;

    const workEnd = this.timeToMinutes(this.BUSINESS_HOURS.end);
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);

    // If this is today, start from current time or work start, whichever is later
    if (isToday) {
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentMinutes = currentHour * 60 + currentMinute;
      currentTime = Math.max(currentTime, currentMinutes);

      // If current time is during lunch break, start after lunch
      if (currentTime >= lunchStart && currentTime < lunchEnd) {
        console.log('🍽️ Current time is during lunch break, scheduling queue appointments after lunch at 1:00 PM');
        currentTime = lunchEnd;
      }
    }

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
      // Get next scheduled appointment
      const nextScheduled = scheduledIndex < sortedScheduled.length ? sortedScheduled[scheduledIndex] : null;
      const nextScheduledTime = nextScheduled ? this.timeToMinutes(nextScheduled.appointment_time) : Infinity;

      // Get next queue appointment
      const nextQueue = queueIndex < sortedQueue.length ? sortedQueue[queueIndex] : null;

      // Special handling for ONGOING appointment - it must be processed first at its actual start time
      if (nextQueue && nextQueue.status === 'ongoing') {
        const duration = nextQueue.total_duration || 30;
        // Ongoing appointments started in the past or now
        const startTimeStr = nextQueue.appointment_time?.slice(0, 5) || this.minutesToTime(currentTime);
        const startTime = this.timeToMinutes(startTimeStr);
        const endTime = startTime + duration;

        timeline.push({
          ...nextQueue,
          type: 'queue',
          startTime: startTimeStr,
          endTime: this.minutesToTime(endTime),
          startMinutes: startTime,
          endMinutes: endTime,
          duration,
          isQueue: true,
          queuePosition: nextQueue.queue_position,
          isOngoing: true
        });

        // Next person starts after this one or now, whichever is later
        currentTime = Math.max(currentTime, endTime) + this.BUFFER_TIME;
        queueIndex++;
        continue;
      }

      // Regular check for lunch break for non-ongoing appointments
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

        // If queue appointment crosses lunch break, move current time to lunch start
        // so the loop will process the lunch break
        if (currentTime < lunchStart && (currentTime + duration) > lunchStart) {
          currentTime = lunchStart;
          continue;
        }

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
  findBestPosition(timeline, serviceDuration, isUrgent, targetDate = null) {
    const allAppointments = timeline.filter(item => item.isQueue || item.isScheduled);
    const totalInQueue = allAppointments.length;

    let queuePosition;
    let estimatedStartTime;
    let estimatedArrivalTime;
    let estimatedEndTime;
    let estimatedWaitTime;
    let isOverflowingWorkHours = false;
    let startTime;
    let wasPushedByLunch = false;
    let availBeforeLunch = 0;

    // Get current time for real-time calculations
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const isToday = targetDate === today;

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentMinutes = currentHour * 60 + currentMinute;

    const workStart = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const workEnd = this.timeToMinutes(this.BUSINESS_HOURS.end);
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);

    // For future dates (tomorrow or later), use business start time
    // For today, use max(current time, business start time)
    const firstQueueStart = this.timeToMinutes(this.FIRST_QUEUE_START);
    const baseStartTime = isToday ? Math.max(firstQueueStart, currentMinutes) : firstQueueStart;

    if (isUrgent) {
      // Urgent appointments go to position 1
      queuePosition = 1;

      // Start from work start or current time (if today), whichever is later
      startTime = baseStartTime;

      // If we're in lunch break, start after lunch
      if (startTime >= lunchStart && startTime < lunchEnd) {
        startTime = lunchEnd;
        wasPushedByLunch = true;
        availBeforeLunch = 0;
      } else if (startTime < lunchStart && (startTime + serviceDuration) > lunchStart) {
        console.log('🍽️ Urgent appointment crosses lunch break, moving to 1:00 PM');
        wasPushedByLunch = true;
        availBeforeLunch = Math.max(0, lunchStart - startTime);
        startTime = lunchEnd;
      }

      const remainingWorkingMinutes = Math.max(0, workEnd - startTime);
      isOverflowingWorkHours = (startTime + serviceDuration) > workEnd;
      estimatedStartTime = this.minutesToTime(startTime);
      estimatedEndTime = this.minutesToTime(startTime + serviceDuration);
      estimatedWaitTime = isToday ? Math.max(0, startTime - currentMinutes) : 0;

      // Calculate arrival time (15 minutes before service start)
      // For today, ensure arrival time is not in the past
      const arrivalTime = isToday
        ? Math.max(currentMinutes, startTime - this.ARRIVAL_BUFFER)
        : Math.max(0, startTime - this.ARRIVAL_BUFFER);
      estimatedArrivalTime = this.minutesToTime(arrivalTime);
    } else {
      // Regular appointments
      // STRICT QUEUE RULE: Maintain arrival order (1, 2, 3...)
      // A later person in the queue should NOT start before someone who joined earlier,
      // even if there is a gap. This prevents the "Queue 4 is earlier than Queue 3" confusion.

      // 1. Find the latest end time of any current appointments (Ongoing or Queue)
      // We only consider people "already in the line"
      let latestQueueEndTime = baseStartTime;

      const queueAppointments = timeline.filter(item => item.isQueue || item.isOngoing);
      if (queueAppointments.length > 0) {
        const sortedQueue = [...queueAppointments].sort((a, b) => a.endMinutes - b.endMinutes);
        latestQueueEndTime = sortedQueue[sortedQueue.length - 1].endMinutes + this.BUFFER_TIME;
      }

      startTime = Math.max(baseStartTime, latestQueueEndTime);

      // 2. Check for conflicts with SCHEDULED appointments
      // If we start at 'startTime', does it conflict with a fixed-time appointment?
      let conflict = true;
      while (conflict) {
        conflict = false;
        // Check for lunch break
        if (startTime < lunchEnd && (startTime + serviceDuration) > lunchStart) {
          if (startTime < lunchStart) {
            wasPushedByLunch = true;
            availBeforeLunch = Math.max(0, lunchStart - startTime);
          }
          startTime = lunchEnd;
          conflict = true;
          continue;
        }

        // Check for scheduled appointments
        for (const item of timeline) {
          if (item.isScheduled) {
            if (startTime < item.endMinutes && (startTime + serviceDuration) > item.startMinutes) {
              // Conflict! Move after this scheduled appointment
              startTime = item.endMinutes + this.BUFFER_TIME;
              conflict = true;
              break;
            }
          }
        }
      } // Closes while(conflict)
    } // Closes else (regular appointments)

    // After determining the startTime, we calculate their queuePosition correctly.
    // E.g. If their startTime is before someone else in the queue, their position should be 2, and the other person becomes 3.
    // For now, in order to show them as 2nd instead of 3rd etc., we calculate how many people start BEFORE them.
    let numPeopleStartingBeforeMe = 0;
    for (const item of timeline) {
      if (item.isQueue && item.startMinutes < startTime) {
        numPeopleStartingBeforeMe++;
      }
    }
    // If Urgent they are 1. We handled urgent earlier. But if they fill a gap, they should be the Nth person in the line.
    queuePosition = numPeopleStartingBeforeMe + 1;

    // Check for lunch break - if start time falls during lunch, move to after lunch
    if (startTime >= lunchStart && startTime < lunchEnd) {
      startTime = lunchEnd;
    } else if (startTime < lunchStart && (startTime + serviceDuration) > lunchStart) {
      // If it overlaps lunch, we need to know how many minutes were left BEFORE lunch
      // but for a strict queue, we push it to 1:00 PM
      startTime = lunchEnd;
    }

    // Check for overflow without forcing it into the slot
    const nextHurdle = (startTime < lunchStart) ? lunchStart : workEnd;
    const remainingMinutesInSlot = Math.max(0, nextHurdle - startTime);
    isOverflowingWorkHours = (startTime + serviceDuration) > workEnd;

    estimatedStartTime = this.minutesToTime(startTime);
    estimatedEndTime = this.minutesToTime(startTime + serviceDuration);

    // Calculate wait time based on when they will actually start
    // For future dates, wait time is 0 (no wait since it's a new day)
    const waitTime = isToday ? Math.max(0, startTime - currentMinutes) : 0;
    estimatedWaitTime = waitTime;

    // Calculate arrival time (15 minutes before service start)
    // For position 1 on future dates, arrival is 7:45 AM (15 min before 8:00 AM)
    // For others, arrival is 15 minutes before their service start
    // For today, ensure arrival time is not in the past
    const arrivalTime = isToday
      ? Math.max(currentMinutes, startTime - this.ARRIVAL_BUFFER)
      : Math.max(0, startTime - this.ARRIVAL_BUFFER);
    estimatedArrivalTime = this.minutesToTime(arrivalTime);

    return {
      queuePosition,
      estimatedStartTime,
      estimatedArrivalTime,
      estimatedEndTime,
      estimatedWaitTime,
      totalInQueue: totalInQueue + 1,
      isOverflowingWorkHours,
      remainingWorkingMinutes: Math.max(0, workEnd - this.timeToMinutes(estimatedStartTime)),
      remainingMinutesInSlot: (this.timeToMinutes(estimatedStartTime) < lunchStart)
        ? Math.max(0, lunchStart - this.timeToMinutes(estimatedStartTime))
        : Math.max(0, workEnd - this.timeToMinutes(estimatedStartTime)),
      wasPushedByLunch,
      availBeforeLunch
    };
  }



  generateRecommendations(timeline, serviceDuration, appointmentInfo) {
    const recommendations = [];

    // Check if appointment would cross lunch break
    const startMinutes = this.timeToMinutes(appointmentInfo.estimatedStartTime);
    const endMinutes = startMinutes + serviceDuration;
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);

    if (appointmentInfo.wasPushedByLunch || (startMinutes < lunchEnd && endMinutes > lunchStart)) {
      const avail = appointmentInfo.availBeforeLunch || Math.max(0, lunchStart - startMinutes);
      recommendations.push({
        type: 'lunch_conflict',
        message: 'Your service crosses the 12:00 PM - 1:00 PM lunch break.',
        suggestion: avail > 0
          ? `Barber has only ${avail} mins before lunch. Appointment moved to 1:00 PM.`
          : 'Appointment set after lunch break.',
        remainingMinutes: avail,
        alternativeTime: '1:00 PM'
      });
    }

    // Check for closing time conflict
    if (appointmentInfo.isOverflowingWorkHours) {
      const avail = appointmentInfo.remainingWorkingMinutes;
      recommendations.push({
        type: 'closing_conflict',
        message: 'Exceeds closing time (5:00 PM)',
        suggestion: `Barber has ${avail} mins left today. Try a shorter service or another barber.`,
        remainingMinutes: avail,
        action: 'find_alternatives'
      });
    }

    // Removed early morning availability recommendation to keep Final Confirmation minimalist and focused.

    return recommendations;
  }

  /**
   * Find early morning available slots
   */
  findEarlyMorningSlots(timeline, serviceDuration) {
    const slots = [];
    const workStart = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);

    // Check slots from 7:30 AM to 11:30 AM
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

      // Check for closing time overflow
      const workEnd = this.timeToMinutes(this.BUSINESS_HOURS.end);
      if (endTime > workEnd) {
        return {
          hasConflict: true,
          isOverflowingWorkHours: true,
          conflictMessage: `Exceeds closing time (Ends at ${this.minutesToTime(endTime)})`,
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

    // Check morning slots (7:30 AM - 11:30 AM)
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

export default new QueueTimeCalculator();
