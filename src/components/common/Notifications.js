// components/common/Notifications.js
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'unread', 'read'
  const subscriptionRef = useRef(null);

  useEffect(() => {
    fetchNotifications();
    const onResize = () => setIsMobile(window.innerWidth < 992); // Bootstrap lg breakpoint
    onResize();
    window.addEventListener('resize', onResize);
    
    // Set up real-time subscription for notifications
    const setupSubscription = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) return;
        
        // Use a unique channel name to avoid conflicts with multiple instances
        const channelName = `notifications-${user.id}`;
        
        // Check if subscription already exists for this channel
        const existingChannel = supabase.getChannels().find(ch => ch.topic === channelName);
        if (existingChannel) {
          console.log('Subscription already exists for this channel');
          subscriptionRef.current = existingChannel;
          return;
        }
        
        const subscription = supabase
          .channel(channelName)
          .on('postgres_changes', 
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'notifications',
              filter: `user_id=eq.${user.id}`
            }, 
            (payload) => {
              // Check if notification already exists in state to prevent duplicates
              setNotifications(prev => {
                const exists = prev.some(n => n.id === payload.new.id);
                if (exists) {
                  console.log('Duplicate notification prevented:', payload.new.id);
                  return prev;
                }
                return [payload.new, ...prev];
              });
              
              // Increment unread count if notification is unread
              if (!payload.new.read) {
                setUnreadCount(prev => prev + 1);
              }
            }
          )
          .subscribe();
        
        subscriptionRef.current = subscription;
      } catch (err) {
        console.error('Error setting up notification subscription:', err);
      }
    };
    
    setupSubscription();

    return () => {
      window.removeEventListener('resize', onResize);
      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
          console.log('✅ Notification subscription cleaned up');
        } catch (err) {
          console.warn('Error unsubscribing from notifications:', err);
        }
        subscriptionRef.current = null;
      }
    };
  }, []);

  // Dispatch custom event when notification dropdown opens/closes
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('notificationsToggle', {
      detail: { isOpen: showNotifications }
    }));
  }, [showNotifications]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setNotifications(data || []);
      
      // Count unread
      const unread = data?.filter(notification => !notification.read).length || 0;
      setUnreadCount(unread);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
      
      // Update local state
      setNotifications(prevNotifications => 
        prevNotifications.map(notification => 
          notification.id === notificationId 
            ? { ...notification, read: true } 
            : notification
        )
      );
      
      // Update unread count
      setUnreadCount(prevCount => Math.max(0, prevCount - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
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
      
      // Update local state
      setNotifications(prevNotifications => 
        prevNotifications.map(notification => ({ ...notification, read: true }))
      );
      
      // Update unread count
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const formatNotificationTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'appointment':
        return 'bi-calendar-check';
      case 'queue':
        return 'bi-people';
      case 'reminder':
        return 'bi-bell';
      default:
        return 'bi-info-circle';
    }
  };

  // Filter notifications based on current filter
  const getFilteredNotifications = () => {
    switch (filter) {
      case 'unread':
        return notifications.filter(notification => !notification.read);
      case 'read':
        return notifications.filter(notification => notification.read);
      default:
        return notifications;
    }
  };

  // Delete a notification
  const handleDeleteNotification = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
      
      // Update local state
      setNotifications(prevNotifications => 
        prevNotifications.filter(notification => notification.id !== notificationId)
      );
      
      // Update unread count if needed
      const deletedNotification = notifications.find(n => n.id === notificationId);
      if (deletedNotification && !deletedNotification.read) {
        setUnreadCount(prevCount => Math.max(0, prevCount - 1));
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  // Delete all notifications
  const handleDeleteAllNotifications = async () => {
    if (!window.confirm('Are you sure you want to delete all notifications?')) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
      
      // Update local state
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Error deleting all notifications:', err);
    }
  };

  // Render notification content (shared between mobile and desktop) - without header and filters
  const renderNotificationContent = () => (
    <>
      
      {loading ? (
        <div className="p-3 text-center">
          <div className="spinner-border spinner-border-sm text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : error ? (
        <div className="p-3 text-center text-danger">
          <i className="bi bi-exclamation-circle me-2"></i>
          {error}
        </div>
      ) : getFilteredNotifications().length === 0 ? (
        <div className="p-4 text-center text-muted">
          <i className="bi bi-bell-slash fs-4 mb-2"></i>
          <p className="mb-0">
            {filter === 'all' ? 'No notifications' : 
             filter === 'unread' ? 'No unread notifications' : 
             'No read notifications'}
          </p>
        </div>
      ) : (
        <>
          {getFilteredNotifications().slice(0, 6).map(notification => (
            <div 
              key={notification.id} 
              className={`notification-item p-2 p-sm-3 border-bottom ${!notification.read ? 'bg-light' : ''}`}
            >
              <div className="d-flex">
                <div className="me-2 me-sm-3 flex-shrink-0">
                  <div className={`rounded-circle bg-${
                    notification.type === 'appointment' ? 'primary' :
                    notification.type === 'queue' ? 'success' :
                    notification.type === 'reminder' ? 'warning' :
                    'secondary'
                  } bg-opacity-10 p-2 text-center`} style={{ 
                    width: isMobile ? '35px' : '40px', 
                    height: isMobile ? '35px' : '40px' 
                  }}>
                    <i className={`bi ${getNotificationIcon(notification.type)}`} style={{ fontSize: isMobile ? '0.9rem' : '1rem' }}></i>
                  </div>
                </div>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start gap-1">
                    <h6 className="mb-1" style={{ fontSize: 'clamp(0.85rem, 2vw, 0.95rem)', wordBreak: 'break-word' }}>{notification.title}</h6>
                    <small className="text-muted flex-shrink-0" style={{ fontSize: 'clamp(0.7rem, 1.5vw, 0.8rem)' }}>
                      {formatNotificationTime(notification.created_at)}
                    </small>
                  </div>
                  <p className="mb-1 small" style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.875rem)', wordBreak: 'break-word' }}>{notification.message}</p>
                  <div className="d-flex gap-2 flex-wrap">
                    {!notification.read && (
                      <button 
                        className="btn btn-sm btn-link text-decoration-none p-0"
                        onClick={() => handleMarkAsRead(notification.id)}
                        style={{ fontSize: 'clamp(0.7rem, 1.5vw, 0.8rem)' }}
                      >
                        <span className="d-sm-none">Read</span>
                        <span className="d-none d-sm-inline">Mark as read</span>
                      </button>
                    )}
                    <button 
                      className="btn btn-sm btn-link text-decoration-none p-0 text-danger"
                      onClick={() => handleDeleteNotification(notification.id)}
                      title="Delete notification"
                      style={{ fontSize: 'clamp(0.7rem, 1.5vw, 0.8rem)' }}
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          <div className="p-3 text-center">
            <Link 
              to="/notifications" 
              className="btn btn-sm btn-link text-decoration-none"
              onClick={() => setShowNotifications(false)}
            >
              View all
            </Link>
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="dropdown" style={{ position: 'relative' }}>
      <button 
        className="btn btn-link text-decoration-none position-relative text-white"
        onClick={() => setShowNotifications(!showNotifications)}
        aria-expanded={showNotifications}
      >
        <i className="bi bi-bell fs-5"></i>
        {unreadCount > 0 && (
          <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
            {unreadCount}
            <span className="visually-hidden">unread notifications</span>
          </span>
        )}
      </button>
      
      {/* Click outside to close - only on mobile */}
      {showNotifications && isMobile && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1059,
            background: 'rgba(0, 0, 0, 0.3)'
          }}
          onClick={() => setShowNotifications(false)}
        />
      )}
      
      {showNotifications && (
        <>
          {/* Mobile: Fixed position modal-like dropdown */}
          {isMobile ? (
            <div 
              className="show shadow"
              style={{ 
                width: 'calc(100vw - 20px)',
                maxWidth: 'calc(100vw - 20px)',
                height: 'calc(100vh - 80px)',
                maxHeight: 'calc(100vh - 80px)',
                overflowY: 'auto',
                overflowX: 'hidden',
                zIndex: 1060,
                padding: 0,
                borderRadius: '0.5rem',
                position: 'fixed',
                top: '70px',
                left: '10px',
                right: '10px',
                bottom: '10px',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                whiteSpace: 'normal',
                boxSizing: 'border-box',
                background: '#ffffff'
              }}
            >
              {/* Arrow pointing to bell - Mobile (centered) */}
              <div 
                style={{
                  position: 'absolute',
                  top: '-8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderBottom: '8px solid #ffffff',
                  filter: 'drop-shadow(0 -2px 2px rgba(0,0,0,0.1))',
                  zIndex: 1
                }}
              />
              {/* Mobile header with close button, actions, and filters */}
              <div className="d-flex flex-column gap-2 p-3 border-bottom" style={{ position: 'sticky', top: 0, background: '#ffffff', zIndex: 1 }}>
                <div className="d-flex justify-content-between align-items-center">
                  <h6 className="mb-0" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1rem)' }}>Notifications</h6>
                  <button 
                    className="btn btn-sm btn-link text-decoration-none"
                    onClick={() => setShowNotifications(false)}
                    style={{ fontSize: '1.2rem', padding: '0.25rem', minWidth: '36px', minHeight: '36px' }}
                  >
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
                
                {/* Filter Buttons - Mobile */}
                <div className="btn-group w-100" role="group" style={{ flexWrap: 'nowrap' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setFilter('all')}
                    style={{ 
                      fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)',
                      padding: 'clamp(0.375rem, 1vw, 0.5rem) clamp(0.4rem, 1.2vw, 0.6rem)',
                      flex: '1 1 0',
                      minHeight: '36px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${filter === 'unread' ? 'btn-warning' : 'btn-outline-warning'}`}
                    onClick={() => setFilter('unread')}
                    style={{ 
                      fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)',
                      padding: 'clamp(0.375rem, 1vw, 0.5rem) clamp(0.4rem, 1.2vw, 0.6rem)',
                      flex: '1 1 0',
                      minHeight: '36px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Unread ({unreadCount})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${filter === 'read' ? 'btn-success' : 'btn-outline-success'}`}
                    onClick={() => setFilter('read')}
                    style={{ 
                      fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)',
                      padding: 'clamp(0.375rem, 1vw, 0.5rem) clamp(0.4rem, 1.2vw, 0.6rem)',
                      flex: '1 1 0',
                      minHeight: '36px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Read ({notifications.length - unreadCount})
                  </button>
                </div>
                
                {/* Mobile action buttons */}
                <div className="d-flex gap-2 flex-wrap">
                  {unreadCount > 0 && (
                    <button 
                      className="btn btn-sm btn-primary flex-fill"
                      onClick={handleMarkAllAsRead}
                      style={{ 
                        fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', 
                        padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                        minHeight: '36px',
                        fontWeight: '500'
                      }}
                    >
                      <i className="bi bi-check-circle me-1"></i>
                      Mark all as read
                    </button>
                  )}
                  <button 
                    className="btn btn-sm btn-outline-danger flex-fill"
                    onClick={handleDeleteAllNotifications}
                    style={{ 
                      fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', 
                      padding: 'clamp(0.5rem, 1.5vw, 0.625rem) clamp(0.75rem, 2vw, 1rem)',
                      minHeight: '36px',
                      fontWeight: '500'
                    }}
                  >
                    <i className="bi bi-trash me-1"></i>
                    Delete all
                  </button>
                </div>
              </div>
              {/* Mobile content */}
              <div style={{ overflowY: 'auto', overflowX: 'hidden' }}>
                {renderNotificationContent()}
              </div>
            </div>
          ) : (
            /* Desktop: Dropdown menu */
            <div 
              className="dropdown-menu dropdown-menu-end show shadow" 
              style={{ 
                width: 'auto',
                minWidth: '420px',
                maxWidth: '500px',
                maxHeight: '420px',
                overflowY: 'auto',
                overflowX: 'hidden',
                zIndex: 1060,
                marginTop: '0.75rem',
                padding: 0,
                borderRadius: '0.5rem',
                right: 0,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                whiteSpace: 'normal',
                position: 'absolute',
                boxSizing: 'border-box'
              }}
            >
              {/* Arrow pointing to bell - Desktop (aligned to bell icon) */}
              <div 
                style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '15px',
                  width: 0,
                  height: 0,
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderBottom: '8px solid #ffffff',
                  filter: 'drop-shadow(0 -2px 2px rgba(0,0,0,0.1))',
                  zIndex: 1
                }}
              />
              {/* Shadow arrow for better visibility */}
              <div 
                style={{
                  position: 'absolute',
                  top: '-9px',
                  right: '15px',
                  width: 0,
                  height: 0,
                  borderLeft: '9px solid transparent',
                  borderRight: '9px solid transparent',
                  borderBottom: '9px solid rgba(0,0,0,0.1)',
                  zIndex: 0
                }}
              /            >
              {/* Desktop header with actions and filters */}
              <div className="d-flex flex-column gap-2 p-2 p-sm-3 border-bottom">
                <div className="d-flex justify-content-between align-items-center">
                  <h6 className="mb-0" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1rem)' }}>Notifications</h6>
                  <div className="d-flex gap-2">
                    {unreadCount > 0 && (
                      <button 
                        className="btn btn-sm btn-link text-decoration-none"
                        onClick={handleMarkAllAsRead}
                        style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', padding: '0.25rem 0.5rem' }}
                      >
                        Mark all as read
                      </button>
                    )}
                    <button 
                      className="btn btn-sm btn-link text-decoration-none text-danger"
                      onClick={handleDeleteAllNotifications}
                      style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)', padding: '0.25rem 0.5rem' }}
                    >
                      Delete all
                    </button>
                  </div>
                </div>
                
                {/* Filter Buttons - Desktop */}
                <div className="btn-group w-100" role="group">
                  <button
                    type="button"
                    className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setFilter('all')}
                    style={{ 
                      fontSize: 'clamp(0.7rem, 1.8vw, 0.875rem)',
                      padding: 'clamp(0.375rem, 1vw, 0.5rem) clamp(0.5rem, 1.5vw, 0.75rem)',
                      flex: '1 1 auto'
                    }}
                  >
                    All ({notifications.length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${filter === 'unread' ? 'btn-warning' : 'btn-outline-warning'}`}
                    onClick={() => setFilter('unread')}
                    style={{ 
                      fontSize: 'clamp(0.7rem, 1.8vw, 0.875rem)',
                      padding: 'clamp(0.375rem, 1vw, 0.5rem) clamp(0.5rem, 1.5vw, 0.75rem)',
                      flex: '1 1 auto'
                    }}
                  >
                    Unread ({unreadCount})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${filter === 'read' ? 'btn-success' : 'btn-outline-success'}`}
                    onClick={() => setFilter('read')}
                    style={{ 
                      fontSize: 'clamp(0.7rem, 1.8vw, 0.875rem)',
                      padding: 'clamp(0.375rem, 1vw, 0.5rem) clamp(0.5rem, 1.5vw, 0.75rem)',
                      flex: '1 1 auto'
                    }}
                  >
                    Read ({notifications.length - unreadCount})
                  </button>
                </div>
              </div>
              {renderNotificationContent()}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Notifications;
