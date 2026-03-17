// components/pages/NotificationsPage.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { NOTIFICATION_TYPES } from '../utils/constants';

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.read).length || 0);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (error) throw error;

      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this notification?')) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const deleted = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (deleted && !deleted.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'read') return n.read;
    return true;
  });

  const getIcon = (type) => {
    switch (type) {
      case 'appointment': return 'bi-calendar-check-fill text-primary';
      case 'queue': return 'bi-people-fill text-success';
      case 'reminder': return 'bi-bell-fill text-warning';
      case 'booking': return 'bi-calendar-plus-fill text-info';
      case 'announcement': return 'bi-megaphone-fill text-danger';
      default: return 'bi-info-circle-fill text-secondary';
    }
  };

  return (
    <div className="container py-5 mt-4">
      <div className="row justify-content-center">
        <div className="col-lg-10">
          <div className="card border-0 shadow-lg rounded-4 overflow-hidden">
            <div className="card-header bg-dark text-white p-4">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div className="d-flex align-items-center">
                  <div className="bg-white bg-opacity-20 rounded-circle p-2 me-3">
                    <i className="bi bi-bell-fill fs-4 text-white"></i>
                  </div>
                  <div>
                    <h3 className="mb-0 fw-bold">Notifications</h3>
                    <p className="mb-0 text-white-50 small">Manage your alerts and stay updated</p>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button 
                    className="btn btn-sm btn-outline-light rounded-pill px-3"
                    onClick={handleMarkAllAsRead}
                    disabled={unreadCount === 0}
                  >
                    Mark All Read
                  </button>
                  <button 
                    className="btn btn-sm btn-outline-danger rounded-pill px-3"
                    onClick={async () => {
                        if (window.confirm('Delete all notifications?')) {
                            const { data: { user } } = await supabase.auth.getUser();
                            await supabase.from('notifications').delete().eq('user_id', user.id);
                            setNotifications([]);
                            setUnreadCount(0);
                        }
                    }}
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            <div className="card-body p-0">
              {/* Filter Tabs */}
              <div className="bg-light p-3 border-bottom d-flex gap-2 overflow-auto">
                <button 
                  className={`btn rounded-pill px-4 ${filter === 'all' ? 'btn-dark' : 'btn-outline-dark'}`}
                  onClick={() => setFilter('all')}
                >
                  All <span className="badge bg-secondary ms-1">{notifications.length}</span>
                </button>
                <button 
                  className={`btn rounded-pill px-4 ${filter === 'unread' ? 'btn-dark' : 'btn-outline-dark'}`}
                  onClick={() => setFilter('unread')}
                >
                  Unread <span className="badge bg-warning ms-1">{unreadCount}</span>
                </button>
                <button 
                  className={`btn rounded-pill px-4 ${filter === 'read' ? 'btn-dark' : 'btn-outline-dark'}`}
                  onClick={() => setFilter('read')}
                >
                  Read <span className="badge bg-success ms-1">{notifications.length - unreadCount}</span>
                </button>
              </div>

              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status"></div>
                  <p className="mt-2 text-muted">Loading notifications...</p>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-bell-slash fs-1 text-muted mb-3 d-block"></i>
                  <h5 className="text-muted">No notifications found</h5>
                  <p className="small text-muted">We'll let you know when something happens</p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {filteredNotifications.map(n => (
                    <div 
                      key={n.id} 
                      className={`list-group-item list-group-item-action p-4 border-start-0 border-end-0 ${!n.read ? 'bg-light bg-opacity-50' : ''}`}
                      style={{ borderLeft: !n.read ? '4px solid #007bff' : '4px solid transparent', transition: 'all 0.2s' }}
                    >
                      <div className="d-flex">
                        <div className="me-3">
                          <div className="bg-white rounded-circle shadow-sm p-3 d-flex align-items-center justify-content-center" style={{ width: '50px', height: '50px' }}>
                            <i className={`bi ${getIcon(n.type)} fs-4`}></i>
                          </div>
                        </div>
                        <div className="flex-grow-1">
                          <div className="d-flex justify-content-between align-items-start mb-1">
                            <h6 className={`mb-0 ${!n.read ? 'fw-bold' : ''}`}>{n.title}</h6>
                            <small className="text-muted">{new Date(n.created_at).toLocaleString()}</small>
                          </div>
                          <p className="mb-2 text-secondary">{n.message}</p>
                          <div className="d-flex gap-3">
                            {!n.read && (
                              <button className="btn btn-sm btn-link p-0 text-decoration-none fw-bold" onClick={() => handleMarkAsRead(n.id)}>Mark as Read</button>
                            )}
                            <button className="btn btn-sm btn-link p-0 text-decoration-none text-danger" onClick={() => handleDelete(n.id)}>Delete</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
