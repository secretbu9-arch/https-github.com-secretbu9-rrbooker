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

      if (passwordData.newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long');
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
    <div className="container mt-4 mb-5">
      <div className="row justify-content-center">
        <div className="col-md-10">
          {/* Header Card */}
          <div className="card shadow-sm mb-4">
            <div className="card-header bg-dark text-white">
              <div className="d-flex align-items-center">
                <img
                  src={logoImage}
                  alt="RAF & ROK"
                  height="40"
                  className="me-3"
                  style={{
                    backgroundColor: '#ffffff',
                    padding: '5px',
                    borderRadius: '8px'
                  }}
                />
                <div>
                  <h4 className="mb-0">
                    <i className="bi bi-gear me-2"></i>
                    Settings
                  </h4>
                  <small className="text-light opacity-75">
                    Manage your account preferences
                  </small>
                </div>
              </div>
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
          <div className="card shadow-sm">
            <div className="card-header">
              <ul className="nav nav-tabs card-header-tabs" role="tablist">
                <li className="nav-item" role="presentation">
                  <button
                    className={`nav-link ${activeTab === 'notifications' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notifications')}
                    type="button"
                  >
                    <i className="bi bi-bell me-2"></i>
                    Notifications
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    className={`nav-link ${activeTab === 'privacy' ? 'active' : ''}`}
                    onClick={() => setActiveTab('privacy')}
                    type="button"
                  >
                    <i className="bi bi-shield-lock me-2"></i>
                    Privacy
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    className={`nav-link ${activeTab === 'security' ? 'active' : ''}`}
                    onClick={() => setActiveTab('security')}
                    type="button"
                  >
                    <i className="bi bi-key me-2"></i>
                    Security
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    className={`nav-link ${activeTab === 'preferences' ? 'active' : ''}`}
                    onClick={() => setActiveTab('preferences')}
                    type="button"
                  >
                    <i className="bi bi-sliders me-2"></i>
                    Preferences
                  </button>
                </li>
              </ul>
            </div>

            <div className="card-body">
              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div>
                  <h5 className="mb-4">
                    <i className="bi bi-bell me-2"></i>
                    Notification Preferences
                  </h5>

                  <div className="row">
                    <div className="col-md-6 mb-4">
                      <div className="card border-light h-100">
                        <div className="card-body">
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <h6 className="card-title mb-0">Push Notifications</h6>
                            {pushStatus.supported ? (
                              <span className={`badge ${pushStatus.permission === 'granted' ? 'bg-success' : (pushStatus.permission === 'denied' ? 'bg-danger' : 'bg-warning')}`}>
                                {pushStatus.permission === 'granted' ? 'Enabled' : (pushStatus.permission === 'denied' ? 'Blocked' : 'Disabled')}
                              </span>
                            ) : (
                              <span className="badge bg-secondary">Not Supported</span>
                            )}
                          </div>

                          {pushStatus.permission === 'denied' && (
                            <div className="alert alert-danger py-2 px-3 mb-3" style={{ fontSize: '0.8rem' }}>
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
                            <div className={`alert ${window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches ? 'alert-success' : 'alert-warning'} py-2 px-3 mb-3`} style={{ fontSize: '0.85rem' }}>
                              <h6 className="alert-heading mb-1" style={{ fontSize: '0.9rem' }}>
                                <i className="bi bi-apple me-2"></i>
                                {window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches ? 'PWA Mode Active' : 'iOS Setup Required'}
                              </h6>
                              {!(window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) ? (
                                <>
                                  <p className="mb-2">Chrome on iOS only supports notifications when saved as an app:</p>
                                  <ol className="mb-0 ps-3">
                                    <li>Tap the <strong>Share</strong> icon (in the address bar or bottom bar).</li>
                                    <li>Select <strong>"Add to Home Screen"</strong>.</li>
                                    <li>Open the <strong>R&R Booker</strong> app from your home screen.</li>
                                  </ol>
                                </>
                              ) : (
                                <p className="mb-0">You are running in App mode! You can now enable push notifications below.</p>
                              )}
                            </div>
                          )}

                          <div className="d-grid gap-2">
                            {pushStatus.permission !== 'granted' ? (
                              <button
                                className="btn btn-outline-primary btn-sm"
                                onClick={handleEnablePush}
                                disabled={saving}
                              >
                                <i className="bi bi-bell-fill me-2"></i>
                                Enable Push Notifications
                              </button>
                            ) : (
                              <>
                                <button
                                  className="btn btn-outline-success btn-sm"
                                  onClick={handleTestNotification}
                                  disabled={saving}
                                >
                                  <i className="bi bi-send-fill me-2"></i>
                                  Send Test Notification
                                </button>
                                <button
                                  className="btn btn-outline-info btn-sm"
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

                    <div className="col-md-6 mb-4">
                      <div className="card border-light h-100">
                        <div className="card-body">
                          <h6 className="card-title">Email Notifications</h6>
                          <p className="small text-muted mb-3">
                            Get appointment summaries and updates via email.
                          </p>
                          <div className="form-check form-switch">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id="emailNotifications"
                              checked={settings.emailNotifications}
                              onChange={(e) => handleSettingChange('emailNotifications', e.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="emailNotifications">
                              Receive emails
                            </label>
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
                  <h5 className="mb-4">
                    <i className="bi bi-shield-lock me-2"></i>
                    Privacy Settings
                  </h5>

                  <div className="card border-light mb-4">
                    <div className="card-body">
                      <h6 className="card-title">Data Sharing</h6>
                      <p className="card-text text-muted">
                        Control how your data is used and shared within the RAF & ROK system.
                      </p>
                      <div className="form-check form-switch mb-3">
                        <input className="form-check-input" type="checkbox" id="shareAnalytics" defaultChecked />
                        <label className="form-check-label" htmlFor="shareAnalytics">
                          Share anonymous usage analytics to improve services
                        </label>
                      </div>
                      <div className="form-check form-switch">
                        <input className="form-check-input" type="checkbox" id="sharePreferences" />
                        <label className="form-check-label" htmlFor="sharePreferences">
                          Share preferences with barbers for better recommendations
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="card border-light">
                    <div className="card-body">
                      <h6 className="card-title">Account Data</h6>
                      <p className="card-text text-muted">
                        Manage your personal data and account information.
                      </p>
                      <button className="btn btn-outline-primary me-2">
                        <i className="bi bi-download me-2"></i>
                        Download My Data
                      </button>
                      <button className="btn btn-outline-danger">
                        <i className="bi bi-trash me-2"></i>
                        Request Account Deletion
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div>
                  <h5 className="mb-4">
                    <i className="bi bi-key me-2"></i>
                    Security Settings
                  </h5>

                  {/* Change Password */}
                  <div className="card border-light mb-4">
                    <div className="card-body">
                      <h6 className="card-title">Change Password</h6>

                      {passwordStep === 1 ? (
                        <form onSubmit={handleSendPasswordOTP}>
                          <div className="row">
                            <div className="col-md-6 mb-3">
                              <label htmlFor="newPassword" className="form-label">New Password</label>
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
                                  className="btn btn-outline-secondary"
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                >
                                  <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                                </button>
                              </div>
                            </div>

                            <div className="col-md-6 mb-3">
                              <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
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
                                  className="btn btn-outline-secondary"
                                  type="button"
                                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                >
                                  <i className={`bi ${showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                                </button>
                              </div>
                            </div>
                          </div>

                          <button type="submit" className="btn btn-primary" disabled={saving}>
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
                          <div className="mb-3">
                            <label htmlFor="otpCode" className="form-label">OTP Code</label>
                            <input
                              type="text"
                              className="form-control"
                              id="otpCode"
                              value={otpCode}
                              onChange={(e) => setOtpCode(e.target.value)}
                              required
                              placeholder="Enter the OTP sent to your email"
                            />
                            <div className="form-text">
                              Sent to: <strong>{user?.email || 'your email'}</strong>
                            </div>
                          </div>

                          <div className="d-flex gap-2">
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                              {saving ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-2"></span>
                                  Verifying...
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-key me-2"></i>
                                  Change Password
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
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
                  <div className="card border-light">
                    <div className="card-body">
                      <h6 className="card-title">Two-Factor Authentication</h6>
                      <p className="card-text text-muted">
                        Add an extra layer of security to your account.
                      </p>
                      <span className="badge bg-warning me-2">Not Enabled</span>
                      <button className="btn btn-outline-success btn-sm">
                        <i className="bi bi-shield-plus me-2"></i>
                        Enable 2FA
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div>
                  <h5 className="mb-4">
                    <i className="bi bi-sliders me-2"></i>
                    Application Preferences
                  </h5>

                  <div className="row">

                    <div className="col-md-6 mb-4">
                      <div className="card border-light">
                        <div className="card-body">
                          <h6 className="card-title">Localization</h6>
                          <div className="mb-3">
                            <label htmlFor="language" className="form-label">Language</label>
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
                          <div className="mb-3">
                            <label htmlFor="timezone" className="form-label">Timezone</label>
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
                <div className="d-flex justify-content-end mt-4">
                  <button
                    className="btn btn-primary"
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
    </div>
  );
};

export default Settings;
