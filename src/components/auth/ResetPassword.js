// components/auth/ResetPassword.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { passwordResetOTPService } from '../../services/auth/PasswordResetOTPService';
import './Login.css';
import './Register.css';

const ResetPassword = () => {
  const [step, setStep] = useState(1);
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
    if (score >= 5) { strength = 'strong'; color = '#51cf66'; }
    else if (score >= 3) { strength = 'medium'; color = '#ffc107'; }
    return { checks, score, strength, color };
  };

  useEffect(() => {
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    if (token && type === 'recovery') {
      const emailFromUrl = searchParams.get('email');
      if (emailFromUrl) {
        setEmail(emailFromUrl);
        setOtpCode(token);
        setStep(2);
      }
    }
  }, [searchParams]);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (checkPasswordStrength(newPassword).score < 6) { setError('Password must meet security requirements.'); return; }
    setLoading(true);
    try {
      await passwordResetOTPService.sendOTPCode(email);
      setSuccess('OTP code sent to your email.');
      setStep(2);
    } catch (err) {
      setError(err.message || 'Failed to send OTP.');
    } finally { setLoading(false); }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!otpCode || otpCode.length < 6) { setError('Invalid OTP'); return; }
    setLoading(true);
    try {
      const { data, error: functionError } = await supabase.functions.invoke('reset-password-with-otp', {
        body: { email, code: otpCode, newPassword }
      });
      if (functionError || data?.error) throw new Error(functionError?.message || data?.error);
      setSuccess('Password reset successful! Redirecting...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.message || 'Invalid OTP.');
    } finally { setLoading(false); }
  };

  return (
    <div className="onboarding-container auth-page">
      <div
        className="onboarding-bg-slide"
        style={{
          backgroundImage: 'url(/assets/auth/reset.png)',
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%'
        }}
      />

      <div className="onboarding-content-wrapper" style={{ justifyContent: 'center' }}>
        <div className="content-glass-card register-card-premium">
          <div className="logo-text-premium">
            <h3 className="onboarding-subtitle">SECURITY FIRST</h3>
            <h2 className="onboarding-title">{step === 1 ? 'Reset Password' : 'Verify OTP'}</h2>
          </div>

          {error && <div className="premium-error-alert"><i className="bi bi-exclamation-circle-fill"></i><span>{error}</span></div>}
          {success && <div className="premium-success-alert"><i className="bi bi-check-circle-fill"></i><span>{success}</span></div>}

          {step === 1 ? (
            <form onSubmit={handleSendOTP} className="premium-form">
              <div className="premium-input-group">
                <i className="bi bi-envelope"></i>
                <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="premium-input-group">
                <i className="bi bi-lock"></i>
                <input type={showPassword ? "text" : "password"} placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
                <button type="button" className="premium-password-toggle" onClick={() => setShowPassword(!showPassword)}><i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i></button>
              </div>
              <div className="premium-input-group">
                <i className="bi bi-lock-fill"></i>
                <input type={showConfirmPassword ? "text" : "password"} placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                <button type="button" className="premium-password-toggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)}><i className={`bi ${showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i></button>
              </div>
              <button type="submit" className="main-action-btn" disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                <span>SEND OTP</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="premium-form">
              <div className="premium-input-group">
                <input
                  type="text"
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem', paddingLeft: '1.1rem' }}
                />
              </div>
              <button type="submit" className="main-action-btn" disabled={loading}>
                {loading ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
                <span>VERIFY & RESET</span>
              </button>
            </form>
          )}

          <div className="premium-divider"><span>OR</span></div>
          <div className="premium-register-prompt"><p>Remembered? <Link to="/login">Sign in</Link></p></div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
