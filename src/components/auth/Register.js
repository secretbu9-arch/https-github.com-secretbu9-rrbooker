// components/auth/Register.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/PushService';
import { fakeUserDetectionService } from '../../services/FakeUserDetectionService';
import './Register.css'; // Import the matching CSS file

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    confirmFullName: '',
    phone: '',
    role: 'customer' // Default role is customer
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [securityAnalysis, setSecurityAnalysis] = useState(null);
  const [showSecurityWarning, setShowSecurityWarning] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

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

  // Validation functions
  const validateForm = () => {
    const errors = [];

    // Check if passwords match
    if (formData.password !== formData.confirmPassword) {
      errors.push('Passwords do not match');
    }

    // Check if full names match
    if (formData.fullName !== formData.confirmFullName) {
      errors.push('Full names do not match');
    }

    // Check password strength
    const passwordStrength = checkPasswordStrength(formData.password);
    if (passwordStrength.score < 3) {
      errors.push('Password is too weak. Please use a stronger password.');
    }

    // Check if full name is provided
    if (!formData.fullName.trim()) {
      errors.push('Full name is required');
    }

    // Check if confirm full name is provided
    if (!formData.confirmFullName.trim()) {
      errors.push('Please confirm your full name');
    }

    return errors;
  };

  const formatFlagMessage = (flag) => {
    const flagMessages = {
      'suspicious_email_pattern': 'Email appears to be fake or temporary',
      'disposable_email': 'Disposable email address detected',
      'invalid_email_format': 'Invalid email format',
      'suspicious_phone_pattern': 'Phone number appears to be fake',
      'invalid_phone_length': 'Invalid phone number length',
      'repeated_digits_phone': 'Phone number has repeated digits',
      'suspicious_name_pattern': 'Name appears to be fake or test data',
      'very_short_name': 'Name is too short',
      'numeric_name': 'Name contains only numbers',
      'special_characters_name': 'Name contains special characters',
      'duplicate_email': 'Email address already exists',
      'duplicate_phone': 'Phone number already exists',
      'similar_names_found': 'Similar names found in system',
      'no_email': 'Email is required',
      'invalid_name': 'Invalid name provided',
      'analysis_error': 'Security analysis failed',
      'duplicate_check_error': 'Duplicate check failed'
    };
    return flagMessages[flag] || flag;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    setSecurityAnalysis(null);
    setShowSecurityWarning(false);

    try {
      // Validate form first
      const validationErrors = validateForm();
      if (validationErrors.length > 0) {
        setError(validationErrors.join('. '));
        setLoading(false);
        return;
      }

      console.log('Starting registration with role:', formData.role);
      
      // Step 1: Run fake user detection analysis
      console.log('Running security analysis...');
      const analysis = await fakeUserDetectionService.analyzeUserRegistration(formData);
      setSecurityAnalysis(analysis);
      
      // Step 2: Check if user is suspicious
      if (analysis.isSuspicious) {
        console.log('Suspicious user detected:', analysis);
        setShowSecurityWarning(true);
        setError(`Security analysis detected potential issues. Risk level: ${analysis.riskLevel.toUpperCase()}. Please review your information and try again.`);
        setLoading(false);
        return;
      }
      
      // Step 3: For medium risk users, show warning but allow registration
      if (analysis.riskLevel === 'medium') {
        console.log('Medium risk user detected:', analysis);
        setShowSecurityWarning(true);
        setSuccess('Registration will require additional verification. Please check your email for verification link.');
      }
      
      // Step 4: Proceed with registration
      console.log('Proceeding with registration...');
      
      // Sign up user with metadata and email verification
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
          data: {
            full_name: formData.fullName,
            role: formData.role,
            phone: formData.phone,
            security_analysis: analysis // Store analysis in metadata
          }
        }
      });

      if (authError) throw authError;

      console.log('Auth user created:', authData.user?.id);
      console.log('User metadata:', authData.user?.user_metadata);

      // Check if email verification is required
      if (authData.user && !authData.user.email_confirmed_at) {
        setSuccess('Registration successful! Please check your email and click the verification link to activate your account. You will be redirected to login after verification.');
        
        // Log successful registration with security analysis
        await supabase.from('system_logs').insert({
          user_id: authData.user.id,
          action: 'user_register_with_verification',
          details: { 
            email: formData.email,
            role: formData.role,
            security_analysis: analysis,
            risk_level: analysis.riskLevel
          }
        });
        
        setLoading(false);
        return;
      }

      // Wait for auth to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!authData.user) {
        throw new Error('User creation failed or confirmation required');
      }

      // Create user profile using upsert to handle duplicates
      const { error: profileError } = await supabase
        .from('users')
        .upsert([{
          id: authData.user.id,
          email: formData.email,
          full_name: formData.fullName,
          phone: formData.phone,
          role: formData.role // Make sure to use the role from the form
        }], {
          onConflict: 'id'
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // Don't throw - the auth user was created successfully
      } else {
        console.log('User profile created with role:', formData.role);
      }

      // Log successful registration with security analysis
      await supabase.from('system_logs').insert({
        user_id: authData.user.id,
        action: 'user_register_success',
        details: { 
          email: formData.email,
          role: formData.role,
          security_analysis: analysis,
          risk_level: analysis.riskLevel
        }
      });

      // Sign them in immediately 
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) {
        console.error('Sign in error:', signInError);
        setSuccess('Registration successful! Please sign in.');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        console.log('Sign in successful, user role should be:', formData.role);
        
        // Extra step: update session with role information
        const { error: sessionError } = await supabase.auth.refreshSession();
        if (sessionError) {
          console.error('Session refresh error:', sessionError);
        }
        
        setSuccess('Registration successful! Redirecting...');
        
        setTimeout(() => {
          // Force reload to ensure all auth data is updated
          window.location.href = '/dashboard';
        }, 1000);
      }
      
    } catch (error) {
      console.error('Registration error:', error);
      setError(error.message || 'Failed to register. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark-onboarding">
      <div className="dark-slide-card register-card">
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
             <h1>R&RBooker</h1>
             <p>Create Account</p>
           </div>
         </div>

        {error && (
          <div className="error-alert" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="success-alert" role="alert">
            {success}
          </div>
        )}

        {showSecurityWarning && securityAnalysis && (
          <div className="security-warning" role="alert">
            <div className="security-header">
              <i className="bi bi-shield-exclamation"></i>
              <strong>Security Analysis Results</strong>
            </div>
            <div className="security-details">
              <p><strong>Risk Level:</strong> <span className={`risk-${securityAnalysis.riskLevel}`}>{securityAnalysis.riskLevel.toUpperCase()}</span></p>
              <p><strong>Risk Score:</strong> {securityAnalysis.riskScore}/100</p>
              {securityAnalysis.flags.length > 0 && (
                <div>
                  <strong>Detected Issues:</strong>
                  <ul>
                    {securityAnalysis.flags.map((flag, index) => (
                      <li key={index}>{formatFlagMessage(flag)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {securityAnalysis.recommendations.length > 0 && (
                <div>
                  <strong>Recommendations:</strong>
                  <ul>
                    {securityAnalysis.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group">
            <label htmlFor="fullName">Full Name</label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              required
              className="dark-input"
              placeholder="Enter your full name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmFullName">Confirm Full Name</label>
            <input
              type="text"
              id="confirmFullName"
              name="confirmFullName"
              value={formData.confirmFullName}
              onChange={handleChange}
              required
              className="dark-input"
              placeholder="Re-enter your full name"
            />
            {formData.confirmFullName && formData.fullName !== formData.confirmFullName && (
              <div className="form-error">Full names do not match</div>
            )}
            {formData.confirmFullName && formData.fullName === formData.confirmFullName && (
              <div className="form-success">✓ Full names match</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="dark-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-container">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
                className="dark-input"
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
              >
                <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
              </button>
            </div>
            
            {/* Password Strength Indicator */}
            {formData.password && (
              <div className="password-strength-container">
                <div className="password-strength-bar">
                  <div 
                    className="password-strength-fill"
                    style={{
                      width: `${(checkPasswordStrength(formData.password).score / 6) * 100}%`,
                      backgroundColor: checkPasswordStrength(formData.password).color
                    }}
                  ></div>
                </div>
                <div className="password-strength-text">
                  <span style={{ color: checkPasswordStrength(formData.password).color }}>
                    {checkPasswordStrength(formData.password).strength.toUpperCase()}
                  </span>
                  <span className="password-score">
                    ({checkPasswordStrength(formData.password).score}/6)
                  </span>
                </div>
              </div>
            )}

            {/* Password Requirements */}
            <div className="password-requirements">
              <div className="requirements-title">Password Requirements:</div>
              <div className={`requirement ${checkPasswordStrength(formData.password).checks.length ? 'met' : 'unmet'}`}>
                <i className={`bi ${checkPasswordStrength(formData.password).checks.length ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                At least 8 characters
              </div>
              <div className={`requirement ${checkPasswordStrength(formData.password).checks.lowercase ? 'met' : 'unmet'}`}>
                <i className={`bi ${checkPasswordStrength(formData.password).checks.lowercase ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                One lowercase letter (a-z)
              </div>
              <div className={`requirement ${checkPasswordStrength(formData.password).checks.uppercase ? 'met' : 'unmet'}`}>
                <i className={`bi ${checkPasswordStrength(formData.password).checks.uppercase ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                One uppercase letter (A-Z)
              </div>
              <div className={`requirement ${checkPasswordStrength(formData.password).checks.number ? 'met' : 'unmet'}`}>
                <i className={`bi ${checkPasswordStrength(formData.password).checks.number ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                One number (0-9)
              </div>
              <div className={`requirement ${checkPasswordStrength(formData.password).checks.special ? 'met' : 'unmet'}`}>
                <i className={`bi ${checkPasswordStrength(formData.password).checks.special ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                One special character (!@#$%^&*)
              </div>
              <div className={`requirement ${checkPasswordStrength(formData.password).checks.noSpaces ? 'met' : 'unmet'}`}>
                <i className={`bi ${checkPasswordStrength(formData.password).checks.noSpaces ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                No spaces
              </div>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="password-input-container">
              <input
                type={showConfirmPassword ? "text" : "password"}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
                className="dark-input"
                placeholder="Re-enter your password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex="-1"
              >
                <i className={`bi ${showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
              </button>
            </div>
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <div className="form-error">Passwords do not match</div>
            )}
            {formData.confirmPassword && formData.password === formData.confirmPassword && (
              <div className="form-success">✓ Passwords match</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone Number</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="dark-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">Account Type</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
              className="dark-select"
            >
              <option value="customer">Customer</option>
            </select>
          </div>

          <button
            type="submit"
            className="action-button"
            disabled={loading}
          >
            {loading ? (
              <span className="spinner" role="status" aria-hidden="true"></span>
            ) : null}
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="login-link">
          <p>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;