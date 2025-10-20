/**
 * BarberAvailabilityService
 * 
 * Comprehensive service for managing barber availability, day-offs, and busy status
 * Handles all scenarios where barbers cannot accept new appointments
 * 
 * @version 1.0.0
 */

import { supabase } from '../supabaseClient';
import CentralizedNotificationService from './CentralizedNotificationService';

class BarberAvailabilityService {
  constructor() {
    this.AVAILABILITY_TYPES = {
      AVAILABLE: 'available',
      BUSY: 'busy',
      BREAK: 'break',
      OFFLINE: 'offline',
      DAY_OFF: 'day_off',
      SICK_LEAVE: 'sick_leave',
      VACATION: 'vacation',
      EMERGENCY: 'emergency'
    };

    this.BUSINESS_HOURS = {
      start: '08:00',
      end: '17:00'
    };
  }

  /**
   * Check if a barber is available for booking on a specific date
   * @param {string} barberId - Barber UUID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} timeSlot - Time slot (optional, for specific time checks)
   * @returns {Promise<Object>} Availability status and details
   */
  async checkBarberAvailability(barberId, date, timeSlot = null) {
    try {
      console.log('🔍 Checking barber availability:', { barberId, date, timeSlot });

      // 1. Check barber's current status
      const { data: barber, error: barberError } = await supabase
        .from('users')
        .select('id, full_name, barber_status')
        .eq('id', barberId)
        .eq('role', 'barber')
        .single();

      if (barberError) {
        console.warn('⚠️ Error fetching barber info:', barberError);
        // If we can't fetch barber info, assume available for now
        return {
          isAvailable: true,
          reason: 'Barber availability check unavailable',
          type: 'unknown'
        };
      }

      if (!barber) {
        return {
          isAvailable: false,
          reason: 'Barber not found',
          type: 'not_found'
        };
      }

      // Note: is_active column doesn't exist in users table, so we skip this check

      // 2. Check if barber is offline
      if (barber.barber_status === 'offline') {
        return {
          isAvailable: false,
          reason: 'Barber is currently offline',
          type: 'offline',
          barberName: barber.full_name
        };
      }

      // 3. Check for scheduled day-offs (with fallback)
      console.log('🔍 Checking day-off status for barber:', barberId, 'date:', date);
      const dayOffStatus = await this.checkDayOff(barberId, date);
      console.log('📅 Day-off status result:', dayOffStatus);
      
      if (!dayOffStatus.isAvailable) {
        console.log('❌ Barber is on day-off:', dayOffStatus);
        return {
          isAvailable: false,
          reason: dayOffStatus.reason,
          type: 'day_off',
          barberName: barber.full_name,
          dayOffType: dayOffStatus.type,
          endDate: dayOffStatus.endDate
        };
      }

      // 4. Check business hours
      const businessHoursStatus = this.checkBusinessHours(date, timeSlot);
      if (!businessHoursStatus.isAvailable) {
        return {
          isAvailable: false,
          reason: businessHoursStatus.reason,
          type: 'outside_hours',
          barberName: barber.full_name
        };
      }

      // 5. Check if barber is at capacity (if timeSlot provided)
      if (timeSlot) {
        const capacityStatus = await this.checkBarberCapacity(barberId, date, timeSlot);
        if (!capacityStatus.isAvailable) {
          return {
            isAvailable: false,
            reason: capacityStatus.reason,
            type: 'at_capacity',
            barberName: barber.full_name,
            nextAvailableTime: capacityStatus.nextAvailableTime
          };
        }
      }

      // 6. Check if barber is currently busy (for real-time bookings)
      if (this.isCurrentTime(date)) {
        const busyStatus = await this.checkCurrentBusyStatus(barberId, date);
        if (!busyStatus.isAvailable) {
          return {
            isAvailable: false,
            reason: busyStatus.reason,
            type: 'currently_busy',
            barberName: barber.full_name,
            estimatedAvailableTime: busyStatus.estimatedAvailableTime
          };
        }
      }

      return {
        isAvailable: true,
        reason: 'Barber is available for booking',
        type: 'available',
        barberName: barber.full_name,
        barberStatus: barber.barber_status
      };

    } catch (error) {
      console.error('❌ Error checking barber availability:', error);
      // Return available by default to prevent blocking bookings
      return {
        isAvailable: true,
        reason: 'Availability check failed - assuming available',
        type: 'fallback',
        error: error.message
      };
    }
  }

  /**
   * Check if barber has a scheduled day-off
   * @param {string} barberId - Barber UUID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Day-off status
   */
  async checkDayOff(barberId, date) {
    try {
      console.log('🔍 Checking day-offs for barber:', barberId, 'date:', date);
      
      // Check if table exists first
      const { data: dayOffs, error } = await supabase
        .from('barber_day_offs')
        .select('*')
        .eq('barber_id', barberId)
        .lte('start_date', date)
        .gte('end_date', date)
        .eq('is_active', true)
        .order('start_date', { ascending: true });

      console.log('📊 Day-offs query result:', { dayOffs, error });

      if (error) {
        console.warn('⚠️ Day-off table may not exist or RLS issue:', error);
        // If table doesn't exist or RLS issue, assume no day-offs
        return { isAvailable: true };
      }

      console.log('📅 Found day-offs:', dayOffs?.length || 0);
      if (dayOffs && dayOffs.length > 0) {
        const dayOff = dayOffs[0];
        console.log('❌ Barber has day-off:', dayOff);
        return {
          isAvailable: false,
          reason: `Barber is on ${dayOff.type.replace('_', ' ')} from ${dayOff.start_date} to ${dayOff.end_date}`,
          type: dayOff.type,
          endDate: dayOff.end_date,
          reason_detail: dayOff.reason
        };
      }

      console.log('✅ No day-offs found for this date');

      return { isAvailable: true };

    } catch (error) {
      console.error('❌ Error checking day-off:', error);
      return { isAvailable: true }; // Default to available if error
    }
  }

  /**
   * Check if the requested time is within business hours
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} timeSlot - Time slot (optional)
   * @returns {Object} Business hours status
   */
  checkBusinessHours(date, timeSlot = null) {
    const requestedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    requestedDate.setHours(0, 0, 0, 0);

    // Check if date is in the past
    if (requestedDate < today) {
      return {
        isAvailable: false,
        reason: 'Cannot book appointments in the past'
      };
    }

    // Check if timeSlot is provided and within business hours
    if (timeSlot) {
      const time = timeSlot.slice(0, 5); // Remove seconds if present
      if (time < this.BUSINESS_HOURS.start || time >= this.BUSINESS_HOURS.end) {
        return {
          isAvailable: false,
          reason: `Appointments are only available between ${this.BUSINESS_HOURS.start} and ${this.BUSINESS_HOURS.end}`
        };
      }
    }

    return { isAvailable: true };
  }

  /**
   * Check if barber is at capacity for the requested time
   * @param {string} barberId - Barber UUID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} timeSlot - Time slot
   * @returns {Promise<Object>} Capacity status
   */
  async checkBarberCapacity(barberId, date, timeSlot) {
    try {
      // Get existing appointments for the time slot
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('id, appointment_time, total_duration, status, appointment_type')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing']);

      if (error) throw error;

      // Check for time conflicts
      const timeConflicts = appointments?.filter(apt => {
        if (!apt.appointment_time) return false;
        
        const aptStart = apt.appointment_time.slice(0, 5);
        const aptEnd = this.addMinutesToTime(aptStart, apt.total_duration || 30);
        const requestedStart = timeSlot.slice(0, 5);
        const requestedEnd = this.addMinutesToTime(requestedStart, 30); // Default 30 min

        return this.timeRangesOverlap(aptStart, aptEnd, requestedStart, requestedEnd);
      }) || [];

      if (timeConflicts.length > 0) {
        // Find next available time
        const nextAvailable = await this.findNextAvailableTime(barberId, date, timeSlot);
        return {
          isAvailable: false,
          reason: 'Time slot is already booked',
          nextAvailableTime: nextAvailable
        };
      }

      return { isAvailable: true };

    } catch (error) {
      console.error('❌ Error checking barber capacity:', error);
      return { isAvailable: true }; // Default to available if error
    }
  }

  /**
   * Check if barber is currently busy (for real-time bookings)
   * @param {string} barberId - Barber UUID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Current busy status
   */
  async checkCurrentBusyStatus(barberId, date) {
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const currentDate = now.toISOString().split('T')[0];

      // Only check if it's the current date
      if (date !== currentDate) {
        return { isAvailable: true };
      }

      // Get current appointments
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('id, appointment_time, total_duration, status, appointment_type')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['ongoing', 'confirmed'])
        .not('appointment_time', 'is', null);

      if (error) throw error;

      // Check if barber is currently with a customer
      const currentAppointment = appointments?.find(apt => {
        const aptStart = apt.appointment_time.slice(0, 5);
        const aptEnd = this.addMinutesToTime(aptStart, apt.total_duration || 30);
        return currentTime >= aptStart && currentTime <= aptEnd;
      });

      if (currentAppointment) {
        const aptEnd = this.addMinutesToTime(
          currentAppointment.appointment_time.slice(0, 5),
          currentAppointment.total_duration || 30
        );
        
        return {
          isAvailable: false,
          reason: 'Barber is currently with a customer',
          estimatedAvailableTime: aptEnd
        };
      }

      return { isAvailable: true };

    } catch (error) {
      console.error('❌ Error checking current busy status:', error);
      return { isAvailable: true };
    }
  }

  /**
   * Set barber as unavailable for a specific date range
   * @param {string} barberId - Barber UUID
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @param {string} type - Type of unavailability (day_off, sick_leave, vacation, emergency)
   * @param {string} reason - Reason for unavailability
   * @returns {Promise<Object>} Result of the operation
   */
  async setBarberUnavailable(barberId, startDate, endDate, type, reason = '') {
    try {
      console.log('📅 Setting barber unavailable:', { barberId, startDate, endDate, type, reason });

      // Validate dates
      if (new Date(startDate) > new Date(endDate)) {
        throw new Error('Start date cannot be after end date');
      }

      // Check for overlapping day-offs using database function
      const { data: hasOverlap, error: checkError } = await supabase
        .rpc('check_day_off_overlap', {
          p_barber_id: barberId,
          p_start_date: startDate,
          p_end_date: endDate
        });

      if (checkError) {
        console.warn('⚠️ RPC function may not exist, using fallback check:', checkError);
        // Fallback to manual check if RPC function doesn't exist
        const { data: existingDayOffs, error: fallbackError } = await supabase
          .from('barber_day_offs')
          .select('id, start_date, end_date, type')
          .eq('barber_id', barberId)
          .eq('is_active', true);

        if (fallbackError) {
          console.warn('⚠️ Day-off table may not exist:', fallbackError);
          // If table doesn't exist, proceed without overlap check
        } else {
          // Manual overlap check
          const hasManualOverlap = existingDayOffs?.some(dayOff => {
            return (startDate <= dayOff.end_date && endDate >= dayOff.start_date);
          });

          if (hasManualOverlap) {
            return {
              success: false,
              error: 'Overlapping day-off already exists',
              overlapping: existingDayOffs?.find(dayOff => 
                startDate <= dayOff.end_date && endDate >= dayOff.start_date
              )
            };
          }
        }
      } else if (hasOverlap) {
        // Get the overlapping day-off for details
        const { data: overlapping, error: fetchError } = await supabase
          .from('barber_day_offs')
          .select('id, start_date, end_date, type')
          .eq('barber_id', barberId)
          .eq('is_active', true)
          .or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`)
          .limit(1);

        if (fetchError) throw fetchError;

        return {
          success: false,
          error: 'Overlapping day-off already exists',
          overlapping: overlapping?.[0]
        };
      }

      // Create day-off record
      const { data, error } = await supabase
        .from('barber_day_offs')
        .insert({
          barber_id: barberId,
          start_date: startDate,
          end_date: endDate,
          type: type,
          reason: reason,
          is_active: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.warn('⚠️ Day-off table may not exist, cannot create day-off record:', error);
        return {
          success: false,
          error: 'Day-off functionality not available. Please contact administrator to set up the system.',
          requiresSetup: true
        };
      }

      // Cancel existing appointments in the date range
      await this.cancelAppointmentsInRange(barberId, startDate, endDate, reason);

      return {
        success: true,
        data: data,
        message: 'Barber marked as unavailable successfully'
      };

    } catch (error) {
      console.error('❌ Error setting barber unavailable:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cancel existing appointments when barber becomes unavailable
   * @param {string} barberId - Barber UUID
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {string} reason - Cancellation reason
   */
  async cancelAppointmentsInRange(barberId, startDate, endDate, reason) {
    try {
      // Get appointments to cancel
      const { data: appointments, error: fetchError } = await supabase
        .from('appointments')
        .select('id, customer_id, appointment_date, appointment_time, customer:customer_id(full_name, email)')
        .eq('barber_id', barberId)
        .gte('appointment_date', startDate)
        .lte('appointment_date', endDate)
        .in('status', ['scheduled', 'confirmed', 'pending']);

      if (fetchError) throw fetchError;

      if (!appointments || appointments.length === 0) {
        return;
      }

      // Cancel appointments
      const { error: cancelError } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          cancellation_reason: `Barber unavailable: ${reason}`,
          updated_at: new Date().toISOString()
        })
        .eq('barber_id', barberId)
        .gte('appointment_date', startDate)
        .lte('appointment_date', endDate)
        .in('status', ['scheduled', 'confirmed', 'pending']);

      if (cancelError) throw cancelError;

      // Send notifications to customers
      for (const appointment of appointments) {
        if (appointment.customer) {
          await CentralizedNotificationService.createNotification({
            userId: appointment.customer_id,
            title: 'Appointment Cancelled - Barber Unavailable',
            message: `Your appointment on ${appointment.appointment_date} at ${appointment.appointment_time || 'scheduled time'} has been cancelled because your barber is unavailable.${reason ? ` Reason: ${reason}` : ''} Please reschedule or book with another barber.`,
            type: 'appointment_cancelled_barber_unavailable',
            channels: ['app', 'push', 'email'],
            appointmentId: appointment.id,
            data: {
              cancellation_reason: reason,
              barber_unavailable: true
            }
          });
        }
      }

      console.log(`✅ Cancelled ${appointments.length} appointments due to barber unavailability`);

    } catch (error) {
      console.error('❌ Error cancelling appointments:', error);
    }
  }

  /**
   * Get barber's availability schedule for a date range
   * @param {string} barberId - Barber UUID
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Promise<Object>} Availability schedule
   */
  async getBarberAvailabilitySchedule(barberId, startDate, endDate) {
    try {
      const { data: dayOffs, error } = await supabase
        .from('barber_day_offs')
        .select('*')
        .eq('barber_id', barberId)
        .eq('is_active', true)
        .gte('start_date', startDate)
        .lte('end_date', endDate)
        .order('start_date', { ascending: true });

      if (error) throw error;

      return {
        dayOffs: dayOffs || [],
        availableDates: this.generateAvailableDates(startDate, endDate, dayOffs || [])
      };

    } catch (error) {
      console.error('❌ Error getting availability schedule:', error);
      return { dayOffs: [], availableDates: [] };
    }
  }

  /**
   * Find next available time slot for a barber
   * @param {string} barberId - Barber UUID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} currentTime - Current time slot
   * @returns {Promise<string>} Next available time
   */
  async findNextAvailableTime(barberId, date, currentTime) {
    try {
      const timeSlots = this.generateTimeSlots();
      const currentIndex = timeSlots.indexOf(currentTime.slice(0, 5));
      
      for (let i = currentIndex + 1; i < timeSlots.length; i++) {
        const timeSlot = timeSlots[i];
        const availability = await this.checkBarberAvailability(barberId, date, timeSlot);
        if (availability.isAvailable) {
          return timeSlot;
        }
      }

      // If no time available today, suggest next available date
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      return nextDate.toISOString().split('T')[0];

    } catch (error) {
      console.error('❌ Error finding next available time:', error);
      return null;
    }
  }

  // Helper methods
  isCurrentTime(date) {
    const today = new Date().toISOString().split('T')[0];
    return date === today;
  }

  addMinutesToTime(time, minutes) {
    const [hours, mins] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMinutes / 60);
    const newMins = totalMinutes % 60;
    return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
  }

  timeRangesOverlap(start1, end1, start2, end2) {
    return start1 < end2 && start2 < end1;
  }

  generateTimeSlots() {
    const slots = [];
    for (let hour = 8; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += 30) { // Reverted to 30-minute intervals
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }

  generateAvailableDates(startDate, endDate, dayOffs) {
    const availableDates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      const isDayOff = dayOffs.some(dayOff => 
        dateStr >= dayOff.start_date && dateStr <= dayOff.end_date
      );
      
      if (!isDayOff) {
        availableDates.push(dateStr);
      }
    }

    return availableDates;
  }
}

export default new BarberAvailabilityService();
