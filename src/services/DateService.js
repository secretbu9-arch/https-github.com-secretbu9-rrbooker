/**
 * DateService - Robust date and timezone handling for the barber booking system
 * Handles all date-related operations with proper timezone support
 */

class DateService {
  constructor() {
    // Default timezone - can be configured per barber or business
    this.defaultTimezone = 'Asia/Manila'; // Philippines timezone
    this.businessHours = {
      start: '08:00', // 8:00 AM - Start of morning session
      end: '17:00'    // 5:00 PM - End of afternoon session
    };
  }

  /**
   * Get current date in multiple formats for debugging and comparison
   * @returns {Object} Object containing different date formats
   */
  getCurrentDateFormats() {
    const now = new Date();
    
    return {
      // ISO formats
      iso: now.toISOString(),
      isoDate: now.toISOString().split('T')[0],
      isoDateTime: now.toISOString().replace('T', ' ').split('.')[0],
      
      // Local formats
      localDate: now.toLocaleDateString('en-CA'), // YYYY-MM-DD
      localDateTime: now.toLocaleString('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }),
      
      // Timezone-aware formats
      timezoneDate: this.formatDateForTimezone(now, this.defaultTimezone),
      timezoneDateTime: this.formatDateTimeForTimezone(now, this.defaultTimezone),
      
      // Raw date object
      raw: now,
      
      // Timestamps
      timestamp: now.getTime(),
      unix: Math.floor(now.getTime() / 1000)
    };
  }

  /**
   * Format date for a specific timezone
   * @param {Date} date - Date object
   * @param {string} timezone - Timezone string (e.g., 'Asia/Manila')
   * @returns {string} Formatted date string
   */
  formatDateForTimezone(date, timezone = this.defaultTimezone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
    } catch (error) {
      console.warn('Error formatting date for timezone:', error);
      return date.toISOString().split('T')[0];
    }
  }

  /**
   * Format date and time for a specific timezone
   * @param {Date} date - Date object
   * @param {string} timezone - Timezone string
   * @returns {string} Formatted datetime string
   */
  formatDateTimeForTimezone(date, timezone = this.defaultTimezone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(date);
    } catch (error) {
      console.warn('Error formatting datetime for timezone:', error);
      return date.toISOString().replace('T', ' ').split('.')[0];
    }
  }

  /**
   * Get today's date in the business timezone
   * @param {string} timezone - Optional timezone override
   * @returns {string} Today's date in YYYY-MM-DD format
   */
  getTodayDate(timezone = this.defaultTimezone) {
    const now = new Date();
    return this.formatDateForTimezone(now, timezone);
  }

  /**
   * Get start and end of day in business timezone
   * @param {string} date - Date string (YYYY-MM-DD)
   * @param {string} timezone - Optional timezone override
   * @returns {Object} Start and end datetime objects
   */
  getDayBoundaries(date, timezone = this.defaultTimezone) {
    try {
      // Create date in the business timezone
      const startOfDay = new Date(`${date}T00:00:00`);
      const endOfDay = new Date(`${date}T23:59:59.999`);
      
      return {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString(),
        startLocal: this.formatDateTimeForTimezone(startOfDay, timezone),
        endLocal: this.formatDateTimeForTimezone(endOfDay, timezone)
      };
    } catch (error) {
      console.error('Error getting day boundaries:', error);
      return {
        start: `${date}T00:00:00.000Z`,
        end: `${date}T23:59:59.999Z`,
        startLocal: `${date} 00:00:00`,
        endLocal: `${date} 23:59:59`
      };
    }
  }

  /**
   * Validate and normalize date string
   * @param {string} dateString - Date string to validate
   * @returns {Object} Validation result with normalized date
   */
  validateAndNormalizeDate(dateString) {
    const result = {
      isValid: false,
      normalized: null,
      original: dateString,
      error: null,
      formats: null
    };

    if (!dateString) {
      result.error = 'Date string is empty or null';
      return result;
    }

    try {
      // Try different date parsing methods
      const date = new Date(dateString);
      
      if (isNaN(date.getTime())) {
        result.error = 'Invalid date format';
        return result;
      }

      // Get normalized formats
      result.formats = this.getCurrentDateFormats();
      result.normalized = date.toISOString().split('T')[0];
      result.isValid = true;

    } catch (error) {
      result.error = `Date parsing error: ${error.message}`;
    }

    return result;
  }

  /**
   * Compare dates with timezone awareness
   * @param {string} date1 - First date
   * @param {string} date2 - Second date
   * @returns {Object} Comparison result
   */
  compareDates(date1, date2) {
    try {
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      
      const diff = d1.getTime() - d2.getTime();
      
      return {
        date1: date1,
        date2: date2,
        difference: diff,
        isEqual: diff === 0,
        isDate1Before: diff < 0,
        isDate1After: diff > 0,
        daysDifference: Math.floor(diff / (1000 * 60 * 60 * 24))
      };
    } catch (error) {
      return {
        date1: date1,
        date2: date2,
        error: error.message,
        isEqual: false,
        isDate1Before: false,
        isDate1After: false
      };
    }
  }

  /**
   * Get week boundaries for a given date
   * @param {string} date - Date string
   * @returns {Object} Week start and end dates
   */
  getWeekBoundaries(date) {
    try {
      const targetDate = new Date(date);
      const dayOfWeek = targetDate.getDay();
      
      // Calculate Monday (start of week)
      const monday = new Date(targetDate);
      monday.setDate(targetDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      
      // Calculate Sunday (end of week)
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      
      return {
        start: monday.toISOString().split('T')[0],
        end: sunday.toISOString().split('T')[0],
        startDate: monday,
        endDate: sunday
      };
    } catch (error) {
      console.error('Error calculating week boundaries:', error);
      return {
        start: date,
        end: date,
        startDate: new Date(date),
        endDate: new Date(date)
      };
    }
  }

  /**
   * Debug date information for troubleshooting
   * @param {string} dateString - Date to debug
   * @returns {Object} Comprehensive date debug information
   */
  debugDate(dateString) {
    const currentFormats = this.getCurrentDateFormats();
    const validation = this.validateAndNormalizeDate(dateString);
    
    return {
      input: dateString,
      currentTime: currentFormats,
      validation: validation,
      comparison: validation.isValid ? this.compareDates(dateString, currentFormats.isoDate) : null,
      timezone: this.defaultTimezone,
      businessHours: this.businessHours
    };
  }

  /**
   * Set business timezone
   * @param {string} timezone - Timezone string
   */
  setTimezone(timezone) {
    this.defaultTimezone = timezone;
  }

  /**
   * Set business hours
   * @param {string} start - Start time (HH:MM)
   * @param {string} end - End time (HH:MM)
   */
  setBusinessHours(start, end) {
    this.businessHours = { start, end };
  }
}

// Create singleton instance
const dateService = new DateService();
export default dateService;
