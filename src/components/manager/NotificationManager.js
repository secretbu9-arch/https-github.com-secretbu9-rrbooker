// components/manager/NotificationManager.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { PushService } from '../../services/PushService';

const NotificationManager = () => {
  const [notificationData, setNotificationData] = useState({
    title: '',
    body: '',
    type: 'general',
    target: 'all', // 'all' or 'specific'
    userId: ''
  });
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role')
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setMessage({ type: 'danger', text: 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNotificationData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSendNotification = async () => {
    if (!notificationData.title || !notificationData.body) {
      setMessage({ type: 'warning', text: 'Please fill in title and body' });
      return;
    }

    if (notificationData.target === 'specific' && !notificationData.userId) {
      setMessage({ type: 'warning', text: 'Please select a user' });
      return;
    }

    setSending(true);
    setMessage({ type: '', text: '' });

    try {
      const data = {
        type: notificationData.type,
        timestamp: new Date().toISOString()
      };

      let result;
      if (notificationData.target === 'all') {
        result = await PushService.sendNotificationToAllUsers(
          notificationData.title,
          notificationData.body,
          data
        );
      } else {
        result = await PushService.sendNotificationToUser(
          notificationData.userId,
          notificationData.title,
          notificationData.body,
          data
        );
      }

      if (result) {
        setMessage({ 
          type: 'success', 
          text: `Notification sent successfully to ${notificationData.target === 'all' ? 'all users' : 'selected user'}` 
        });
        setNotificationData({
          title: '',
          body: '',
          type: 'general',
          target: 'all',
          userId: ''
        });
      } else {
        setMessage({ type: 'danger', text: 'Failed to send notification' });
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      setMessage({ type: 'danger', text: 'Error sending notification: ' + error.message });
    } finally {
      setSending(false);
    }
  };

  const handleTestNotification = async () => {
    setSending(true);
    setMessage({ type: '', text: '' });

    try {
      console.log('🧪 Testing notification system...');
      
      // First test: Check if we can fetch users
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, role')
        .limit(5);
      
      if (usersError) {
        console.error('❌ Error fetching users:', usersError);
        setMessage({ type: 'danger', text: `Database error: ${usersError.message}` });
        return;
      }
      
      console.log('👥 Users found:', users?.length || 0, users);
      
      if (!users || users.length === 0) {
        setMessage({ type: 'warning', text: 'No users found in database. Please create some users first.' });
        return;
      }
      
      // Test with current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMessage({ type: 'danger', text: 'No authenticated user found' });
        return;
      }
      
      console.log('👤 Testing with current user:', user.id);
      
      const result = await PushService.sendNotificationToUser(
        user.id,
        'Test Notification 🧪',
        'This is a test notification from the manager panel',
        { type: 'test', source: 'manager' }
      );
      
      if (result) {
        setMessage({ type: 'success', text: 'Test notification sent successfully! Check your notifications.' });
      } else {
        setMessage({ type: 'danger', text: 'Test notification failed - check console for details' });
      }
    } catch (error) {
      console.error('❌ Error testing notification:', error);
      setMessage({ type: 'danger', text: 'Error testing notification: ' + error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h4 className="mb-0">
                <i className="bi bi-bell me-2"></i>
                Notification Manager
              </h4>
            </div>
            <div className="card-body">
              {message.text && (
                <div className={`alert alert-${message.type} alert-dismissible fade show`} role="alert">
                  {message.text}
                  <button 
                    type="button" 
                    className="btn-close" 
                    onClick={() => setMessage({ type: '', text: '' })}
                  ></button>
                </div>
              )}

              <div className="row">
                <div className="col-md-8">
                  <div className="card">
                    <div className="card-header">
                      <h5>Send Notification</h5>
                    </div>
                    <div className="card-body">
                      <div className="mb-3">
                        <label className="form-label">Target</label>
                        <div className="btn-group w-100" role="group">
                          <input 
                            type="radio" 
                            className="btn-check" 
                            name="target" 
                            id="targetAll" 
                            value="all"
                            checked={notificationData.target === 'all'}
                            onChange={handleInputChange}
                          />
                          <label className="btn btn-outline-primary" htmlFor="targetAll">
                            All Users
                          </label>
                          
                          <input 
                            type="radio" 
                            className="btn-check" 
                            name="target" 
                            id="targetSpecific" 
                            value="specific"
                            checked={notificationData.target === 'specific'}
                            onChange={handleInputChange}
                          />
                          <label className="btn btn-outline-primary" htmlFor="targetSpecific">
                            Specific User
                          </label>
                        </div>
                      </div>

                      {notificationData.target === 'specific' && (
                        <div className="mb-3">
                          <label className="form-label">Select User</label>
                          <select 
                            className="form-select"
                            name="userId"
                            value={notificationData.userId}
                            onChange={handleInputChange}
                            disabled={loading}
                          >
                            <option value="">Choose a user...</option>
                            {users.map(user => (
                              <option key={user.id} value={user.id}>
                                {user.full_name} ({user.email}) - {user.role}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="mb-3">
                        <label className="form-label">Title</label>
                        <input 
                          type="text" 
                          className="form-control"
                          name="title"
                          value={notificationData.title}
                          onChange={handleInputChange}
                          placeholder="Enter notification title"
                          maxLength={100}
                        />
                      </div>

                      <div className="mb-3">
                        <label className="form-label">Message</label>
                        <textarea 
                          className="form-control"
                          name="body"
                          value={notificationData.body}
                          onChange={handleInputChange}
                          placeholder="Enter notification message"
                          rows={4}
                          maxLength={500}
                        />
                        <div className="form-text">
                          {notificationData.body.length}/500 characters
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="form-label">Type</label>
                        <select 
                          className="form-select"
                          name="type"
                          value={notificationData.type}
                          onChange={handleInputChange}
                        >
                          <option value="general">General</option>
                          <option value="appointment">Appointment</option>
                          <option value="queue">Queue</option>
                          <option value="booking">Booking</option>
                          <option value="announcement">Announcement</option>
                          <option value="reminder">Reminder</option>
                        </select>
                      </div>

                      <div className="d-flex gap-2">
                        <button 
                          className="btn btn-primary"
                          onClick={handleSendNotification}
                          disabled={sending}
                        >
                          {sending ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                              Sending...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-send me-2"></i>
                              Send Notification
                            </>
                          )}
                        </button>
                        
                        <button 
                          className="btn btn-outline-secondary"
                          onClick={handleTestNotification}
                          disabled={sending}
                        >
                          <i className="bi bi-bell me-2"></i>
                          Test Notification
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="card">
                    <div className="card-header">
                      <h5>Quick Actions</h5>
                    </div>
                    <div className="card-body">
                      <div className="d-grid gap-2">
                        <button 
                          className="btn btn-outline-primary"
                          onClick={() => setNotificationData(prev => ({
                            ...prev,
                            title: 'Appointment Reminder',
                            body: 'Your appointment is coming up in 30 minutes. Please arrive on time.',
                            type: 'reminder'
                          }))}
                        >
                          <i className="bi bi-clock me-2"></i>
                          Appointment Reminder
                        </button>
                        
                        <button 
                          className="btn btn-outline-success"
                          onClick={() => setNotificationData(prev => ({
                            ...prev,
                            title: 'Queue Update',
                            body: 'You are next in line. Please proceed to the barber chair.',
                            type: 'queue'
                          }))}
                        >
                          <i className="bi bi-people me-2"></i>
                          Queue Update
                        </button>
                        
                        <button 
                          className="btn btn-outline-info"
                          onClick={() => setNotificationData(prev => ({
                            ...prev,
                            title: 'New Booking',
                            body: 'You have a new booking request. Please check your dashboard.',
                            type: 'booking'
                          }))}
                        >
                          <i className="bi bi-calendar-plus me-2"></i>
                          New Booking
                        </button>
                        
                        <button 
                          className="btn btn-outline-warning"
                          onClick={() => setNotificationData(prev => ({
                            ...prev,
                            title: 'Shop Announcement',
                            body: 'We have a special promotion this week. Book now to get 20% off!',
                            type: 'announcement'
                          }))}
                        >
                          <i className="bi bi-megaphone me-2"></i>
                          Shop Announcement
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="card mt-3">
                    <div className="card-header">
                      <h5>Statistics</h5>
                    </div>
                    <div className="card-body">
                      <div className="row text-center">
                        <div className="col-6">
                          <h4 className="text-primary">{users.length}</h4>
                          <small className="text-muted">Total Users</small>
                        </div>
                        <div className="col-6">
                          <h4 className="text-success">Active</h4>
                          <small className="text-muted">Notification System</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationManager;
