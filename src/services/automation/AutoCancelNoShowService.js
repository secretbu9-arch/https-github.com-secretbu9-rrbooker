// services/AutoCancelNoShowService.js
// Service to auto-cancel confirmed appointments where customer didn't attend
import { supabase } from '../../supabaseClient';

class AutoCancelNoShowService {
  constructor() {
    // Grace period in minutes after scheduled time before auto-cancelling
    // Default: 30 minutes (customer has 30 min grace period to arrive)
    this.GRACE_PERIOD_MINUTES = 30;

    // For queue appointments, check if they should have started by now
    this.QUEUE_CHECK_BUFFER_MINUTES = 15;
  }

  /**
   * Check and auto-cancel confirmed appointments that didn't attend
   * @param {number} gracePeriodMinutes - Optional grace period override
   * @returns {Promise<Object>} Result with cancelled appointments count
   */
  async cancelNoShowAppointments(gracePeriodMinutes = null) {
    try {
      const gracePeriod = gracePeriodMinutes || this.GRACE_PERIOD_MINUTES;
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

      console.log('🔍 Checking for no-show appointments...', { today, currentTime, gracePeriod });

      // Calculate cutoff time (current time - grace period)
      const cutoffTime = this.subtractMinutes(currentTime, gracePeriod);

      // Find confirmed/scheduled appointments for today and past dates that:
      // 1. Are confirmed or scheduled (not pending, not ongoing, not completed, not cancelled)
      // 2. Have appointment_date <= today (today or past)
      // 3. Have appointment_time that has passed (with grace period) OR are queue appointments
      // 4. Status is still 'confirmed' or 'scheduled' (not started)

      const { data: appointments, error: fetchError } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email),
          barber:barber_id(id, full_name, email),
          service:service_id(id, name, duration)
        `)
        .lte('appointment_date', today)
        .in('status', ['confirmed', 'scheduled'])
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: true, nullsLast: true });

      if (fetchError) throw fetchError;

      if (!appointments || appointments.length === 0) {
        console.log('✅ No appointments to check');
        return {
          success: true,
          cancelledCount: 0,
          cancelledAppointments: []
        };
      }

      // Group appointments by barber and date for queue calculations
      const appointmentsByBarberDate = {};
      appointments.forEach(apt => {
        const key = `${apt.barber_id}_${apt.appointment_date}`;
        if (!appointmentsByBarberDate[key]) {
          appointmentsByBarberDate[key] = [];
        }
        appointmentsByBarberDate[key].push(apt);
      });

      const cancelledAppointments = [];

      for (const appointment of appointments) {
        let shouldCancel = false;
        let estimatedStartTime = null;

        // If appointment is for a past date, cancel it immediately (regardless of time)
        if (appointment.appointment_date < today) {
          shouldCancel = true;
          estimatedStartTime = appointment.appointment_time || (appointment.appointment_type === 'queue' ? 'estimated start time' : 'scheduled time');
          console.log(`📅 Past date appointment found - will cancel:`, {
            id: appointment.id,
            date: appointment.appointment_date,
            today: today,
            type: appointment.appointment_type,
            queue_position: appointment.queue_position
          });
        }
        // Check if it's a scheduled appointment with exact time (for today)
        else if (appointment.appointment_time) {
          const appointmentTime = appointment.appointment_time;
          shouldCancel = this.shouldCancelAppointment(appointmentTime, currentTime, cutoffTime, appointment);
          estimatedStartTime = appointmentTime;
        }
        // Check if it's a queue appointment (for today)
        else if (appointment.appointment_type === 'queue' && appointment.queue_position && appointment.appointment_date === today) {
          // Get all appointments for this barber on this date
          const key = `${appointment.barber_id}_${appointment.appointment_date}`;
          const barberAppointments = appointmentsByBarberDate[key] || [];

          // Calculate estimated start time based on queue position
          estimatedStartTime = this.calculateQueueStartTime(
            appointment.appointment_date,
            appointment.queue_position,
            appointment.barber_id,
            barberAppointments.filter(apt =>
              apt.queue_position < appointment.queue_position &&
              apt.appointment_type === 'queue' &&
              apt.id !== appointment.id
            )
          );

          if (estimatedStartTime) {
            // Check if estimated start time has passed (with grace period)
            shouldCancel = this.shouldCancelAppointment(estimatedStartTime, currentTime, cutoffTime, appointment);
          }
        }

        if (shouldCancel) {
          const timeDisplay = estimatedStartTime || appointment.appointment_time || 'scheduled time';
          console.log(`❌ Auto-cancelling no-show appointment:`, {
            id: appointment.id,
            time: timeDisplay,
            type: appointment.appointment_type,
            queue_position: appointment.queue_position,
            status: appointment.status,
            customer: appointment.customer?.full_name,
            date: appointment.appointment_date
          });

          // Cancel the appointment
          const cancellationReason = appointment.appointment_type === 'queue'
            ? `Automatically cancelled: Customer did not attend at estimated start time (${timeDisplay}). Grace period of ${gracePeriod} minutes exceeded.`
            : `Automatically cancelled: Customer did not attend at scheduled time (${timeDisplay}). Grace period of ${gracePeriod} minutes exceeded.`;

          const { error: cancelError } = await supabase
            .from('appointments')
            .update({
              status: 'cancelled',
              cancellation_reason: cancellationReason,
              queue_position: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', appointment.id);

          if (cancelError) {
            console.error(`❌ Error cancelling appointment ${appointment.id}:`, cancelError);
            continue;
          }

          cancelledAppointments.push(appointment);

          // Create notification for customer
          if (appointment.customer_id) {
            try {
              const { CentralizedNotificationService } = await import('./CentralizedNotificationService');
              await CentralizedNotificationService.createNotification({
                userId: appointment.customer_id,
                title: 'Appointment Cancelled',
                message: `Your appointment scheduled for ${appointment.appointment_time} on ${appointment.appointment_date} has been automatically cancelled because you did not attend.`,
                type: 'appointment_cancelled',
                appointmentId: appointment.id,
                data: {
                  reason: 'no_show',
                  scheduled_time: appointment.appointment_time,
                  scheduled_date: appointment.appointment_date
                }
              });
            } catch (notifError) {
              console.error('Error creating notification:', notifError);
            }
          }

          // Create notification for barber
          if (appointment.barber_id) {
            try {
              const { CentralizedNotificationService } = await import('./CentralizedNotificationService');
              await CentralizedNotificationService.createNotification({
                userId: appointment.barber_id,
                title: 'Appointment Auto-Cancelled',
                message: `Appointment with ${appointment.customer?.full_name || 'customer'} scheduled for ${appointment.appointment_time} was automatically cancelled due to no-show.`,
                type: 'appointment_cancelled',
                appointmentId: appointment.id,
                data: {
                  reason: 'no_show',
                  customer_name: appointment.customer?.full_name
                }
              });
            } catch (notifError) {
              console.error('Error creating barber notification:', notifError);
            }
          }

          // Log the cancellation
          try {
            await supabase.from('system_logs').insert({
              user_id: appointment.customer_id,
              action: 'appointment_auto_cancelled_no_show',
              details: {
                appointment_id: appointment.id,
                scheduled_time: appointment.appointment_time,
                grace_period: gracePeriod
              }
            });
          } catch (logError) {
            console.error('Error logging cancellation:', logError);
          }
        }
      }

      console.log(`✅ Auto-cancellation complete. Cancelled ${cancelledAppointments.length} no-show appointments.`);

      return {
        success: true,
        cancelledCount: cancelledAppointments.length,
        cancelledAppointments: cancelledAppointments.map(apt => ({
          id: apt.id,
          customer: apt.customer?.full_name,
          time: apt.appointment_time,
          date: apt.appointment_date
        }))
      };

    } catch (error) {
      console.error('❌ Error in auto-cancel no-show service:', error);
      throw error;
    }
  }

  /**
   * Check if an appointment should be cancelled
   * @param {string} appointmentTime - Appointment time in HH:MM format
   * @param {string} currentTime - Current time in HH:MM format
   * @param {string} cutoffTime - Cutoff time (current - grace period) in HH:MM format
   * @param {Object} appointment - Full appointment object
   * @returns {boolean} True if should cancel
   */
  shouldCancelAppointment(appointmentTime, currentTime, cutoffTime, appointment) {
    // Convert times to minutes for comparison
    const appointmentMinutes = this.timeToMinutes(appointmentTime);
    const currentMinutes = this.timeToMinutes(currentTime);
    const cutoffMinutes = this.timeToMinutes(cutoffTime);

    // Check if appointment time has passed the cutoff (with grace period)
    // If appointment was at 10:00 AM, current time is 10:35 AM, and grace is 30 min
    // Cutoff would be 10:05 AM (10:35 - 30 min)
    // Since 10:00 < 10:05, we should cancel

    if (appointmentMinutes < cutoffMinutes) {
      return true;
    }

    return false;
  }

  /**
   * Convert time string (HH:MM) to minutes since midnight
   * @param {string} timeString - Time in HH:MM format
   * @returns {number} Minutes since midnight
   */
  timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Subtract minutes from a time string
   * @param {string} timeString - Time in HH:MM format
   * @param {number} minutes - Minutes to subtract
   * @returns {string} New time in HH:MM format
   */
  subtractMinutes(timeString, minutes) {
    const totalMinutes = this.timeToMinutes(timeString);
    const newMinutes = totalMinutes - minutes;

    // Handle negative (previous day)
    if (newMinutes < 0) {
      return '00:00';
    }

    const hours = Math.floor(newMinutes / 60);
    const mins = newMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate estimated start time for a queue appointment
   * @param {string} appointmentDate - Date in YYYY-MM-DD format
   * @param {number} queuePosition - Queue position (1, 2, 3, etc.)
   * @param {string} barberId - Barber ID
   * @param {Array} previousQueueAppointments - Previous appointments in queue
   * @returns {string|null} Estimated start time in HH:MM format or null
   */
  calculateQueueStartTime(appointmentDate, queuePosition, barberId, previousQueueAppointments) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const isToday = appointmentDate === today;

    // First customer starts at 8:00 AM
    const FIRST_QUEUE_START = '08:00';
    const BUSINESS_START = '07:30';
    const LUNCH_START = '12:00';
    const LUNCH_END = '13:00';
    const BUSINESS_END = '17:00';

    if (queuePosition === 1) {
      // Position 1 starts at 8:00 AM (for future dates) or max(current time, 8:00 AM) for today
      if (isToday) {
        const currentMinutes = this.timeToMinutes(now.toTimeString().slice(0, 5));
        const firstQueueMinutes = this.timeToMinutes(FIRST_QUEUE_START);
        return this.minutesToTime(Math.max(firstQueueMinutes, currentMinutes));
      }
      return FIRST_QUEUE_START;
    }

    // For position 2+, calculate based on previous appointments
    let estimatedMinutes = this.timeToMinutes(BUSINESS_START);

    // Add time for all previous queue appointments
    previousQueueAppointments.forEach(prevApt => {
      const duration = prevApt.total_duration || prevApt.service?.duration || 30;
      estimatedMinutes += duration + 5; // Add 5 min buffer

      // Skip lunch break if needed
      if (estimatedMinutes >= this.timeToMinutes(LUNCH_START) && estimatedMinutes < this.timeToMinutes(LUNCH_END)) {
        estimatedMinutes = this.timeToMinutes(LUNCH_END);
      }
    });

    // For today, ensure we don't go before current time
    if (isToday) {
      const currentMinutes = this.timeToMinutes(now.toTimeString().slice(0, 5));
      estimatedMinutes = Math.max(estimatedMinutes, currentMinutes);
    }

    // Ensure we don't exceed business hours
    if (estimatedMinutes >= this.timeToMinutes(BUSINESS_END)) {
      return null; // Can't fit in business hours
    }

    return this.minutesToTime(estimatedMinutes);
  }

  /**
   * Convert minutes to time string (HH:MM)
   */
  minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Check and cancel no-show appointments for queue appointments
   * Queue appointments don't have exact times, so we check based on estimated start times
   */
  async cancelNoShowQueueAppointments() {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().slice(0, 5);

      console.log('🔍 Checking for no-show queue appointments...', { today, currentTime });

      // Get confirmed queue appointments for today
      const { data: queueAppointments, error: fetchError } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email),
          barber:barber_id(id, full_name, email),
          service:service_id(id, name, duration)
        `)
        .eq('appointment_date', today)
        .eq('appointment_type', 'queue')
        .in('status', ['confirmed', 'scheduled'])
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: true });

      if (fetchError) throw fetchError;

      if (!queueAppointments || queueAppointments.length === 0) {
        return {
          success: true,
          cancelledCount: 0,
          cancelledAppointments: []
        };
      }

      // For queue appointments, we need to check if they should have started by now
      // This is more complex - we'd need to calculate estimated start times
      // For now, we'll use a simpler approach: if it's past business hours end and still confirmed, cancel

      const businessEnd = '17:00'; // 5:00 PM
      const cancelledAppointments = [];

      // If current time is past business end, cancel all remaining confirmed queue appointments
      if (this.timeToMinutes(currentTime) >= this.timeToMinutes(businessEnd)) {
        for (const appointment of queueAppointments) {
          console.log(`❌ Auto-cancelling queue appointment after business hours:`, {
            id: appointment.id,
            queue_position: appointment.queue_position,
            customer: appointment.customer?.full_name
          });

          const { error: cancelError } = await supabase
            .from('appointments')
            .update({
              status: 'cancelled',
              cancellation_reason: 'Automatically cancelled: Customer did not attend. Business hours ended without service being started.',
              queue_position: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', appointment.id);

          if (!cancelError) {
            cancelledAppointments.push(appointment);

            // Create notifications (similar to scheduled appointments)
            // ... (notification code similar to above)
          }
        }
      }

      return {
        success: true,
        cancelledCount: cancelledAppointments.length,
        cancelledAppointments
      };

    } catch (error) {
      console.error('❌ Error cancelling no-show queue appointments:', error);
      throw error;
    }
  }

  /**
   * Run both checks (scheduled and queue appointments)
   */
  async cancelAllNoShowAppointments(gracePeriodMinutes = null) {
    try {
      // The main cancelNoShowAppointments now handles both scheduled and queue
      const result = await this.cancelNoShowAppointments(gracePeriodMinutes);

      // Also run the separate queue check for additional coverage
      const queueResult = await this.cancelNoShowQueueAppointments();

      return {
        success: true,
        scheduled: result,
        queue: queueResult,
        totalCancelled: result.cancelledCount + queueResult.cancelledCount
      };
    } catch (error) {
      console.error('❌ Error in cancelAllNoShowAppointments:', error);
      throw error;
    }
  }

  /**
   * Manually trigger cancellation check (for testing or immediate execution)
   */
  async manualCheck() {
    console.log('🔧 Manual no-show check triggered');
    return await this.cancelAllNoShowAppointments();
  }
}

const service = new AutoCancelNoShowService();

// Expose to window for manual testing/debugging
if (typeof window !== 'undefined') {
  window.AutoCancelNoShowService = service;
  console.log('🔧 AutoCancelNoShowService available at window.AutoCancelNoShowService');
  console.log('💡 To manually trigger: await window.AutoCancelNoShowService.manualCheck()');
}

export default service;

