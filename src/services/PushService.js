// services/PushService.js
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';
import { getFCMToken, onForegroundMessage } from '../firebase-config';

class PushServiceImpl {
  initialized = false;
  deviceToken = null;
  pendingToken = null;

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Request permissions for both push and local notifications
      const [pushPerms, localPerms] = await Promise.allSettled([
        PushNotifications.requestPermissions(),
        LocalNotifications.requestPermissions()
      ]);

      console.log('Push permissions:', pushPerms.status === 'fulfilled' ? pushPerms.value : pushPerms.reason);
      console.log('Local permissions:', localPerms.status === 'fulfilled' ? localPerms.value : localPerms.reason);

      // Initialize local notifications regardless of platform
      await this.initializeLocalNotifications();

      // Initialize push notifications only on native platforms
      if (Capacitor.isNativePlatform()) {
        await this.initializePushNotifications();
      } else {
        // For web, we'll use browser notifications
        await this.initializeWebNotifications();
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
      // Still mark as initialized to prevent retry loops
      this.initialized = true;
    }
  }

  async initializePushNotifications() {
    try {
      // Register with APNS/FCM
      await PushNotifications.register();

      // Listeners
      PushNotifications.addListener('registration', async (token) => {
        console.log('Push token received:', token.value);
        this.deviceToken = token.value;
        try {
          // Check if user is authenticated before attempting to save
          const isAuthenticated = await this.isUserAuthenticated();
          if (isAuthenticated) {
            await this.saveDeviceToken(token.value);
          } else {
            console.log('🔄 User not authenticated, storing token for later');
            this.pendingToken = token.value;
          }
        } catch (e) {
          console.error('Error saving device token:', e);
        }
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error:', error);
      });

      // Foreground notifications
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push received in foreground:', notification);
        // Show local notification when app is in foreground
        this.showLocalNotification(
          notification.title || 'Raf & Rok',
          notification.body || 'You have a new notification',
          notification.data
        );
      });

      // Tapped notifications
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Push action performed:', action);
        this.handleNotificationAction(action);
      });

    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
    }
  }

  async initializeLocalNotifications() {
    try {
      // Ensure Android notification channel exists (Android 8+)
      if (Capacitor.getPlatform() === 'android' && LocalNotifications.createChannel) {
        try {
          await LocalNotifications.createChannel({
            id: 'default',
            name: 'General Notifications',
            description: 'General alerts and updates',
            importance: 5, // IMPORTANCE_HIGH
            visibility: 1, // VISIBILITY_PRIVATE
            sound: 'default',
            lights: true,
            vibration: true
          });
          console.log('Android notification channel ensured');
        } catch (channelError) {
          console.warn('Could not create notification channel:', channelError);
        }
      }

      // Listen for local notification actions
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        console.log('Local notification action:', action);
        this.handleNotificationAction(action);
      });

      // Listen for local notification received
      LocalNotifications.addListener('localNotificationReceived', (notification) => {
        console.log('Local notification received:', notification);
      });

    } catch (error) {
      console.error('Failed to initialize local notifications:', error);
    }
  }

  async initializeWebNotifications() {
    try {
      // Request browser notification permission
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        console.log('Browser notification permission:', permission);
        
        if (permission === 'granted') {
          console.log('Browser notifications enabled');
          
          // Get FCM token for web push
          try {
            const fcmToken = await getFCMToken();
            if (fcmToken) {
              this.deviceToken = fcmToken;
              // Check if user is authenticated before attempting to save
              const isAuthenticated = await this.isUserAuthenticated();
              if (isAuthenticated) {
                await this.saveDeviceToken(fcmToken);
              } else {
                console.log('🔄 User not authenticated, storing token for later');
                this.pendingToken = fcmToken;
              }
              
              // Listen for foreground messages
              onForegroundMessage((payload) => {
                console.log('FCM message received in foreground:', payload);
                // Handle message regardless of focus to avoid missed notifications on web
                if (document.hasFocus()) {
                  console.log('🔔 Tab is focused, handling foreground message');
                } else {
                  console.log('🔔 Tab not focused, ensuring a browser notification is shown');
                }
                this.handleForegroundMessage(payload);
              });
            } else {
              console.warn('Failed to get FCM token for web notifications');
            }
          } catch (fcmError) {
            console.error('Error getting FCM token:', fcmError);
            // Continue without FCM token - we can still use browser notifications
          }
        } else if (permission === 'denied') {
          console.warn('Browser notifications denied by user');
        } else {
          console.log('Browser notification permission pending');
        }
      } else {
        console.warn('Browser notifications not supported');
      }
    } catch (error) {
      console.error('Error initializing web notifications:', error);
    }
  }

  async saveDeviceToken(token) {
    console.log('🔐 Checking authentication...');
    
    if (!token) {
      console.error('❌ No device token provided');
      return;
    }
    
    let user;
    try {
      // First check if there's a session to avoid AuthSessionMissingError
      let session;
      try {
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.log('🔄 Session check failed, will retry when user is authenticated');
          this.pendingToken = token;
          return;
        }
        session = currentSession;
      } catch (sessionCheckError) {
        console.log('🔄 Session check error, will retry when user is authenticated');
        this.pendingToken = token;
        return;
      }
      
      if (!session) {
        console.log('🔄 No active session found, will retry when user is authenticated');
        this.pendingToken = token;
        return;
      }
      
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('❌ Authentication error:', authError);
        console.log('🔄 Will retry when user is authenticated');
        // Store the token for later use when user is authenticated
        this.pendingToken = token;
        return;
      }
      
      if (!authUser) {
        console.log('🔄 No authenticated user found, will retry when user logs in');
        // Store the token for later use when user is authenticated
        this.pendingToken = token;
        return;
      }
      
      user = authUser; // Assign to outer scope variable
    } catch (error) {
      // Handle specific authentication errors
      if (error.name === 'AuthSessionMissingError' || error.message?.includes('Auth session missing')) {
        console.log('🔄 Auth session missing, will retry when user is authenticated');
        this.pendingToken = token;
        return;
      }
      
      console.error('❌ Error checking authentication:', error);
      console.log('🔄 Will retry when user is authenticated');
      // Store the token for later use when user is authenticated
      this.pendingToken = token;
      return;
    }

    console.log('✅ User authenticated:', user.id);
    console.log('📱 Platform:', Capacitor.getPlatform());
    console.log('🔑 Token:', token.substring(0, 20) + '...');

    // Upsert into a user_devices table: id (uuid) | user_id | platform | token | last_seen
    const platform = Capacitor.getPlatform();
    
    try {
      console.log('💾 Saving device token to database...');
      const { data, error } = await supabase
        .from('user_devices')
        .upsert({
          user_id: user.id,
          platform,
          token,
          last_seen: new Date().toISOString()
        }, { onConflict: 'token' });
      
      if (error) {
        console.error('❌ Error saving device token:', error);
        throw error;
      }
      
      console.log('✅ Device token saved successfully:', data);
    } catch (error) {
      console.error('❌ Failed to save device token:', error);
      throw error;
    }
  }

  // Retry saving pending token when user becomes authenticated
  async retryPendingToken() {
    if (this.pendingToken) {
      console.log('🔄 Retrying to save pending device token...');
      const token = this.pendingToken;
      this.pendingToken = null; // Clear pending token
      await this.saveDeviceToken(token);
    }
  }

  // Check if user is authenticated and retry pending token
  async checkAuthAndRetryToken() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && !error) {
        await this.retryPendingToken();
      }
    } catch (error) {
      console.log('🔄 Auth check failed, will retry later');
    }
  }

  // Check if user is currently authenticated
  async isUserAuthenticated() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      return !error && !!session;
    } catch (error) {
      return false;
    }
  }

  // Show local notification
  async showLocalNotification(title, body, data = {}) {
    try {
      console.log('🔔 showLocalNotification called with:', { title, body, data });
      
      // Ensure notification ID fits within Java int range for Android
      const notificationId = Math.floor(Date.now() % 2000000000);
      
      // Schedule with a safe delay to avoid "Scheduled time must be after current time"
      // Use a longer delay to ensure it's always in the future
      const fireAt = new Date(Date.now() + 2000);
      
      console.log('🔔 Scheduling notification:', {
        id: notificationId,
        fireAt: fireAt.toISOString(),
        currentTime: new Date().toISOString()
      });

      const notificationPayload = {
        notifications: [{
          id: notificationId,
          title,
          body,
          data,
          schedule: { at: fireAt, allowWhileIdle: true },
          sound: 'default',
          attachments: undefined,
          actionTypeId: '',
          extra: data
        }]
      };
      
      console.log('🔔 Notification payload:', notificationPayload);

      await LocalNotifications.schedule(notificationPayload);
      console.log('✅ Local notification scheduled successfully');
    } catch (error) {
      console.error('❌ Error showing local notification:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
  }

  // Show browser notification (web fallback)
  async showBrowserNotification(title, body, data = {}) {
    console.log('🔔 showBrowserNotification called:', { title, body, data });
    console.log('🔔 Notification permission:', Notification.permission);
    console.log('🔔 Notification in window:', 'Notification' in window);
    
    if ('Notification' in window && Notification.permission === 'granted') {
      console.log('🔔 Creating browser notification...');
      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data
      });

      console.log('🔔 Browser notification created:', notification);

      notification.onclick = () => {
        console.log('🔔 Notification clicked');
        window.focus();
        this.handleNotificationAction({ notification: { data } });
        notification.close();
      };

      // Auto-close after 5 seconds
      setTimeout(() => {
        console.log('🔔 Auto-closing notification');
        notification.close();
      }, 5000);
    } else {
      console.log('🔔 Cannot show browser notification - permission not granted or not supported');
    }
  }

  // Handle foreground FCM messages
  handleForegroundMessage(payload) {
    console.log('🔔 handleForegroundMessage called with payload:', payload);
    const notification = payload.notification;
    const data = payload.data || {};
    
    console.log('🔔 Notification object:', notification);
    console.log('🔔 Data object:', data);
  
    if (notification) {
      console.log('🔔 Showing browser notification:', notification.title, notification.body);
      // Use browser notification on web
      if (!Capacitor.isNativePlatform()) {
        this.showBrowserNotification(
          notification.title || 'Raf & Rox',
          notification.body || 'You have a new notification',
          data
        );
        return;
      }
  
      // Native: keep LocalNotifications
      this.showLocalNotification(
        notification.title || 'Raf & Rox',
        notification.body || 'You have a new notification',
        data
      );
    } else {
      console.log('🔔 No notification object in payload, showing fallback notification');
      // Fallback notification if no notification object
      if (!Capacitor.isNativePlatform()) {
        this.showBrowserNotification(
          'R&R Booker',
          'You have a new notification',
          data
        );
      }
    }
  }

  // Handle notification actions (tap, click, etc.)
  handleNotificationAction(action) {
    const data = action.notification?.data || action.notification?.extra || {};
    
    // Store notification data for navigation
    if (data.type) {
      sessionStorage.setItem('notificationAction', JSON.stringify({
        type: data.type,
        data: data,
        timestamp: Date.now()
      }));
    }
    
    // Navigate based on notification type
    if (data.type === 'appointment') {
      // Navigate to appointments page
      window.location.href = '/appointments';
    } else if (data.type === 'queue') {
      // Navigate to queue page
      window.location.href = '/queue';
    } else if (data.type === 'booking') {
      // Navigate to booking page
      window.location.href = '/book';
    } else {
      // Default to dashboard
      window.location.href = '/dashboard';
    }
  }

  // Send notification to specific user
  async sendNotificationToUser(userId, title, body, data = {}) {
    try {
      // Ensure data is always an object and all values are strings (FCM requirement)
      const safeData = data && typeof data === 'object' ? data : {};
      
      // Convert all data values to strings for FCM compatibility
      const stringifiedData = {};
      for (const [key, value] of Object.entries(safeData)) {
        stringifiedData[key] = value !== null && value !== undefined ? String(value) : '';
      }
      
      console.log(`🔔 Attempting to send notification to user ${userId}:`, { title, body, data: stringifiedData });
      
      // Test if PushService is properly initialized
      if (!this.initialized) {
        console.log('⚠️ PushService not initialized, initializing now...');
        await this.initialize();
      }
      
      // Try to send via Supabase Edge Function (FCM)
      const requestBody = {
        userId,
        title,
        body,
        data: stringifiedData,
        type: stringifiedData.type || 'general'
      };
      
      console.log('📤 Sending to Edge Function:', JSON.stringify(requestBody, null, 2));
      
      const { data: result, error } = await supabase.functions.invoke('send-notification', {
        body: requestBody
      });

      if (error) {
        console.warn('❌ FCM notification failed, falling back to local notifications:', error);
        
        // Fallback to local notifications
        if (Capacitor.isNativePlatform()) {
          await this.showLocalNotification(title, body, stringifiedData);
        } else {
          await this.showBrowserNotification(title, body, stringifiedData);
        }
        
        // DO NOT create database notification here - it's handled by CentralizedNotificationService
        // This prevents duplicate database notifications
        
        return true; // Return true for fallback success
      }

      // DO NOT create database notification here - it's handled by CentralizedNotificationService
      // This prevents duplicate database notifications

      console.log(`✅ Push notification sent to user ${userId}:`, JSON.stringify(result, null, 2));
      
      // Handle different result formats
      if (result && result.success === false && result.message === 'No devices found for user') {
        console.log('⚠️ No devices found for user - this is expected for users without registered devices');
      } else if (result && result.results && Array.isArray(result.results)) {
        // Analyze the results when devices are found
        const successful = result.results.filter(r => r && r.success).length;
        const failed = result.results.length - successful;
        console.log(`📊 Notification results: ${successful} successful, ${failed} failed`);
        
        // Log failed notifications for debugging
        result.results.forEach((deviceResult, index) => {
          if (deviceResult && !deviceResult.success) {
            const errorMessage = typeof deviceResult.error === 'string' 
              ? deviceResult.error 
              : JSON.stringify(deviceResult.error) || 'Unknown error';
            console.warn(`❌ Device ${index + 1} failed: ${errorMessage}`);
          } else if (deviceResult && deviceResult.success) {
            const messageId = typeof deviceResult.messageId === 'string' 
              ? deviceResult.messageId 
              : JSON.stringify(deviceResult.messageId) || 'No message ID';
            console.log(`✅ Device ${index + 1} succeeded: ${messageId}`);
          }
        });
      } else {
        console.log('📊 Notification result:', JSON.stringify(result, null, 2));
      }
      
      // If no devices found, show local notification as fallback
      if (result && (result.devices === 0 || (result.success === false && result.message === 'No devices found for user'))) {
        console.log('⚠️ No devices found, showing local notification as fallback');
        if (Capacitor.isNativePlatform()) {
          await this.showLocalNotification(title, body, data);
        } else {
          await this.showBrowserNotification(title, body, data);
        }
      }
      
      // If all devices failed, show local notification as fallback
      if (result && result.results && Array.isArray(result.results) && result.results.every(r => r && !r.success)) {
        console.log('⚠️ All devices failed, showing local notification as fallback');
        if (Capacitor.isNativePlatform()) {
          await this.showLocalNotification(title, body, data);
        } else {
          await this.showBrowserNotification(title, body, data);
        }
      }
      
      // Note: Database notification is created by the Edge Function
      // No need to create duplicate here
      
      return true; // Success
      
    } catch (error) {
      console.error('Error sending notification to user:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Fallback to local notification only
      try {
        if (Capacitor.isNativePlatform()) {
          await this.showLocalNotification(title, body, data);
        } else {
          await this.showBrowserNotification(title, body, data);
        }
      } catch (localError) {
        console.error('Failed to show local notification:', localError);
      }
      
      return true; // Return true even for fallback
    }
  }

  // REMOVED: Database notification creation to prevent duplicates
  // Only CentralizedNotificationService should create database notifications

  // Send appointment notification
  async sendAppointmentNotification(userId, appointmentData) {
    // Ensure appointmentData is an object and has required properties
    const safeData = {
      id: appointmentData?.id || 'unknown',
      barber_name: appointmentData?.barber_name || 'Barber',
      status: appointmentData?.status || 'updated'
    };
    
    const title = 'Appointment Update';
    const body = `Your appointment with ${safeData.barber_name} has been ${safeData.status}`;
    
    await this.sendNotificationToUser(userId, title, body, {
      type: 'appointment',
      appointment_id: safeData.id,
      status: safeData.status
    });
  }

  // Send queue notification
  async sendQueueNotification(userId, queueData) {
    const title = 'Queue Update';
    const body = `You are #${queueData.position} in the queue`;
    
    await this.sendNotificationToUser(userId, title, body, {
      type: 'queue',
      appointment_id: queueData.appointment_id,
      position: queueData.position
    });
  }

  // Send specific queue position notifications
  async sendQueuePositionNotification(position, appointmentId = null) {
    let title = '';
    let body = '';
    let data = {
      type: 'queue_position',
      position: position?.toString() || '',
      appointment_id: appointmentId?.toString() || ''
    };

    if (position === 1) {
      title = "You're Next! 🎉";
      body = "You're next in line! Please be ready for your appointment.";
      data.type = 'queue_next';
    } else if (position === 2) {
      title = "Almost Your Turn! ⏰";
      body = "You're #2 in line. Your turn is coming up soon!";
      data.type = 'queue_soon';
    } else if (position === 3) {
      title = "Queue Update 📈";
      body = "Good news! You moved up to position #3 in the queue.";
      data.type = 'queue_update';
    } else {
      title = "Queue Update 📈";
      body = `You moved to position #${position} in the queue.`;
      data.type = 'queue_update';
    }

    console.log('🔔 Sending queue position notification:', { title, body, data });
    
    // Use local notification directly for immediate delivery
    await this.showLocalNotification(title, body, data);
  }

  // Send appointment confirmation notification
  async sendAppointmentConfirmation(appointmentData) {
    let title, body;
    
    // Check if this is a friend booking
    if (appointmentData.friend_name) {
      title = "Friend Appointment Request Submitted! 👥";
      body = `${appointmentData.friend_name}'s appointment request submitted and is pending confirmation. Position #${appointmentData.queue_position || 1} in queue.`;
    } else {
      title = "Appointment Request Submitted! 📝";
      body = `Your appointment request has been submitted and is pending confirmation. You are #${appointmentData.queue_position || 1} in the queue.`;
    }
    
    // Send proper push notification to user
    await this.sendNotificationToUser(appointmentData.customer_id || appointmentData.user_id, title, body, {
      type: 'appointment_pending',
      appointment_id: appointmentData.id?.toString() || '',
      queue_position: appointmentData.queue_position?.toString() || '',
      friend_name: appointmentData.friend_name?.toString() || ''
    });
    
    // Also show local notification as backup
    await this.showLocalNotification(title, body, {
      type: 'appointment_pending',
      appointment_id: appointmentData.id?.toString() || '',
      queue_position: appointmentData.queue_position?.toString() || '',
      friend_name: appointmentData.friend_name?.toString() || ''
    });
  }

  // Send appointment reminder notification
  async sendAppointmentReminder(appointmentData) {
    const title = "Appointment Reminder ⏰";
    const body = `Your appointment is coming up soon. You're #${appointmentData.queue_position || 1} in the queue.`;
    
    await this.showLocalNotification(title, body, {
      type: 'appointment_reminder',
      appointment_id: appointmentData.id,
      queue_position: appointmentData.queue_position
    });
  }

  // Send booking notification
  async sendBookingNotification(userId, bookingData) {
    const title = 'Booking Request';
    const body = `New booking request from ${bookingData.customer_name}`;
    
    await this.sendNotificationToUser(userId, title, body, {
      type: 'booking',
      appointment_id: bookingData.id,
      customer_name: bookingData.customer_name
    });
  }

  // Check if notifications are supported and enabled
  async checkNotificationSupport() {
    const support = {
      push: false,
      local: false,
      web: false,
      permissions: {
        push: 'unknown',
        local: 'unknown',
        web: 'unknown'
      }
    };

    try {
      // Check push notification support
      if (Capacitor.isNativePlatform()) {
        support.push = true;
        try {
          const pushPerms = await PushNotifications.checkPermissions();
          support.permissions.push = pushPerms.receive;
        } catch (e) {
          console.warn('Could not check push permissions:', e);
        }
      }

      // Check local notification support
      try {
        const localPerms = await LocalNotifications.checkPermissions();
        support.local = localPerms.display !== 'denied';
        support.permissions.local = localPerms.display;
      } catch (e) {
        console.warn('Could not check local permissions:', e);
      }

      // Check web notification support
      if ('Notification' in window) {
        support.web = true;
        support.permissions.web = Notification.permission;
      }
    } catch (error) {
      console.error('Error checking notification support:', error);
    }

    return support;
  }

  // Send notification to all users (for announcements)
  async sendNotificationToAllUsers(title, body, data = {}) {
    try {
      console.log('🔔 Sending notification to all users...');
      
      const { data: users, error } = await supabase
        .from('users')
        .select('id, full_name, role');

      if (error) {
        console.error('❌ Error fetching users:', error);
        // Fallback: try to send to current user only
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log('🔄 Fallback: sending to current user only');
          return await this.sendNotificationToUser(user.id, title, body, data);
        }
        return false;
      }

      if (!users || users.length === 0) {
        console.log('⚠️ No users found in database');
        // Fallback: try to send to current user only
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log('🔄 Fallback: sending to current user only');
          return await this.sendNotificationToUser(user.id, title, body, data);
        }
        return false;
      }

      console.log(`📤 Sending notification to ${users.length} users:`, users.map(u => `${u.full_name} (${u.role})`));

      // Send to each user
      const promises = users.map(user => 
        this.sendNotificationToUser(user.id, title, body, data)
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
      const failed = results.length - successful;
      
      console.log(`✅ Notification sent to ${successful} users, ${failed} failed`);
      return successful > 0; // Return true if at least one notification was sent
    } catch (error) {
      console.error('❌ Error sending notification to all users:', error);
      return false;
    }
  }

  // Test notification functionality
  async testNotification() {
    try {
      console.log('🔔 Starting test notification...');
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error('❌ No authenticated user for test notification');
        return false;
      }

      console.log('✅ User authenticated:', user.id);

      const title = 'Test Notification';
      const body = 'This is a test notification from R&R Booker';
      
      // Check platform and permissions first
      const platform = Capacitor.getPlatform();
      console.log('📱 Platform:', platform);
      
      if (Capacitor.isNativePlatform()) {
        // Check local notification permissions
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const localPerms = await LocalNotifications.checkPermissions();
        console.log('🔔 Local notification permissions:', localPerms);
        
        if (localPerms.display === 'granted') {
          console.log('✅ Local notifications granted, showing notification...');
          await this.showLocalNotification(title, body, { type: 'test' });
        } else {
          console.log('❌ Local notifications not granted:', localPerms.display);
          // Request permission
          const requestPerms = await LocalNotifications.requestPermissions();
          console.log('🔔 Requested permissions:', requestPerms);
          
          if (requestPerms.display === 'granted') {
            await this.showLocalNotification(title, body, { type: 'test' });
          } else {
            console.error('❌ Could not get local notification permission');
            return false;
          }
        }
      } else {
        // Web platform
        console.log('🌐 Web platform detected');
        if ('Notification' in window) {
          console.log('🔔 Browser notification permission:', Notification.permission);
          
          if (Notification.permission === 'granted') {
            console.log('✅ Browser notifications granted, showing notification...');
            await this.showBrowserNotification(title, body, { type: 'test' });
          } else if (Notification.permission === 'default') {
            console.log('🔔 Requesting browser notification permission...');
            const permission = await Notification.requestPermission();
            console.log('🔔 Permission result:', permission);
            
            if (permission === 'granted') {
              await this.showBrowserNotification(title, body, { type: 'test' });
            } else {
              console.error('❌ Browser notification permission denied');
              return false;
            }
          } else {
            console.error('❌ Browser notification permission denied');
            return false;
          }
        } else {
          console.error('❌ Browser does not support notifications');
          return false;
        }
      }
      
      // Also send real push notification
      console.log('📤 Sending push notification via Edge Function...');
      await this.sendNotificationToUser(user.id, title, body, { type: 'test' });
      
      console.log('✅ Test notification completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Error testing notification:', error);
      return false;
    }
  }
}

export const PushService = new PushServiceImpl();

// Add test functions to window for easy access
if (typeof window !== 'undefined') {
  // Test basic browser notifications (works without HTTPS)
  window.testWebNotification = async () => {
    try {
      console.log('🔔 Testing browser notification...');
      
      if (!('Notification' in window)) {
        console.error('❌ Browser notifications not supported');
        return false;
      }
      
      console.log('🔔 Current notification permission:', Notification.permission);
      
      if (Notification.permission === 'granted') {
        const notification = new Notification('Test Browser Notification 🔔', {
          body: 'This is a test browser notification. If you can see this, browser notifications are working!',
          icon: '/favicon.ico',
          tag: 'web-test-notification'
        });
        
        notification.onclick = () => {
          console.log('✅ Notification clicked!');
          notification.close();
        };
        
        console.log('✅ Browser notification created and should be visible');
        return true;
      } else if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        console.log('🔔 Permission requested, result:', permission);
        
        if (permission === 'granted') {
          return await window.testWebNotification(); // Retry
        } else {
          console.error('❌ Notification permission denied');
          return false;
        }
      } else {
        console.error('❌ Notification permission denied');
        return false;
      }
    } catch (error) {
      console.error('❌ Error testing browser notification:', error);
      return false;
    }
  };

  // Test push notifications (requires HTTPS and proper setup)
  window.testPushNotification = async () => {
    try {
      console.log('🔔 Testing push notification...');
      return await PushService.testNotification();
    } catch (error) {
      console.error('❌ Error testing push notification:', error);
      return false;
    }
  };

  // Request notification permission
  window.requestNotificationPermission = async () => {
    try {
      if (!('Notification' in window)) {
        console.error('❌ Browser notifications not supported');
        return false;
      }
      
      const permission = await Notification.requestPermission();
      console.log('🔔 Permission result:', permission);
      return permission === 'granted';
    } catch (error) {
      console.error('❌ Error requesting permission:', error);
      return false;
    }
  };

  // Check device token status
  window.checkDeviceTokenStatus = async () => {
    try {
      console.log('🔍 Checking device token status...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ No authenticated user');
        return { error: 'No authenticated user' };
      }
      
      // Check user devices in database
      const { data: devices, error } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', user.id);
      
      if (error) {
        console.error('❌ Error fetching devices:', error);
        return { error: error.message };
      }
      
      console.log('📱 Registered devices:', devices?.length || 0);
      devices?.forEach((device, index) => {
        console.log(`📱 Device ${index + 1}:`, {
          platform: device.platform,
          token: device.token?.substring(0, 20) + '...',
          lastSeen: device.last_seen,
          isActive: new Date(device.last_seen) > new Date(Date.now() - 24 * 60 * 60 * 1000) // Active in last 24 hours
        });
      });
      
      return {
        user: user.id,
        deviceCount: devices?.length || 0,
        devices: devices || [],
        hasActiveDevices: devices?.some(d => new Date(d.last_seen) > new Date(Date.now() - 24 * 60 * 60 * 1000)) || false
      };
      
    } catch (error) {
      console.error('❌ Error checking device status:', error);
      return { error: error.message };
    }
  };

  // Test Firebase configuration
  window.testFirebaseConfig = async () => {
    try {
      console.log('🔥 Testing Firebase configuration...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ No authenticated user');
        return { error: 'No authenticated user' };
      }
      
      // Test the Edge Function with a simple notification
      const { data: result, error } = await supabase.functions.invoke('send-notification', {
        body: {
          userId: user.id,
          title: 'Firebase Config Test 🔥',
          body: 'Testing Firebase Service Account configuration',
          data: { type: 'test', timestamp: new Date().toISOString() },
          type: 'test'
        }
      });

      if (error) {
        console.error('❌ Firebase config test failed:', error);
        return { 
          success: false, 
          error: error.message,
          details: 'Check if GOOGLE_SERVICE_ACCOUNT and FIREBASE_PROJECT_ID are set in Supabase Edge Functions'
        };
      }

      console.log('✅ Firebase config test successful:', result);
      return {
        success: true,
        result: result,
        message: 'Firebase Service Account is properly configured!'
      };
      
    } catch (error) {
      console.error('❌ Error testing Firebase config:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  };

  // Test mobile push notifications
  window.testMobilePushNotification = async () => {
    try {
      console.log('📱 Testing mobile push notification...');
      
      // Check if we're on a mobile platform
      const platform = Capacitor.getPlatform();
      console.log('📱 Current platform:', platform);
      
      if (platform === 'web') {
        console.log('⚠️ This is a web platform, not mobile');
        return false;
      }
      
      // Check if PushService is initialized
      if (!PushService.initialized) {
        console.log('⚠️ PushService not initialized, initializing now...');
        await PushService.initialize();
      }
      
      // Check if we have a device token
      if (!PushService.deviceToken) {
        console.log('⚠️ No device token found, trying to get one...');
        await PushNotifications.register();
        // Wait a bit for token registration
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      if (!PushService.deviceToken) {
        console.error('❌ Still no device token after registration attempt');
        return false;
      }
      
      console.log('✅ Device token found:', PushService.deviceToken.substring(0, 20) + '...');
      
      // Test local notification first
      await PushService.showLocalNotification(
        'Test Mobile Notification 📱',
        'This is a test mobile notification. If you can see this, mobile notifications are working!',
        { type: 'test_mobile' }
      );
      
      console.log('✅ Mobile notification test completed');
      return true;
      
    } catch (error) {
      console.error('❌ Error testing mobile push notification:', error);
      return false;
    }
  };

  // Check mobile push notification status
  window.checkMobilePushStatus = async () => {
    try {
      console.log('📱 Checking mobile push notification status...');
      
      const platform = Capacitor.getPlatform();
      console.log('📱 Platform:', platform);
      
      if (platform === 'web') {
        console.log('⚠️ This is a web platform, not mobile');
        return {
          platform: 'web',
          isMobile: false,
          message: 'This is a web platform, not mobile'
        };
      }
      
      // Check initialization
      console.log('🔧 PushService initialized:', PushService.initialized);
      
      // Check device token
      console.log('🔑 Device token available:', !!PushService.deviceToken);
      if (PushService.deviceToken) {
        console.log('🔑 Token preview:', PushService.deviceToken.substring(0, 20) + '...');
      }
      
      // Check permissions
      const permissions = await PushNotifications.checkPermissions();
      console.log('🔔 Push permissions:', permissions);
      
      return {
        platform,
        isMobile: true,
        initialized: PushService.initialized,
        hasToken: !!PushService.deviceToken,
        permissions,
        tokenPreview: PushService.deviceToken ? PushService.deviceToken.substring(0, 20) + '...' : null
      };
      
    } catch (error) {
      console.error('❌ Error checking mobile push status:', error);
      return {
        error: error.message
      };
    }
  };
}











