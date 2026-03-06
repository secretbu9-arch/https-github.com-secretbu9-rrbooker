// components/auth/ResetPassword.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { passwordResetOTPService } from '../../services/auth/PasswordResetOTPService';
import './Login.css'; // Reuse Login styles
import './Register.css'; // Shared password component styles

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

  // Password strength checker
  const checkPasswordStrength = (password) => {
    const checks = {
      length: password.length >= 8,
      lowercase: /[a-z]/.test(password),
      uppercase: /[A-Z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      noSpaces: !/\s/.test(password)
    };

    const score = Object.values(checks).filter(Boolean).length;

    let strength = 'weak';
    let color = '#ff6b6b';

    if (score >= 5) {
      strength = 'strong';
      color = '#51cf66';
    } else if (score >= 3) {
      strength = 'medium';
      color = '#ffc107';
    }

    return { checks, score, strength, color };
  };



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
    const passwordStrength = checkPasswordStrength(newPassword);
    if (passwordStrength.score < 6) {
      setError('Password must meet all 6 security requirements.');
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

    // Validate password strength (especially for recovery links)
    const passwordStrength = checkPasswordStrength(newPassword);
    if (passwordStrength.score < 6) {
      setError('Password must meet all security requirements.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
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

              {newPassword && checkPasswordStrength(newPassword).score < 6 && (
                <div className="form-error" style={{ color: '#ff6b6b', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                  <i className="bi bi-exclamation-triangle-fill me-1"></i>
                  Password does not meet all requirements
                </div>
              )}

              {/* Password Strength Indicator */}
              {newPassword && (
                <div className="password-strength-container" style={{ marginTop: '0.5rem' }}>
                  <div className="password-strength-bar" style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    marginBottom: '0.5rem'
                  }}>
                    <div
                      className="password-strength-fill"
                      style={{
                        height: '100%',
                        transition: 'all 0.3s ease',
                        width: `${(checkPasswordStrength(newPassword).score / 6) * 100}%`,
                        backgroundColor: checkPasswordStrength(newPassword).color
                      }}
                    ></div>
                  </div>
                  <div className="password-strength-text" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}>
                    <span style={{ color: checkPasswordStrength(newPassword).color }}>
                      {checkPasswordStrength(newPassword).strength.toUpperCase()}
                    </span>
                    <span className="password-score" style={{ color: 'rgba(255, 255, 255, 0.6)', fontWeight: '400' }}>
                      ({checkPasswordStrength(newPassword).score}/6)
                    </span>
                  </div>
                </div>
              )}

              {/* Password Requirements */}
              <div className="password-requirements" style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div className="requirements-title" style={{ fontSize: '0.8rem', fontWeight: '600', color: 'rgba(255, 255, 255, 0.8)', marginBottom: '0.5rem' }}>
                  Password Requirements:
                </div>
                {[
                  { key: 'length', text: 'At least 8 characters' },
                  { key: 'lowercase', text: 'One lowercase letter (a-z)' },
                  { key: 'uppercase', text: 'One uppercase letter (A-Z)' },
                  { key: 'number', text: 'One number (0-9)' },
                  { key: 'special', text: 'One special character (!@#$%^&*)' },
                  { key: 'noSpaces', text: 'No spaces' }
                ].map((req) => (
                  <div key={req.key} className={`requirement ${checkPasswordStrength(newPassword).checks[req.key] ? 'met' : 'unmet'}`} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    marginBottom: '0.25rem',
                    color: checkPasswordStrength(newPassword).checks[req.key] ? '#51cf66' : 'rgba(255, 255, 255, 0.5)'
                  }}>
                    <i className={`bi ${checkPasswordStrength(newPassword).checks[req.key] ? 'bi-check-circle-fill' : 'bi-circle'}`} style={{ fontSize: '0.8rem' }}></i>
                    {req.text}
                  </div>
                ))}
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
              {confirmPassword && newPassword !== confirmPassword && (
                <div className="form-error" style={{ color: '#ff6b6b', fontSize: '0.8rem', marginTop: '0.25rem' }}>Passwords do not match</div>
              )}
              {confirmPassword && newPassword === confirmPassword && (
                <div className="form-success" style={{ color: '#51cf66', fontSize: '0.8rem', marginTop: '0.25rem' }}>✓ Passwords match</div>
              )}
            </div>

            <button
              type="submit"
              className="action-button"
              disabled={loading || !newPassword || checkPasswordStrength(newPassword).score < 6 || newPassword !== confirmPassword}
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

            {/* Added password field for recovery flow if skipping step 1 (email link) */}
            {searchParams.get('token') && (
              <div className="security-warning" style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '1.25rem',
                borderRadius: '16px',
                marginBottom: '1.5rem',
                color: 'white',
                textAlign: 'left'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '1rem', color: '#F8A34A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="bi bi-shield-lock-fill"></i>
                  Create Your New Password
                </div>

                <div className="form-group mb-3">
                  <label style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '0.4rem', display: 'block' }}>New Password</label>
                  <div className="password-input-container">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="dark-input"
                      placeholder="Enter new password"
                      minLength={8}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                    </button>

                  </div>

                  {newPassword && checkPasswordStrength(newPassword).score < 6 && (
                    <div className="form-error" style={{ color: '#ff6b6b', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      <i className="bi bi-exclamation-triangle-fill me-1"></i>
                      Password does not meet all requirements
                    </div>
                  )}

                  {/* Tiny Strength Bar for Recovery Flow */}
                  {newPassword && (
                    <div className="password-strength-bar" style={{
                      width: '100%',
                      height: '3px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '2px',
                      marginTop: '0.5rem',
                      overflow: 'hidden'
                    }}>
                      <div
                        style={{
                          height: '100%',
                          transition: 'all 0.3s ease',
                          width: `${(checkPasswordStrength(newPassword).score / 6) * 100}%`,
                          backgroundColor: checkPasswordStrength(newPassword).color
                        }}
                      ></div>
                    </div>
                  )}
                </div>

                <div className="form-group mb-3">
                  <label style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '0.4rem', display: 'block' }}>Confirm New Password</label>
                  <div className="password-input-container">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
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
                    >
                      <i className={`bi ${showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <div style={{ color: '#ff6b6b', fontSize: '0.75rem', marginTop: '0.25rem' }}>Passwords do not match</div>
                  )}
                </div>

                {/* Requirements Checklist */}
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.5rem', color: 'rgba(255, 255, 255, 0.5)' }}>Requirements:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem' }}>
                    {[
                      { key: 'length', text: '8+ Characters' },
                      { key: 'lowercase', text: 'Lowercase' },
                      { key: 'uppercase', text: 'Uppercase' },
                      { key: 'number', text: 'Number' },
                      { key: 'special', text: 'Special' },
                    ].map((req) => (
                      <div key={req.key} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.7rem',
                        color: checkPasswordStrength(newPassword).checks[req.key] ? '#51cf66' : 'rgba(255, 255, 255, 0.3)'
                      }}>
                        <i className={`bi ${checkPasswordStrength(newPassword).checks[req.key] ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                        {req.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="action-button"
              disabled={
                loading ||
                otpCode.length < 6 ||
                (searchParams.get('token') && (checkPasswordStrength(newPassword).score < 6 || newPassword !== confirmPassword))
              }
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
    </div >
  );
};

export default ResetPassword;

