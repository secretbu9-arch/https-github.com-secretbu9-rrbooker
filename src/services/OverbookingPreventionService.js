// services/OverbookingPreventionService.js
import { supabase } from '../supabaseClient';

class OverbookingPreventionService {
  // Comprehensive overbooking prevention check
  static async preventOverbooking(barberId, date, timeSlot, serviceDuration) {
    try {
      console.log('🔍 Running overbooking prevention check:', { barberId, date, timeSlot, serviceDuration });

      const conflicts = [];
      const suggestions = [];

      // 1. Check for time slot conflicts
      if (timeSlot) {
        const timeConflict = await this.checkTimeSlotConflict(barberId, date, timeSlot, serviceDuration);
        if (timeConflict.hasConflict) {
          conflicts.push({
            type: 'time_conflict',
            message: timeConflict.message,
            severity: 'high'
          });
          
          // Suggest alternative time slots
          const alternatives = await this.findAlternativeTimeSlots(barberId, date, serviceDuration);
          if (alternatives.length > 0) {
            suggestions.push({
              type: 'alternative_time',
              message: `Alternative time slots available: ${alternatives.slice(0, 3).join(', ')}`,
              alternatives: alternatives
            });
          }
        }
      }

      // 2. Check barber capacity
      const capacityCheck = await this.checkBarberCapacity(barberId, date, serviceDuration);
      if (!capacityCheck.hasCapacity) {
        conflicts.push({
          type: 'capacity_exceeded',
          message: `Barber is fully booked for ${date}. Current utilization: ${capacityCheck.utilizationPercentage.toFixed(1)}%`,
          severity: 'high'
        });

        // Suggest waitlist or different date
        const nextAvailableDate = await this.findNextAvailableDate(barberId, serviceDuration);
        if (nextAvailableDate) {
          suggestions.push({
            type: 'alternative_date',
            message: `Next available date: ${nextAvailableDate}`,
            date: nextAvailableDate
          });
        }

        suggestions.push({
          type: 'alternative_barber',
          message: 'Try booking with another barber who has available slots',
          action: 'find_alternative_barber'
        });
      }

      // 3. Check for lunch break conflicts
      if (timeSlot) {
        const lunchConflict = this.checkLunchBreakConflict(timeSlot, serviceDuration);
        if (lunchConflict.hasConflict) {
          conflicts.push({
            type: 'lunch_break_conflict',
            message: lunchConflict.message,
            severity: 'medium'
          });

          suggestions.push({
            type: 'lunch_break_alternative',
            message: 'Choose a time slot that doesn\'t cross the lunch break (12:00 PM - 1:00 PM)',
            action: 'reschedule'
          });
        }
      }

      // 4. Check for queue overflow
      const queueCheck = await this.checkQueueOverflow(barberId, date);
      if (queueCheck.isOverflow) {
        conflicts.push({
          type: 'queue_overflow',
          message: `Queue is full (${queueCheck.currentSize}/${queueCheck.maxSize}). Expected wait time: ${queueCheck.estimatedWaitTime} minutes`,
          severity: 'medium'
        });

        suggestions.push({
          type: 'queue_alternative',
          message: 'Consider booking a scheduled appointment instead',
          action: 'schedule'
        });
      }

      // 5. Check for service duration conflicts
      const durationConflict = await this.checkServiceDurationConflict(barberId, date, timeSlot, serviceDuration);
      if (durationConflict.hasConflict) {
        conflicts.push({
          type: 'duration_conflict',
          message: durationConflict.message,
          severity: 'medium'
        });

        suggestions.push({
          type: 'duration_alternative',
          message: 'Consider reducing service duration or choosing a different time slot',
          action: 'modify_duration'
        });
      }

      const allowed = conflicts.length === 0 || conflicts.every(c => c.severity === 'low');

      return {
        allowed,
        conflicts,
        suggestions,
        summary: {
          totalConflicts: conflicts.length,
          highSeverityConflicts: conflicts.filter(c => c.severity === 'high').length,
          hasAlternatives: suggestions.length > 0
        }
      };

    } catch (error) {
      console.error('Error in overbooking prevention check:', error);
      return {
        allowed: false,
        conflicts: [{
          type: 'system_error',
          message: 'Unable to verify booking availability. Please try again.',
          severity: 'high'
        }],
        suggestions: [],
        error: error.message
      };
    }
  }

  // Check for time slot conflicts
  static async checkTimeSlotConflict(barberId, date, timeSlot, serviceDuration) {
    try {
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('appointment_time, total_duration, status')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending']);

      if (error) throw error;

      const slotStart = this.timeToMinutes(timeSlot);
      const slotEnd = slotStart + serviceDuration;

      for (const appointment of appointments) {
        const aptStart = this.timeToMinutes(appointment.appointment_time);
        const aptEnd = aptStart + (appointment.total_duration || 30);

        // Check for overlap
        if (slotStart < aptEnd && slotEnd > aptStart) {
          return {
            hasConflict: true,
            message: `Time slot conflicts with existing appointment at ${appointment.appointment_time}`,
            conflictingAppointment: appointment
          };
        }
      }

      return { hasConflict: false };

    } catch (error) {
      console.error('Error checking time slot conflict:', error);
      return {
        hasConflict: true,
        message: 'Unable to verify time slot availability'
      };
    }
  }

  // Check barber capacity
  static async checkBarberCapacity(barberId, date, serviceDuration) {
    try {
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('total_duration, status')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending']);

      if (error) throw error;

      const totalBookedTime = appointments.reduce((total, apt) => {
        return total + (apt.total_duration || 30);
      }, 0);

      const maxCapacity = 480; // 8 hours in minutes
      const availableCapacity = maxCapacity - totalBookedTime;
      const hasCapacity = availableCapacity >= serviceDuration;

      return {
        hasCapacity,
        totalBookedTime,
        availableCapacity,
        maxCapacity,
        utilizationPercentage: (totalBookedTime / maxCapacity) * 100
      };

    } catch (error) {
      console.error('Error checking barber capacity:', error);
      return {
        hasCapacity: false,
        error: error.message
      };
    }
  }

  // Check for lunch break conflicts
  static checkLunchBreakConflict(timeSlot, serviceDuration) {
    const slotStart = this.timeToMinutes(timeSlot);
    const slotEnd = slotStart + serviceDuration;
    
    const lunchStart = this.timeToMinutes('12:00');
    const lunchEnd = this.timeToMinutes('13:00');

    // Check if appointment crosses lunch break
    if (slotStart < lunchEnd && slotEnd > lunchStart) {
      return {
        hasConflict: true,
        message: 'Appointment time crosses the lunch break period (12:00 PM - 1:00 PM)'
      };
    }

    return { hasConflict: false };
  }

  // Check for queue overflow
  static async checkQueueOverflow(barberId, date) {
    try {
      const { data: queueAppointments, error } = await supabase
        .from('appointments')
        .select('id, appointment_time, total_duration, status')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .eq('appointment_type', 'queue')
        .in('status', ['pending', 'confirmed']);

      if (error) throw error;

      const maxQueueSize = 10; // Maximum queue size
      const currentSize = queueAppointments.length;
      const isOverflow = currentSize >= maxQueueSize;

      // Calculate estimated wait time
      const totalDuration = queueAppointments.reduce((total, apt) => {
        return total + (apt.total_duration || 30);
      }, 0);
      const estimatedWaitTime = Math.ceil(totalDuration / 60); // Convert to hours

      return {
        isOverflow,
        currentSize,
        maxSize: maxQueueSize,
        estimatedWaitTime: estimatedWaitTime * 60 // Convert back to minutes
      };

    } catch (error) {
      console.error('Error checking queue overflow:', error);
      return {
        isOverflow: false,
        currentSize: 0,
        maxSize: 10,
        estimatedWaitTime: 0
      };
    }
  }

  // Check for service duration conflicts
  static async checkServiceDurationConflict(barberId, date, timeSlot, serviceDuration) {
    try {
      if (!timeSlot) return { hasConflict: false };

      // Check if the service duration is too long for the remaining day
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('appointment_time, total_duration, status')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending'])
        .gte('appointment_time', timeSlot)
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      const slotStart = this.timeToMinutes(timeSlot);
      const slotEnd = slotStart + serviceDuration;
      const dayEnd = this.timeToMinutes('17:00'); // 5 PM

      // Check if appointment would extend beyond business hours
      if (slotEnd > dayEnd) {
        return {
          hasConflict: true,
          message: `Service duration (${serviceDuration} minutes) would extend beyond business hours (5:00 PM)`
        };
      }

      // Check for conflicts with subsequent appointments
      for (const appointment of appointments) {
        const aptStart = this.timeToMinutes(appointment.appointment_time);
        
        if (slotEnd > aptStart) {
          return {
            hasConflict: true,
            message: `Service duration conflicts with subsequent appointment at ${appointment.appointment_time}`
          };
        }
      }

      return { hasConflict: false };

    } catch (error) {
      console.error('Error checking service duration conflict:', error);
      return {
        hasConflict: true,
        message: 'Unable to verify service duration availability'
      };
    }
  }

  // Find alternative time slots
  static async findAlternativeTimeSlots(barberId, date, serviceDuration) {
    try {
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('appointment_time, total_duration, status')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending'])
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      const alternatives = [];
      const timeSlots = this.generateTimeSlots();

      for (const timeSlot of timeSlots) {
        const slotStart = this.timeToMinutes(timeSlot);
        const slotEnd = slotStart + serviceDuration;

        // Check if this slot is available
        const hasConflict = appointments.some(apt => {
          const aptStart = this.timeToMinutes(apt.appointment_time);
          const aptEnd = aptStart + (apt.total_duration || 30);
          return slotStart < aptEnd && slotEnd > aptStart;
        });

        if (!hasConflict) {
          alternatives.push(timeSlot);
          if (alternatives.length >= 5) break; // Limit to 5 alternatives
        }
      }

      return alternatives;

    } catch (error) {
      console.error('Error finding alternative time slots:', error);
      return [];
    }
  }

  // Find next available date
  static async findNextAvailableDate(barberId, serviceDuration) {
    try {
      const today = new Date();
      
      for (let i = 1; i <= 7; i++) { // Check next 7 days
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() + i);
        const dateString = checkDate.toISOString().split('T')[0];

        const capacityCheck = await this.checkBarberCapacity(barberId, dateString, serviceDuration);
        
        if (capacityCheck.hasCapacity) {
          return dateString;
        }
      }

      return null;

    } catch (error) {
      console.error('Error finding next available date:', error);
      return null;
    }
  }

  // Generate time slots
  static generateTimeSlots() {
    const slots = [];
    for (let hour = 9; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  }

  // Helper function to convert time string to minutes
  static timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Helper function to convert minutes to time string
  static minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}

export default OverbookingPreventionService;
