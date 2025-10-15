// components/pages/Settings.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/PushService';
import logoImage from '../../assets/images/raf-rok-logo.png';

const Settings = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('notifications');
  const [notificationSupport, setNotificationSupport] = useState(null);
  const [testingNotification, setTestingNotification] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState({
    emailNotifications: true,
    appointmentReminders: true,
    promotionalEmails: false,
    language: 'en',
    timezone: 'Asia/Manila'
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchUserData();
    checkNotificationSupport();
  }, []);

  const checkNotificationSupport = async () => {
    try {
      const support = await PushService.checkNotificationSupport();
      setNotificationSupport(support);
    } catch (error) {
      console.error('Error checking notification support:', error);
    }
  };

  const testNotification = async () => {
    setTestingNotification(true);
    try {
      const success = await PushService.testNotification();
      if (success) {
        setMessage({ type: 'success', text: 'Test notification sent successfully!' });
      } else {
        setMessage({ type: 'warning', text: 'Failed to send test notification. Check your browser settings.' });
      }
    } catch (error) {
      console.error('Error testing notification:', error);
      setMessage({ type: 'danger', text: 'Error testing notification: ' + error.message });
    } finally {
      setTestingNotification(false);
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
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
          appointmentReminders: true,
          promotionalEmails: false,
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

  const changePassword = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      // Validate password match
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        throw new Error('New passwords do not match');
      }

      if (passwordData.newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error changing password:', error);
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
                      <div className="card border-light">
                        <div className="card-body">
                          <h6 className="card-title">Email Notifications</h6>
                          <div className="form-check form-switch mb-3">
                            <input 
                              className="form-check-input" 
                              type="checkbox" 
                              id="emailNotifications"
                              checked={settings.emailNotifications}
                              onChange={(e) => handleSettingChange('emailNotifications', e.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="emailNotifications">
                              Receive email notifications
                            </label>
                          </div>
                          <div className="form-check form-switch mb-3">
                            <input 
                              className="form-check-input" 
                              type="checkbox" 
                              id="appointmentReminders"
                              checked={settings.appointmentReminders}
                              onChange={(e) => handleSettingChange('appointmentReminders', e.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="appointmentReminders">
                              Appointment reminders
                            </label>
                          </div>
                          <div className="form-check form-switch">
                            <input 
                              className="form-check-input" 
                              type="checkbox" 
                              id="promotionalEmails"
                              checked={settings.promotionalEmails}
                              onChange={(e) => handleSettingChange('promotionalEmails', e.target.checked)}
                            />
                            <label className="form-check-label" htmlFor="promotionalEmails">
                              Promotional emails
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                  </div>

                  {/* Notification Test Section */}
                  <div className="row mt-4">
                    <div className="col-12">
                      <div className="card border-light">
                        <div className="card-body">
                          <h6 className="card-title">
                            <i className="bi bi-bell-slash me-2"></i>
                            Test Notifications
                          </h6>
                          <p className="text-muted mb-3">
                            Test your notification settings to ensure they're working properly.
                          </p>
                          
                          {notificationSupport && (
                            <div className="mb-3">
                              <h6 className="small text-muted mb-2">Notification Support Status:</h6>
                              <div className="row">
                                <div className="col-md-4">
                                  <div className="d-flex align-items-center">
                                    <i className={`bi bi-${notificationSupport.push ? 'check-circle text-success' : 'x-circle text-danger'} me-2`}></i>
                                    <span className="small">Push Notifications: {notificationSupport.permissions.push}</span>
                                  </div>
                                </div>
                                <div className="col-md-4">
                                  <div className="d-flex align-items-center">
                                    <i className={`bi bi-${notificationSupport.local ? 'check-circle text-success' : 'x-circle text-danger'} me-2`}></i>
                                    <span className="small">Local Notifications: {notificationSupport.permissions.local}</span>
                                  </div>
                                </div>
                                <div className="col-md-4">
                                  <div className="d-flex align-items-center">
                                    <i className={`bi bi-${notificationSupport.web ? 'check-circle text-success' : 'x-circle text-danger'} me-2`}></i>
                                    <span className="small">Web Notifications: {notificationSupport.permissions.web}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="d-flex gap-2">
                            <button 
                              className="btn btn-primary"
                              onClick={testNotification}
                              disabled={testingNotification}
                            >
                              {testingNotification ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                  Testing...
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-bell me-2"></i>
                                  Send Test Notification
                                </>
                              )}
                            </button>
                            <button 
                              className="btn btn-outline-secondary"
                              onClick={checkNotificationSupport}
                            >
                              <i className="bi bi-arrow-clockwise me-2"></i>
                              Refresh Status
                            </button>
                          </div>

                          {message.text && (
                            <div className={`alert alert-${message.type} mt-3 mb-0`} role="alert">
                              {message.text}
                            </div>
                          )}
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
                      <form onSubmit={changePassword}>
                        <div className="row">
                          <div className="col-md-6 mb-3">
                            <label htmlFor="newPassword" className="form-label">New Password</label>
                            <input
                              type="password"
                              className="form-control"
                              id="newPassword"
                              name="newPassword"
                              value={passwordData.newPassword}
                              onChange={handlePasswordChange}
                              required
                              minLength="6"
                            />
                          </div>
                          <div className="col-md-6 mb-3">
                            <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
                            <input
                              type="password"
                              className="form-control"
                              id="confirmPassword"
                              name="confirmPassword"
                              value={passwordData.confirmPassword}
                              onChange={handlePasswordChange}
                              required
                              minLength="6"
                            />
                          </div>
                        </div>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                          {saving ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2"></span>
                              Changing...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-key me-2"></i>
                              Change Password
                            </>
                          )}
                        </button>
                      </form>
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