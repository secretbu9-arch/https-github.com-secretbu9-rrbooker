// services/EmailService.js
import { supabase } from '../supabaseClient';

class EmailService {
  constructor() {
    this.baseUrl = process.env.REACT_APP_SUPABASE_URL;
  }

  // Send booking confirmation email
  async sendBookingConfirmation(appointmentData) {
    try {
      // Prepare the email payload
      const emailPayload = {
        type: appointmentData.type || 'booking_confirmation',
        customer: appointmentData.customer,
        confirmation_code: appointmentData.confirmation_code,
        metadata: appointmentData.metadata,
        appointment: appointmentData.appointment || appointmentData
      };

      // Try Supabase Edge Function to send email
      try {
        const { data, error } = await supabase.functions.invoke('send-booking-email', {
          body: emailPayload
        });

        // Handle error response from edge function
        if (error) {
          console.error('❌ Error sending booking confirmation email:', {
            error,
            errorType: error.constructor?.name,
            errorMessage: error.message,
            errorContext: error.context,
            fullError: JSON.stringify(error, null, 2)
          });
          
          // Try to extract error message from error object
          let errorMessage = error.message || 'Failed to send email';
          
          // Try to extract error message from response body
          // Supabase FunctionsHttpError has context.json() method
          if (error.context) {
            // Method 1: Try context.json() if available (FunctionsHttpError)
            if (typeof error.context.json === 'function') {
              try {
                const errorBody = await error.context.json();
                console.log('📋 Error response body (from json()):', errorBody);
                
                if (errorBody?.error) {
                  errorMessage = errorBody.error;
                } else if (errorBody?.message) {
                  errorMessage = errorBody.message;
                }
              } catch (e) {
                console.warn('Could not parse error response body from json():', e);
              }
            }
            
            // Method 2: Try context.body directly
            if (error.context.body) {
              try {
                const errorBody = typeof error.context.body === 'string' 
                  ? JSON.parse(error.context.body) 
                  : error.context.body;
                console.log('📋 Error response body (from body):', errorBody);
                
                if (errorBody?.error && errorMessage === error.message) {
                  errorMessage = errorBody.error;
                } else if (errorBody?.message && errorMessage === error.message) {
                  errorMessage = errorBody.message;
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
            
            // Method 3: Try context.response
            if (error.context.response) {
              try {
                const errorBody = typeof error.context.response === 'string'
                  ? JSON.parse(error.context.response)
                  : error.context.response;
                console.log('📋 Error response body (from response):', errorBody);
                
                if (errorBody?.error && errorMessage === error.message) {
                  errorMessage = errorBody.error;
                } else if (errorBody?.message && errorMessage === error.message) {
                  errorMessage = errorBody.message;
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
            
            // Method 4: Try context.data
            if (error.context.data && errorMessage === error.message) {
              try {
                const errorBody = typeof error.context.data === 'string'
                  ? JSON.parse(error.context.data)
                  : error.context.data;
                console.log('📋 Error response body (from data):', errorBody);
                
                if (errorBody?.error) {
                  errorMessage = errorBody.error;
                } else if (errorBody?.message) {
                  errorMessage = errorBody.message;
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
          
          // For OTP emails, provide a clear error message
          if (appointmentData.type === 'booking_confirmation_code') {
            // Provide more helpful error message based on common issues
            if (errorMessage.includes('not configured') || errorMessage.includes('Email service')) {
              errorMessage = 'Email service is not configured. Please contact support to configure the email service. The verification code cannot be sent at this time.';
            } else if (errorMessage.includes('unauthorized_client') || errorMessage.includes('Unauthorized')) {
              errorMessage = 'Gmail authentication failed. The refresh token may be expired or invalid. Please contact support to update the Gmail API credentials.';
            } else if (errorMessage.includes('invalid_grant')) {
              errorMessage = 'Gmail refresh token is invalid or expired. Please contact support to regenerate the Gmail API refresh token.';
            } else if (errorMessage.includes('Gmail access token') || errorMessage.includes('Gmail API')) {
              errorMessage = 'Gmail API authentication error. Please contact support to verify the Gmail API credentials are correctly configured.';
            } else if (errorMessage === 'Edge Function returned a non-2xx status code' || errorMessage === 'Failed to send email' || errorMessage.includes('non-2xx')) {
              // Most common cause: email service not configured
              errorMessage = 'Failed to send verification code email. This usually means the email service is not configured. Please check your email service configuration in Supabase Edge Functions secrets (Gmail, Mailgun, or SendGrid) or contact support.';
            }
            console.error('❌ Final error message for OTP:', errorMessage);
            throw new Error(errorMessage);
          }
          
          throw new Error(errorMessage);
        }

        // Check if email was simulated or failed (email service not configured)
        if (data?.simulated || !data?.success) {
          const errorMessage = data?.error || 'Email service is not configured';
          console.error('❌ Email service error:', errorMessage);
          console.error('❌ Please configure one of the following in Supabase Edge Functions secrets:');
          console.error('   - Mailgun: MAILGUN_API_KEY and MAILGUN_DOMAIN');
          console.error('   - SendGrid: SENDGRID_API_KEY');
          console.error('   - Gmail: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN');
          
          // For OTP emails, always throw an error
          if (appointmentData.type === 'booking_confirmation_code') {
            throw new Error(errorMessage || 'Email service is not configured. Please contact support to configure the email service. The verification code cannot be sent at this time.');
          }
          
          // For other emails, log warning but allow to continue
          console.warn('⚠️ Email was not sent:', errorMessage);
          return { 
            success: false, 
            message: errorMessage,
            simulated: true 
          };
        }

        return data;
      } catch (edgeFunctionError) {
        console.error('Edge function error:', edgeFunctionError);
        
          // For OTP emails, provide a clear error message
          if (appointmentData.type === 'booking_confirmation_code' || appointmentData.type === 'password_reset_otp') {
            const errorMessage = edgeFunctionError.message || 'Failed to send verification code email. Please check your email service configuration or try again later.';
            throw new Error(errorMessage);
          }
        
        // For other emails, re-throw the error
        throw edgeFunctionError;
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
