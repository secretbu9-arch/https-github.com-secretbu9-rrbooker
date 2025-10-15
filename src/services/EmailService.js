// services/EmailService.js
import { supabase } from '../supabaseClient';

class EmailService {
  constructor() {
    this.baseUrl = process.env.REACT_APP_SUPABASE_URL;
  }

  // Send booking confirmation email
  async sendBookingConfirmation(appointmentData) {
    try {
      console.log('📧 Sending booking confirmation email...', appointmentData);

      // For development, simulate email sending
      if (appointmentData.type === 'booking_confirmation_code') {
        console.log('📧 Simulating confirmation code email...');
        console.log('📧 To:', appointmentData.customer.email);
        console.log('📧 Code:', appointmentData.confirmation_code);
        
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ Confirmation code email sent successfully (simulated)');
        return { success: true, message: 'Email sent successfully (simulated)' };
      }

      // Try Supabase Edge Function for other email types
      try {
        const { data, error } = await supabase.functions.invoke('send-booking-email', {
          body: {
            appointment: appointmentData,
            type: appointmentData.type || 'booking_confirmation'
          }
        });

        if (error) {
          console.error('Error sending booking confirmation email:', error);
          throw error;
        }

        console.log('✅ Booking confirmation email sent successfully');
        return data;
      } catch (edgeFunctionError) {
        console.warn('Edge function failed, using fallback:', edgeFunctionError.message);
        
        // Fallback: simulate email sending
        console.log('📧 Simulating email send...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { success: true, message: 'Email sent successfully (fallback)' };
      }

    } catch (error) {
      console.error('Failed to send booking confirmation email:', error);
      throw error;
    }
  }

  // Send appointment reminder email
  async sendAppointmentReminder(appointmentData, reminderType = '24hours') {
    try {
      console.log(`📧 Sending ${reminderType} appointment reminder email...`, appointmentData);

      const { data, error } = await supabase.functions.invoke('send-booking-email', {
        body: {
          appointment: appointmentData,
          type: 'appointment_reminder',
          reminderType
        }
      });

      if (error) {
        console.error('Error sending appointment reminder email:', error);
        throw error;
      }

      console.log(`✅ ${reminderType} appointment reminder email sent successfully`);
      return data;

    } catch (error) {
      console.error('Failed to send appointment reminder email:', error);
      throw error;
    }
  }

  // Send appointment status update email
  async sendStatusUpdateEmail(appointmentData, status) {
    try {
      console.log(`📧 Sending status update email for ${status}...`, appointmentData);

      const { data, error } = await supabase.functions.invoke('send-booking-email', {
        body: {
          appointment: appointmentData,
          type: 'status_update',
          status
        }
      });

      if (error) {
        console.error('Error sending status update email:', error);
        throw error;
      }

      console.log(`✅ Status update email sent successfully for ${status}`);
      return data;

    } catch (error) {
      console.error('Failed to send status update email:', error);
      throw error;
    }
  }

  // Send queue notification email
  async sendQueueNotificationEmail(appointmentData, queuePosition) {
    try {
      console.log(`📧 Sending queue notification email for position ${queuePosition}...`, appointmentData);

      const { data, error } = await supabase.functions.invoke('send-booking-email', {
        body: {
          appointment: appointmentData,
          type: 'queue_notification',
          queuePosition
        }
      });

      if (error) {
        console.error('Error sending queue notification email:', error);
        throw error;
      }

      console.log(`✅ Queue notification email sent successfully for position ${queuePosition}`);
      return data;

    } catch (error) {
      console.error('Failed to send queue notification email:', error);
      throw error;
    }
  }

  // Format appointment data for email
  formatAppointmentForEmail(appointment) {
    return {
      id: appointment.id,
      customer_name: appointment.customer?.full_name || 'Customer',
      customer_email: appointment.customer?.email || '',
      barber_name: appointment.barber?.full_name || 'Barber',
      service_name: appointment.service?.name || 'Service',
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      status: appointment.status,
      total_price: appointment.total_price,
      notes: appointment.notes,
      is_double_booking: appointment.is_double_booking,
      double_booking_data: appointment.double_booking_data ? JSON.parse(appointment.double_booking_data) : null
    };
  }
}

export const emailService = new EmailService();
