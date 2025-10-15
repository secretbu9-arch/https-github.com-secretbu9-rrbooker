// utils/validators.js

/**
 * Validate an email address
 * @param {string} email - Email to validate
 * @returns {boolean} - Whether the email is valid
 */
export const isValidEmail = (email) => {
  if (!email) return false;
  
  // Email regex pattern
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailPattern.test(email);
};

/**
 * Validate a password (at least 6 characters with at least one number and one letter)
 * @param {string} password - Password to validate
 * @returns {boolean} - Whether the password is valid
 */
export const isValidPassword = (password) => {
  if (!password) return false;
  
  // At least 6 characters, at least one letter and one number
  return password.length >= 6 && 
         /[a-zA-Z]/.test(password) && 
         /[0-9]/.test(password);
};

/**
 * Get password strength (1-5)
 * @param {string} password - Password to check
 * @returns {number} - Password strength (1-5)
 */
export const getPasswordStrength = (password) => {
  if (!password) return 0;
  
  let strength = 0;
  
  // Length check
  if (password.length >= 6) strength += 1;
  if (password.length >= 10) strength += 1;
  
  // Character type checks
  if (/[a-z]/.test(password)) strength += 1; // Lowercase
  if (/[A-Z]/.test(password)) strength += 1; // Uppercase
  if (/[0-9]/.test(password)) strength += 1; // Numbers
  if (/[^a-zA-Z0-9]/.test(password)) strength += 1; // Special characters
  
  // Cap at 5
  return Math.min(5, strength);
};

/**
 * Validate a phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - Whether the phone number is valid
 */
export const isValidPhone = (phone) => {
  if (!phone) return false;
  
  // Remove non-numeric characters
  const cleanedPhone = phone.replace(/\D/g, '');
  
  // Check length (7-15 digits to accommodate international numbers)
  return cleanedPhone.length >= 7 && cleanedPhone.length <= 15;
};

/**
 * Validate a name (at least 2 characters, only letters, spaces, hyphens, and apostrophes)
 * @param {string} name - Name to validate
 * @returns {boolean} - Whether the name is valid
 */
export const isValidName = (name) => {
  if (!name) return false;
  
  // Allow letters, spaces, hyphens, and apostrophes
  const namePattern = /^[a-zA-Z\s\-']+$/;
  return name.length >= 2 && namePattern.test(name);
};

/**
 * Validate a date string (YYYY-MM-DD)
 * @param {string} dateString - Date string to validate
 * @returns {boolean} - Whether the date string is valid
 */
export const isValidDateString = (dateString) => {
  if (!dateString) return false;
  
  // Check format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  
  // Check if it's a valid date
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return false;
  
  // Parse parts to validate month and day
  const [year, month, day] = dateString.split('-').map(Number);
  
  // Create a new date with the parsed values and check if it matches the input
  const reconstructed = new Date(year, month - 1, day);
  return reconstructed.getFullYear() === year &&
         reconstructed.getMonth() === month - 1 &&
         reconstructed.getDate() === day;
};

/**
 * Validate a time string (HH:MM)
 * @param {string} timeString - Time string to validate
 * @returns {boolean} - Whether the time string is valid
 */
export const isValidTimeString = (timeString) => {
  if (!timeString) return false;
  
  // Check format
  if (!/^\d{2}:\d{2}$/.test(timeString)) return false;
  
  // Parse hours and minutes
  const [hours, minutes] = timeString.split(':').map(Number);
  
  // Check if hours and minutes are valid
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

/**
 * Validate a price (positive number with up to 2 decimal places)
 * @param {string|number} price - Price to validate
 * @returns {boolean} - Whether the price is valid
 */
export const isValidPrice = (price) => {
  if (price === undefined || price === null || price === '') return false;
  
  // Convert to number if string
  const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  // Check if it's a valid number
  if (isNaN(numericPrice)) return false;
  
  // Check if it's positive
  if (numericPrice < 0) return false;
  
  // Check for at most 2 decimal places
  const decimalPlaces = numericPrice.toString().includes('.')
    ? numericPrice.toString().split('.')[1].length
    : 0;
  
  return decimalPlaces <= 2;
};

/**
 * Validate an image file type
 * @param {File} file - File to validate
 * @returns {boolean} - Whether the file is a valid image
 */
export const isValidImageFile = (file) => {
  if (!file) return false;
  
  // Check file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  return validTypes.includes(file.type);
};

/**
 * Validate file size
 * @param {File} file - File to validate
 * @param {number} maxSizeInMB - Maximum file size in MB
 * @returns {boolean} - Whether the file size is valid
 */
export const isValidFileSize = (file, maxSizeInMB = 5) => {
  if (!file) return false;
  
  // Convert maxSizeInMB to bytes
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  
  return file.size <= maxSizeInBytes;
};

/**
 * Validate form data
 * @param {object} data - Form data to validate
 * @param {object} rules - Validation rules
 * @returns {object} - Validation result
 */
export const validateForm = (data, rules) => {
  const errors = {};
  let isValid = true;
  
  // Apply each validation rule
  for (const [field, fieldRules] of Object.entries(rules)) {
    for (const rule of fieldRules) {
      if (typeof rule === 'function') {
        // Custom validator function
        const result = rule(data[field], data);
        if (result !== true) {
          errors[field] = result;
          isValid = false;
          break;
        }
      } else if (rule.validator && typeof rule.validator === 'function') {
        // Object with validator function and message
        if (!rule.validator(data[field], data)) {
          errors[field] = rule.message || 'Invalid value';
          isValid = false;
          break;
        }
      }
    }
  }
  
  return { isValid, errors };
};

/**
 * Create common validation rules
 */
export const rules = {
  required: (value) => !!value || 'This field is required',
  email: (value) => isValidEmail(value) || 'Invalid email address',
  password: (value) => isValidPassword(value) || 'Password must be at least 6 characters with at least one letter and one number',
  phone: (value) => !value || isValidPhone(value) || 'Invalid phone number',
  name: (value) => isValidName(value) || 'Invalid name',
  date: (value) => isValidDateString(value) || 'Invalid date format (YYYY-MM-DD)',
  time: (value) => isValidTimeString(value) || 'Invalid time format (HH:MM)',
  price: (value) => isValidPrice(value) || 'Invalid price (positive number with up to 2 decimal places)',
  minLength: (min) => (value) => 
    !value || value.length >= min || `Minimum length is ${min} characters`,
  maxLength: (max) => (value) => 
    !value || value.length <= max || `Maximum length is ${max} characters`,
  match: (field, fieldName) => (value, allValues) => 
    value === allValues[field] || `Must match ${fieldName || field}`,
  futureDate: (value) => {
    if (!value) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(value);
    return date >= today || 'Date must be in the future';
  },
  minValue: (min) => (value) => 
    !value || parseFloat(value) >= min || `Minimum value is ${min}`,
  maxValue: (max) => (value) => 
    !value || parseFloat(value) <= max || `Maximum value is ${max}`,
  integer: (value) => 
    !value || Number.isInteger(Number(value)) || 'Must be an integer',
  positiveNumber: (value) => 
    !value || Number(value) > 0 || 'Must be a positive number',
  nonNegativeNumber: (value) => 
    !value || Number(value) >= 0 || 'Must be zero or positive'
};

export default {
  isValidEmail,
  isValidPassword,
  getPasswordStrength,
  isValidPhone,
  isValidName,
  isValidDateString,
  isValidTimeString,
  isValidPrice,
  isValidImageFile,
  isValidFileSize,
  validateForm,
  rules
};