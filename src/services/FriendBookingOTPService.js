import { supabase } from '../supabaseClient';
import { emailService } from './EmailService';

const OTP_EXPIRATION_MINUTES = 10;

class FriendBookingOTPService {
  constructor() {
    this.table = 'friend_booking_otps';
  }

  generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
  }

  async sendVerificationCode(email, { friendName, requestedBy } = {}) {
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail) {
      throw new Error('Email address is required');
    }

    if (!this.isValidEmail(normalizedEmail)) {
      throw new Error('Please enter a valid email address');
    }

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60_000).toISOString();

    try {
      // Remove any existing pending codes for this email
      await supabase
        .from(this.table)
        .delete()
        .eq('email', normalizedEmail)
        .is('verified_at', null);

      const { error } = await supabase
        .from(this.table)
        .insert({
          email: normalizedEmail,
          code,
          expires_at: expiresAt,
          metadata: {
            friendName: friendName || null,
            requestedBy: requestedBy || null
          }
        });

      if (error) {
        console.error('Failed to persist OTP code:', error);
        throw new Error('Unable to generate verification code. Please try again later.');
      }

      await emailService.sendBookingConfirmation({
        type: 'booking_confirmation_code',
        customer: {
          email: normalizedEmail,
          full_name: friendName || 'Friend/Child'
        },
        confirmation_code: code,
        metadata: {
          friendName: friendName || null,
          requestedBy: requestedBy || null,
          expiresAt
        }
      });

      return {
        success: true,
        expiresAt
      };
    } catch (err) {
      console.error('Error sending friend booking verification code:', err);
      throw err;
    }
  }

  async verifyCode(email, code) {
    const normalizedEmail = this.normalizeEmail(email);
    const trimmedCode = (code || '').trim();

    if (!normalizedEmail || !trimmedCode) {
      throw new Error('Email and verification code are required');
    }

    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('email', normalizedEmail)
      .eq('code', trimmedCode)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Failed to verify OTP code:', error);
      throw new Error('Unable to verify code. Please try again later.');
    }

    if (!data) {
      throw new Error('Invalid verification code. Please check the code and try again.');
    }

    const now = new Date();
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;

    if (!expiresAt || now > expiresAt) {
      await supabase
        .from(this.table)
        .update({
          verified_at: new Date().toISOString(),
          verification_status: 'expired'
        })
        .eq('id', data.id);

      throw new Error('This verification code has expired. Please request a new code.');
    }

    const { error: updateError } = await supabase
      .from(this.table)
      .update({
        verified_at: now.toISOString(),
        verification_status: 'verified'
      })
      .eq('id', data.id);

    if (updateError) {
      console.error('Failed to update OTP verification status:', updateError);
      throw new Error('Unable to verify code. Please try again.');
    }

    return {
      success: true,
      verifiedAt: now.toISOString()
    };
  }

  async clearVerification(email) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) return;

    await supabase
      .from(this.table)
      .delete()
      .eq('email', normalizedEmail);
  }

  isValidEmail(email) {
    const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
    return emailRegex.test(email);
  }
}

export const friendBookingOTPService = new FriendBookingOTPService();







