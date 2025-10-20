// services/CapacityService.js
import { supabase } from '../supabaseClient';

class CapacityService {
  // Check if barber has capacity for a new appointment
  static async checkBarberCapacity(barberId, date, serviceDuration) {
    try {
      console.log('🔍 Checking barber capacity:', { barberId, date, serviceDuration });

      // Get all appointments for the barber on the given date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('appointment_time, total_duration, status, appointment_type')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing']);

      if (error) throw error;

      // Calculate total booked time
      const totalBookedTime = appointments.reduce((total, apt) => {
        return total + (apt.total_duration || 30); // Default 30 minutes if no duration
      }, 0);

      // Assume 8-hour work day (480 minutes) with 15 appointment capacity
      const maxCapacity = 480; // 8 hours in minutes
      const availableCapacity = maxCapacity - totalBookedTime;

      const hasCapacity = availableCapacity >= serviceDuration;

      console.log('📊 Capacity check result:', {
        totalBookedTime,
        availableCapacity,
        serviceDuration,
        hasCapacity
      });

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

  // Get next available time slot
  static async getNextAvailableSlot(barberId, date, serviceDuration = 30) {
    try {
      console.log('🔍 Getting next available slot:', { barberId, date, serviceDuration });

      // Get all appointments for the barber on the given date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('appointment_time, total_duration, status')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      // Generate time slots (9 AM to 5 PM, 30-minute intervals)
      const timeSlots = [];
      for (let hour = 9; hour < 17; hour++) {
        for (let minute = 0; minute < 60; minute += 30) { // Reverted to 30-minute intervals
          const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          timeSlots.push(timeString);
        }
      }

      // Find the first available slot
      for (const timeSlot of timeSlots) {
        const slotStart = this.timeToMinutes(timeSlot);
        const slotEnd = slotStart + serviceDuration;

        // Check if this slot conflicts with any existing appointment
        const hasConflict = appointments.some(apt => {
          const aptStart = this.timeToMinutes(apt.appointment_time);
          const aptEnd = aptStart + (apt.total_duration || 30);

          // Check for overlap
          return (slotStart < aptEnd && slotEnd > aptStart);
        });

        if (!hasConflict) {
          return {
            time: timeSlot,
            available: true,
            duration: serviceDuration
          };
        }
      }

      return {
        time: null,
        available: false,
        message: 'No available slots for the requested duration'
      };

    } catch (error) {
      console.error('Error getting next available slot:', error);
      return {
        time: null,
        available: false,
        error: error.message
      };
    }
  }

  // Find alternative barbers with available capacity
  static async findAlternativeBarbers(date, serviceDuration, excludeBarberId, allBarbers) {
    try {
      console.log('🔍 Finding alternative barbers:', { date, serviceDuration, excludeBarberId });

      const alternativeBarbers = [];

      // Get all barbers except the excluded one
      const availableBarbers = allBarbers.filter(barber => barber.id !== excludeBarberId);

      for (const barber of availableBarbers) {
        // Check capacity for this barber
        const capacityCheck = await this.checkBarberCapacity(
          barber.id,
          date,
          serviceDuration
        );

        if (capacityCheck.hasCapacity) {
          // Get available slots count
          const nextSlot = await this.getNextAvailableSlot(
            barber.id,
            date,
            serviceDuration
          );

          alternativeBarbers.push({
            id: barber.id,
            full_name: barber.full_name,
            availableSlots: nextSlot.available ? 1 : 0,
            utilizationPercentage: capacityCheck.utilizationPercentage,
            rating: barber.average_rating || 0,
            nextAvailableSlot: nextSlot.time
          });
        }
      }

      // Sort by available slots (descending) and rating (descending)
      alternativeBarbers.sort((a, b) => {
        if (b.availableSlots !== a.availableSlots) {
          return b.availableSlots - a.availableSlots;
        }
        return b.rating - a.rating;
      });

      console.log('✅ Found alternative barbers:', alternativeBarbers);
      return alternativeBarbers.slice(0, 5); // Return top 5 alternatives

    } catch (error) {
      console.error('Error finding alternative barbers:', error);
      return [];
    }
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

export default CapacityService;
