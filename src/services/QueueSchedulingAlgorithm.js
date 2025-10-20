// services/QueueSchedulingAlgorithm.js
import { supabase } from '../supabaseClient';

class QueueSchedulingAlgorithm {
  // Calculate next available time slots for queue-to-scheduled conversion
  static async calculateNextAvailableSlots(barberId, date, serviceDuration, maxSlots = 5) {
    try {
      console.log('🔍 Calculating next available slots:', { barberId, date, serviceDuration, maxSlots });

      // Get all existing appointments for the barber on the given date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('appointment_time, total_duration, status, appointment_type')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      // Generate all possible time slots for the day
      const allTimeSlots = this.generateTimeSlots();
      const availableSlots = [];

      // Check each time slot for availability
      for (const timeSlot of allTimeSlots) {
        const slotStart = this.timeToMinutes(timeSlot);
        const slotEnd = slotStart + serviceDuration;

        // Skip if slot would extend beyond business hours
        if (slotEnd > this.timeToMinutes('17:00')) {
          continue;
        }

        // Check for conflicts with existing appointments (only scheduled appointments have appointment_time)
        const hasConflict = appointments.some(apt => {
          // Skip queue appointments or appointments without appointment_time
          if (!apt.appointment_time || apt.appointment_type === 'queue') {
            return false;
          }
          
          const aptStart = this.timeToMinutes(apt.appointment_time);
          const aptEnd = aptStart + (apt.total_duration || 30);

          // Check for overlap
          return slotStart < aptEnd && slotEnd > aptStart;
        });

        // Check for lunch break conflict
        const lunchConflict = this.checkLunchBreakConflict(timeSlot, serviceDuration);

        if (!hasConflict && !lunchConflict) {
          // Calculate slot quality score
          const qualityScore = this.calculateSlotQuality(timeSlot, serviceDuration, appointments);
          
          availableSlots.push({
            time: timeSlot,
            display: this.convertTo12Hour(timeSlot),
            duration: serviceDuration,
            endTime: this.minutesToTime(slotEnd),
            qualityScore: qualityScore,
            confidence: this.calculateConfidence(timeSlot, serviceDuration, appointments)
          });
        }
      }

      // Sort by quality score and confidence
      availableSlots.sort((a, b) => {
        if (b.qualityScore !== a.qualityScore) {
          return b.qualityScore - a.qualityScore;
        }
        return b.confidence - a.confidence;
      });

      // Return top slots
      const result = availableSlots.slice(0, maxSlots);
      
      console.log('✅ Found available slots:', result.length);
      return result;

    } catch (error) {
      console.error('Error calculating next available slots:', error);
      return [];
    }
  }

  // Calculate optimal slot for queue-to-scheduled conversion
  static async calculateOptimalSlot(barberId, date, serviceDuration, preferences = {}) {
    try {
      console.log('🎯 Calculating optimal slot:', { barberId, date, serviceDuration, preferences });

      const availableSlots = await this.calculateNextAvailableSlots(barberId, date, serviceDuration, 10);
      
      if (availableSlots.length === 0) {
        return {
          success: false,
          message: 'No available slots found for the requested duration',
          alternatives: await this.findAlternativeDates(barberId, serviceDuration)
        };
      }

      // Apply preferences
      let filteredSlots = availableSlots;

      // Filter by preferred time range
      if (preferences.preferredTimeRange) {
        const { start, end } = preferences.preferredTimeRange;
        filteredSlots = filteredSlots.filter(slot => {
          const slotTime = this.timeToMinutes(slot.time);
          return slotTime >= this.timeToMinutes(start) && slotTime <= this.timeToMinutes(end);
        });
      }

      // Filter by preferred time of day
      if (preferences.preferredTimeOfDay) {
        filteredSlots = filteredSlots.filter(slot => {
          const hour = parseInt(slot.time.split(':')[0]);
          switch (preferences.preferredTimeOfDay) {
            case 'morning':
              return hour >= 9 && hour < 12;
            case 'afternoon':
              return hour >= 12 && hour < 17;
            case 'early':
              return hour >= 9 && hour < 11;
            case 'late':
              return hour >= 15 && hour < 17;
            default:
              return true;
          }
        });
      }

      // If no slots match preferences, use the best available slot
      if (filteredSlots.length === 0) {
        filteredSlots = availableSlots;
      }

      const optimalSlot = filteredSlots[0];

      return {
        success: true,
        slot: optimalSlot,
        alternatives: filteredSlots.slice(1, 4), // Next 3 alternatives
        message: `Optimal slot found: ${optimalSlot.display}`
      };

    } catch (error) {
      console.error('Error calculating optimal slot:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Calculate slot quality score
  static calculateSlotQuality(timeSlot, serviceDuration, existingAppointments) {
    let score = 100; // Base score

    const slotStart = this.timeToMinutes(timeSlot);
    const slotEnd = slotStart + serviceDuration;

    // Penalize slots that are too early or too late
    const hour = parseInt(timeSlot.split(':')[0]);
    if (hour < 10) score -= 20; // Too early
    if (hour > 15) score -= 15; // Too late

    // Bonus for slots with buffer time before and after
    const hasBufferBefore = !existingAppointments.some(apt => {
      if (!apt.appointment_time || apt.appointment_type === 'queue') return false;
      const aptEnd = this.timeToMinutes(apt.appointment_time) + (apt.total_duration || 30);
      return aptEnd === slotStart;
    });

    const hasBufferAfter = !existingAppointments.some(apt => {
      if (!apt.appointment_time || apt.appointment_type === 'queue') return false;
      const aptStart = this.timeToMinutes(apt.appointment_time);
      return aptStart === slotEnd;
    });

    if (hasBufferBefore) score += 10;
    if (hasBufferAfter) score += 10;

    // Bonus for slots that don't create gaps
    const createsGap = existingAppointments.some(apt => {
      if (!apt.appointment_time || apt.appointment_type === 'queue') return false;
      const aptStart = this.timeToMinutes(apt.appointment_time);
      const aptEnd = aptStart + (apt.total_duration || 30);
      return (slotStart > aptEnd && slotStart - aptEnd > 30) || 
             (slotEnd < aptStart && aptStart - slotEnd > 30);
    });

    if (!createsGap) score += 15;

    // Penalize slots that are too close to lunch break
    const lunchStart = this.timeToMinutes('12:00');
    const lunchEnd = this.timeToMinutes('13:00');
    if (slotStart < lunchEnd && slotEnd > lunchStart) {
      score -= 50; // Heavy penalty for lunch break conflict
    } else if (Math.abs(slotStart - lunchStart) < 60 || Math.abs(slotEnd - lunchEnd) < 60) {
      score -= 10; // Light penalty for being close to lunch break
    }

    return Math.max(0, Math.min(100, score));
  }

  // Calculate confidence level for a slot
  static calculateConfidence(timeSlot, serviceDuration, existingAppointments) {
    let confidence = 100;

    // Reduce confidence if there are many appointments around this time
    const slotStart = this.timeToMinutes(timeSlot);
    const nearbyAppointments = existingAppointments.filter(apt => {
      if (!apt.appointment_time || apt.appointment_type === 'queue') return false;
      const aptStart = this.timeToMinutes(apt.appointment_time);
      return Math.abs(aptStart - slotStart) < 120; // Within 2 hours
    });

    confidence -= nearbyAppointments.length * 5;

    // Reduce confidence if the slot is at the end of the day
    const hour = parseInt(timeSlot.split(':')[0]);
    if (hour >= 16) confidence -= 20;

    return Math.max(0, Math.min(100, confidence));
  }

  // Check for lunch break conflict
  static checkLunchBreakConflict(timeSlot, serviceDuration) {
    const slotStart = this.timeToMinutes(timeSlot);
    const slotEnd = slotStart + serviceDuration;
    
    const lunchStart = this.timeToMinutes('12:00');
    const lunchEnd = this.timeToMinutes('13:00');

    return slotStart < lunchEnd && slotEnd > lunchStart;
  }

  // Find alternative dates when no slots are available
  static async findAlternativeDates(barberId, serviceDuration, maxDays = 7) {
    try {
      const alternatives = [];
      const today = new Date();
      
      for (let i = 1; i <= maxDays; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);
        const dateString = checkDate.toISOString().split('T')[0];

        const availableSlots = await this.calculateNextAvailableSlots(barberId, dateString, serviceDuration, 1);
        
        if (availableSlots.length > 0) {
          alternatives.push({
            date: dateString,
            displayDate: checkDate.toLocaleDateString(),
            availableSlots: availableSlots.length,
            bestSlot: availableSlots[0]
          });
        }
      }

      return alternatives;

    } catch (error) {
      console.error('Error finding alternative dates:', error);
      return [];
    }
  }

  // Generate time slots for the day
  static generateTimeSlots() {
    const slots = [];
    for (let hour = 9; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += 30) { // Reverted to 30-minute intervals
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  }

  // Convert time to minutes
  static timeToMinutes(timeString) {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Convert minutes to time
  static minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  // Convert 24-hour format to 12-hour format
  static convertTo12Hour(time24) {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${hour12}:${minutes} ${ampm}`;
  }

  // Calculate estimated wait time for queue position
  static async calculateQueueWaitTime(barberId, date, queuePosition) {
    try {
      const { data: queueAppointments, error } = await supabase
        .from('appointments')
        .select('total_duration, status, queue_position')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .eq('appointment_type', 'queue')
        .in('status', ['pending', 'confirmed'])
        .lte('queue_position', queuePosition)
        .order('queue_position', { ascending: true });

      if (error) throw error;

      const totalWaitTime = queueAppointments.reduce((total, apt) => {
        return total + (apt.total_duration || 30);
      }, 0);

      return {
        estimatedWaitTime: totalWaitTime,
        queuePosition: queuePosition,
        appointmentsAhead: queueAppointments.length - 1
      };

    } catch (error) {
      console.error('Error calculating queue wait time:', error);
      return {
        estimatedWaitTime: 0,
        queuePosition: queuePosition,
        appointmentsAhead: 0
      };
    }
  }
}

export default QueueSchedulingAlgorithm;


