// components/auth/Login.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import OnboardingSlides from '../onboarding/OnboardingSlides';
import { PushService } from '../../services/notifications/PushService';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Always show onboarding when landing on login for now
    setShowOnboarding(true);
  }, []);

  const handleOnboardingComplete = () => {
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

      try {
        await PushService.checkAuthAndRetryToken();
      } catch (error) {
        console.log('Failed to retry pending token:', error);
      }

      navigate('/dashboard');
    } catch (error) {
      setError(error.message);
      await supabase.from('system_logs').insert({
        action: 'login_failed',
        details: { email, error: error.message },
      });
    } finally {
      setLoading(false);
    }
  };

  if (showOnboarding) {
    return <OnboardingSlides onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="onboarding-container auth-page">
      {/* Background Image (Same as first slide for continuity) */}
      <div
        className="onboarding-bg-slide"
        style={{
          backgroundImage: 'url(/assets/onboarding/welcome.png)',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      />

      <div className="onboarding-content-wrapper">
        <div className="content-glass-card login-card-premium">
          <div className="barber-logo">
            <div className="logo-image-container-premium">
              <img
                src="/rrbooker-logo-3.png"
                alt="R&R Booker Logo"
                className="premium-auth-logo"
              />
            </div>
            <div className="logo-text-premium">
              <h3 className="onboarding-subtitle">WELCOME BACK</h3>
              <h2 className="onboarding-title">Sign In</h2>
            </div>
          </div>

          {error && (
            <div className="premium-error-alert">
              <i className="bi bi-exclamation-circle-fill"></i>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="premium-form">
            <div className="premium-input-group">
              <i className="bi bi-envelope"></i>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="premium-input-group">
              <i className="bi bi-lock"></i>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="premium-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
              </button>
            </div>

            <div className="forgot-password-link">
              <Link to="/reset-password">Forgot Password?</Link>
            </div>

            <button
              type="submit"
              className="main-action-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="spinner-border spinner-border-sm me-2"></span>
              ) : null}
              <span>{loading ? 'SIGNING IN...' : 'SIGN IN'}</span>
            </button>
          </form>

          <div className="premium-divider">
            <span>OR</span>
          </div>

          <div className="premium-register-prompt">
            <p>Don't have an account? <Link to="/register">Sign up now</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
