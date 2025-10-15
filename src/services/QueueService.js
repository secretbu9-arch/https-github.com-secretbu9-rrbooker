import { supabase } from '../supabaseClient';
import { PushService } from './PushService';

class QueueService {
  // Get queue status for a barber
  async getBarberQueueStatus(barberId, date) {
    try {
      const { data, error } = await supabase
        .rpc('get_barber_queue_status', {
          p_barber_id: barberId,
          p_appointment_date: date
        });

      if (error) throw error;
      return data?.[0] || null;
    } catch (error) {
      console.error('Error getting barber queue status:', error);
      throw error;
    }
  }

  // Process scheduled appointments for queue insertion
  async processScheduledAppointments() {
    try {
      const { data, error } = await supabase
        .rpc('process_scheduled_appointments_for_queue');

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error processing scheduled appointments:', error);
      throw error;
    }
  }

  // Update queue position for an appointment
  async updateQueuePosition(appointmentId, newPosition) {
    try {
      const appointment = await this.getAppointment(appointmentId);
      if (!appointment) throw new Error('Appointment not found');

      const { data, error } = await supabase
        .rpc('manager_reorder_queue', {
          p_barber_id: appointment.barber_id,
          p_appointment_date: appointment.appointment_date,
          p_appointment_id: appointmentId,
          p_new_position: newPosition
        });

      if (error) throw error;

      if (data) {
        // Send notification to customer
        await this.notifyCustomerPositionChange(appointment, newPosition);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating queue position:', error);
      throw error;
    }
  }

  // Update priority level for an appointment
  async updatePriorityLevel(appointmentId, newPriority) {
    try {
      const appointment = await this.getAppointment(appointmentId);
      if (!appointment) throw new Error('Appointment not found');

      const { error } = await supabase
        .from('appointments')
        .update({ 
          priority_level: newPriority,
          manager_adjusted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Reorder queue based on new priority
      await this.reorderQueueByPriority(appointment.barber_id, appointment.appointment_date);

      // Send notification to customer
      await this.notifyCustomerPriorityChange(appointment, newPriority);

      return true;
    } catch (error) {
      console.error('Error updating priority level:', error);
      throw error;
    }
  }

  // Reorder queue based on priority levels
  async reorderQueueByPriority(barberId, appointmentDate) {
    try {
      // Get all appointments in queue for this barber and date
      const { data: queueAppointments, error } = await supabase
        .from('appointments')
        .select('id, queue_position, priority_level, appointment_time, created_at')
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .in('status', ['scheduled', 'pending', 'ongoing'])
        .not('queue_position', 'is', null)
        .order('queue_position', { ascending: true });

      if (error) throw error;

      // Sort by priority and time
      const sortedAppointments = queueAppointments.sort((a, b) => {
        const priorityOrder = { 'urgent': 0, 'high': 1, 'normal': 2, 'low': 3 };
        const aPriority = priorityOrder[a.priority_level] || 2;
        const bPriority = priorityOrder[b.priority_level] || 2;
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        
        // If same priority, sort by appointment time or creation time
        if (a.appointment_time && b.appointment_time) {
          return a.appointment_time.localeCompare(b.appointment_time);
        }
        
        return new Date(a.created_at) - new Date(b.created_at);
      });

      // Update queue positions
      for (let i = 0; i < sortedAppointments.length; i++) {
        const newPosition = i + 1;
        if (sortedAppointments[i].queue_position !== newPosition) {
          await supabase
            .from('appointments')
            .update({ 
              queue_position: newPosition,
              updated_at: new Date().toISOString()
            })
            .eq('id', sortedAppointments[i].id);
        }
      }

      // Update estimated wait times
      await supabase.rpc('update_estimated_wait_times', {
        p_barber_id: barberId,
        p_appointment_date: appointmentDate
      });

      return true;
    } catch (error) {
      console.error('Error reordering queue by priority:', error);
      throw error;
    }
  }

  // Get appointment details
  async getAppointment(appointmentId) {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          customer_id,
          barber_id,
          appointment_date,
          appointment_time,
          status,
          queue_position,
          priority_level,
          barber:barber_id(full_name, email)
        `)
        .eq('id', appointmentId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting appointment:', error);
      throw error;
    }
  }

  // Notify customer about position change
  async notifyCustomerPositionChange(appointment, newPosition) {
    try {
      // Use CentralizedNotificationService to prevent duplicates
      const { default: centralizedNotificationService } = await import('./CentralizedNotificationService');
      await centralizedNotificationService.createQueuePositionNotification({
        userId: appointment.customer_id,
        appointmentId: appointment.id,
        queuePosition: newPosition,
        reason: 'Position updated by system',
        barberName: appointment.barber?.full_name
      });
    } catch (error) {
      console.warn('Failed to send position change notification:', error);
    }
  }

  // Notify customer about priority change
  async notifyCustomerPriorityChange(appointment, newPriority) {
    try {
      // Use CentralizedNotificationService to prevent duplicates
      const { default: centralizedNotificationService } = await import('./CentralizedNotificationService');
      await centralizedNotificationService.createNotification({
        userId: appointment.customer_id,
        title: 'Queue Priority Updated',
        message: `Your appointment priority has been updated to ${newPriority}. Your position in the queue may have changed.`,
        type: 'queue_priority_update',
        category: 'queue_update',
        priority: 'normal',
        channels: ['app', 'push'],
        data: {
          appointment_id: appointment.id,
          new_priority: newPriority,
          barber_name: appointment.barber?.full_name
        },
        appointmentId: appointment.id
      });
    } catch (error) {
      console.warn('Failed to send priority change notification:', error);
    }
  }

  // Get queue analytics
  async getQueueAnalytics(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('enhanced_queue_analytics')
        .select('*')
        .eq('appointment_date', targetDate);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting queue analytics:', error);
      throw error;
    }
  }

  // Get customer's queue position
  async getCustomerQueuePosition(appointmentId) {
    try {
      const appointment = await this.getAppointment(appointmentId);
      if (!appointment || !appointment.queue_position) return null;

      const queueStatus = await this.getBarberQueueStatus(
        appointment.barber_id, 
        appointment.appointment_date
      );

      return {
        appointment,
        queueStatus,
        position: appointment.queue_position,
        estimatedWaitTime: appointment.estimated_wait_time
      };
    } catch (error) {
      console.error('Error getting customer queue position:', error);
      throw error;
    }
  }

  // Set up real-time queue updates
  setupQueueUpdates(barberId, date, callback) {
    const channelName = `queue-updates-${barberId}-${date}`;
    
    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'appointments',
          filter: `barber_id=eq.${barberId}`
        }, 
        (payload) => {
          console.log('Queue update received:', payload);
          callback(payload);
        }
      )
      .subscribe();

    return subscription;
  }

  // Clean up queue subscriptions
  cleanupQueueUpdates(subscription) {
    if (subscription) {
      subscription.unsubscribe();
    }
  }
}

export default new QueueService();
