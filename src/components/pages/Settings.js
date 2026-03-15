// components/pages/Settings.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { passwordResetOTPService } from '../../services/auth/PasswordResetOTPService';
import { PushService } from '../../services/notifications/PushService';
import logoImage from '../../assets/images/raf-rok-logo.png';
import { Capacitor } from '@capacitor/core';

const Settings = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('notifications');

  // Settings state
  const [settings, setSettings] = useState({
    emailNotifications: true,
    language: 'en',
    timezone: 'Asia/Manila'
  });

  // Push notification state
  const [pushStatus, setPushStatus] = useState({
    supported: true,
    permission: 'default'
  });

  // Password change state (OTP-based, like ResetPassword)
  const [passwordStep, setPasswordStep] = useState(1); // 1: set new password, 2: verify OTP
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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



  useEffect(() => {
    fetchUserData();
    checkPushStatus();
  }, []);

  const checkPushStatus = async () => {
    try {
      const support = await PushService.checkNotificationSupport();
      const isSupported = support.push || support.web;
      // Get the most relevant permission status
      const currentPermission = Capacitor.isNativePlatform()
        ? support.permissions.push
        : support.permissions.web;

      setPushStatus({
        supported: isSupported,
        permission: currentPermission
      });
    } catch (error) {
      console.error('Error checking push status:', error);
      // Fallback
      setPushStatus({
        supported: 'Notification' in window || Capacitor.isNativePlatform(),
        permission: typeof Notification !== 'undefined' ? Notification.permission : 'default'
      });
    }
  };

  const handleEnablePush = async () => {
    try {
      setSaving(true);
      await PushService.initialize(true); // Force re-initialization/token refresh
      await checkPushStatus();
      setMessage({ type: 'success', text: 'Push notifications initialized!' });
    } catch (error) {
      console.error('Error enabling push notifications:', error);
      setMessage({ type: 'error', text: 'Failed to enable push notifications.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      await PushService.sendNotificationToUser(
        user.id,
        'Test Notification 🔔',
        'If you see this, push notifications are working correctly!',
        { type: 'test' }
      );

      setMessage({ type: 'success', text: 'Test notification sent! Check your device.' });
    } catch (error) {
      console.error('Error sending test notification:', error);
      setMessage({ type: 'error', text: 'Failed to send test notification.' });
    } finally {
      setSaving(false);
    }
  };

  const handleBrowserTest = async () => {
    try {
      if (!('Notification' in window)) {
        setMessage({ type: 'error', text: 'Notifications not supported in this browser.' });
        return;
      }

      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setMessage({ type: 'error', text: 'Browser permission denied. Please enable them in your address bar.' });
          return;
        }
      }

      await PushService.showBrowserNotification(
        'Notification Test 🔔',
        'If you see this, your browser is correctly configured to show popups!'
      );
    } catch (error) {
      console.error('Error in browser test:', error);
    }
  };

  const fetchUserData = async () => {
    try {
      setLoading(true);

      // Get current authenticated user
      const { data: authUser, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      if (authUser?.user) {
        setUser(authUser.user);

        // Fetch user profile from users table
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.user.email)
          .single();

        if (profileError) throw profileError;
        setProfile(profileData);

        // Load saved settings (you might want to create a user_settings table)
        // For now, we'll use default settings
        setSettings({
          emailNotifications: true,
          language: 'en',
          timezone: 'Asia/Manila'
        });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setMessage({ type: 'error', text: 'Failed to load user data' });
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (settingName, value) => {
    setSettings(prev => ({
      ...prev,
      [settingName]: value
    }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      // Here you would typically save to a user_settings table
      // For now, we'll just simulate a save
      await new Promise(resolve => setTimeout(resolve, 1000));

      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendPasswordOTP = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      // Validate password match
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        throw new Error('New passwords do not match');
      }

      // Validate password strength
      const passwordStrength = checkPasswordStrength(passwordData.newPassword);
      if (passwordStrength.score < 6) {
        throw new Error('Password must meet all 6 security requirements.');
      }

      if (!user?.email) {
        throw new Error('Unable to determine your email. Please re-login and try again.');
      }

      // Send OTP code (same approach as ResetPassword)
      await passwordResetOTPService.sendOTPCode(user.email);
      setMessage({ type: 'success', text: 'OTP code has been sent to your email. Please check your inbox.' });
      setPasswordStep(2);
    } catch (error) {
      console.error('Error sending password OTP:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to change password' });
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyPasswordOTP = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      if (!otpCode || otpCode.length < 6) {
        throw new Error('Please enter a valid OTP code');
      }

      if (!user?.email) {
        throw new Error('Unable to determine your email. Please re-login and try again.');
      }

      const { data, error: functionError } = await supabase.functions.invoke('reset-password-with-otp', {
        body: {
          email: user.email,
          code: otpCode,
          newPassword: passwordData.newPassword
        }
      });

      if (functionError) throw functionError;
      if (data?.error) throw new Error(data.error);

      if (!data?.success) {
        throw new Error('Failed to change password. Please try again.');
      }

      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setPasswordData({ newPassword: '', confirmPassword: '' });
      setOtpCode('');
      setPasswordStep(1);
    } catch (error) {
      console.error('Error verifying password OTP:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to change password' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="row justify-content-center">
          <div className="col-md-10">
            <div className="card shadow-sm">
              <div className="card-body text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-3 text-muted">Loading settings...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid min-vh-100 py-4" style={{ background: '#fdfdfd', color: '#1a1a1a', fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');
        :root {
          --premium-brown: #3d2c24;
          --premium-dark: #1a1a1a;
          --border-subtle: rgba(0,0,0,0.06);
        }
        .settings-card {
          background: #fff;
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          transition: all 0.3s ease;
          overflow: hidden;
          margin-bottom: 1.5rem;
        }
        .settings-card:hover {
          box-shadow: 0 10px 30px rgba(0,0,0,0.05);
        }
        .settings-header {
          border-bottom: 1px solid var(--border-subtle);
          padding: 20px;
          background: #fff;
        }
        .btn-premium {
          background-color: var(--premium-dark);
          color: white;
          border-radius: 50px;
          padding: 8px 24px;
          font-weight: 600;
          font-size: 0.85rem;
          border: none;
          transition: 0.3s ease;
        }
        .btn-premium:hover {
          background-color: var(--premium-brown);
          color: white;
        }
        .btn-premium-outline {
          background-color: transparent;
          color: var(--premium-dark);
          border: 1px solid var(--border-subtle);
          border-radius: 50px;
          padding: 8px 24px;
          font-weight: 600;
          font-size: 0.85rem;
          transition: 0.3s ease;
        }
        .btn-premium-outline:hover {
          border-color: var(--premium-dark);
          background-color: #f8f9fa;
        }
        .form-control, .form-select {
          border-radius: 12px;
          padding: 10px 15px;
          border: 1px solid var(--border-subtle);
          background-color: #f8f9fa;
          font-size: 0.9rem;
        }
        .form-control:focus, .form-select:focus {
          border-color: var(--premium-dark);
          box-shadow: 0 0 0 0.2rem rgba(26, 26, 26, 0.1);
          background-color: #fff;
        }
        .nav-tabs .nav-link {
          color: #666;
          border: none;
          border-bottom: 2px solid transparent;
          font-weight: 600;
          padding: 12px 20px;
          transition: all 0.3s ease;
        }
        .nav-tabs .nav-link:hover {
          color: var(--premium-dark);
          border-color: transparent;
        }
        .nav-tabs .nav-link.active {
          color: var(--premium-dark);
          background-color: transparent;
          border-color: transparent;
          border-bottom: 2px solid var(--premium-dark);
        }
        .nav-tabs {
          border-bottom: 1px solid var(--border-subtle);
          padding: 0 10px;
          background-color: #fcfcfc;
        }
      `}</style>
      <div className="row justify-content-center">
        <div className="col-md-9 col-lg-8">
          {/* Header */}
          <div className="d-flex align-items-center gap-3 mb-4">
            <div className="bg-white rounded-circle p-2 d-flex align-items-center justify-content-center shadow-sm flex-shrink-0" style={{ width: '55px', height: '55px', border: '1px solid #eee' }}>
               <img src={logoImage} alt="Raf & Rox" style={{ width: '40px' }} />
            </div>
            <div>
              <h3 className="mb-0 fw-bold fs-4 fs-md-3">Settings</h3>
              <p className="text-muted small mb-0">Manage your account preferences and security</p>
            </div>
          </div>

          {/* Alert Messages */}
          {message.text && (
            <div className={`alert alert-${message.type === 'error' ? 'danger' : 'success'} alert-dismissible fade show`} role="alert">
              <i className={`bi ${message.type === 'error' ? 'bi-exclamation-triangle' : 'bi-check-circle'} me-2`}></i>
              {message.text}
              <button
                type="button"
                className="btn-close"
                onClick={() => setMessage({ type: '', text: '' })}
              ></button>
            </div>
          )}

          {/* Settings Navigation Tabs */}
          <div className="settings-card pt-0">
            <div>
              <ul className="nav nav-tabs border-0" role="tablist">
                <li className="nav-item" role="presentation">
                  <button
                    className={`nav-link rounded-0 ${activeTab === 'notifications' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notifications')}
                    type="button"
                  >
                    <i className="bi bi-bell-fill me-2"></i>
                    Notifications
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    className={`nav-link rounded-0 ${activeTab === 'privacy' ? 'active' : ''}`}
                    onClick={() => setActiveTab('privacy')}
                    type="button"
                  >
                    <i className="bi bi-shield-lock-fill me-2"></i>
                    Privacy
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    className={`nav-link rounded-0 ${activeTab === 'security' ? 'active' : ''}`}
                    onClick={() => setActiveTab('security')}
                    type="button"
                  >
                    <i className="bi bi-key-fill me-2"></i>
                    Security
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    className={`nav-link rounded-0 ${activeTab === 'preferences' ? 'active' : ''}`}
                    onClick={() => setActiveTab('preferences')}
                    type="button"
                  >
                    <i className="bi bi-sliders me-2"></i>
                    Preferences
                  </button>
                </li>
              </ul>
            </div>

            <div className="card-body p-4 p-md-5">
              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div>
                  <h5 className="mb-4 fw-bold">
                    <i className="bi bi-bell text-muted me-2"></i>
                    Notification Preferences
                  </h5>

                  <div className="row g-4">
                    <div className="col-12 mb-2">
                      <div className="p-4 bg-light rounded-4 border" style={{ backgroundColor: '#fcfcfc' }}>
                        <div>
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <h6 className="mb-0 fw-bold">Push Notifications</h6>
                            {pushStatus.supported ? (
                              <span className="bg-dark text-white px-3 py-1 rounded-pill small fw-bold">
                                {pushStatus.permission === 'granted' ? 'Enabled' : (pushStatus.permission === 'denied' ? 'Blocked' : 'Disabled')}
                              </span>
                            ) : (
                              <span className="bg-secondary text-white px-3 py-1 rounded-pill small fw-bold">Not Supported</span>
                            )}
                          </div>

                              {pushStatus.permission === 'denied' && (
                            <div className="alert bg-light border-dark text-dark py-2 px-3 mb-3 fw-medium rounded-3" style={{ fontSize: '0.8rem' }}>
                              <i className="bi bi-exclamation-octagon-fill me-2"></i>
                              Notifications are <strong>blocked</strong> by your browser.
                              <div className="mt-1">
                                Click the <strong>lock icon</strong> (🔒) in your browser address bar and select "Reset permission" to fix this.
                              </div>
                            </div>
                          )}

                          <p className="small text-muted mb-3">
                            Receive real-time updates directly on your device.
                          </p>

                          {/* iOS Specific Instructions */}
                          {/iPhone|iPad|iPod/i.test(navigator.userAgent) && (
                            <div className="alert bg-light border-dark py-2 px-3 mb-3 rounded-3" style={{ fontSize: '0.85rem' }}>
                              <h6 className="alert-heading mb-1 fw-bold text-dark" style={{ fontSize: '0.9rem' }}>
                                <i className="bi bi-apple me-2"></i>
                                {window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches ? 'PWA Mode Active' : 'iOS Setup Required'}
                              </h6>
                              {!(window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) ? (
                                <>
                                  <p className="mb-2 text-dark">Chrome on iOS only supports notifications when saved as an app:</p>
                                  <ol className="mb-0 ps-3 text-dark fw-medium">
                                    <li>Tap the <strong>Share</strong> icon (in the address bar or bottom bar).</li>
                                    <li>Select <strong>"Add to Home Screen"</strong>.</li>
                                    <li>Open the <strong>R&R Booker</strong> app from your home screen.</li>
                                  </ol>
                                </>
                              ) : (
                                <p className="mb-0 text-dark fw-medium">You are running in App mode! You can now enable push notifications below.</p>
                              )}
                            </div>
                          )}

                          <div className="d-flex flex-wrap gap-2 mt-3">
                            {pushStatus.permission !== 'granted' ? (
                              <button
                                className="btn-premium"
                                onClick={handleEnablePush}
                                disabled={saving}
                              >
                                <i className="bi bi-bell-fill me-2"></i>
                                Enable Push Notifications
                              </button>
                            ) : (
                              <>
                                <button
                                  className="btn-premium flex-grow-1"
                                  onClick={handleTestNotification}
                                  disabled={saving}
                                >
                                  <i className="bi bi-send-fill me-2"></i>
                                  Send Test Notification
                                </button>
                                <button
                                  className="btn-premium-outline flex-grow-1"
                                  onClick={handleBrowserTest}
                                  disabled={saving}
                                >
                                  <i className="bi bi-window-stack me-2"></i>
                                  Test Browser Popup
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="col-12 mb-2">
                      <div className="p-4 bg-light rounded-4 border" style={{ backgroundColor: '#fcfcfc' }}>
                        <div>
                          <h6 className="mb-0 fw-bold">Email Notifications</h6>
                          <p className="small text-muted mb-3 mt-1">
                            Get appointment summaries and updates via email.
                          </p>
                          <div className="form-check form-switch p-0 m-0 d-flex align-items-center justify-content-between">
                            <label className="form-check-label fw-medium m-0" htmlFor="emailNotifications">
                              Receive emails
                            </label>
                            <input
                              className="form-check-input m-0 custom-switch"
                              type="checkbox"
                              id="emailNotifications"
                              checked={settings.emailNotifications}
                              onChange={(e) => handleSettingChange('emailNotifications', e.target.checked)}
                              style={{ transform: 'scale(1.2)' }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Privacy Tab */}
              {activeTab === 'privacy' && (
                <div>
                  <h5 className="mb-4 fw-bold">
                    <i className="bi bi-shield-lock text-muted me-2"></i>
                    Privacy Settings
                  </h5>

                  <div className="p-4 bg-light rounded-4 border mb-4" style={{ backgroundColor: '#fcfcfc' }}>
                    <div>
                      <h6 className="mb-0 fw-bold">Data Sharing</h6>
                      <p className="text-muted small mt-1 mb-4">
                        Control how your data is used and shared within the RAF & ROX system.
                      </p>
                      
                      <div className="form-check form-switch p-0 m-0 d-flex align-items-center justify-content-between mb-3 border-bottom pb-3">
                        <label className="form-check-label fw-medium m-0" htmlFor="shareAnalytics">
                          Share anonymous usage analytics to improve services
                        </label>
                        <input className="form-check-input m-0 flex-shrink-0" type="checkbox" id="shareAnalytics" defaultChecked style={{ transform: 'scale(1.2)' }} />
                      </div>
                      
                      <div className="form-check form-switch p-0 m-0 d-flex align-items-center justify-content-between">
                        <label className="form-check-label fw-medium m-0" htmlFor="sharePreferences">
                          Share preferences with barbers for better recommendations
                        </label>
                        <input className="form-check-input m-0 flex-shrink-0" type="checkbox" id="sharePreferences" style={{ transform: 'scale(1.2)' }} />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-light rounded-4 border" style={{ backgroundColor: '#fcfcfc' }}>
                    <div>
                      <h6 className="mb-0 fw-bold">Account Data</h6>
                      <p className="text-muted small mt-1 mb-4">
                        Manage your personal data and account information.
                      </p>
                      
                      <div className="d-flex flex-wrap gap-2">
                        <button className="btn-premium">
                          <i className="bi bi-download me-2"></i>
                          Download My Data
                        </button>
                        <button className="btn-premium-outline">
                          <i className="bi bi-trash me-2"></i>
                          Request Account Deletion
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div>
                  <h5 className="mb-4 fw-bold">
                    <i className="bi bi-key text-muted me-2"></i>
                    Security Settings
                  </h5>

                  {/* Change Password */}
                  <div className="p-4 bg-light rounded-4 border mb-4" style={{ backgroundColor: '#fcfcfc' }}>
                    <div>
                      <h6 className="mb-4 fw-bold">Change Password</h6>

                      {passwordStep === 1 ? (
                        <form onSubmit={handleSendPasswordOTP}>
                          <div className="row g-3">
                            <div className="col-md-6">
                              <label htmlFor="newPassword" className="form-label fw-medium small text-muted">New Password</label>
                              <div className="input-group">
                                <input
                                  type={showPassword ? 'text' : 'password'}
                                  className="form-control"
                                  id="newPassword"
                                  name="newPassword"
                                  value={passwordData.newPassword}
                                  onChange={handlePasswordChange}
                                  required
                                  minLength="8"
                                />
                                <button
                                  className="btn btn-light border"
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                >
                                  <i className={`bi ${showPassword ? 'bi-eye-slash text-dark' : 'bi-eye text-dark'}`}></i>
                                </button>

                              </div>

                              {passwordData.newPassword && checkPasswordStrength(passwordData.newPassword).score < 3 && (
                                <div className="text-danger mt-1 fw-medium" style={{ fontSize: '0.8rem' }}>
                                  <i className="bi bi-exclamation-triangle-fill me-1"></i>
                                  Password is too weak
                                </div>
                              )}

                              {/* Password Strength Indicator */}
                              {passwordData.newPassword && (
                                <div className="password-strength-container mt-2">
                                  <div className="password-strength-bar" style={{
                                    width: '100%',
                                    height: '4px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.08)',
                                    borderRadius: '2px',
                                    overflow: 'hidden',
                                    marginBottom: '0.5rem'
                                  }}>
                                    <div
                                      className="password-strength-fill"
                                      style={{
                                        height: '100%',
                                        transition: 'all 0.3s ease',
                                        width: `${(checkPasswordStrength(passwordData.newPassword).score / 6) * 100}%`,
                                        backgroundColor: checkPasswordStrength(passwordData.newPassword).color
                                      }}
                                    ></div>
                                  </div>
                                  <div className="password-strength-text d-flex justify-content-between" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    <span style={{ color: checkPasswordStrength(passwordData.newPassword).color }}>
                                      {checkPasswordStrength(passwordData.newPassword).strength.toUpperCase()}
                                    </span>
                                    <span className="text-muted">
                                      {checkPasswordStrength(passwordData.newPassword).score}/6
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="col-md-6">
                              <label htmlFor="confirmPassword" className="form-label fw-medium small text-muted">Confirm Password</label>
                              <div className="input-group">
                                <input
                                  type={showConfirmPassword ? 'text' : 'password'}
                                  className="form-control"
                                  id="confirmPassword"
                                  name="confirmPassword"
                                  value={passwordData.confirmPassword}
                                  onChange={handlePasswordChange}
                                  required
                                  minLength="8"
                                />
                                <button
                                  className="btn btn-light border"
                                  type="button"
                                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                >
                                  <i className={`bi ${showConfirmPassword ? 'bi-eye-slash text-dark' : 'bi-eye text-dark'}`}></i>
                                </button>
                              </div>
                              {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                                <div className="text-danger mt-1 fw-bold" style={{ fontSize: '0.8rem' }}>Passwords do not match</div>
                              )}
                              {passwordData.confirmPassword && passwordData.newPassword === passwordData.confirmPassword && (
                                <div className="text-success mt-1 fw-bold" style={{ fontSize: '0.8rem' }}>✓ Passwords match</div>
                              )}
                            </div>
                          </div>

                          {/* Password Requirements */}
                          <div className="password-requirements mb-4 mt-3 p-3 rounded-4" style={{
                            backgroundColor: '#1a1a1a',
                            border: '1px solid #3d2c24',
                          }}>
                            <div className="requirements-title mb-3" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8f9fa' }}>
                              Password Requirements:
                            </div>
                            <div className="row g-2">
                              {[
                                { key: 'length', text: 'At least 8 characters' },
                                { key: 'lowercase', text: 'One lowercase letter (a-z)' },
                                { key: 'uppercase', text: 'One uppercase letter (A-Z)' },
                                { key: 'number', text: 'One number (0-9)' },
                                { key: 'special', text: 'One special character (!@#$%^&*)' },
                                { key: 'noSpaces', text: 'No spaces' }
                              ].map((req) => (
                                <div key={req.key} className="col-12 col-md-6">
                                  <div className="requirement d-flex align-items-center gap-2" style={{
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    color: checkPasswordStrength(passwordData.newPassword).checks[req.key] ? '#ffffff' : '#888888',
                                  }}>
                                    <i className={`bi ${checkPasswordStrength(passwordData.newPassword).checks[req.key] ? 'bi-check-circle-fill' : 'bi-circle'}`} style={{ color: checkPasswordStrength(passwordData.newPassword).checks[req.key] ? '#51cf66' : '#666666' }}></i>
                                    {req.text}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="btn-premium"
                            disabled={saving || !passwordData.newPassword || checkPasswordStrength(passwordData.newPassword).score < 6 || passwordData.newPassword !== passwordData.confirmPassword}
                          >
                            {saving ? (
                              <>
                                <span className="spinner-border spinner-border-sm me-2"></span>
                                Sending OTP...
                              </>
                            ) : (
                              <>
                                <i className="bi bi-envelope me-2"></i>
                                Send OTP Code
                              </>
                            )}
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={handleVerifyPasswordOTP}>
                          <div className="mb-4">
                            <label htmlFor="otpCode" className="form-label fw-medium small text-muted">OTP Code</label>
                            <input
                              type="text"
                              className="form-control"
                              id="otpCode"
                              value={otpCode}
                              onChange={(e) => setOtpCode(e.target.value)}
                              required
                              placeholder="Enter the OTP sent to your email"
                            />
                            <div className="form-text small mt-2">
                              Sent to: <strong className="text-dark">{user?.email || 'your email'}</strong>
                            </div>
                          </div>

                          <div className="d-flex gap-2">
                            <button type="submit" className="btn-premium" disabled={saving}>
                              {saving ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-2"></span>
                                  Verifying...
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-key-fill me-2"></i>
                                  Change Password
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              className="btn-premium-outline"
                              onClick={() => {
                                setPasswordStep(1);
                                setOtpCode('');
                              }}
                              disabled={saving}
                            >
                              Back
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>

                  {/* Two-Factor Authentication */}
                  <div className="p-4 bg-light rounded-4 border" style={{ backgroundColor: '#fcfcfc' }}>
                    <div>
                      <h6 className="mb-0 fw-bold">Two-Factor Authentication</h6>
                      <p className="text-muted small mt-1 mb-3">
                        Add an extra layer of security to your account.
                      </p>
                      <div className="d-flex align-items-center">
                        <span className="bg-light text-muted border px-3 py-1 rounded-pill small fw-bold me-3">Not Enabled</span>
                        <button className="btn-premium-outline">
                          <i className="bi bi-shield-plus me-2"></i>
                          Enable 2FA
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div>
                  <h5 className="mb-4 fw-bold">
                    <i className="bi bi-sliders text-muted me-2"></i>
                    Application Preferences
                  </h5>

                  <div className="row g-4">
                    <div className="col-md-6">
                      <div className="p-4 bg-light rounded-4 border h-100" style={{ backgroundColor: '#fcfcfc' }}>
                        <div>
                          <h6 className="mb-4 fw-bold">Localization</h6>
                          <div className="mb-3">
                            <label htmlFor="language" className="form-label fw-medium small text-muted">Language</label>
                            <select
                              className="form-select"
                              id="language"
                              value={settings.language}
                              onChange={(e) => handleSettingChange('language', e.target.value)}
                            >
                              <option value="en">English</option>
                              <option value="fil">Filipino</option>
                            </select>
                          </div>
                          <div className="mb-0">
                            <label htmlFor="timezone" className="form-label fw-medium small text-muted">Timezone</label>
                            <select
                              className="form-select"
                              id="timezone"
                              value={settings.timezone}
                              onChange={(e) => handleSettingChange('timezone', e.target.value)}
                            >
                              <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                              <option value="UTC">UTC (GMT+0)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Save Button */}
              {activeTab !== 'security' && (
                <div className="d-flex justify-content-end mt-4 pt-3 border-top">
                  <button
                    className="btn-premium"
                    onClick={saveSettings}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check-lg me-2"></i>
                        Save Settings
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div >
  );
};

export default Settings;
