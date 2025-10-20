// services/UnifiedSlotBookingService.js
import { supabase } from '../supabaseClient';

class UnifiedSlotBookingService {
  // Configuration
  static CONFIG = {
    BUSINESS_HOURS: { start: '08:00', end: '17:00' },
    LUNCH_BREAK: { start: '12:00', end: '13:00' },
    SLOT_DURATION: 30, // minutes - reverted to 30-minute intervals
    MAX_QUEUE_SIZE: 15,
    SLOT_TYPES: {
      AVAILABLE: 'available',
      SCHEDULED: 'scheduled',
      QUEUE: 'queue',
      FULL: 'full',
      LUNCH: 'lunch'
    }
  };

  // Get unified slot availability for a barber on a specific date
  static async getUnifiedSlots(barberId, date, serviceDuration = 30) {
    try {
      console.log('🔍 Getting unified slots for barber:', barberId, 'date:', date);

      // Get all appointments for this barber on this date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      // Generate all possible time slots for the day
      const allSlots = this.generateTimeSlots();
      const slotMap = new Map();

      // Initialize all slots as available
      allSlots.forEach(slot => {
        slotMap.set(slot, {
          time: slot,
          type: this.CONFIG.SLOT_TYPES.AVAILABLE,
          available: true,
          queuePosition: null,
          scheduledAppointment: null,
          queueAppointments: [],
          estimatedWaitTime: 0,
          canBook: true,
          reason: null
        });
      });

      // Mark lunch break slots
      this.markLunchBreakSlots(slotMap);

      // Process scheduled appointments
      const scheduledAppointments = appointments?.filter(apt => apt.appointment_type === 'scheduled') || [];
      this.processScheduledAppointments(slotMap, scheduledAppointments, serviceDuration);

      // Process queue appointments
      const queueAppointments = appointments?.filter(apt => apt.appointment_type === 'queue') || [];
      this.processQueueAppointments(slotMap, queueAppointments, serviceDuration);

      // Calculate slot availability and recommendations
      const result = this.calculateSlotAvailability(slotMap, serviceDuration);

      console.log('✅ Generated unified slots:', result.length);
      return result;

    } catch (error) {
      console.error('Error getting unified slots:', error);
      return [];
    }
  }

  // Generate all possible time slots for the day
  static generateTimeSlots() {
    const slots = [];
    const startHour = parseInt(this.CONFIG.BUSINESS_HOURS.start.split(':')[0]);
    const endHour = parseInt(this.CONFIG.BUSINESS_HOURS.end.split(':')[0]);

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += this.CONFIG.SLOT_DURATION) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  }

  // Mark lunch break slots
  static markLunchBreakSlots(slotMap) {
    const lunchStart = this.timeToMinutes(this.CONFIG.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.CONFIG.LUNCH_BREAK.end);

    for (const [time, slot] of slotMap) {
      const slotTime = this.timeToMinutes(time);
      if (slotTime >= lunchStart && slotTime < lunchEnd) {
        slot.type = this.CONFIG.SLOT_TYPES.LUNCH;
        slot.available = false;
        slot.canBook = false;
        slot.reason = 'Lunch break';
      }
    }
  }

  // Process scheduled appointments
  static processScheduledAppointments(slotMap, appointments, serviceDuration) {
    appointments.forEach(appointment => {
      if (!appointment.appointment_time) return;

      const startTime = this.timeToMinutes(appointment.appointment_time);
      const endTime = startTime + (appointment.total_duration || serviceDuration);
      
      // Mark all slots covered by this appointment
      for (const [time, slot] of slotMap) {
        const slotTime = this.timeToMinutes(time);
        if (slotTime >= startTime && slotTime < endTime) {
          slot.type = this.CONFIG.SLOT_TYPES.SCHEDULED;
          slot.available = false;
          slot.canBook = false;
          slot.scheduledAppointment = appointment;
          slot.reason = `Scheduled: ${appointment.customer?.full_name || 'Customer'}`;
        }
      }
    });
  }

  // Process queue appointments
  static processQueueAppointments(slotMap, appointments, serviceDuration) {
    // Sort queue appointments by queue number
    const sortedQueue = appointments.sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));
    
    let currentTime = this.timeToMinutes(this.CONFIG.BUSINESS_HOURS.start);
    let queuePosition = 1;

    sortedQueue.forEach(appointment => {
      const appointmentDuration = appointment.total_duration || serviceDuration;
      
      // Check if this appointment can fit within working hours
      const endTime = currentTime + appointmentDuration;
      const businessEnd = this.timeToMinutes(this.CONFIG.BUSINESS_HOURS.end);
      
      if (endTime <= businessEnd) {
        // Check if this appointment would cross lunch break
        const lunchStart = this.timeToMinutes(this.CONFIG.LUNCH_BREAK.start);
        const lunchEnd = this.timeToMinutes(this.CONFIG.LUNCH_BREAK.end);
        
        // If appointment crosses lunch break, move it to after lunch
        if (currentTime < lunchEnd && endTime > lunchStart) {
          console.log(`🕐 Queue appointment ${appointment.id} would cross lunch break, moving to after lunch`);
          currentTime = lunchEnd; // Move to after lunch break
          
          // Recalculate end time after lunch
          const newEndTime = currentTime + appointmentDuration;
          if (newEndTime > businessEnd) {
            console.warn(`Queue appointment ${appointment.id} cannot fit after lunch break`);
            return; // Skip this appointment
          }
        }
        
        // Find the slot that corresponds to currentTime
        const assignedSlot = this.minutesToTime(currentTime);
        const slot = slotMap.get(assignedSlot);
        
        if (slot) {
          slot.queueAppointments.push(appointment);
          slot.queuePosition = queuePosition;
          slot.estimatedWaitTime = (queuePosition - 1) * serviceDuration;
          
          // Mark all slots from currentTime to endTime as occupied by this queue appointment
          for (const [time, slot] of slotMap) {
            const slotTime = this.timeToMinutes(time);
            if (slotTime >= currentTime && slotTime < endTime) {
              if (slot.type === this.CONFIG.SLOT_TYPES.AVAILABLE) {
                slot.type = this.CONFIG.SLOT_TYPES.QUEUE;
                slot.available = false;
                slot.canBook = false;
                slot.reason = `Queue position ${queuePosition}`;
              }
            }
          }
          
          // Update currentTime to the end of this appointment
          currentTime = endTime;
          queuePosition++;
        }
      } else {
        console.warn(`Queue appointment ${appointment.id} cannot fit within working hours`);
      }
    });
  }

  // Calculate slot availability and recommendations
  static calculateSlotAvailability(slotMap, serviceDuration) {
    const slots = Array.from(slotMap.values());
    
    // Add recommendations for each slot
    slots.forEach(slot => {
      if (slot.type === this.CONFIG.SLOT_TYPES.AVAILABLE) {
        // Check if this slot can accommodate the service duration
        const canAccommodate = this.canAccommodateService(slotMap, slot.time, serviceDuration);
        slot.canBook = canAccommodate;
        slot.reason = canAccommodate ? 'Available' : 'Insufficient time';
      }
    });

    return slots;
  }

  // Check if a slot can accommodate the service duration
  static canAccommodateService(slotMap, startTime, serviceDuration) {
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = startMinutes + serviceDuration;
    
    // Check if service would extend beyond business hours
    const businessEnd = this.timeToMinutes(this.CONFIG.BUSINESS_HOURS.end);
    if (endMinutes > businessEnd) {
      return false;
    }

    // Check if service would cross lunch break
    const lunchStart = this.timeToMinutes(this.CONFIG.LUNCH_BREAK.start);
    const lunchEnd = this.timeToMinutes(this.CONFIG.LUNCH_BREAK.end);
    if (startMinutes < lunchEnd && endMinutes > lunchStart) {
      return false;
    }

    // Check if all required slots are available
    const requiredSlots = Math.ceil(serviceDuration / this.CONFIG.SLOT_DURATION);
    for (let i = 0; i < requiredSlots; i++) {
      const slotTime = this.minutesToTime(startMinutes + (i * this.CONFIG.SLOT_DURATION));
      const slot = slotMap.get(slotTime);
      
      if (!slot || !slot.available) {
        return false;
      }
    }

    return true;
  }

  // Get alternative barbers when primary barber is full
  static async getAlternativeBarbers(date, serviceDuration, excludeBarberId, allBarbers) {
    try {
      console.log('🔍 Finding alternative barbers for date:', date);

      const alternatives = [];

      for (const barber of allBarbers) {
        if (barber.id === excludeBarberId) continue;

        const slots = await this.getUnifiedSlots(barber.id, date, serviceDuration);
        const availableSlots = slots.filter(slot => slot.canBook);
        
        if (availableSlots.length > 0) {
          const nextAvailableSlot = availableSlots[0];
          const queueSlots = slots.filter(slot => slot.type === this.CONFIG.SLOT_TYPES.QUEUE);
          
          alternatives.push({
            barber: barber,
            availableSlots: availableSlots.length,
            nextAvailableSlot: nextAvailableSlot.time,
            nextAvailableDisplay: this.convertTo12Hour(nextAvailableSlot.time),
            queueLength: queueSlots.length,
            estimatedWaitTime: queueSlots.length * serviceDuration,
            rating: barber.average_rating || 0,
            recommendation: this.getBarberRecommendation(availableSlots.length, queueSlots.length),
            reason: availableSlots.length === 0 ? 'fully_scheduled' : 'available'
          });
        }
      }

      // Sort by recommendation score
      alternatives.sort((a, b) => {
        const scoreA = this.calculateRecommendationScore(a);
        const scoreB = this.calculateRecommendationScore(b);
        return scoreB - scoreA;
      });

      console.log('✅ Found alternative barbers:', alternatives.length);
      return alternatives.slice(0, 5); // Return top 5

    } catch (error) {
      console.error('Error finding alternative barbers:', error);
      return [];
    }
  }

  // Get barber recommendation based on availability
  static getBarberRecommendation(availableSlots, queueLength) {
    if (availableSlots >= 5) return 'Excellent availability';
    if (availableSlots >= 3) return 'Good availability';
    if (availableSlots >= 1) return 'Limited availability';
    if (queueLength < 5) return 'Short queue';
    if (queueLength < 10) return 'Moderate queue';
    return 'Long queue';
  }

  // Calculate recommendation score
  static calculateRecommendationScore(barber) {
    let score = 0;
    
    // Available slots score (higher is better)
    score += barber.availableSlots * 10;
    
    // Queue length score (lower is better)
    score += Math.max(0, 10 - barber.queueLength);
    
    // Rating score
    score += (barber.rating || 0) * 2;
    
    return score;
  }

  // Book a slot (either scheduled or queue)
  static async bookSlot(bookingData) {
    try {
      console.log('📅 Booking slot:', bookingData);

      const { barberId, date, timeSlot, serviceDuration, customerId, services, addOns } = bookingData;

      // Check if slot is still available
      const slots = await this.getUnifiedSlots(barberId, date, serviceDuration);
      const targetSlot = slots.find(slot => slot.time === timeSlot);

      if (!targetSlot || !targetSlot.canBook) {
        throw new Error('Selected slot is no longer available');
      }

      // Determine booking type based on slot availability
      const isScheduled = targetSlot.type === this.CONFIG.SLOT_TYPES.AVAILABLE;
      
      const appointmentData = {
        customer_id: customerId,
        barber_id: barberId,
        service_id: services[0], // Primary service
        services_data: JSON.stringify(services),
        add_ons_data: JSON.stringify(addOns),
        appointment_date: date,
        appointment_time: isScheduled ? timeSlot : null,
        status: isScheduled ? 'scheduled' : 'pending',
        appointment_type: isScheduled ? 'scheduled' : 'queue',
        priority_level: 'normal',
        total_price: this.calculateTotalPrice(services, addOns),
        total_duration: serviceDuration,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // For queue appointments, get next queue position
      if (!isScheduled) {
        const { data: nextPosition, error: positionError } = await supabase
          .rpc('get_next_queue_position', {
            p_barber_id: barberId,
            p_appointment_date: date,
            p_priority_level: 'normal'
          });

        if (positionError) throw positionError;
        appointmentData.queue_position = nextPosition;
      }

      // Insert appointment
      const { data: appointment, error: insertError } = await supabase
        .from('appointments')
        .insert([appointmentData])
        .select()
        .single();

      if (insertError) throw insertError;

      console.log('✅ Slot booked successfully:', appointment);
      return {
        success: true,
        appointment: appointment,
        bookingType: isScheduled ? 'scheduled' : 'queue',
        message: isScheduled 
          ? `Appointment scheduled for ${this.convertTo12Hour(timeSlot)}`
          : `Added to queue at position ${appointmentData.queue_position}`
      };

    } catch (error) {
      console.error('Error booking slot:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper functions
  static timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  static minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  static convertTo12Hour(time24) {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${hour12}:${minutes} ${ampm}`;
  }

  static calculateTotalPrice(services, addOns) {
    // This would integrate with your existing price calculation logic
    return 0; // Placeholder
  }
}

export default UnifiedSlotBookingService;
