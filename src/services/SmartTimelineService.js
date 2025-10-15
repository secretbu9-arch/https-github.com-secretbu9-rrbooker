// services/SmartTimelineService.js
/**
 * Smart Timeline Service
 * Manages unified view of scheduled and queue appointments
 * Intelligently fills gaps and prevents conflicts
 */

import { supabase } from '../supabaseClient';
import { formatDateLocal } from '../utils/dateHelpers';

class SmartTimelineService {
  constructor() {
    this.BUSINESS_HOURS = {
      start: '08:00',
      end: '17:00'  // 5:00 PM
    };
    this.LUNCH_BREAK = {
      start: '12:00',  // 12:00 PM (end of morning)
      end: '13:00'     // 1:00 PM (start of afternoon)
    };
    this.BUFFER_TIME = 0; // 0 minutes buffer between appointments (removed 5-minute gap)
  }

  /**
   * Get unified timeline for a barber on a specific date
   * Combines scheduled and queue appointments intelligently
   * 
   * @param {string} barberId - The barber's ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Timeline with all appointments and gaps
   */
  async getUnifiedTimeline(barberId, date) {
    try {
      console.log('📊 Building unified timeline for:', barberId, date);

      // 1. Fetch all appointments for the day
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, phone, email),
          service:service_id(id, name, duration, price)
        `)
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'pending', 'ongoing'])
        .order('appointment_time', { ascending: true, nullsLast: true })
        .order('queue_position', { ascending: true, nullsLast: true });

      if (error) throw error;

      // 2. Separate scheduled and queue appointments
      const scheduled = appointments?.filter(apt => 
        apt.appointment_type === 'scheduled' && apt.appointment_time !== null
      ) || [];
      
      const queue = appointments?.filter(apt => 
        apt.appointment_type === 'queue' || apt.queue_position !== null
      ) || [];

      console.log('📅 Scheduled appointments:', scheduled.length);
      console.log('👥 Queue appointments:', queue.length);

      // 3. Build timeline blocks
      const timeline = this.buildTimelineBlocks(scheduled, queue);

      // 4. Calculate gaps between scheduled appointments
      const gaps = this.calculateGaps(scheduled);

      // 5. Assign estimated times to queue appointments
      const queueWithTimes = this.assignEstimatedTimes(queue, gaps, scheduled);

      // 6. Detect conflicts
      const conflicts = this.detectConflicts(timeline);

      return {
        timeline,
        scheduled,
        queue: queueWithTimes,
        gaps,
        conflicts,
        summary: {
          totalScheduled: scheduled.length,
          totalQueue: queue.length,
          totalGapTime: gaps.reduce((sum, gap) => sum + gap.duration, 0),
          queueFitsInGaps: this.checkQueueFitsInGaps(queue, gaps),
          nextAvailableTime: this.getNextAvailableTime(timeline)
        }
      };

    } catch (error) {
      console.error('❌ Error building timeline:', error);
      throw error;
    }
  }

  /**
   * Build timeline blocks from scheduled and queue appointments
   */
  buildTimelineBlocks(scheduled, queue) {
    const blocks = [];
    let currentTime = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const endTime = this.timeToMinutes(this.BUSINESS_HOURS.end);

    // Add lunch break
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);

    // Create blocks for scheduled appointments
    for (const apt of scheduled) {
      const startTime = this.timeToMinutes(apt.appointment_time);
      const duration = apt.total_duration || apt.service?.duration || 30;
      const endTimeApt = startTime + duration;

      blocks.push({
        type: 'scheduled',
        appointment: apt,
        startTime: this.minutesToTime(startTime),
        endTime: this.minutesToTime(endTimeApt),
        startMinutes: startTime,
        endMinutes: endTimeApt,
        duration,
        status: apt.status
      });
    }

    // Sort blocks by start time
    blocks.sort((a, b) => a.startMinutes - b.startMinutes);

    // Add lunch break block
    blocks.push({
      type: 'lunch',
      startTime: this.LUNCH_BREAK.start,
      endTime: this.LUNCH_BREAK.end,
      startMinutes: lunchStart,
      endMinutes: lunchEnd,
      duration: lunchEnd - lunchStart
    });

    // Resort after adding lunch
    blocks.sort((a, b) => a.startMinutes - b.startMinutes);

    // Fill gaps with queue appointments
    let queueIndex = 0;
    const filledBlocks = [];
    let previousEnd = currentTime;

    for (const block of blocks) {
      // Check if there's a gap before this block
      if (previousEnd < block.startMinutes) {
        const gapDuration = block.startMinutes - previousEnd;
        
        // Try to fill gap with queue appointments
        const queueFit = this.fillGapWithQueue(
          queue.slice(queueIndex),
          gapDuration,
          previousEnd
        );

        queueFit.blocks.forEach(qb => filledBlocks.push(qb));
        queueIndex += queueFit.used;

        // Add remaining gap if any
        if (queueFit.remaining > 0) {
          filledBlocks.push({
            type: 'gap',
            startTime: this.minutesToTime(previousEnd + queueFit.filled),
            endTime: this.minutesToTime(block.startMinutes),
            startMinutes: previousEnd + queueFit.filled,
            endMinutes: block.startMinutes,
            duration: queueFit.remaining
          });
        }
      }

      // Add the scheduled/lunch block
      filledBlocks.push(block);
      previousEnd = block.endMinutes + this.BUFFER_TIME;
    }

    // Add remaining queue appointments at the end
    while (queueIndex < queue.length && previousEnd < endTime) {
      const apt = queue[queueIndex];
      const duration = apt.total_duration || apt.service?.duration || 30;
      const endApt = previousEnd + duration;

      if (endApt <= endTime) {
        filledBlocks.push({
          type: 'queue',
          appointment: apt,
          startTime: this.minutesToTime(previousEnd),
          endTime: this.minutesToTime(endApt),
          startMinutes: previousEnd,
          endMinutes: endApt,
          duration,
          queuePosition: apt.queue_position,
          estimatedTime: this.minutesToTime(previousEnd)
        });
        previousEnd = endApt + this.BUFFER_TIME;
        queueIndex++;
      } else {
        break;
      }
    }

    return filledBlocks;
  }

  /**
   * Fill a gap with queue appointments
   */
  fillGapWithQueue(queueAppointments, gapDuration, startMinutes) {
    const blocks = [];
    let filled = 0;
    let used = 0;
    let currentTime = startMinutes;

    for (const apt of queueAppointments) {
      const duration = apt.total_duration || apt.service?.duration || 30;
      const needed = duration + this.BUFFER_TIME;

      if (filled + needed <= gapDuration) {
        blocks.push({
          type: 'queue',
          appointment: apt,
          startTime: this.minutesToTime(currentTime),
          endTime: this.minutesToTime(currentTime + duration),
          startMinutes: currentTime,
          endMinutes: currentTime + duration,
          duration,
          queuePosition: apt.queue_position,
          estimatedTime: this.minutesToTime(currentTime)
        });

        currentTime += duration + this.BUFFER_TIME;
        filled += needed;
        used++;
      } else {
        break;
      }
    }

    return {
      blocks,
      filled,
      used,
      remaining: gapDuration - filled
    };
  }

  /**
   * Calculate gaps between scheduled appointments
   */
  calculateGaps(scheduled) {
    const gaps = [];
    const sorted = [...scheduled].sort((a, b) => 
      this.timeToMinutes(a.appointment_time) - this.timeToMinutes(b.appointment_time)
    );

    let previousEnd = this.timeToMinutes(this.BUSINESS_HOURS.start);
    const lunchStart = this.timeToMinutes(this.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.LUNCH_BREAK.end);

    for (const apt of sorted) {
      const startTime = this.timeToMinutes(apt.appointment_time);
      const duration = apt.total_duration || apt.service?.duration || 30;
      const endTime = startTime + duration;

      // Check for gap before lunch
      if (previousEnd < lunchStart && startTime > previousEnd) {
        const gapStart = previousEnd;
        const gapEnd = Math.min(startTime, lunchStart);
        
        if (gapEnd > gapStart) {
          gaps.push({
            startTime: this.minutesToTime(gapStart),
            endTime: this.minutesToTime(gapEnd),
            duration: gapEnd - gapStart,
            type: 'before_lunch'
          });
        }
      }

      // Check for gap after lunch
      if (previousEnd < lunchEnd && startTime > lunchEnd) {
        gaps.push({
          startTime: this.minutesToTime(lunchEnd),
          endTime: this.minutesToTime(startTime),
          duration: startTime - lunchEnd,
          type: 'after_lunch'
        });
      } else if (startTime > previousEnd && previousEnd >= lunchEnd) {
        gaps.push({
          startTime: this.minutesToTime(previousEnd),
          endTime: this.minutesToTime(startTime),
          duration: startTime - previousEnd,
          type: 'regular'
        });
      }

      previousEnd = Math.max(previousEnd, endTime + this.BUFFER_TIME);
    }

    // Add gap at end of day if any
    const endOfDay = this.timeToMinutes(this.BUSINESS_HOURS.end);
    if (previousEnd < endOfDay) {
      gaps.push({
        startTime: this.minutesToTime(previousEnd),
        endTime: this.BUSINESS_HOURS.end,
        duration: endOfDay - previousEnd,
        type: 'end_of_day'
      });
    }

    return gaps;
  }

  /**
   * Assign estimated times to queue appointments based on gaps
   */
  assignEstimatedTimes(queue, gaps, scheduled) {
    return queue.map((apt, index) => {
      const duration = apt.total_duration || apt.service?.duration || 30;
      
      // Calculate cumulative time from previous queue appointments
      let cumulativeTime = 0;
      for (let i = 0; i < index; i++) {
        cumulativeTime += (queue[i].total_duration || queue[i].service?.duration || 30) + this.BUFFER_TIME;
      }

      // Find which gap this appointment falls into
      let estimatedStartMinutes = this.timeToMinutes(this.BUSINESS_HOURS.start);
      let remainingTime = cumulativeTime;

      for (const gap of gaps) {
        const gapDuration = gap.duration;
        if (remainingTime < gapDuration) {
          estimatedStartMinutes = this.timeToMinutes(gap.startTime) + remainingTime;
          break;
        }
        remainingTime -= gapDuration;
      }

      return {
        ...apt,
        estimated_start_time: this.minutesToTime(estimatedStartMinutes),
        estimated_end_time: this.minutesToTime(estimatedStartMinutes + duration),
        estimated_wait_time: cumulativeTime
      };
    });
  }

  /**
   * Check if queue fits in available gaps
   */
  checkQueueFitsInGaps(queue, gaps) {
    const totalQueueTime = queue.reduce((sum, apt) => 
      sum + (apt.total_duration || apt.service?.duration || 30) + this.BUFFER_TIME, 0
    );
    const totalGapTime = gaps.reduce((sum, gap) => sum + gap.duration, 0);

    return {
      fits: totalQueueTime <= totalGapTime,
      totalQueueTime,
      totalGapTime,
      overflow: Math.max(0, totalQueueTime - totalGapTime)
    };
  }

  /**
   * Detect conflicts in the timeline
   */
  detectConflicts(timeline) {
    const conflicts = [];
    
    for (let i = 0; i < timeline.length - 1; i++) {
      const current = timeline[i];
      const next = timeline[i + 1];

      if (current.endMinutes > next.startMinutes) {
        conflicts.push({
          type: 'overlap',
          block1: current,
          block2: next,
          overlapMinutes: current.endMinutes - next.startMinutes
        });
      }
    }

    return conflicts;
  }

  /**
   * Get next available time slot
   */
  getNextAvailableTime(timeline) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Find first gap or end of last appointment after current time
    for (const block of timeline) {
      if (block.type === 'gap' && block.startMinutes > currentMinutes) {
        return block.startTime;
      }
    }

    // Return end of last block or start of business
    if (timeline.length > 0) {
      const lastBlock = timeline[timeline.length - 1];
      return this.minutesToTime(lastBlock.endMinutes + this.BUFFER_TIME);
    }

    return this.BUSINESS_HOURS.start;
  }

  /**
   * Convert time string to minutes
   */
  timeToMinutes(timeString) {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Convert minutes to time string
   */
  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  /**
   * Check if queue booking is available
   */
  async canAcceptQueueBooking(barberId, date, serviceDuration) {
    try {
      const timeline = await this.getUnifiedTimeline(barberId, date);
      const queueFits = timeline.summary.queueFitsInGaps;
      
      // Check if adding this duration would still fit
      const newTotalQueue = queueFits.totalQueueTime + serviceDuration + this.BUFFER_TIME;
      const wouldFit = newTotalQueue <= queueFits.totalGapTime;

      return {
        canAccept: wouldFit,
        currentQueueTime: queueFits.totalQueueTime,
        availableGapTime: queueFits.totalGapTime,
        afterBookingQueueTime: newTotalQueue,
        estimatedPosition: timeline.queue.length + 1,
        estimatedStartTime: this.calculateEstimatedStartForNewQueue(timeline, serviceDuration)
      };
    } catch (error) {
      console.error('Error checking queue availability:', error);
      return {
        canAccept: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate estimated start time for a new queue booking
   */
  calculateEstimatedStartForNewQueue(timeline, serviceDuration) {
    const queueBlocks = timeline.timeline.filter(b => b.type === 'queue');
    
    if (queueBlocks.length === 0) {
      // First in queue, use first available gap
      const firstGap = timeline.gaps[0];
      return firstGap ? firstGap.startTime : this.BUSINESS_HOURS.start;
    }

    // Add after last queue appointment
    const lastQueue = queueBlocks[queueBlocks.length - 1];
    return this.minutesToTime(lastQueue.endMinutes + this.BUFFER_TIME);
  }
}

export default new SmartTimelineService();

