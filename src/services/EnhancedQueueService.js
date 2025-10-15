/**
 * EnhancedQueueService - Advanced queue management with proper type separation
 * Handles queue operations without affecting scheduled appointments
 */

import { supabase } from '../supabaseClient.js';
import dateService from './DateService.js';
import appointmentTypeManager from './AppointmentTypeManager.js';
import { PushService } from './PushService.js';

class EnhancedQueueService {
  constructor() {
    this.maxQueueSize = 15;
    this.defaultServiceDuration = 30; // minutes
  }

  /**
   * Get comprehensive queue data for a barber on a specific date
   * @param {string} barberId - Barber ID
   * @param {string} date - Date string (YYYY-MM-DD)
   * @returns {Object} Complete queue information
   */
  async getBarberQueueData(barberId, date) {
    try {
      console.log('🔄 EnhancedQueueService: Getting queue data for barber:', barberId, 'date:', date);
      
      // Validate and normalize date
      const dateValidation = dateService.validateAndNormalizeDate(date);
      if (!dateValidation.isValid) {
        throw new Error(`Invalid date format: ${dateValidation.error}`);
      }

      const normalizedDate = dateValidation.normalized;
      const dayBoundaries = dateService.getDayBoundaries(normalizedDate);
      
      console.log('📅 Date info:', {
        original: date,
        normalized: normalizedDate,
        boundaries: dayBoundaries
      });

      // Get all appointments for the barber on this date
      const { data: allAppointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('barber_id', barberId)
        .eq('appointment_date', normalizedDate)
        .in('status', ['scheduled', 'ongoing', 'pending'])
        .order('created_at', { ascending: true });

      if (appointmentsError) {
        throw new Error(`Failed to fetch appointments: ${appointmentsError.message}`);
      }

      console.log('📋 Raw appointments fetched:', allAppointments?.length || 0);

      // Separate appointments by type
      const separatedAppointments = appointmentTypeManager.separateAppointmentsByType(allAppointments || []);
      
      console.log('📊 Appointment separation:', separatedAppointments.summary);

      // Process each type separately
      const result = {
        date: normalizedDate,
        barberId: barberId,
        currentAppointment: null,
        scheduledAppointments: [],
        queueAppointments: [],
        pendingRequests: [],
        statistics: {
          total: separatedAppointments.summary.total,
          scheduled: separatedAppointments.summary.scheduled,
          queue: separatedAppointments.summary.queue,
          pending: 0,
          current: 0
        },
        validation: {
          hasErrors: separatedAppointments.summary.invalid > 0,
          errors: separatedAppointments.invalid
        },
        debug: {
          dateFormats: dateService.getCurrentDateFormats(),
          dayBoundaries: dayBoundaries,
          separation: separatedAppointments.summary
        }
      };

      // Process scheduled appointments
      result.scheduledAppointments = this.processScheduledAppointments(separatedAppointments.scheduled);
      
      // Process queue appointments
      result.queueAppointments = this.processQueueAppointments(separatedAppointments.queue);
      
      // Process pending requests (queue appointments with pending status)
      result.pendingRequests = this.processPendingRequests(separatedAppointments.queue);
      
      // Find current appointment (ongoing)
      result.currentAppointment = this.findCurrentAppointment(allAppointments || []);
      
      // Update statistics
      result.statistics.pending = result.pendingRequests.length;
      result.statistics.current = result.currentAppointment ? 1 : 0;

      console.log('✅ Enhanced queue data processed:', {
        scheduled: result.scheduledAppointments.length,
        queue: result.queueAppointments.length,
        pending: result.pendingRequests.length,
        current: result.currentAppointment ? 'Found' : 'None'
      });

      return result;

    } catch (error) {
      console.error('❌ EnhancedQueueService error:', error);
      throw error;
    }
  }

  /**
   * Process scheduled appointments
   * @param {Array} scheduledAppointments - Array of scheduled appointments
   * @returns {Array} Processed scheduled appointments
   */
  processScheduledAppointments(scheduledAppointments) {
    return scheduledAppointments
      .filter(apt => apt.status === 'scheduled')
      .sort((a, b) => {
        // Sort by appointment_time
        if (a.appointment_time && b.appointment_time) {
          return a.appointment_time.localeCompare(b.appointment_time);
        }
        // Fallback to creation time
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      })
      .map(apt => ({
        ...apt,
        type: 'scheduled',
        displayOrder: apt.appointment_time || '00:00',
        estimatedDuration: apt.total_duration || apt.service?.duration || this.defaultServiceDuration
      }));
  }

  /**
   * Process queue appointments
   * @param {Array} queueAppointments - Array of queue appointments
   * @returns {Array} Processed queue appointments
   */
  processQueueAppointments(queueAppointments) {
    return queueAppointments
      .filter(apt => apt.status === 'scheduled')
      .sort((a, b) => {
        // Sort by queue_position
        const aPos = a.queue_position || 999;
        const bPos = b.queue_position || 999;
        return aPos - bPos;
      })
      .map((apt, index) => ({
        ...apt,
        type: 'queue',
        displayOrder: apt.queue_position || (index + 1),
        estimatedDuration: apt.total_duration || apt.service?.duration || this.defaultServiceDuration,
        estimatedWaitTime: this.calculateWaitTime(apt, index)
      }));
  }

  /**
   * Process pending requests
   * @param {Array} queueAppointments - Array of queue appointments
   * @returns {Array} Pending requests
   */
  processPendingRequests(queueAppointments) {
    return queueAppointments
      .filter(apt => apt.status === 'pending')
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
      .map(apt => ({
        ...apt,
        type: 'pending',
        displayOrder: new Date(apt.created_at || 0).getTime(),
        estimatedDuration: apt.total_duration || apt.service?.duration || this.defaultServiceDuration
      }));
  }

  /**
   * Find current appointment (ongoing)
   * @param {Array} allAppointments - All appointments
   * @returns {Object|null} Current appointment
   */
  findCurrentAppointment(allAppointments) {
    const current = allAppointments.find(apt => apt.status === 'ongoing');
    return current ? {
      ...current,
      type: 'current',
      displayOrder: 0
    } : null;
  }

  /**
   * Calculate estimated wait time for queue appointment
   * @param {Object} appointment - Queue appointment
   * @param {number} position - Position in queue
   * @returns {number} Estimated wait time in minutes
   */
  calculateWaitTime(appointment, position) {
    // This is a simplified calculation
    // In a real system, you'd consider service durations of appointments ahead
    const baseWaitTime = position * this.defaultServiceDuration;
    return Math.max(0, baseWaitTime);
  }

  /**
   * Accept a pending queue request
   * @param {string} appointmentId - Appointment ID
   * @param {string} barberId - Barber ID
   * @param {boolean} isUrgent - Is urgent request
   * @returns {Object} Result of acceptance
   */
  async acceptQueueRequest(appointmentId, barberId, isUrgent = false) {
    try {
      console.log('🔄 Accepting queue request:', appointmentId, 'urgent:', isUrgent);

      // Get the appointment
      const { data: appointment, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (fetchError || !appointment) {
        throw new Error('Appointment not found');
      }

      // Validate appointment type
      const validation = appointmentTypeManager.validateAppointmentType(appointment);
      if (!validation.isValid || validation.type !== 'queue') {
        throw new Error('Invalid appointment type for queue acceptance');
      }

      // Get current queue to determine position
      const queueData = await this.getBarberQueueData(barberId, appointment.appointment_date);
      
      let queuePosition;
      if (isUrgent) {
        // Urgent appointments go to position 1
        queuePosition = 1;
        // Increment positions of existing queue appointments only
        await this.incrementQueuePositions(barberId, appointment.appointment_date, 1);
      } else {
        // Regular appointments go to the end
        queuePosition = queueData.queueAppointments.length + 1;
      }

      // Update appointment
      const updateData = {
        status: 'scheduled',
        queue_position: queuePosition,
        priority_level: isUrgent ? 'urgent' : 'normal',
        updated_at: new Date().toISOString()
      };

      const { error: updateError } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', appointmentId);

      if (updateError) {
        throw new Error(`Failed to update appointment: ${updateError.message}`);
      }

      // Send notification to customer
      await this.notifyCustomerQueueAcceptance(appointment, queuePosition, isUrgent);

      console.log('✅ Queue request accepted:', {
        appointmentId,
        queuePosition,
        isUrgent
      });

      return {
        success: true,
        appointmentId,
        queuePosition,
        isUrgent,
        message: `Appointment accepted and assigned queue position #${queuePosition}`
      };

    } catch (error) {
      console.error('❌ Error accepting queue request:', error);
      throw error;
    }
  }

  /**
   * Increment queue positions for existing queue appointments
   * @param {string} barberId - Barber ID
   * @param {string} date - Date
   * @param {number} startPosition - Starting position to increment from
   */
  async incrementQueuePositions(barberId, date, startPosition) {
    try {
      // Only increment queue appointments, not scheduled ones
      const { error } = await supabase
        .from('appointments')
        .update({ 
          queue_position: supabase.raw('queue_position + 1'),
          updated_at: new Date().toISOString()
        })
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .eq('status', 'scheduled')
        .eq('appointment_type', 'queue') // Only queue appointments
        .gte('queue_position', startPosition);

      if (error) {
        console.warn('Warning: Could not increment all queue positions:', error);
      }
    } catch (error) {
      console.warn('Warning: Error incrementing queue positions:', error);
    }
  }

  /**
   * Notify customer about queue acceptance
   * @param {Object} appointment - Appointment object
   * @param {number} queuePosition - Queue position
   * @param {boolean} isUrgent - Is urgent
   */
  async notifyCustomerQueueAcceptance(appointment, queuePosition, isUrgent) {
    try {
      const title = isUrgent ? 'Urgent Appointment Confirmed! 🚨' : 'Appointment Confirmed! ✅';
      const message = isUrgent 
        ? `Your urgent appointment has been confirmed. You are #${queuePosition} in the queue.`
        : `Your appointment has been confirmed. You are #${queuePosition} in the queue.`;

      // Use CentralizedNotificationService to prevent duplicates
      const { default: centralizedNotificationService } = await import('./CentralizedNotificationService');
      await centralizedNotificationService.createBookingConfirmationNotification({
        userId: appointment.customer_id,
        appointmentId: appointment.id,
        queuePosition: queuePosition,
        estimatedTime: null,
        appointmentType: 'queue',
        appointmentTime: null,
        isUrgent: isUrgent
      });

    } catch (error) {
      console.warn('Failed to send queue acceptance notification:', error);
    }
  }

  /**
   * Get queue statistics and analytics
   * @param {string} barberId - Barber ID
   * @param {string} date - Date
   * @returns {Object} Queue statistics
   */
  async getQueueStatistics(barberId, date) {
    try {
      const queueData = await this.getBarberQueueData(barberId, date);
      
      const stats = {
        date: date,
        barberId: barberId,
        summary: queueData.statistics,
        averageWaitTime: this.calculateAverageWaitTime(queueData.queueAppointments),
        queueEfficiency: this.calculateQueueEfficiency(queueData),
        recommendations: this.getQueueRecommendations(queueData)
      };

      return stats;
    } catch (error) {
      console.error('Error getting queue statistics:', error);
      throw error;
    }
  }

  /**
   * Calculate average wait time
   * @param {Array} queueAppointments - Queue appointments
   * @returns {number} Average wait time in minutes
   */
  calculateAverageWaitTime(queueAppointments) {
    if (queueAppointments.length === 0) return 0;
    
    const totalWaitTime = queueAppointments.reduce((sum, apt) => {
      return sum + (apt.estimatedWaitTime || 0);
    }, 0);
    
    return Math.round(totalWaitTime / queueAppointments.length);
  }

  /**
   * Calculate queue efficiency
   * @param {Object} queueData - Queue data
   * @returns {Object} Efficiency metrics
   */
  calculateQueueEfficiency(queueData) {
    const total = queueData.statistics.total;
    const scheduled = queueData.statistics.scheduled;
    const queue = queueData.statistics.queue;
    
    return {
      scheduledRatio: total > 0 ? Math.round((scheduled / total) * 100) : 0,
      queueRatio: total > 0 ? Math.round((queue / total) * 100) : 0,
      isBalanced: Math.abs(scheduled - queue) <= 2,
      recommendation: this.getEfficiencyRecommendation(scheduled, queue)
    };
  }

  /**
   * Get efficiency recommendation
   * @param {number} scheduled - Number of scheduled appointments
   * @param {number} queue - Number of queue appointments
   * @returns {string} Recommendation
   */
  getEfficiencyRecommendation(scheduled, queue) {
    if (queue > scheduled * 2) {
      return 'Consider encouraging more scheduled appointments to reduce queue wait times';
    } else if (scheduled > queue * 2) {
      return 'Queue is underutilized - consider promoting walk-in availability';
    } else {
      return 'Good balance between scheduled and queue appointments';
    }
  }

  /**
   * Get queue recommendations
   * @param {Object} queueData - Queue data
   * @returns {Array} Recommendations
   */
  getQueueRecommendations(queueData) {
    const recommendations = [];

    if (queueData.statistics.queue > this.maxQueueSize) {
      recommendations.push('Queue is at maximum capacity - consider closing new queue requests');
    }

    if (queueData.validation.hasErrors) {
      recommendations.push('Fix data validation errors to ensure proper queue operation');
    }

    if (queueData.statistics.pending > 5) {
      recommendations.push('High number of pending requests - consider faster response times');
    }

    const urgentCount = queueData.queueAppointments.filter(apt => apt.priority_level === 'urgent').length;
    if (urgentCount > 2) {
      recommendations.push('Multiple urgent appointments - consider priority management');
    }

    return recommendations;
  }
}

// Create singleton instance
const enhancedQueueService = new EnhancedQueueService();
export default enhancedQueueService;
