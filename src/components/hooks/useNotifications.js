// hooks/useNotifications.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Custom hook for managing user notifications
 */
export const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [subscribed, setSubscribed] = useState(false);

  /**
   * Fetch user notifications
   */
  const fetchNotifications = useCallback(async (limit = 10) => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

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
  }, []);

  /**
   * Mark a notification as read
   * @param {string} notificationId - ID of the notification to mark as read
   */
  const markAsRead = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
      
      // Update local state
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, read: true } 
            : notification
        )
      );
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      return true;
    } catch (err) {
      console.error('Error marking notification as read:', err);
      return false;
    }
  };

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return false;

      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;
      
      // Update local state
      setNotifications(prev => 
        prev.map(notification => ({ ...notification, read: true }))
      );
      
      // Update unread count
      setUnreadCount(0);
      
      return true;
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      return false;
    }
  };

  /**
   * Delete a notification
   * @param {string} notificationId - ID of the notification to delete
   */
  const deleteNotification = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
      
      // Update local state and check if it was unread
      let wasUnread = false;
      setNotifications(prev => {
        const notification = prev.find(n => n.id === notificationId);
        wasUnread = notification && !notification.read;
        return prev.filter(n => n.id !== notificationId);
      });
      
      // Update unread count if needed
      if (wasUnread) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      return true;
    } catch (err) {
      console.error('Error deleting notification:', err);
      return false;
    }
  };

  /**
   * Delete all notifications
   */
  const deleteAllNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return false;

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
      
      // Update local state
      setNotifications([]);
      setUnreadCount(0);
      
      return true;
    } catch (err) {
      console.error('Error deleting all notifications:', err);
      return false;
    }
  };

  /**
   * Set up real-time subscription to notifications
   */
  const setupSubscription = useCallback(() => {
    if (!subscribed) {
      // Get the current user
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        
        // Set up subscription
        const subscription = supabase
          .channel('notifications')
          .on('postgres_changes', 
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'notifications',
              filter: `user_id=eq.${user.id}`
            }, 
            (payload) => {
              // Add the new notification to the list
              setNotifications(prev => [payload.new, ...prev]);
              // Increment unread count
              setUnreadCount(prev => prev + 1);
              // Show browser or in-app notification
              showNotification(payload.new);
            }
          )
          .subscribe();
        
        setSubscribed(true);
        
        // Return cleanup function
        return () => {
          subscription.unsubscribe();
          setSubscribed(false);
        };
      });
    }
  }, [subscribed]);

  /**
   * Show a notification via browser or in-app
   * @param {object} notification - Notification data
   */
  const showNotification = (notification) => {
    // Check browser notification permission
    if (Notification.permission === 'granted') {
      // Show browser notification
      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico'
      });
      
      // Close after 5 seconds
      setTimeout(() => browserNotification.close(), 5000);
    } else {
      // Show in-app notification
      // This would typically use a toast or notification component
      console.log('New notification:', notification.title, notification.message);
    }
  };

  /**
   * Request permission for browser notifications
   */
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      return false;
    }
    
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    
    return Notification.permission === 'granted';
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchNotifications();
    
    // Request notification permission
    requestNotificationPermission();
  }, [fetchNotifications]);

  // Set up subscription on mount
  useEffect(() => {
    const cleanup = setupSubscription();
    return cleanup;
  }, [setupSubscription]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    requestNotificationPermission
  };
};

export default useNotifications;