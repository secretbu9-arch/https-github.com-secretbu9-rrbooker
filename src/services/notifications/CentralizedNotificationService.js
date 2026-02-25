import { supabase } from '../../supabaseClient';

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
  async createNewBookingNotification({
    barberId,
    customerName,
    serviceName,
    appointmentId,
    appointmentType = 'queue',
    appointmentTime = null
  }) {
    const notificationKey = `new-booking-${appointmentId}`;

    if (this.isCreating.has(notificationKey)) {
      console.log(`🔄 New booking notification already being created for ${appointmentId}`);
      return null;
    }

    this.isCreating.add(notificationKey);

    try {
      const title = 'New Booking Request 📅';
      const message = appointmentType === 'scheduled'
        ? `${customerName} scheduled a ${serviceName} for ${appointmentTime}.`
        : `${customerName} joined the queue for a ${serviceName}.`;

      console.log(`📣 Notifying barber ${barberId} and managers of new booking ${appointmentId}`);

      // 1. Notify the specific barber
      await this.createNotification({
        userId: barberId,
        title,
        message,
        type: 'booking',
        category: 'new_booking',
        priority: 'high',
        channels: ['app', 'push'],
        appointmentId,
        data: {
          customer_name: customerName,
          service_name: serviceName,
          appointment_type: appointmentType
        }
      });

      // 2. Notify all managers
      try {
        const { data: managers, error: managersError } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'manager');

        if (!managersError && managers) {
          for (const manager of managers) {
            // Avoid duplicate notification if the manager IS the barber
            if (manager.id !== barberId) {
              await this.createNotification({
                userId: manager.id,
                title,
                message,
                type: 'booking',
                category: 'new_booking',
                priority: 'high',
                channels: ['app', 'push'],
                appointmentId,
                data: {
                  customer_name: customerName,
                  service_name: serviceName,
                  appointment_type: appointmentType
                }
              });
            }
          }
        }
      } catch (managerNotifError) {
        console.warn('⚠️ Failed to notify managers of new booking:', managerNotifError);
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Error in createNewBookingNotification:', error);
      throw error;
    } finally {
      this.isCreating.delete(notificationKey);
    }
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
    // Create unique key to prevent concurrent duplicates (without timestamp to catch true duplicates)
    const notificationKey = `${userId}-${appointmentId}-${status}`;

    if (this.isCreating.has(notificationKey)) {
      console.log(`🔄 Notification already being created for ${notificationKey}`);
      return null;
    }

    this.isCreating.add(notificationKey);

    try {
      // Fetch appointment details for better messaging
      const { data: appointment, error: fetchError } = await supabase
        .from('appointments')
        .select(`
          *,
          barber:barber_id(full_name),
          customer:customer_id(full_name),
          service:service_id(name)
        `)
        .eq('id', appointmentId)
        .single();

      const barberName = appointment?.barber?.full_name || 'your barber';
      const customerName = appointment?.customer?.full_name || 'a customer';
      const serviceName = appointment?.service?.name || 'service';
      const appointmentDate = appointment?.appointment_date || '';

      const isBarber = userId === appointment?.barber_id;

      // Determine notification content
      let title, message, priority;

      switch (status) {
        case 'confirmed':
          title = 'Appointment Confirmed ✅';
          message = isBarber
            ? `Appointment for ${customerName} (${serviceName}) has been confirmed.`
            : `Your ${serviceName} with ${barberName} has been confirmed. See you there!`;
          priority = 'high';
          break;
        case 'ongoing':
          title = isBarber ? 'Service Started ✂️' : 'It\'s your turn! ✂️';
          message = isBarber
            ? `Now serving ${customerName} for ${serviceName}.`
            : `${barberName} is ready for you now. Please head over to the chair.`;
          priority = 'high';
          break;
        case 'completed':
          title = 'Appointment Completed ✅';
          message = isBarber
            ? `Service for ${customerName} has been marked as completed.`
            : `Thank you for choosing R&R Booker! We hope you enjoyed your ${serviceName}.`;
          priority = 'normal';
          break;
        case 'cancelled':
          title = 'Appointment Cancelled ❌';
          message = isBarber
            ? `Appointment for ${customerName} has been cancelled.`
            : `Your appointment for ${serviceName} has been cancelled. Please contact us for details.`;
          priority = 'high';
          break;
        default:
          title = `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`;
          message = isBarber
            ? `Appointment for ${customerName} updated to ${status}.`
            : `Your ${serviceName} appointment status has been updated to ${status}.`;
          priority = 'normal';
      }

      // Check for existing notification in last 24 hours
      const { data: existingNotifications, error: checkError } = await supabase
        .from('notifications')
        .select('id, created_at')
        .eq('user_id', userId)
        .eq('data->>appointment_id', appointmentId)
        .eq('data->>status', status)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (checkError) throw checkError;

      if (existingNotifications && existingNotifications.length > 0) {
        const lastNotif = existingNotifications[0];
        const lastSentAt = new Date(lastNotif.created_at || lastNotif.timestamp || 0).getTime();
        const secondsSinceLast = (Date.now() - lastSentAt) / 1000;

        console.log(`🔄 Duplicate notification prevented for appointment ${appointmentId} status ${status}. Last one was ${Math.round(secondsSinceLast)}s ago.`);

        // Only send push if at least 30 seconds have passed since the last one
        // This prevents "double buzz" from rapid duplicate events
        if (secondsSinceLast > 30) {
          try {
            const { PushService } = await import('./PushService');
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
        } else {
          console.log(`🚫 Skipping duplicate push notification: too recent (${Math.round(secondsSinceLast)}s ago)`);
        }

        return lastNotif;
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
    // Create key without timestamp to catch true duplicates
    const notificationKey = `${userId}-booking-${appointmentId}`;

    if (this.isCreating.has(notificationKey)) {
      console.log(`🔄 Booking notification already being created for ${notificationKey}`);
      return null;
    }

    this.isCreating.add(notificationKey);

    try {
      // Fetch barber name if not provided
      const { data: appointment } = await supabase
        .from('appointments')
        .select('*, barber:barber_id(full_name)')
        .eq('id', appointmentId)
        .single();

      const barberName = appointment?.barber?.full_name || 'your barber';

      // Safeguard: Verify appointment status before sending confirmation
      const { data: apptStatus, error: statusError } = await supabase
        .from('appointments')
        .select('status')
        .eq('id', appointmentId)
        .single();

      if (statusError) {
        console.warn(`⚠️ Could not verify status for appointment ${appointmentId}:`, statusError);
      } else if (apptStatus?.status === 'pending') {
        console.log(`🚫 Preventing confirmation notification for PENDING appointment ${appointmentId}`);
        this.isCreating.delete(notificationKey);
        return null;
      }

      // Check for existing booking notification
      const { data: existingNotifications, error: checkError } = await supabase
        .from('notifications')
        .select('id, created_at')
        .eq('user_id', userId)
        .eq('data->>appointment_id', appointmentId)
        .eq('data->>category', 'booking')
        .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (checkError) throw checkError;

      // Determine notification content based on appointment type
      const title = appointmentType === 'scheduled' ? 'Appointment Scheduled! 📅' : 'Booking Confirmed! 🎉';
      const message = appointmentType === 'scheduled'
        ? `Great news! Your appointment with ${barberName} is set for ${appointmentTime || 'the selected time'}.`
        : `You're in the queue! Your appointment with ${barberName} is confirmed. You are #${queuePosition} in line.`;

      if (existingNotifications && existingNotifications.length > 0) {
        const lastNotif = existingNotifications[0];
        const lastSentAt = new Date(lastNotif.created_at || 0).getTime();
        const secondsSinceLast = (Date.now() - lastSentAt) / 1000;

        console.log(`🔄 Duplicate booking notification prevented for appointment ${appointmentId}. Last one was ${Math.round(secondsSinceLast)}s ago.`);

        // Only send push if at least 30 seconds have passed since the last one
        if (secondsSinceLast > 30) {
          try {
            const { PushService } = await import('./PushService');
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
        } else {
          console.log(`🚫 Skipping duplicate booking push: too recent (${Math.round(secondsSinceLast)}s ago)`);
        }

        return lastNotif;
      }

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
    // Create unique key without timestamp to catch true duplicates
    // Include appointmentId/orderId/queueEntryId in key for better duplicate detection
    // For reschedule requests, also include request_id if available
    const keyParts = [userId, type, title];
    if (appointmentId) keyParts.push(`appt-${appointmentId}`);
    if (orderId) keyParts.push(`order-${orderId}`);
    if (queueEntryId) keyParts.push(`queue-${queueEntryId}`);
    if (data?.request_id) keyParts.push(`req-${data.request_id}`);
    const notificationKey = keyParts.join('-');

    // Check in-memory first to prevent rapid duplicates
    if (this.isCreating.has(notificationKey)) {
      console.log(`🔄 Notification already being created for ${notificationKey} - preventing duplicate`);
      return null;
    }

    // For reschedule requests, check database FIRST for very recent duplicates (within 10 seconds)
    // This catches rapid-fire duplicates that might slip through the in-memory check
    // Check for ANY notification with same user, type, title, and appointment_id (ignore request_id)
    const isRescheduleRequest = type === 'appointment_reschedule_request' ||
      type === 'appointment_reschedule_confirmed' ||
      type === 'appointment_reschedule_declined' ||
      data?.action_type === 'reschedule' ||
      title.includes('Reschedule Request');

    if (isRescheduleRequest && appointmentId) {
      try {
        // Check for ANY duplicate within last 10 seconds - very aggressive check
        const { data: recentNotifications, error: recentError } = await supabase
          .from('notifications')
          .select('id, created_at')
          .eq('user_id', userId)
          .eq('type', type)
          .eq('title', title)
          .eq('data->>appointment_id', appointmentId)
          .gte('created_at', new Date(Date.now() - 10000).toISOString()) // Last 10 seconds
          .order('created_at', { ascending: false })
          .limit(1);

        if (!recentError && recentNotifications && recentNotifications.length > 0) {
          const age = Date.now() - new Date(recentNotifications[0].created_at).getTime();
          console.log(`🔄 Very recent duplicate reschedule notification found (${Math.round(age / 1000)}s ago) - preventing duplicate`);
          return recentNotifications[0];
        }
      } catch (recentCheckError) {
        console.warn('Error checking for recent duplicates:', recentCheckError);
        // Continue with normal flow if this check fails
      }
    }

    // Add to in-memory set to prevent concurrent duplicates
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
      } else if (appointmentId) {
        // For appointment-related notifications, check by appointmentId AND title to prevent duplicates
        // For reschedule requests, use a shorter time window and also check by request_id if available
        const isRescheduleRequest = type === 'appointment_reschedule_request' ||
          type === 'appointment_reschedule_confirmed' ||
          type === 'appointment_reschedule_declined' ||
          data?.action_type === 'reschedule' ||
          title.includes('Reschedule Request');

        // Use shorter time window for reschedule requests (5 minutes) to catch rapid duplicates
        const timeWindow = isRescheduleRequest ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;

        // For reschedule requests, check for ANY notification with same user, type, title, and appointment_id
        // within the time window, regardless of request_id (to catch duplicates even if request_id differs)
        let query = supabase
          .from('notifications')
          .select('id, created_at')
          .eq('user_id', userId)
          .eq('type', type)
          .eq('title', title)
          .eq('data->>appointment_id', appointmentId)
          .gte('created_at', new Date(Date.now() - timeWindow).toISOString());

        // For reschedule requests, be extra strict - check by appointment_id + title + type only
        // This catches duplicates even if request_id is different (shouldn't happen, but safety)
        if (isRescheduleRequest) {
          // Don't filter by request_id for the initial check - just check for any duplicate
          // This ensures we catch duplicates even in race conditions
          console.log(`🔍 Checking for duplicate reschedule notification: user=${userId}, type=${type}, title="${title}", appointment=${appointmentId}`);
        } else if (data?.request_id) {
          // For non-reschedule, still check by request_id if available
          query = query.eq('data->>request_id', data.request_id.toString());
        }

        const { data: notificationData, error: checkError } = await query.limit(1);
        existingNotifications = notificationData;
        if (checkError) {
          console.error('Error checking for duplicate notification:', checkError);
          throw checkError;
        }

        if (existingNotifications && existingNotifications.length > 0) {
          console.log(`🔄 Duplicate notification found in database check - preventing duplicate (found ${existingNotifications.length} existing)`);
        }
      } else if (queueEntryId) {
        // For queue-related notifications, check by queueEntryId AND title
        const { data, error: checkError } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('type', type)
          .eq('title', title)
          .eq('data->>queue_entry_id', queueEntryId)
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
        const lastNotif = existingNotifications[0];
        const lastSentAt = new Date(lastNotif.created_at || 0).getTime();
        const secondsSinceLast = (Date.now() - lastSentAt) / 1000;

        console.log(`🔄 Duplicate notification prevented for user ${userId} with title "${title}". Last one was ${Math.round(secondsSinceLast)}s ago.`);

        // Still send push notification even if database notification is duplicate, 
        // but ONLY if at least 30 seconds have passed.
        if (channels.includes('push') && secondsSinceLast > 30) {
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
        } else if (channels.includes('push')) {
          console.log(`🚫 Skipping duplicate push for "${title}": too recent (${Math.round(secondsSinceLast)}s ago)`);
        }

        return lastNotif;
      }

      // Final duplicate check right before inserting (catches race conditions)
      // For reschedule requests, be extra aggressive - check within last 10 seconds
      if (isRescheduleRequest && appointmentId) {
        const { data: finalCheck, error: finalCheckError } = await supabase
          .from('notifications')
          .select('id, created_at')
          .eq('user_id', userId)
          .eq('type', type)
          .eq('title', title)
          .eq('data->>appointment_id', appointmentId)
          .gte('created_at', new Date(Date.now() - 10000).toISOString()) // Last 10 seconds
          .order('created_at', { ascending: false })
          .limit(1);

        if (!finalCheckError && finalCheck && finalCheck.length > 0) {
          const age = Date.now() - new Date(finalCheck[0].created_at).getTime();
          console.log(`🔄 Final duplicate check found existing notification (${Math.round(age / 1000)}s ago) - preventing duplicate`);
          this.isCreating.delete(notificationKey);
          return finalCheck[0];
        }
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

      // For reschedule requests, do one final check right before insert to catch any last-millisecond duplicates
      if (isRescheduleRequest && appointmentId && data?.request_id) {
        const { data: lastSecondCheck, error: lastCheckError } = await supabase
          .from('notifications')
          .select('id, created_at')
          .eq('user_id', userId)
          .eq('type', type)
          .eq('title', title)
          .eq('data->>appointment_id', appointmentId)
          .eq('data->>request_id', data.request_id.toString())
          .gte('created_at', new Date(Date.now() - 5000).toISOString()) // Last 5 seconds
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastCheckError && lastSecondCheck) {
          const age = Date.now() - new Date(lastSecondCheck.created_at).getTime();
          console.log(`🔄 Last-second duplicate check found notification (${Math.round(age / 1000)}s ago) - preventing duplicate`);
          this.isCreating.delete(notificationKey);
          return lastSecondCheck;
        }
      }

      const { data: notification, error } = await supabase
        .from('notifications')
        .insert(notificationData)
        .select()
        .single();

      if (error) {
        // If it's a unique constraint violation, it means a duplicate was created
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
          console.log(`🔄 Database constraint prevented duplicate notification`);
          // Try to get the existing notification
          const { data: existing } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .eq('type', type)
            .eq('title', title)
            .eq('data->>appointment_id', appointmentId);

          // For reschedule requests, also filter by request_id if available
          let existingQuery = supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .eq('type', type)
            .eq('title', title)
            .eq('data->>appointment_id', appointmentId);

          if (isRescheduleRequest && data?.request_id) {
            existingQuery = existingQuery.eq('data->>request_id', data.request_id.toString());
          }

          const { data: existingNotif } = await existingQuery
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingNotif) {
            this.isCreating.delete(notificationKey);
            return existingNotif;
          }
        }
        throw error;
      }

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
    // Create key without timestamp to catch true duplicates
    const notificationKey = `${userId}-queue-${appointmentId}`;

    if (this.isCreating.has(notificationKey)) {
      console.log(`🔄 Queue notification already being created for ${notificationKey}`);
      return null;
    }

    this.isCreating.add(notificationKey);

    try {
      // Fetch appointment details for better messaging
      const { data: appointment } = await supabase
        .from('appointments')
        .select('*, barber:barber_id(full_name)')
        .eq('id', appointmentId)
        .single();

      const barberName = appointment?.barber?.full_name || 'your barber';

      // Check for existing queue notification
      const { data: existingNotifications, error: checkError } = await supabase
        .from('notifications')
        .select('id, created_at')
        .eq('user_id', userId)
        .eq('data->>appointment_id', appointmentId)
        .eq('data->>category', 'position_update')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .limit(1);

      if (checkError) throw checkError;

      const title = queuePosition === 1 ? 'You\'re next in line! 🎉' : '📍 Queue Position Update';
      let message = '';

      if (queuePosition === 1) {
        message = `You are now next in line for your appointment with ${barberName}. Please be ready!`;
      } else {
        message = oldPosition
          ? `You've moved up! Your position for ${barberName} changed from #${oldPosition} to #${queuePosition}.`
          : `You are now at position #${queuePosition} in ${barberName}'s queue.`;
      }

      if (existingNotifications && existingNotifications.length > 0) {
        const lastNotif = existingNotifications[0];
        const lastSentAt = new Date(lastNotif.created_at || 0).getTime();
        const secondsSinceLast = (Date.now() - lastSentAt) / 1000;

        console.log(`🔄 Duplicate queue notification prevented for appointment ${appointmentId}. Last one was ${Math.round(secondsSinceLast)}s ago.`);

        // Only send push if at least 30 seconds have passed
        if (secondsSinceLast > 30) {
          try {
            const { PushService } = await import('./PushService');
            await PushService.sendNotificationToUser(userId, title, message, {
              type: 'queue',
              appointment_id: appointmentId,
              queue_position: queuePosition,
              old_position: oldPosition,
              reason
            });
            console.log(`✅ Push notification sent for duplicate prevention: ${title} for user ${userId}`);
          } catch (pushError) {
            console.warn('⚠️ Push notification failed for duplicate prevention:', pushError);
          }
        } else {
          console.log(`🚫 Skipping duplicate queue push: too recent (${Math.round(secondsSinceLast)}s ago)`);
        }

        return lastNotif;
      }

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
