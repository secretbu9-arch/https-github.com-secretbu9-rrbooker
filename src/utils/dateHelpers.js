// utils/dateHelpers.js
/**
 * Date Helper Utilities
 * Prevents timezone issues when working with dates
 */

/**
 * Format a Date object to YYYY-MM-DD string using local timezone
 * This prevents the timezone shift issue that occurs with toISOString()
 * 
 * @param {Date} date - The date object to format
 * @returns {string} Date in YYYY-MM-DD format (local timezone)
 * 
 * @example
 * const date = new Date('2025-10-06');
 * formatDateLocal(date); // Returns '2025-10-06' (not shifted by timezone)
 */
export const formatDateLocal = (date) => {
  if (!date || !(date instanceof Date)) {
    console.warn('Invalid date provided to formatDateLocal:', date);
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 * 
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export const getTodayLocal = () => {
  return formatDateLocal(new Date());
};

/**
 * Parse a date string (YYYY-MM-DD) to a Date object at midnight local time
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object at midnight local time
 */
export const parseDateLocal = (dateString) => {
  if (!dateString) return null;
  
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // Month is 0-indexed
};

/**
 * Compare two dates (ignoring time)
 * 
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} True if dates are the same day
 */
export const isSameDay = (date1, date2) => {
  const d1 = date1 instanceof Date ? date1 : parseDateLocal(date1);
  const d2 = date2 instanceof Date ? date2 : parseDateLocal(date2);
  
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

/**
 * Get start of week (Sunday) for a given date
 * 
 * @param {Date} date - Reference date
 * @returns {Date} Start of week (Sunday)
 */
export const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

/**
 * Get end of week (Saturday) for a given date
 * 
 * @param {Date} date - Reference date
 * @returns {Date} End of week (Saturday)
 */
export const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
};

/**
 * Get array of dates for the week containing the given date
 * 
 * @param {Date} date - Reference date
 * @returns {Array<Date>} Array of 7 dates (Sunday to Saturday)
 */
export const getWeekDays = (date) => {
  const start = getStartOfWeek(date);
  const days = [];
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  
  return days;
};

/**
 * Add days to a date
 * 
 * @param {Date} date - Starting date
 * @param {number} days - Number of days to add (can be negative)
 * @returns {Date} New date
 */
export const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Check if a date is in the past (before today)
 * 
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is in the past
 */
export const isPastDate = (date) => {
  const d = date instanceof Date ? date : parseDateLocal(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  
  return d < today;
};

/**
 * Check if a date is today
 * 
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today
 */
export const isToday = (date) => {
  return isSameDay(date, new Date());
};

/**
 * Format date for display (e.g., "October 6, 2025")
 * 
 * @param {Date|string} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatDateDisplay = (date, options = {}) => {
  const d = date instanceof Date ? date : parseDateLocal(date);
  
  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  
  return d.toLocaleDateString('en-US', { ...defaultOptions, ...options });
};

/**
 * Format date for display with weekday (e.g., "Monday, October 6, 2025")
 * 
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string with weekday
 */
export const formatDateWithWeekday = (date) => {
  return formatDateDisplay(date, { weekday: 'long' });
};

/**
 * Get date range string (e.g., "Oct 5 - Oct 11, 2025")
 * 
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {string} Formatted date range string
 */
export const formatDateRange = (startDate, endDate) => {
  const start = startDate instanceof Date ? startDate : parseDateLocal(startDate);
  const end = endDate instanceof Date ? endDate : parseDateLocal(endDate);
  
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  return `${startStr} - ${endStr}`;
};

/**
 * Prevent timezone issues when converting date to ISO format
 * Returns YYYY-MM-DD in local timezone (not UTC)
 * 
 * @deprecated Use formatDateLocal instead
 * @param {Date} date - Date object
 * @returns {string} Date in YYYY-MM-DD format
 */
export const toLocalISODate = (date) => {
  console.warn('toLocalISODate is deprecated. Use formatDateLocal instead.');
  return formatDateLocal(date);
};

// Export a default object with all functions
export default {
  formatDateLocal,
  getTodayLocal,
  parseDateLocal,
  isSameDay,
  getStartOfWeek,
  getEndOfWeek,
  getWeekDays,
  addDays,
  isPastDate,
  isToday,
  formatDateDisplay,
  formatDateWithWeekday,
  formatDateRange,
  toLocalISODate
};

