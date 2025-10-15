/**
 * ComprehensiveQueueManager - Centralized queue management service
 * Handles all queue operations including adding scheduled appointments to queue,
 * changing priorities, and managing queue positions
 */

import { supabase } from '../supabaseClient';
import CentralizedNotificationService from './CentralizedNotificationService';

class ComprehensiveQueueManager {
  constructor() {
    this.maxQueueSize = 15;
  }

  /**
   * Add a scheduled appointment to the queue
   * @param {string} appointmentId - ID of the appointment to add to queue
   * @param {string} barberId - ID of the barber
   * @param {boolean} isUrgent - Whether this is an urgent appointment
   * @returns {Promise<Object>} Result object with success status and queue position
   */
  async addScheduledToQueue(appointmentId, barberId, isUrgent = false) {
    try {
      console.log('🔄 Adding scheduled appointment to queue:', { appointmentId, barberId, isUrgent });

      // First, get the appointment details
      const { data: appointment, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch appointment: ${fetchError.message}`);
      }

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      // Debug: Log appointment data to help identify customer ID issues
      console.log('📋 Full appointment data:', appointment);
      console.log('📋 Customer ID fields:', {
        id: appointment.id,
        customer_id: appointment.customer_id,
        primary_customer_id: appointment.primary_customer_id,
        appointment_type: appointment.appointment_type,
        barber_id: appointment.barber_id
      });

      // Check if appointment is already in queue
      if (appointment.appointment_type === 'queue') {
        return {
          success: true,
          message: 'Appointment is already in queue',
          queuePosition: appointment.queue_position
        };
      }

      // Get current queue for the barber on the same date
      const { data: queueAppointments, error: queueError } = await supabase
        .from('appointments')
        .select('id, queue_position')
        .eq('barber_id', barberId)
        .eq('appointment_date', appointment.appointment_date)
        .eq('appointment_type', 'queue')
        .in('status', ['pending', 'scheduled', 'confirmed'])
        .order('queue_position', { ascending: true });

      if (queueError) {
        throw new Error(`Failed to fetch queue: ${queueError.message}`);
      }

      // Check queue capacity
      if (queueAppointments && queueAppointments.length >= this.maxQueueSize) {
        throw new Error('Queue is at maximum capacity');
      }

      // Calculate new queue position
      const newQueuePosition = (queueAppointments?.length || 0) + 1;

      // Update the appointment to queue type
      const { data: updatedAppointment, error: updateError } = await supabase
        .from('appointments')
        .update({
          appointment_type: 'queue',
          queue_position: newQueuePosition,
          priority_level: isUrgent ? 'urgent' : 'normal',
          appointment_time: null, // Remove scheduled time
          status: 'pending'
        })
        .eq('id', appointmentId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update appointment: ${updateError.message}`);
      }

      // Send notification to customer
      const customerId = appointment.customer_id || appointment.primary_customer_id;
      console.log('🔔 Notification attempt:', {
        appointmentId: appointmentId,
        customerId: customerId,
        customer_id: appointment.customer_id,
        primary_customer_id: appointment.primary_customer_id
      });
      
      if (customerId) {
        try {
          await CentralizedNotificationService.createNotification({
            user_id: customerId,
            type: 'appointment_queue_added',
            title: 'Appointment Added to Queue',
            message: `Your appointment has been added to the queue at position ${newQueuePosition}. You will be notified when it's your turn.`,
            data: {
              appointment_id: appointmentId,
              queue_position: newQueuePosition,
              barber_id: barberId
            }
          });
        } catch (notificationError) {
          console.warn('Failed to send notification:', notificationError);
          // Don't fail the entire operation for notification issues
        }
      } else {
        console.warn('Cannot send notification: customer_id and primary_customer_id are both missing for appointment:', appointmentId);
      }

      // Fix any data consistency issues for this barber and date
      try {
        await this.fixDataConsistency(barberId, appointment.appointment_date);
      } catch (consistencyError) {
        console.warn('Failed to fix data consistency:', consistencyError);
        // Don't fail the main operation for consistency issues
      }

      console.log('✅ Successfully added appointment to queue at position:', newQueuePosition);

      return {
        success: true,
        message: 'Appointment successfully added to queue',
        queuePosition: newQueuePosition,
        appointment: updatedAppointment
      };

    } catch (error) {
      console.error('❌ Error adding appointment to queue:', error);
      return {
        success: false,
        message: error.message || 'Failed to add appointment to queue'
      };
    }
  }

  /**
   * Change the priority of an appointment
   * @param {string} appointmentId - ID of the appointment
   * @param {string} priority - New priority level ('urgent', 'normal', 'low')
   * @returns {Promise<Object>} Result object with success status
   */
  async changePriority(appointmentId, priority) {
    try {
      console.log('🔄 Changing appointment priority:', { appointmentId, priority });

      // Validate priority
      const validPriorities = ['urgent', 'normal', 'low'];
      if (!validPriorities.includes(priority)) {
        throw new Error(`Invalid priority level: ${priority}`);
      }

      // Update the appointment priority
      const { data: updatedAppointment, error: updateError } = await supabase
        .from('appointments')
        .update({
          priority_level: priority
        })
        .eq('id', appointmentId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update priority: ${updateError.message}`);
      }

      // Send notification to customer
      const customerId = updatedAppointment.customer_id || updatedAppointment.primary_customer_id;
      if (customerId) {
        try {
          await CentralizedNotificationService.createNotification({
            user_id: customerId,
            type: 'appointment_priority_changed',
            title: 'Appointment Priority Updated',
            message: `Your appointment priority has been changed to ${priority}.`,
            data: {
              appointment_id: appointmentId,
              priority: priority
            }
          });
        } catch (notificationError) {
          console.warn('Failed to send notification:', notificationError);
        }
      } else {
        console.warn('Cannot send notification: customer_id and primary_customer_id are both missing for appointment:', appointmentId);
      }

      console.log('✅ Successfully changed appointment priority to:', priority);

      return {
        success: true,
        message: `Priority changed to ${priority}`,
        appointment: updatedAppointment
      };

    } catch (error) {
      console.error('❌ Error changing appointment priority:', error);
      return {
        success: false,
        message: error.message || 'Failed to change appointment priority'
      };
    }
  }

  /**
   * Change the queue position of an appointment
   * @param {string} appointmentId - ID of the appointment
   * @param {number} newPosition - New queue position
   * @returns {Promise<Object>} Result object with success status
   */
  async changeQueuePosition(appointmentId, newPosition) {
    try {
      console.log('🔄 Changing queue position:', { appointmentId, newPosition });

      // Get the appointment details
      const { data: appointment, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch appointment: ${fetchError.message}`);
      }

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      if (appointment.appointment_type !== 'queue') {
        throw new Error('Appointment is not in queue');
      }

      // Get all queue appointments for the same barber and date
      const { data: queueAppointments, error: queueError } = await supabase
        .from('appointments')
        .select('id, queue_position')
        .eq('barber_id', appointment.barber_id)
        .eq('appointment_date', appointment.appointment_date)
        .eq('appointment_type', 'queue')
        .in('status', ['pending', 'scheduled', 'confirmed'])
        .order('queue_position', { ascending: true });

      if (queueError) {
        throw new Error(`Failed to fetch queue: ${queueError.message}`);
      }

      const maxPosition = queueAppointments?.length || 0;
      if (newPosition < 1 || newPosition > maxPosition) {
        throw new Error(`Invalid position. Must be between 1 and ${maxPosition}`);
      }

      const currentPosition = appointment.queue_position;
      const otherAppointments = queueAppointments.filter(apt => apt.id !== appointmentId);

      // Update positions for other appointments
      const updates = [];
      
      if (newPosition < currentPosition) {
        // Moving up in queue - shift others down
        otherAppointments.forEach(apt => {
          if (apt.queue_position >= newPosition && apt.queue_position < currentPosition) {
            updates.push({
              id: apt.id,
              queue_position: apt.queue_position + 1
            });
          }
        });
      } else if (newPosition > currentPosition) {
        // Moving down in queue - shift others up
        otherAppointments.forEach(apt => {
          if (apt.queue_position > currentPosition && apt.queue_position <= newPosition) {
            updates.push({
              id: apt.id,
              queue_position: apt.queue_position - 1
            });
          }
        });
      }

      // Execute all updates
      for (const update of updates) {
        await supabase
          .from('appointments')
          .update({ queue_position: update.queue_position })
          .eq('id', update.id);
      }

      // Update the target appointment
      const { data: updatedAppointment, error: updateError } = await supabase
        .from('appointments')
        .update({
          queue_position: newPosition
        })
        .eq('id', appointmentId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update queue position: ${updateError.message}`);
      }

      // Send notification to customer
      const customerId = appointment.customer_id || appointment.primary_customer_id;
      if (customerId) {
        try {
          await CentralizedNotificationService.createNotification({
            user_id: customerId,
            type: 'appointment_queue_position_changed',
            title: 'Queue Position Updated',
            message: `Your appointment queue position has been changed to ${newPosition}.`,
            data: {
              appointment_id: appointmentId,
              queue_position: newPosition,
              barber_id: appointment.barber_id
            }
          });
        } catch (notificationError) {
          console.warn('Failed to send notification:', notificationError);
        }
      } else {
        console.warn('Cannot send notification: customer_id and primary_customer_id are both missing for appointment:', appointmentId);
      }

      console.log('✅ Successfully changed queue position to:', newPosition);

      return {
        success: true,
        message: `Queue position changed to ${newPosition}`,
        appointment: updatedAppointment
      };

    } catch (error) {
      console.error('❌ Error changing queue position:', error);
      return {
        success: false,
        message: error.message || 'Failed to change queue position'
      };
    }
  }

  /**
   * Fix data consistency issues in appointments
   * @param {string} barberId - Barber ID to fix appointments for
   * @param {string} date - Date to fix appointments for (optional)
   * @returns {Promise<Object>} Result object with success status
   */
  async fixDataConsistency(barberId, date = null) {
    try {
      console.log('🔄 Fixing data consistency issues:', { barberId, date });

      let query = supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing']);

      if (date) {
        query = query.eq('appointment_date', date);
      }

      const { data: appointments, error: fetchError } = await query;

      if (fetchError) {
        throw new Error(`Failed to fetch appointments: ${fetchError.message}`);
      }

      const updates = [];
      const issues = [];

      // Check for consistency issues
      appointments?.forEach(appointment => {
        if (appointment.appointment_type === 'queue' && appointment.appointment_time) {
          issues.push(`Queue appointment ${appointment.id} has appointment_time (should be null)`);
          updates.push({
            id: appointment.id,
            appointment_time: null
          });
        }

        if (appointment.appointment_type === 'scheduled' && appointment.queue_position) {
          issues.push(`Scheduled appointment ${appointment.id} has queue_position (should be null)`);
          updates.push({
            id: appointment.id,
            queue_position: null
          });
        }
      });

      // Apply fixes
      for (const update of updates) {
        await supabase
          .from('appointments')
          .update({
            appointment_time: update.appointment_time,
            queue_position: update.queue_position
          })
          .eq('id', update.id);
      }

      console.log('✅ Fixed data consistency issues:', {
        totalAppointments: appointments?.length || 0,
        issuesFound: issues.length,
        fixesApplied: updates.length
      });

      return {
        success: true,
        message: `Fixed ${updates.length} data consistency issues`,
        issues: issues,
        fixesApplied: updates.length
      };

    } catch (error) {
      console.error('❌ Error fixing data consistency:', error);
      return {
        success: false,
        message: error.message || 'Failed to fix data consistency'
      };
    }
  }

  /**
   * Remove an appointment from the queue
   * @param {string} appointmentId - ID of the appointment to remove
   * @returns {Promise<Object>} Result object with success status
   */
  async removeFromQueue(appointmentId) {
    try {
      console.log('🔄 Removing appointment from queue:', appointmentId);

      // Get the appointment details
      const { data: appointment, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch appointment: ${fetchError.message}`);
      }

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      if (appointment.appointment_type !== 'queue') {
        throw new Error('Appointment is not in queue');
      }

      const removedPosition = appointment.queue_position;

      // Update the appointment to remove from queue
      const { data: updatedAppointment, error: updateError } = await supabase
        .from('appointments')
        .update({
          appointment_type: 'scheduled',
          queue_position: null,
          status: 'cancelled'
        })
        .eq('id', appointmentId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update appointment: ${updateError.message}`);
      }

      // Reorder remaining queue positions
      const { data: remainingQueue, error: queueError } = await supabase
        .from('appointments')
        .select('id, queue_position')
        .eq('barber_id', appointment.barber_id)
        .eq('appointment_date', appointment.appointment_date)
        .eq('appointment_type', 'queue')
        .in('status', ['pending', 'scheduled', 'confirmed'])
        .gt('queue_position', removedPosition)
        .order('queue_position', { ascending: true });

      if (queueError) {
        console.warn('Failed to fetch remaining queue for reordering:', queueError);
      } else if (remainingQueue) {
        // Update positions for remaining appointments
        for (const apt of remainingQueue) {
          await supabase
            .from('appointments')
            .update({ queue_position: apt.queue_position - 1 })
            .eq('id', apt.id);
        }
      }

      // Send notification to customer
      const customerId = appointment.customer_id || appointment.primary_customer_id;
      if (customerId) {
        try {
          await CentralizedNotificationService.createNotification({
            user_id: customerId,
            type: 'appointment_removed_from_queue',
            title: 'Appointment Removed from Queue',
            message: 'Your appointment has been removed from the queue.',
            data: {
              appointment_id: appointmentId,
              barber_id: appointment.barber_id
            }
          });
        } catch (notificationError) {
          console.warn('Failed to send notification:', notificationError);
        }
      } else {
        console.warn('Cannot send notification: customer_id and primary_customer_id are both missing for appointment:', appointmentId);
      }

      console.log('✅ Successfully removed appointment from queue');

      return {
        success: true,
        message: 'Appointment removed from queue',
        appointment: updatedAppointment
      };

    } catch (error) {
      console.error('❌ Error removing appointment from queue:', error);
      return {
        success: false,
        message: error.message || 'Failed to remove appointment from queue'
      };
    }
  }
}

// Export as singleton instance
export default new ComprehensiveQueueManager();
