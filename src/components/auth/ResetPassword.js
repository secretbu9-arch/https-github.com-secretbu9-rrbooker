// components/auth/ResetPassword.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { passwordResetOTPService } from '../../services/PasswordResetOTPService';
import './Login.css'; // Reuse Login styles

const ResetPassword = () => {
  const [step, setStep] = useState(1); // 1: email+password, 2: OTP sent, 3: verify OTP
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Check for token in URL (from email link)
  useEffect(() => {
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    
    if (token && type === 'recovery') {
      // User came from email link, extract email from URL or session
      const emailFromUrl = searchParams.get('email');
      if (emailFromUrl) {
        setEmail(emailFromUrl);
        setOtpCode(token);
        setStep(2);
      }
    }
  }, [searchParams]);

  // Step 1: Enter email and new password, then send OTP
  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);

    try {
      // Send OTP code using custom OTP service
      await passwordResetOTPService.sendOTPCode(email);
      setSuccess('OTP code has been sent to your email. Please check your inbox.');
      setStep(2);
    } catch (err) {
      console.error('Error sending OTP:', err);
      setError(err.message || 'Failed to send OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP and update password
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!otpCode || otpCode.length < 6) {
      setError('Please enter a valid OTP code');
      return;
    }

    setLoading(true);

    try {
      // Call Edge Function to verify OTP and update password
      const { data, error: functionError } = await supabase.functions.invoke('reset-password-with-otp', {
        body: {
          email,
          code: otpCode,
          newPassword
        }
      });

      if (functionError) {
        throw functionError;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.success) {
        setSuccess('Password has been reset successfully! Redirecting to login...');
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        throw new Error('Failed to reset password. Please try again.');
      }
    } catch (err) {
      console.error('Error verifying OTP:', err);
      setError(err.message || 'Invalid OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await passwordResetOTPService.sendOTPCode(email);
      setSuccess('OTP code has been resent to your email.');
    } catch (err) {
      console.error('Error resending OTP:', err);
      setError(err.message || 'Failed to resend OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark-onboarding">
      <div className="dark-slide-card login-card">
        <div className="barber-logo">
          <div className="logo-image-container">
            <img 
              src="/rrbooker-logo-3.png" 
              alt="RAF & ROX Barbershop" 
              className="auth-logo"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'block';
              }}
            />
            <span className="logo-fallback-text" style={{ display: 'none' }}>R&R</span>
          </div>
          <div className="logo-text">
            <h1>Reset Password</h1>
            <p>
              {step === 1 && 'Enter your email and new password'}
              {step === 2 && 'Enter the OTP code sent to your email'}
            </p>
          </div>
        </div>

        {error && (
          <div className="error-alert" role="alert" style={{ 
            backgroundColor: '#ff6b6b', 
            color: 'white', 
            padding: '0.75rem', 
            borderRadius: '8px', 
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}

        {success && (
          <div className="success-alert" role="alert" style={{ 
            backgroundColor: '#51cf66', 
            color: 'white', 
            padding: '0.75rem', 
            borderRadius: '8px', 
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            {success}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleSendOTP} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="dark-input"
                placeholder="Enter your email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <div className="password-input-container">
                <input
                  type={showPassword ? "text" : "password"}
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="dark-input"
                  placeholder="Enter new password (min. 8 characters)"
                  minLength={8}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="password-input-container">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="dark-input"
                  placeholder="Confirm new password"
                  minLength={8}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  <i className={`bi ${showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="action-button"
              disabled={loading}
            >
              {loading ? (
                <span className="spinner" role="status" aria-hidden="true"></span>
              ) : null}
              {loading ? 'Sending OTP...' : 'Send OTP Code'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOTP} className="login-form">
            <div className="form-group">
              <label htmlFor="otpCode">OTP Code</label>
              <input
                type="text"
                id="otpCode"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                className="dark-input"
                placeholder="Enter 6-digit OTP code"
                maxLength={6}
                style={{ 
                  textAlign: 'center', 
                  fontSize: '1.5rem', 
                  letterSpacing: '0.5rem',
                  fontFamily: 'monospace'
                }}
              />
              <p style={{ 
                fontSize: '0.85rem', 
                color: 'rgba(255, 255, 255, 0.6)', 
                marginTop: '0.5rem',
                textAlign: 'center'
              }}>
                Check your email for the OTP code
              </p>
            </div>

            <button
              type="submit"
              className="action-button"
              disabled={loading || otpCode.length < 6}
            >
              {loading ? (
                <span className="spinner" role="status" aria-hidden="true"></span>
              ) : null}
              {loading ? 'Verifying...' : 'Confirm & Reset Password'}
            </button>

            <button
              type="button"
              onClick={handleResendOTP}
              className="action-button"
              disabled={loading}
              style={{
                marginTop: '1rem',
                backgroundColor: 'transparent',
                border: '2px solid #F8A34A',
                color: '#F8A34A'
              }}
            >
              {loading ? 'Sending...' : 'Resend OTP'}
            </button>
          </form>
        )}

        <div className="register-link">
          <p>
            Remember your password? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

