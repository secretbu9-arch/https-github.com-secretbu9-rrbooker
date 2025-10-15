// utils/helpers.js (Enhanced with queue management and new features)
import { DATE_FORMATS, QUEUE_SETTINGS, BOOKING_SETTINGS } from './constants';
import addOnsService from '../../services/AddOnsService';

/**
 * Format a date string or Date object using Intl.DateTimeFormat
 * @param {string|Date} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} - Formatted date string
 */
export const formatDate = (date, options = DATE_FORMATS.MEDIUM) => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', options).format(dateObj);
};

/**
 * Format time from 24h format to 12h format
 * @param {string} timeString - Time string in 24h format (HH:MM)
 * @returns {string} - Time string in 12h format
 */
export const formatTime = (timeString) => {
  if (!timeString) return '';
  
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  
  return `${hour12}:${minutes} ${period}`;
};

/**
 * Format duration in minutes to human-readable format
 * @param {number} durationMinutes - Duration in minutes
 * @returns {string} - Formatted duration string
 */
export const formatDuration = (durationMinutes) => {
  if (durationMinutes < 60) {
    return `${durationMinutes} ${durationMinutes === 1 ? 'minute' : 'minutes'}`;
  } else {
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    
    if (minutes === 0) {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    } else {
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
  }
};

/**
 * Format a price number to currency string
 * @param {number} price - Price to format
 * @param {string} currency - Currency code
 * @returns {string} - Formatted price string
 */
export const formatPrice = (price, currency = 'PHP') => {
  if (price === undefined || price === null) return '';
  
  // Format price for Philippine Peso with ₱ symbol
  if (currency === 'PHP') {
    return `₱${Number(price).toFixed(2)}`;
  }
  
  // For other currencies, use Intl.NumberFormat
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(price);
};

/**
 * Get today's date as ISO string (YYYY-MM-DD) - timezone safe
 * @returns {string} - Today's date as ISO string
 */
export const getTodayISOString = () => {
  const today = new Date();
  return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
};

/**
 * Convert a Date object to ISO string (YYYY-MM-DD) - timezone safe
 * @param {Date} date - Date object to convert
 * @returns {string} - Date as ISO string
 */
export const toISODateString = (date) => {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
};

/**
 * Calculate estimated wait time based on queue position and service durations
 * @param {number} position - Queue position
 * @param {Array} queue - Array of queue items with service durations
 * @param {number} averageServiceTime - Average service time in minutes
 * @returns {string} - Formatted wait time
 */
export const calculateWaitTime = (position, queue = [], averageServiceTime = QUEUE_SETTINGS.AVERAGE_SERVICE_TIME) => {
  if (!queue || queue.length === 0 || position <= 0) {
    return "0 min";
  }
  
  let waitTimeMinutes = 0;
  
  // Sum up service durations for all appointments ahead in the queue
  for (let i = 0; i < Math.min(position - 1, queue.length); i++) {
    const appointment = queue[i];
    const serviceDuration = appointment.service?.duration || averageServiceTime;
    const addOnsDuration = calculateAddOnsDuration(appointment.add_ons_data);
    waitTimeMinutes += serviceDuration + addOnsDuration;
  }
  
  // Format wait time
  if (waitTimeMinutes < 60) {
    return `${waitTimeMinutes} min`;
  } else {
    const hours = Math.floor(waitTimeMinutes / 60);
    const minutes = waitTimeMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
};

/**
 * Calculate total duration for add-ons
 * @param {string} addOnsData - JSON string of add-on IDs
 * @returns {Promise<number>} - Total duration in minutes
 */
export const calculateAddOnsDuration = async (addOnsData) => {
  return await addOnsService.calculateAddOnsDuration(addOnsData);
};

/**
 * Calculate total price for add-ons
 * @param {string} addOnsData - JSON string of add-on IDs
 * @returns {Promise<number>} - Total price
 */
export const calculateAddOnsPrice = async (addOnsData) => {
  return await addOnsService.calculateAddOnsPrice(addOnsData);
};

/**
 * Get display text for multiple services
 * @param {object} appointment - Appointment object
 * @param {Array} services - Array of all available services
 * @returns {string} - Formatted services display text
 */
export const getServicesDisplay = (appointment, services = []) => {
  const servicesList = [];
  
  // Add primary service
  if (appointment.service) {
    servicesList.push(appointment.service.name);
  }
  
  // Add additional services
  if (appointment.services_data) {
    try {
      // Handle different data types
      let serviceIds;
      
      if (typeof appointment.services_data === 'string') {
        // Handle empty or invalid JSON strings
        if (appointment.services_data.trim() === '' || 
            appointment.services_data === '[]' || 
            appointment.services_data === 'null' || 
            appointment.services_data === 'undefined') {
          return servicesList.join(', ');
        }
        
        serviceIds = JSON.parse(appointment.services_data);
      } else if (Array.isArray(appointment.services_data)) {
        // Data is already an array
        serviceIds = appointment.services_data;
      } else {
        // Data is null, undefined, or other type
        return servicesList.join(', ');
      }
      
      if (Array.isArray(serviceIds)) {
        // Skip the first one as it's already added as primary service
        const additionalServiceIds = serviceIds.slice(1);
        
        additionalServiceIds.forEach(serviceId => {
          const service = services.find(s => s.id === serviceId);
          if (service) {
            servicesList.push(service.name);
          }
        });
        
        // If we couldn't find service details, just show count
        if (additionalServiceIds.length > 0 && servicesList.length === 1) {
          servicesList.push(`+${additionalServiceIds.length} more services`);
        }
      }
    } catch (e) {
      console.error('Error parsing services data:', e);
      // Return just the primary service if parsing fails
    }
  }
  
  return servicesList.join(', ');
};

/**
 * Get display text for add-ons
 * @param {string} addOnsData - JSON string of add-on IDs
 * @returns {Promise<string>} - Formatted add-ons display text
 */
export const getAddOnsDisplay = async (addOnsData) => {
  return await addOnsService.getAddOnsDisplay(addOnsData);
};

/**
 * Calculate total appointment price including services, add-ons, and fees
 * @param {object} appointment - Appointment object
 * @returns {number} - Total price
 */
export const calculateTotalPrice = (appointment) => {
  let total = appointment.total_price || appointment.service?.price || 0;
  
  // Add urgent fee if applicable
  if (appointment.is_urgent) {
    total += QUEUE_SETTINGS.URGENT_FEE;
  }
  
  return total;
};

/**
 * Calculate total appointment duration including services and add-ons
 * @param {object} appointment - Appointment object
 * @returns {number} - Total duration in minutes
 */
export const calculateTotalDuration = (appointment) => {
  let duration = appointment.total_duration || appointment.service?.duration || 0;
  
  // If total_duration is not available, calculate from add-ons
  if (!appointment.total_duration && appointment.add_ons_data) {
    duration += calculateAddOnsDuration(appointment.add_ons_data);
  }
  
  return duration;
};

/**
 * Get queue position for a customer
 * @param {string} appointmentId - Appointment ID
 * @param {Array} queue - Array of queued appointments
 * @returns {number|null} - Queue position or null if not found
 */
export const getQueuePosition = (appointmentId, queue) => {
  const index = queue.findIndex(apt => apt.id === appointmentId);
  return index >= 0 ? index + 1 : null;
};

/**
 * Check if barber is at full capacity
 * @param {number} currentAppointments - Current number of appointments
 * @param {number} maxCapacity - Maximum capacity (optional)
 * @returns {boolean} - Whether barber is at full capacity
 */
export const isBarberAtCapacity = (currentAppointments, maxCapacity = QUEUE_SETTINGS.DEFAULT_CAPACITY) => {
  return currentAppointments >= maxCapacity;
};

/**
 * Get next available queue number
 * @param {Array} queue - Current queue
 * @returns {number} - Next available queue number
 */
export const getNextQueueNumber = (queue) => {
  if (!queue || queue.length === 0) return 1;
  
  const maxQueueNumber = Math.max(
    0,
    ...queue.map(apt => apt.queue_position || 0)
  );
  
  return maxQueueNumber + 1;
};

/**
 * Validate booking data
 * @param {object} bookingData - Booking data to validate
 * @returns {object} - Validation result with isValid and errors
 */
export const validateBookingData = (bookingData) => {
  const errors = [];
  
  // Required fields
  if (!bookingData.barber_id) {
    errors.push('Barber is required');
  }
  
  if (!bookingData.services || bookingData.services.length === 0) {
    errors.push('At least one service is required');
  }
  
  if (!bookingData.appointment_date) {
    errors.push('Appointment date is required');
  }
  
  // Validate date is not in the past
  const appointmentDate = new Date(bookingData.appointment_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (appointmentDate < today) {
    errors.push('Appointment date cannot be in the past');
  }
  
  // Validate advance booking limit
  const maxAdvanceDays = BOOKING_SETTINGS.ADVANCE_BOOKING_DAYS;
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + maxAdvanceDays);
  
  if (appointmentDate > maxDate) {
    errors.push(`Cannot book more than ${maxAdvanceDays} days in advance`);
  }
  
  // Validate service count
  if (bookingData.services && bookingData.services.length > BOOKING_SETTINGS.MAX_SERVICES_PER_BOOKING) {
    errors.push(`Maximum ${BOOKING_SETTINGS.MAX_SERVICES_PER_BOOKING} services allowed per booking`);
  }
  
  // Validate add-ons count
  if (bookingData.addOns && bookingData.addOns.length > BOOKING_SETTINGS.MAX_ADDONS_PER_BOOKING) {
    errors.push(`Maximum ${BOOKING_SETTINGS.MAX_ADDONS_PER_BOOKING} add-ons allowed per booking`);
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Format queue status for display
 * @param {object} queueInfo - Queue information
 * @returns {string} - Formatted queue status
 */
export const formatQueueStatus = (queueInfo) => {
  if (!queueInfo) return 'Unknown';
  
  const { current, queue, capacity } = queueInfo;
  const queueLength = queue?.length || 0;
  
  if (current) {
    return `Serving customer • ${queueLength} waiting`;
  } else if (queueLength === 0) {
    return 'No queue';
  } else if (queueLength >= (capacity || QUEUE_SETTINGS.DEFAULT_CAPACITY)) {
    return `Queue full (${queueLength})`;
  } else {
    return `${queueLength} in queue`;
  }
};

/**
 * Get barber status color class
 * @param {string} status - Barber status
 * @returns {string} - CSS class for status color
 */
export const getBarberStatusColor = (status) => {
  const statusMap = {
    'available': 'success',
    'busy': 'warning',
    'break': 'info',
    'offline': 'secondary'
  };
  
  return statusMap[status?.toLowerCase()] || 'primary';
};

/**
 * Get appointment status color class
 * @param {string} status - Appointment status
 * @returns {string} - CSS class for status color
 */
export const getStatusColor = (status) => {
  const statusMap = {
    'pending': 'warning',
    'scheduled': 'info',
    'confirmed': 'success',
    'ongoing': 'primary',
    'done': 'success',
    'cancelled': 'danger'
  };
  
  return statusMap[status?.toLowerCase()] || 'secondary';
};

/**
 * Get appropriate icon for appointment status
 * @param {string} status - Appointment status
 * @returns {string} - Bootstrap icon class
 */
export const getStatusIcon = (status) => {
  const iconMap = {
    'pending': 'bi-clock-fill',
    'scheduled': 'bi-calendar-check',
    'confirmed': 'bi-check-circle',
    'ongoing': 'bi-scissors',
    'done': 'bi-check-circle-fill',
    'cancelled': 'bi-x-circle-fill'
  };
  
  return iconMap[status?.toLowerCase()] || 'bi-question-circle';
};

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
export const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  return `${text.substring(0, maxLength)}...`;
};

/**
 * Get initials from name
 * @param {string} name - Full name
 * @returns {string} - Initials
 */
export const getInitials = (name) => {
  if (!name) return '';
  
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();
};

/**
 * Check if two dates are the same day
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} - Whether the dates are the same day
 */
export const isSameDay = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

/**
 * Check if date is today
 * @param {Date|string} date - Date to check
 * @returns {boolean} - Whether the date is today
 */
export const isToday = (date) => {
  return isSameDay(date, new Date());
};

/**
 * Generate a random ID
 * @param {number} length - Length of the ID
 * @returns {string} - Random ID
 */
export const generateId = (length = 8) => {
  return Math.random().toString(36).substring(2, 2 + length);
};

/**
 * Deep clone an object
 * @param {object} obj - Object to clone
 * @returns {object} - Cloned object
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Download data as a CSV file
 * @param {Array} data - Array of objects to download
 * @param {string} filename - Filename for the CSV
 */
export const downloadCSV = (data, filename = 'download.csv') => {
  if (!data || !data.length) return;
  
  // Get headers from the first object
  const headers = Object.keys(data[0]);
  
  // Convert data to CSV format
  const csvRows = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(header => {
        const cell = row[header];
        // Handle commas and quotes in the data
        const cellStr = cell === null || cell === undefined ? '' : String(cell);
        return cellStr.includes(',') || cellStr.includes('"') 
          ? `"${cellStr.replace(/"/g, '""')}"` 
          : cellStr;
      }).join(',')
    )
  ];
  
  // Create CSV content
  const csvContent = csvRows.join('\n');
  
  // Create a blob and download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  // Create a temporary link and trigger download
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Calculate appointment analytics
 * @param {Array} appointments - Array of appointments
 * @returns {object} - Analytics data
 */
export const calculateAppointmentAnalytics = (appointments) => {
  if (!appointments || appointments.length === 0) {
    return {
      total: 0,
      completed: 0,
      cancelled: 0,
      pending: 0,
      revenue: 0,
      averageDuration: 0,
      completionRate: 0
    };
  }
  
  const analytics = {
    total: appointments.length,
    completed: 0,
    cancelled: 0,
    pending: 0,
    revenue: 0,
    totalDuration: 0
  };
  
  appointments.forEach(appointment => {
    switch (appointment.status) {
      case 'done':
        analytics.completed++;
        analytics.revenue += calculateTotalPrice(appointment);
        break;
      case 'cancelled':
        analytics.cancelled++;
        break;
      case 'pending':
        analytics.pending++;
        break;
    }
    
    analytics.totalDuration += calculateTotalDuration(appointment);
  });
  
  analytics.averageDuration = Math.round(analytics.totalDuration / appointments.length);
  analytics.completionRate = analytics.total > 0 ? (analytics.completed / analytics.total) * 100 : 0;
  
  return analytics;
};

// ==============================================
// APPOINTMENT DATA CLEANING UTILITIES
// ==============================================

/**
 * Clean services_data and add_ons_data from double-encoded JSON
 * @param {string} jsonString - The potentially double-encoded JSON string
 * @returns {Array} Clean array of IDs
 */
export const cleanJsonArray = (jsonString) => {
  if (!jsonString || jsonString === 'null' || jsonString === '[]') {
    return [];
  }

  try {
    // Handle double-encoded JSON like '"[\\"id1\\",\\"id2\\"]"'
    let cleaned = jsonString;
    
    // Remove outer quotes if present
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    
    // Fix escaped quotes
    cleaned = cleaned.replace(/\\"/g, '"');
    
    // Parse the JSON
    const parsed = JSON.parse(cleaned);
    
    // Ensure it's an array
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to parse JSON array:', jsonString, error);
    return [];
  }
};

/**
 * Parse boolean value from various formats
 * @param {any} value - Value to parse as boolean
 * @returns {boolean} Parsed boolean value
 */
export const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value);
};

/**
 * Clean appointment data from database
 * @param {Object} appointment - Raw appointment data from database
 * @returns {Object} Cleaned appointment data
 */
export const cleanAppointmentData = (appointment) => {
  if (!appointment) return null;

  return {
    ...appointment,
    // Clean JSON arrays
    services: cleanJsonArray(appointment.services_data),
    addOns: cleanJsonArray(appointment.add_ons_data),
    
    // Clean numeric fields
    totalDuration: appointment.total_duration ? parseInt(appointment.total_duration) : 0,
    totalPrice: appointment.total_price ? parseFloat(appointment.total_price) : 0,
    queueNumber: appointment.queue_position ? parseInt(appointment.queue_position) : null,
    rescheduleCount: appointment.reschedule_count ? parseInt(appointment.reschedule_count) : 0,
    
    // Clean boolean fields
    isUrgent: parseBoolean(appointment.is_urgent),
    isRebooking: parseBoolean(appointment.is_rebooking),
    isWalkIn: parseBoolean(appointment.is_walk_in),
    isDoubleBooking: parseBoolean(appointment.is_double_booking),
    isReviewed: parseBoolean(appointment.is_reviewed),
    
    // Clean rating
    customerRating: appointment.customer_rating ? parseInt(appointment.customer_rating) : null,
    
    // Remove the messy fields
    services_data: undefined,
    add_ons_data: undefined,
  };
};

/**
 * Validate appointment data before saving
 * @param {Object} appointmentData - Appointment data to validate
 * @returns {Object} Validation result with errors array
 */
export const validateAppointmentData = (appointmentData) => {
  const errors = [];

  // Required fields
  if (!appointmentData.customerId) errors.push('Customer ID is required');
  if (!appointmentData.barberId) errors.push('Barber ID is required');
  if (!appointmentData.appointmentDate) errors.push('Appointment date is required');
  if (!appointmentData.selectedServices?.length) errors.push('At least one service is required');

  // Data type validations
  if (appointmentData.totalPrice && isNaN(parseFloat(appointmentData.totalPrice))) {
    errors.push('Total price must be a valid number');
  }
  if (appointmentData.totalDuration && isNaN(parseInt(appointmentData.totalDuration))) {
    errors.push('Total duration must be a valid number');
  }
  if (appointmentData.customerRating && (appointmentData.customerRating < 1 || appointmentData.customerRating > 5)) {
    errors.push('Customer rating must be between 1 and 5');
  }

  // Date validations
  if (appointmentData.appointmentDate) {
    const appointmentDate = new Date(appointmentData.appointmentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (appointmentDate < today) {
      errors.push('Appointment date cannot be in the past');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ==============================================
// REBOOKING DATA HELPER UTILITIES
// ==============================================

/**
 * Parse services data from database format
 * @param {string} servicesData - JSON string from services_data field
 * @returns {Array} Array of service IDs
 */
export const parseServicesData = (servicesData) => {
  if (!servicesData || servicesData === 'null' || servicesData === '[]') {
    return [];
  }

  try {
    // Handle double-encoded JSON
    let cleaned = servicesData;
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).replace(/\\"/g, '"');
    }
    
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to parse services_data:', servicesData, error);
    return [];
  }
};

/**
 * Parse add-ons data from database format
 * @param {string} addOnsData - JSON string from add_ons_data field
 * @returns {Array} Array of add-on IDs
 */
export const parseAddOnsData = (addOnsData) => {
  if (!addOnsData || addOnsData === 'null' || addOnsData === '[]') {
    return [];
  }

  try {
    // Handle double-encoded JSON
    let cleaned = addOnsData;
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).replace(/\\"/g, '"');
    }
    
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to parse add_ons_data:', addOnsData, error);
    return [];
  }
};

/**
 * Map legacy addon names to their corresponding UUIDs
 * @param {Array} addonIds - Array of addon IDs (may contain legacy names)
 * @param {Array} addOnsList - Array of addon objects from database
 * @returns {Array} Array of mapped addon IDs (UUIDs)
 */
export const mapLegacyAddonIds = (addonIds, addOnsList) => {
  if (!Array.isArray(addonIds) || !Array.isArray(addOnsList)) {
    return [];
  }

  // Legacy mapping for addon names to proper addon data
  const legacyMapping = {
    'addon1': 'Beard Trim',
    'addon2': 'Hot Towel Treatment',
    'addon3': 'Scalp Massage',
    'addon4': 'Hair Wash',
    'addon5': 'Styling',
    'addon6': 'Hair Wax Application',
    'addon7': 'Eyebrow Trim',
    'addon8': 'Mustache Trim',
    'addon9': 'Face Mask',
    'addon10': 'Hair Treatment'
  };

  return addonIds.map(addonId => {
    // If it's already a UUID, return as is
    if (typeof addonId === 'string' && addonId.length === 36 && addonId.includes('-')) {
      return addonId;
    }

    // If it's a legacy name, try to find the corresponding UUID
    if (typeof addonId === 'string' && addonId.startsWith('addon')) {
      const addonName = legacyMapping[addonId];
      if (addonName) {
        const addon = addOnsList.find(a => a.name === addonName);
        if (addon) {
          console.log(`🔄 Mapped ${addonId} → ${addon.id} (${addon.name})`);
          return addon.id;
        }
      }
    }

    // If we can't map it, return the original ID
    return addonId;
  }).filter(Boolean); // Remove any null/undefined values
};

/**
 * Calculate total price for services and add-ons (rebooking version)
 * @param {Array} selectedServices - Array of service IDs
 * @param {Array} selectedAddOns - Array of add-on IDs
 * @param {Array} servicesList - Array of service objects
 * @param {Array} addOnsList - Array of add-on objects
 * @returns {Object} Price breakdown and total
 */
export const calculateRebookingPrice = (selectedServices, selectedAddOns, servicesList, addOnsList) => {
  const servicesTotal = selectedServices.reduce((total, serviceId) => {
    const service = servicesList.find(s => s.id === serviceId);
    return total + (service?.price || 0);
  }, 0);
  
  const addOnsTotal = selectedAddOns.reduce((total, addonId) => {
    const addon = addOnsList.find(a => a.id === addonId);
    return total + (addon?.price || 0);
  }, 0);

  return {
    servicesTotal,
    addOnsTotal,
    total: servicesTotal + addOnsTotal
  };
};

/**
 * Calculate total duration for services and add-ons (rebooking version)
 * @param {Array} selectedServices - Array of service IDs
 * @param {Array} selectedAddOns - Array of add-on IDs
 * @param {Array} servicesList - Array of service objects
 * @param {Array} addOnsList - Array of add-on objects
 * @returns {number} Total duration in minutes
 */
export const calculateRebookingDuration = (selectedServices, selectedAddOns, servicesList, addOnsList) => {
  const servicesDuration = selectedServices.reduce((total, serviceId) => {
    const service = servicesList.find(s => s.id === serviceId);
    return total + (service?.duration || service?.duration_minutes || 30);
  }, 0);
  
  const addOnsDuration = selectedAddOns.reduce((total, addonId) => {
    const addon = addOnsList.find(a => a.id === addonId);
    return total + (addon?.duration || 15);
  }, 0);

  return servicesDuration + addOnsDuration;
};

/**
 * Validate rebooking data
 * @param {Object} appointmentData - Raw appointment data from database
 * @param {Array} servicesList - Available services
 * @param {Array} addOnsList - Available add-ons
 * @returns {Object} Validation result
 */
export const validateRebookingData = (appointmentData, servicesList, addOnsList) => {
  const errors = [];
  const warnings = [];

  // Parse the data
  const selectedServices = parseServicesData(appointmentData.services_data);
  const selectedAddOns = parseAddOnsData(appointmentData.add_ons_data);

  // Validate services
  selectedServices.forEach(serviceId => {
    const service = servicesList.find(s => s.id === serviceId);
    if (!service) {
      errors.push(`Service with ID ${serviceId} not found`);
    } else if (!service.is_active) {
      warnings.push(`Service "${service.name}" is not active`);
    }
  });

  // Validate add-ons
  selectedAddOns.forEach(addonId => {
    const addon = addOnsList.find(a => a.id === addonId);
    if (!addon) {
      errors.push(`Add-on with ID ${addonId} not found`);
    } else if (!addon.is_active) {
      warnings.push(`Add-on "${addon.name}" is not active`);
    }
  });

  // Check for legacy add-on names
  const legacyAddonNames = selectedAddOns.filter(id => 
    typeof id === 'string' && id.startsWith('addon')
  );
  if (legacyAddonNames.length > 0) {
    warnings.push(`Found legacy add-on names: ${legacyAddonNames.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    selectedServices,
    selectedAddOns,
    hasLegacyData: legacyAddonNames.length > 0
  };
};

/**
 * Get rebooking summary
 * @param {Object} appointmentData - Raw appointment data
 * @param {Array} servicesList - Available services
 * @param {Array} addOnsList - Available add-ons
 * @returns {Object} Rebooking summary
 */
export const getRebookingSummary = (appointmentData, servicesList, addOnsList) => {
  const selectedServices = parseServicesData(appointmentData.services_data);
  const selectedAddOns = parseAddOnsData(appointmentData.add_ons_data);
  
  const priceBreakdown = calculateRebookingPrice(selectedServices, selectedAddOns, servicesList, addOnsList);
  const totalDuration = calculateRebookingDuration(selectedServices, selectedAddOns, servicesList, addOnsList);
  
  const services = selectedServices.map(id => 
    servicesList.find(s => s.id === id)
  ).filter(Boolean);
  
  const addOns = selectedAddOns.map(id => 
    addOnsList.find(a => a.id === id)
  ).filter(Boolean);

  return {
    selectedServices,
    selectedAddOns,
    services,
    addOns,
    priceBreakdown,
    totalDuration,
    originalPrice: appointmentData.total_price || 0,
    priceDifference: priceBreakdown.total - (appointmentData.total_price || 0)
  };
};

export default {
  formatDate,
  formatTime,
  formatDuration,
  formatPrice,
  getTodayISOString,
  calculateWaitTime,
  calculateAddOnsDuration,
  calculateAddOnsPrice,
  getServicesDisplay,
  getAddOnsDisplay,
  calculateTotalPrice,
  calculateTotalDuration,
  getQueuePosition,
  isBarberAtCapacity,
  getNextQueueNumber,
  validateBookingData,
  formatQueueStatus,
  getBarberStatusColor,
  getStatusColor,
  getStatusIcon,
  truncateText,
  getInitials,
  isSameDay,
  isToday,
  generateId,
  deepClone,
  debounce,
  downloadCSV,
  calculateAppointmentAnalytics,
  // Appointment data cleaning utilities
  cleanJsonArray,
  parseBoolean,
  cleanAppointmentData,
  validateAppointmentData,
  // Rebooking data helper utilities
  parseServicesData,
  parseAddOnsData,
  mapLegacyAddonIds,
  calculateRebookingPrice,
  calculateRebookingDuration,
  validateRebookingData,
  getRebookingSummary
};