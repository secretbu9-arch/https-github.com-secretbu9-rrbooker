/**
 * AppointmentTypeManager - Handles different appointment types and their specific logic
 * Separates scheduled appointments from queue appointments with proper validation
 */

import dateService from './DateService.js';

class AppointmentTypeManager {
  constructor() {
    this.appointmentTypes = {
      SCHEDULED: 'scheduled',
      QUEUE: 'queue',
      WALK_IN: 'walk_in'
    };

    this.statuses = {
      PENDING: 'pending',
      SCHEDULED: 'scheduled',
      ONGOING: 'ongoing',
      DONE: 'done',
      CANCELLED: 'cancelled'
    };

    this.priorityLevels = {
      URGENT: 'urgent',
      HIGH: 'high',
      NORMAL: 'normal',
      LOW: 'low'
    };
  }

  /**
   * Validate appointment type and data structure
   * @param {Object} appointment - Appointment object
   * @returns {Object} Validation result
   */
  validateAppointmentType(appointment) {
    const result = {
      isValid: false,
      type: null,
      errors: [],
      warnings: [],
      normalized: null
    };

    if (!appointment) {
      result.errors.push('Appointment object is null or undefined');
      return result;
    }

    // Check required fields
    const requiredFields = ['id', 'customer_id', 'barber_id', 'appointment_date', 'status'];
    for (const field of requiredFields) {
      if (!appointment[field]) {
        result.errors.push(`Missing required field: ${field}`);
      }
    }

    // Determine appointment type
    result.type = this.determineAppointmentType(appointment);

    // Validate based on type
    switch (result.type) {
      case this.appointmentTypes.SCHEDULED:
        result.isValid = this.validateScheduledAppointment(appointment, result);
        break;
      case this.appointmentTypes.QUEUE:
        result.isValid = this.validateQueueAppointment(appointment, result);
        break;
      default:
        result.errors.push(`Unknown appointment type: ${result.type}`);
    }

    // Create normalized appointment object
    if (result.isValid) {
      result.normalized = this.normalizeAppointment(appointment, result.type);
    }

    return result;
  }

  /**
   * Determine appointment type based on appointment data
   * @param {Object} appointment - Appointment object
   * @returns {string} Appointment type
   */
  determineAppointmentType(appointment) {
    // Check explicit appointment_type field first
    if (appointment.appointment_type) {
      return appointment.appointment_type;
    }

    // Infer from other fields
    if (appointment.appointment_time && appointment.appointment_time !== null) {
      return this.appointmentTypes.SCHEDULED;
    }

    if (appointment.queue_position && appointment.queue_position !== null) {
      return this.appointmentTypes.QUEUE;
    }

    // Default based on status
    if (appointment.status === this.statuses.PENDING) {
      return this.appointmentTypes.QUEUE;
    }

    return this.appointmentTypes.SCHEDULED;
  }

  /**
   * Validate scheduled appointment
   * @param {Object} appointment - Appointment object
   * @param {Object} result - Validation result object
   * @returns {boolean} Is valid
   */
  validateScheduledAppointment(appointment, result) {
    let isValid = true;

    // Scheduled appointments should have appointment_time
    if (!appointment.appointment_time) {
      result.errors.push('Scheduled appointments must have appointment_time');
      isValid = false;
    }

    // Scheduled appointments should not have queue_position (usually)
    if (appointment.queue_position !== null && appointment.queue_position !== undefined) {
      result.warnings.push('Scheduled appointment has queue_position - this may indicate data inconsistency');
    }

    // Validate appointment_time format
    if (appointment.appointment_time) {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(appointment.appointment_time)) {
        result.errors.push('Invalid appointment_time format. Expected HH:MM');
        isValid = false;
      }
    }

    return isValid;
  }

  /**
   * Validate queue appointment
   * @param {Object} appointment - Appointment object
   * @param {Object} result - Validation result object
   * @returns {boolean} Is valid
   */
  validateQueueAppointment(appointment, result) {
    let isValid = true;

    // Queue appointments should have queue_position
    if (appointment.queue_position === null || appointment.queue_position === undefined) {
      result.warnings.push('Queue appointment missing queue_position');
    }

    // Queue appointments may not have appointment_time initially
    if (appointment.appointment_time) {
      result.warnings.push('Queue appointment has appointment_time - this may be assigned later');
    }

    // Validate queue_position
    if (appointment.queue_position !== null && appointment.queue_position !== undefined) {
      if (!Number.isInteger(appointment.queue_position) || appointment.queue_position < 1) {
        result.errors.push('Invalid queue_position. Must be a positive integer');
        isValid = false;
      }
    }

    return isValid;
  }

  /**
   * Normalize appointment object based on type
   * @param {Object} appointment - Original appointment
   * @param {string} type - Appointment type
   * @returns {Object} Normalized appointment
   */
  normalizeAppointment(appointment, type) {
    const normalized = { ...appointment };

    // Ensure appointment_type is set
    normalized.appointment_type = type;

    // Normalize based on type
    switch (type) {
      case this.appointmentTypes.SCHEDULED:
        // Ensure appointment_time is properly formatted
        if (normalized.appointment_time) {
          normalized.appointment_time = this.normalizeTimeString(normalized.appointment_time);
        }
        // Clear queue_position for scheduled appointments
        if (normalized.queue_position === null || normalized.queue_position === undefined) {
          normalized.queue_position = null;
        }
        break;

      case this.appointmentTypes.QUEUE:
        // Ensure queue_position is a number
        if (normalized.queue_position !== null && normalized.queue_position !== undefined) {
          normalized.queue_position = parseInt(normalized.queue_position);
        }
        // Clear appointment_time for queue appointments (initially)
        if (!normalized.appointment_time) {
          normalized.appointment_time = null;
        }
        break;
    }

    // Ensure priority_level is set
    if (!normalized.priority_level) {
      normalized.priority_level = this.priorityLevels.NORMAL;
    }

    // Normalize date
    const dateValidation = dateService.validateAndNormalizeDate(normalized.appointment_date);
    if (dateValidation.isValid) {
      normalized.appointment_date = dateValidation.normalized;
    }

    return normalized;
  }

  /**
   * Normalize time string to HH:MM format
   * @param {string} timeString - Time string
   * @returns {string} Normalized time string
   */
  normalizeTimeString(timeString) {
    if (!timeString) return null;

    // Handle different time formats
    const time = timeString.toString().trim();
    
    // If it's already in HH:MM format
    if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      return time;
    }

    // If it's in HH:MM:SS format, remove seconds
    if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(time)) {
      return time.substring(0, 5);
    }

    // If it's a timestamp or other format, try to parse
    try {
      const date = new Date(`2000-01-01T${time}`);
      if (!isNaN(date.getTime())) {
        return date.toTimeString().substring(0, 5);
      }
    } catch (error) {
      console.warn('Could not normalize time string:', time);
    }

    return time; // Return original if can't normalize
  }

  /**
   * Separate appointments by type
   * @param {Array} appointments - Array of appointments
   * @returns {Object} Separated appointments
   */
  separateAppointmentsByType(appointments) {
    const result = {
      scheduled: [],
      queue: [],
      walkIn: [],
      invalid: [],
      summary: {
        total: appointments.length,
        scheduled: 0,
        queue: 0,
        walkIn: 0,
        invalid: 0
      }
    };

    if (!Array.isArray(appointments)) {
      result.invalid.push({ error: 'Input is not an array', data: appointments });
      return result;
    }

    appointments.forEach((appointment, index) => {
      const validation = this.validateAppointmentType(appointment);
      
      if (!validation.isValid) {
        result.invalid.push({
          index,
          appointment,
          errors: validation.errors,
          warnings: validation.warnings
        });
        result.summary.invalid++;
        return;
      }

      switch (validation.type) {
        case this.appointmentTypes.SCHEDULED:
          result.scheduled.push(validation.normalized);
          result.summary.scheduled++;
          break;
        case this.appointmentTypes.QUEUE:
          result.queue.push(validation.normalized);
          result.summary.queue++;
          break;
        case this.appointmentTypes.WALK_IN:
          result.walkIn.push(validation.normalized);
          result.summary.walkIn++;
          break;
        default:
          result.invalid.push({
            index,
            appointment,
            errors: [`Unknown type: ${validation.type}`]
          });
          result.summary.invalid++;
      }
    });

    return result;
  }

  /**
   * Sort appointments by type-specific criteria
   * @param {Array} appointments - Array of appointments
   * @param {string} type - Appointment type
   * @returns {Array} Sorted appointments
   */
  sortAppointmentsByType(appointments, type) {
    const separated = this.separateAppointmentsByType(appointments);
    
    switch (type) {
      case this.appointmentTypes.SCHEDULED:
        return separated.scheduled.sort((a, b) => {
          // Sort by appointment_time
          if (a.appointment_time && b.appointment_time) {
            return a.appointment_time.localeCompare(b.appointment_time);
          }
          // Fallback to creation time
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        });

      case this.appointmentTypes.QUEUE:
        return separated.queue.sort((a, b) => {
          // Sort by queue_position
          const aPos = a.queue_position || 999;
          const bPos = b.queue_position || 999;
          return aPos - bPos;
        });

      default:
        return appointments;
    }
  }

  /**
   * Get appointment type statistics
   * @param {Array} appointments - Array of appointments
   * @returns {Object} Statistics
   */
  getAppointmentTypeStatistics(appointments) {
    const separated = this.separateAppointmentsByType(appointments);
    
    return {
      ...separated.summary,
      percentages: {
        scheduled: separated.summary.total > 0 ? 
          Math.round((separated.summary.scheduled / separated.summary.total) * 100) : 0,
        queue: separated.summary.total > 0 ? 
          Math.round((separated.summary.queue / separated.summary.total) * 100) : 0,
        walkIn: separated.summary.total > 0 ? 
          Math.round((separated.summary.walkIn / separated.summary.total) * 100) : 0,
        invalid: separated.summary.total > 0 ? 
          Math.round((separated.summary.invalid / separated.summary.total) * 100) : 0
      },
      validation: {
        hasErrors: separated.invalid.length > 0,
        errorCount: separated.invalid.length,
        errors: separated.invalid
      }
    };
  }

  /**
   * Debug appointment type information
   * @param {Object} appointment - Appointment object
   * @returns {Object} Debug information
   */
  debugAppointmentType(appointment) {
    const validation = this.validateAppointmentType(appointment);
    const currentDate = dateService.getCurrentDateFormats();
    
    return {
      original: appointment,
      validation: validation,
      currentDate: currentDate,
      typeInfo: {
        determined: validation.type,
        isValid: validation.isValid,
        normalized: validation.normalized
      },
      recommendations: this.getRecommendations(appointment, validation)
    };
  }

  /**
   * Get recommendations for fixing appointment issues
   * @param {Object} appointment - Appointment object
   * @param {Object} validation - Validation result
   * @returns {Array} Recommendations
   */
  getRecommendations(appointment, validation) {
    const recommendations = [];

    if (!validation.isValid) {
      recommendations.push('Fix validation errors before processing');
    }

    if (validation.warnings.length > 0) {
      recommendations.push('Review warnings for potential data inconsistencies');
    }

    if (!appointment.appointment_type) {
      recommendations.push('Set explicit appointment_type field');
    }

    if (validation.type === this.appointmentTypes.SCHEDULED && appointment.queue_position) {
      recommendations.push('Consider removing queue_position from scheduled appointment');
    }

    if (validation.type === this.appointmentTypes.QUEUE && !appointment.queue_position) {
      recommendations.push('Assign queue_position to queue appointment');
    }

    return recommendations;
  }
}

// Create singleton instance
const appointmentTypeManager = new AppointmentTypeManager();
export default appointmentTypeManager;
