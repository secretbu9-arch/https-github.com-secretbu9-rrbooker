import { supabase } from '../../supabaseClient';
import { emailService } from '../notifications/EmailService';

const OTP_EXPIRATION_MINUTES = 10;

class PasswordResetOTPService {
  constructor() {
    this.table = 'password_reset_otps';
  }

  generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  async sendOTPCode(email) {
    const startTime = performance.now();
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail) {
      throw new Error('Email address is required');
    }

    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error('Please enter a valid email address');
    }

    // Note: We don't check if user exists here to avoid exposing which emails are registered
    // The OTP will be sent regardless, and verification will fail if user doesn't exist when updating password

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60_000).toISOString();

    try {
      // Remove any existing pending codes for this email
      const { error: deleteError } = await supabase
        .from(this.table)
        .delete()
        .eq('email', normalizedEmail)
        .is('verified_at', null);

      if (deleteError) {
        console.warn('⚠️ [Password Reset OTP] Error deleting old codes:', deleteError);
      }

      // Insert new code
      const { error } = await supabase
        .from(this.table)
        .insert({
          email: normalizedEmail,
          code,
          expires_at: expiresAt
        });

      if (error) {
        console.error('❌ [Password Reset OTP] Failed to persist OTP code:', error);
        throw new Error('Unable to generate verification code. Please try again later.');
      }

      // Send email
      try {
        await emailService.sendBookingConfirmation({
          type: 'password_reset_otp',
          customer: {
            email: normalizedEmail
          },
          confirmation_code: code,
          metadata: {
            expiresAt
          }
        });
      } catch (emailError) {
        console.error('❌ [Password Reset OTP] Email sending failed:', emailError);

        // Delete the OTP code since email failed
        await supabase
          .from(this.table)
          .delete()
          .eq('email', normalizedEmail)
          .eq('code', code);

        throw new Error(
          emailError.message ||
          'Failed to send OTP code email. Please check your email service configuration or try again later.'
        );
      }

      return {
        success: true,
        expiresAt
      };
    } catch (err) {
      const totalDuration = performance.now() - startTime;
      console.error('❌ [Password Reset OTP] Error:', {
        error: err.message,
        duration: `${totalDuration.toFixed(2)}ms`
      });
      throw err;
    }
  }

  async verifyCode(email, code) {
    const startTime = performance.now();
    const normalizedEmail = this.normalizeEmail(email);
    const trimmedCode = (code || '').trim();

    if (!normalizedEmail || !trimmedCode) {
      throw new Error('Email and verification code are required');
    }

    const now = new Date().toISOString();

    // Find valid, unexpired code
    const { data, error } = await supabase
      .from(this.table)
      .select('id')
      .eq('email', normalizedEmail)
      .eq('code', trimmedCode)
      .is('verified_at', null)
      .gt('expires_at', now)
      .maybeSingle();

    if (error) {
      console.error('❌ [Password Reset OTP] Database error:', error);
      throw new Error('Unable to verify code. Please try again later.');
    }

    if (!data) {
      throw new Error('Invalid or expired verification code. Please check the code and try again.');
    }

    // Mark as verified
    const { error: updateError } = await supabase
      .from(this.table)
      .update({
        verified_at: now,
        verification_status: 'verified'
      })
      .eq('id', data.id)
      .is('verified_at', null);

    if (updateError) {
      console.error('❌ [Password Reset OTP] Update failed:', updateError);
      throw new Error('Unable to verify code. Please try again.');
    }

    return {
      success: true,
      verifiedAt: now
    };
  }

  isValidEmail(email) {
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    return emailRegex.test(email);
  }
}

export const passwordResetOTPService = new PasswordResetOTPService();

