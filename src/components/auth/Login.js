// components/auth/Login.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import OnboardingSlides from '../onboarding/OnboardingSlides';
import { PushService } from '../../services/PushService';
import './Login.css'; // Import the matching CSS file

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  // On component mount, check if we should show onboarding
  useEffect(() => {
    // Always show onboarding before login
    setShowOnboarding(true);
  }, []);

  const handleOnboardingComplete = () => {
    // Switch to login form
    setShowOnboarding(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Log the login action
      await supabase.from('system_logs').insert({
        user_id: data.user.id,
        action: 'login_success',
        details: { email },
      });

      // Retry saving any pending device token now that user is authenticated
      try {
        await PushService.checkAuthAndRetryToken();
      } catch (error) {
        console.log('Failed to retry pending token:', error);
      }

      navigate('/dashboard');
    } catch (error) {
      setError(error.message);
      
      // Log failed login attempt
      await supabase.from('system_logs').insert({
        action: 'login_failed',
        details: { email, error: error.message },
      });
    } finally {
      setLoading(false);
    }
  };

  // If showOnboarding is true, render the onboarding slides
  if (showOnboarding) {
    return <OnboardingSlides onComplete={handleOnboardingComplete} />;
  }

  // Otherwise render the login form with matching dark theme
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
            <h1>R&RBooker</h1>
            <p>Welcome back!</p>
          </div>
        </div>

        {error && (
          <div className="error-alert" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="dark-input"
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

          <button
            type="submit"
            className="action-button"
            disabled={loading}
          >
            {loading ? (
              <span className="spinner" role="status" aria-hidden="true"></span>
            ) : null}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="register-link">
          <p>
            Don't have an account? <Link to="/register">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;