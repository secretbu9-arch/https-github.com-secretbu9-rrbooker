import { supabase } from '../supabaseClient';

/**
 * Centralized Notification Service
 * This service is the ONLY place where notifications should be created
 * It prevents ALL duplicates by design
 */
class CentralizedNotificationService {
  constructor() {
    this.isCreating = new Set(); // Track ongoing notification creation
  }

  /**
   * Create appointment status notification (ONLY function to use)
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>} Created notification
   */
  async createAppointmentStatusNotification({
    userId,
    appointmentId,
    status,
    changedBy = 'system'
  }) {
    // Create unique key to prevent concurrent duplicates
    const notificationKey = `${userId}-${appointmentId}-${status}-${Date.now()}`;
    
    if (this.isCreating.has(notificationKey)) {
      console.log(`🔄 Notification already being created for ${notificationKey}`);
      return null;
    }

    this.isCreating.add(notificationKey);

    try {
      // Check for existing notification in last 24 hours
      const { data: existingNotifications, error: checkError } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('data->>appointment_id', appointmentId)
        .eq('data->>status', status)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (checkError) throw checkError;

      if (existingNotifications && existingNotifications.length > 0) {
        console.log(`🔄 Duplicate notification prevented for appointment ${appointmentId} status ${status}`);
        
        // Still send push notification even if database notification is duplicate
        try {
          const { PushService } = await import('./PushService');
          // Determine notification content for push notification
          let title, message;
          switch (status) {
            case 'confirmed':
              title = 'Appointment Confirmed ✅';
              message = 'Your appointment has been confirmed.';
              break;
            case 'ongoing':
              title = 'Your appointment has started! ✂️';
              message = 'Your barber is ready for you now.';
              break;
            case 'done':
              title = 'Appointment Completed ✅';
              message = 'Thank you for visiting us! Please rate your experience.';
              break;
            case 'cancelled':
              title = 'Appointment Cancelled ❌';
              message = 'Your appointment has been cancelled.';
              break;
            default:
              title = 'Appointment ' + status.charAt(0).toUpperCase() + status.slice(1);
              message = `Your appointment status has been updated to ${status}`;
          }
          
          await PushService.sendNotificationToUser(userId, title, message, {
            type: 'appointment',
            appointment_id: appointmentId,
            status,
            changed_by: changedBy
          });
          console.log(`✅ Push notification sent for duplicate prevention: ${title} for user ${userId}`);
        } catch (pushError) {
          console.warn('⚠️ Push notification failed for duplicate prevention:', pushError);
        }
        
        return existingNotifications[0];
      }

      // Determine notification content
      let title, message, priority;
      
      switch (status) {
        case 'confirmed':
          title = 'Appointment Confirmed ✅';
          message = 'Your appointment has been confirmed.';
          priority = 'high';
          break;
        case 'ongoing':
          title = 'Your appointment has started! ✂️';
          message = 'Your barber is ready for you now.';
          priority = 'high';
          break;
        case 'done':
          title = 'Appointment Completed ✅';
          message = 'Thank you for visiting us! Please rate your experience.';
          priority = 'normal';
          break;
        case 'cancelled':
          title = 'Appointment Cancelled ❌';
          message = 'Your appointment has been cancelled.';
          priority = 'high';
          break;
        default:
          title = `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`;
          message = `Your appointment status has been updated to ${status}`;
          priority = 'normal';
      }

      // Create notification
      const notificationData = {
        user_id: userId,
        title,
        message,
        type: 'appointment',
        data: {
          category: 'status_update',
          priority,
          channels: ['app', 'push'],
          appointment_id: appointmentId,
          status,
          changed_by: changedBy
        },
        read: false,
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: notification, error } = await supabase
        .from('notifications')
        .insert(notificationData)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Notification created: ${title} for user ${userId}`);
      
      // Also send push notification
        try {
          const { PushService } = await import('./PushService');
          await PushService.sendNotificationToUser(userId, title, message, {
            type: 'appointment',
            appointment_id: appointmentId,
            status,
            changed_by: changedBy
          });
          console.log(`✅ Push notification sent: ${title} for user ${userId}`);
        } catch (pushError) {
          console.warn('⚠️ Push notification failed:', pushError);
          // Don't throw - database notification was created successfully
        }
      
      return notification;

    } catch (error) {
      console.error('❌ Error creating appointment status notification:', error);
      throw error;
    } finally {
      this.isCreating.delete(notificationKey);
    }
  }

  /**
   * Create booking confirmation notification
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>} Created notification
   */
  async createBookingConfirmationNotification({
    userId,
    appointmentId,
    queuePosition,
    estimatedTime,
    appointmentType = 'queue',
    appointmentTime = null
  }) {
    const notificationKey = `${userId}-booking-${appointmentId}-${Date.now()}`;
    
    if (this.isCreating.has(notificationKey)) {
      console.log(`🔄 Booking notification already being created for ${notificationKey}`);
      return null;
    }

    this.isCreating.add(notificationKey);

    try {
      // Check for existing booking notification
      const { data: existingNotifications, error: checkError } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('data->>appointment_id', appointmentId)
        .eq('data->>category', 'booking')
        .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (checkError) throw checkError;

      if (existingNotifications && existingNotifications.length > 0) {
        console.log(`🔄 Duplicate booking notification prevented for appointment ${appointmentId}`);
        
        // Still send push notification even if database notification is duplicate
        try {
          const { PushService } = await import('./PushService');
          const title = appointmentType === 'scheduled' ? 'Appointment Scheduled! 📅' : 'Booking Confirmed! 🎉';
          const message = appointmentType === 'scheduled' 
            ? `Your appointment has been scheduled for ${appointmentTime || 'the selected time'}.`
            : `Your appointment has been confirmed. You are #${queuePosition} in the queue.`;
          
          await PushService.sendNotificationToUser(userId, title, message, {
            type: 'appointment_confirmed',
            appointment_id: appointmentId,
            queue_position: queuePosition,
            estimated_time: estimatedTime,
            appointment_type: appointmentType,
            appointment_time: appointmentTime
          });
          console.log(`✅ Push notification sent for duplicate prevention: ${title} for user ${userId}`);
        } catch (pushError) {
          console.warn('⚠️ Push notification failed for duplicate prevention:', pushError);
        }
        
        return existingNotifications[0];
      }

      // Determine notification content based on appointment type
      const title = appointmentType === 'scheduled' ? 'Appointment Scheduled! 📅' : 'Booking Confirmed! 🎉';
      const message = appointmentType === 'scheduled' 
        ? `Your appointment has been scheduled for ${appointmentTime || 'the selected time'}.`
        : `Your appointment has been confirmed. You are #${queuePosition} in the queue.`;

      const notificationData = {
        user_id: userId,
        title,
        message,
        type: 'appointment',
        data: {
          category: 'booking',
          priority: 'high',
          channels: ['app', 'push'],
          appointment_id: appointmentId,
          queue_position: queuePosition,
          estimated_time: estimatedTime,
          appointment_type: appointmentType,
          appointment_time: appointmentTime
        },
        read: false,
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: notification, error } = await supabase
        .from('notifications')
        .insert(notificationData)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Booking notification created for user ${userId}`);
      
      // Also send push notification
        try {
          const { PushService } = await import('./PushService');
          await PushService.sendNotificationToUser(userId, title, message, {
            type: 'appointment_confirmed',
            appointment_id: appointmentId?.toString() || '',
            queue_position: queuePosition?.toString() || '',
            estimated_time: estimatedTime?.toString() || '',
            appointment_type: appointmentType,
            appointment_time: appointmentTime
          });
          console.log(`✅ Push notification sent for booking confirmation to user ${userId}`);
        } catch (pushError) {
          console.warn('⚠️ Push notification failed for booking confirmation:', pushError);
          // Don't throw - database notification was created successfully
        }
      
      return notification;

    } catch (error) {
      console.error('❌ Error creating booking notification:', error);
      throw error;
    } finally {
      this.isCreating.delete(notificationKey);
    }
  }

  /**
   * Create general notification (for orders, etc.)
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>} Created notification
   */
  async createNotification({
    userId,
    title,
    message,
    type = 'system',
    category = 'status_update',
    priority = 'normal',
    channels = ['app'],
    data = {},
    appointmentId = null,
    orderId = null,
    queueEntryId = null
  }) {
    const notificationKey = `${userId}-${type}-${title}-${Date.now()}`;
    
    if (this.isCreating.has(notificationKey)) {
      console.log(`🔄 Notification already being created for ${notificationKey}`);
      return null;
    }

    this.isCreating.add(notificationKey);

    try {
      // Check for existing notification
      let existingNotifications;
      if (type === 'order' && orderId) {
        // For order notifications, check by order_id AND title to prevent duplicates for the same order status
        const { data, error: checkError } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', type)
          .eq('title', title)
          .eq('data->>order_id', orderId)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);
        existingNotifications = data;
        if (checkError) throw checkError;
      } else {
        // For other notifications, check by title and type
        const { data, error: checkError } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('title', title)
          .eq('type', type)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);
        existingNotifications = data;
        if (checkError) throw checkError;
      }

      if (existingNotifications && existingNotifications.length > 0) {
        console.log(`🔄 Duplicate notification prevented for user ${userId} with title "${title}"`);
        
        // Still send push notification even if database notification is duplicate
        if (channels.includes('push')) {
          try {
            const { PushService } = await import('./PushService');
            await PushService.sendNotificationToUser(userId, title, message, {
              type,
              ...data,
              appointment_id: appointmentId,
              order_id: orderId,
              queue_entry_id: queueEntryId
            });
            console.log(`✅ Push notification sent for duplicate prevention: ${title} for user ${userId}`);
          } catch (pushError) {
            console.warn('⚠️ Push notification failed for duplicate prevention:', pushError);
          }
        }
        
        return existingNotifications[0];
      }

      const notificationData = {
        user_id: userId,
        title,
        message,
        type,
        data: {
          ...data,
          category,
          priority,
          channels,
          appointment_id: appointmentId,
          order_id: orderId,
          queue_entry_id: queueEntryId
        },
        read: false,
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: notification, error } = await supabase
        .from('notifications')
        .insert(notificationData)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Notification created: ${title} for user ${userId}`);
      
      // Also send push notification if channels include 'push'
      if (channels.includes('push')) {
        try {
          const { PushService } = await import('./PushService');
          await PushService.sendNotificationToUser(userId, title, message, {
            type,
            ...data,
            appointment_id: appointmentId,
            order_id: orderId,
            queue_entry_id: queueEntryId
          });
          console.log(`✅ Push notification sent: ${title} for user ${userId}`);
        } catch (pushError) {
          console.warn('⚠️ Push notification failed:', pushError);
          // Don't throw - database notification was created successfully
        }
      }
      
      return notification;

    } catch (error) {
      console.error('❌ Error creating notification:', error);
      throw error;
    } finally {
      this.isCreating.delete(notificationKey);
    }
  }

  /**
   * Create queue position update notification
   * @param {Object} params - Notification parameters
   * @returns {Promise<Object>} Created notification
   */
  async createQueuePositionNotification({
    userId,
    appointmentId,
    queuePosition,
    oldPosition = null,
    reason = null
  }) {
    const notificationKey = `${userId}-queue-${appointmentId}-${Date.now()}`;
    
    if (this.isCreating.has(notificationKey)) {
      console.log(`🔄 Queue notification already being created for ${notificationKey}`);
      return null;
    }

    this.isCreating.add(notificationKey);

    try {
      // Check for existing queue notification
      const { data: existingNotifications, error: checkError } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('data->>appointment_id', appointmentId)
        .eq('data->>category', 'position_update')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .limit(1);

      if (checkError) throw checkError;

      if (existingNotifications && existingNotifications.length > 0) {
        console.log(`🔄 Duplicate queue notification prevented for appointment ${appointmentId}`);
        
        // Still send push notification even if database notification is duplicate
        try {
          const { PushService } = await import('./PushService');
          const message = oldPosition
            ? `Your queue position changed from #${oldPosition} to #${queuePosition}${reason ? ` - ${reason}` : ''}`
            : `You are now at position #${queuePosition} in the queue`;
            
          await PushService.sendNotificationToUser(userId, '📍 Queue Position Update', message, {
            type: 'queue',
            appointment_id: appointmentId,
            queue_position: queuePosition,
            old_position: oldPosition,
            reason
          });
          console.log(`✅ Push notification sent for duplicate prevention: 📍 Queue Position Update for user ${userId}`);
        } catch (pushError) {
          console.warn('⚠️ Push notification failed for duplicate prevention:', pushError);
        }
        
        return existingNotifications[0];
      }

      const message = oldPosition
        ? `Your queue position changed from #${oldPosition} to #${queuePosition}${reason ? ` - ${reason}` : ''}`
        : `You are now at position #${queuePosition} in the queue`;

      const notificationData = {
        user_id: userId,
        title: '📍 Queue Position Update',
        message,
        type: 'queue',
        data: {
          category: 'position_update',
          priority: 'normal',
          channels: ['app', 'push'],
          appointment_id: appointmentId,
          queue_position: queuePosition,
          old_position: oldPosition,
          reason
        },
        read: false,
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: notification, error } = await supabase
        .from('notifications')
        .insert(notificationData)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Queue notification created for user ${userId}`);
      
      // Also send push notification
        try {
          const { PushService } = await import('./PushService');
          await PushService.sendNotificationToUser(userId, '📍 Queue Position Update', message, {
            type: 'queue',
            appointment_id: appointmentId,
            queue_position: queuePosition,
            old_position: oldPosition,
            reason
          });
          console.log(`✅ Push notification sent for queue position update to user ${userId}`);
        } catch (pushError) {
          console.warn('⚠️ Push notification failed for queue position update:', pushError);
          // Don't throw - database notification was created successfully
        }
      
      return notification;

    } catch (error) {
      console.error('❌ Error creating queue notification:', error);
      throw error;
    } finally {
      this.isCreating.delete(notificationKey);
    }
  }
}

// Export singleton instance
export default new CentralizedNotificationService();
