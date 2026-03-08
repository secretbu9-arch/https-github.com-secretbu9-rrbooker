// components/auth/Register.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/notifications/PushService';
import './Login.css'; // Reuse premium login styles
import './Register.css'; // Specific register styles

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    confirmFullName: '',
    phone: '',
    role: 'customer'
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'phone') {
      let digits = value.replace(/\D/g, '');
      if (value.startsWith('+63')) {
        digits = value.substring(3).replace(/\D/g, '');
      } else if (digits.startsWith('63')) {
        digits = digits.substring(2);
      }
      if (digits.startsWith('0')) digits = digits.substring(1);
      if (digits.length > 0 && digits[0] !== '9') digits = '';
      if (digits.length > 10) digits = digits.substring(0, 10);
      const formatted = digits.length > 0 ? `+63${digits}` : '';
      setFormData(prev => ({ ...prev, [name]: formatted }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

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

  const validateForm = () => {
    const errors = [];
    if (formData.password !== formData.confirmPassword) errors.push('Passwords do not match');
    if (formData.fullName !== formData.confirmFullName) errors.push('Full names do not match');
    const passwordStrength = checkPasswordStrength(formData.password);
    if (passwordStrength.score < 6) errors.push('Password must meet all security requirements.');
    if (!formData.fullName.trim()) errors.push('Full name is required');
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const validationErrors = validateForm();
      if (validationErrors.length > 0) {
        setError(validationErrors.join('. '));
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
          data: {
            full_name: formData.fullName,
            role: formData.role,
            phone: formData.phone
          }
        }
      });

      if (authError) throw authError;

      const { error: profileError } = await supabase
        .from('users')
        .upsert([{
          id: authData.user.id,
          email: formData.email,
          full_name: formData.fullName,
          phone: formData.phone,
          role: formData.role
        }], { onConflict: 'id' });

      if (profileError) console.error('Profile creation error:', profileError);

      if (!authData.user.email_confirmed_at) {
        setSuccess('Registration successful! Please verify your email.');
        setLoading(false);
        return;
      }

      await supabase.auth.signInWithPassword({ email: formData.email, password: formData.password });
      setSuccess('Registration successful! Redirecting...');
      setTimeout(() => { window.location.href = '/dashboard'; }, 1000);

    } catch (error) {
      setError(error.message || 'Failed to register.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-container auth-page">
      <div
        className="onboarding-bg-slide"
        style={{
          backgroundImage: 'url(/assets/auth/register.png)',
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%'
        }}
      />

      <div className="onboarding-content-wrapper" style={{ justifyContent: 'center' }}>
        <div className="content-glass-card register-card-premium" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
          <div className="barber-logo">
            <div className="logo-text-premium">
              <h3 className="onboarding-subtitle">JOIN THE CLUB</h3>
              <h2 className="onboarding-title">Create Account</h2>
            </div>
          </div>

          {error && <div className="premium-error-alert"><i className="bi bi-exclamation-circle-fill"></i><span>{error}</span></div>}
          {success && <div className="premium-success-alert"><i className="bi bi-check-circle-fill"></i><span>{success}</span></div>}

          <form onSubmit={handleSubmit} className="premium-form">
            <div className="premium-input-group">
              <i className="bi bi-person"></i>
              <input type="text" name="fullName" placeholder="Full Name" value={formData.fullName} onChange={handleChange} required />
            </div>

            <div className="premium-input-group">
              <i className="bi bi-person-check"></i>
              <input type="text" name="confirmFullName" placeholder="Confirm Full Name" value={formData.confirmFullName} onChange={handleChange} required />
            </div>

            <div className="premium-input-group">
              <i className="bi bi-envelope"></i>
              <input type="email" name="email" placeholder="Email Address" value={formData.email} onChange={handleChange} required />
            </div>

            <div className="premium-input-group">
              <i className="bi bi-telephone"></i>
              <input type="tel" name="phone" placeholder="+63XXXXXXXXXX" value={formData.phone} onChange={handleChange} maxLength={13} style={{ paddingLeft: '3.2rem' }} />
            </div>

            <div className="premium-input-group">
              <i className="bi bi-lock"></i>
              <input type={showPassword ? "text" : "password"} name="password" placeholder="Password" value={formData.password} onChange={handleChange} required minLength={8} />
              <button type="button" className="premium-password-toggle" onClick={() => setShowPassword(!showPassword)}><i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i></button>
            </div>

            {formData.password && (
              <div className="premium-password-indicators">
                <div className="password-strength-bar">
                  <div className="password-strength-fill" style={{ width: `${(checkPasswordStrength(formData.password).score / 6) * 100}%`, backgroundColor: checkPasswordStrength(formData.password).color }}></div>
                </div>
                <div className="requirements-grid">
                  {Object.entries({ length: '8+ Chars', lowercase: 'Lower', uppercase: 'Upper', number: 'Number', special: 'Special', noSpaces: 'No Spaces' }).map(([key, label]) => (
                    <span key={key} className={`req-item ${checkPasswordStrength(formData.password).checks[key] ? 'met' : ''}`}>
                      <i className={`bi bi-${checkPasswordStrength(formData.password).checks[key] ? 'check-circle' : 'circle'}`}></i> {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="premium-input-group">
              <i className="bi bi-lock-fill"></i>
              <input type={showConfirmPassword ? "text" : "password"} name="confirmPassword" placeholder="Confirm Password" value={formData.confirmPassword} onChange={handleChange} required />
              <button type="button" className="premium-password-toggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)}><i className={`bi ${showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i></button>
            </div>

            <button type="submit" className="main-action-btn" disabled={loading}>
              {loading ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
              <span>{loading ? 'CREATING...' : 'CREATE ACCOUNT'}</span>
            </button>
          </form>

          <div className="premium-divider"><span>OR</span></div>
          <div className="premium-register-prompt"><p>Already have an account? <Link to="/login">Sign in</Link></p></div>
        </div>
      </div>
    </div>
  );
};

export default Register;
