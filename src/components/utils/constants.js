// utils/constants.js (Enhanced with new features)

// User roles
export const ROLES = {
  MANAGER: 'manager',
  BARBER: 'barber',
  CUSTOMER: 'customer'
};

// Appointment statuses (Enhanced)
export const APPOINTMENT_STATUS = {
  PENDING: 'pending',      // New: Waiting for barber confirmation
  SCHEDULED: 'scheduled',  // Confirmed appointments use 'scheduled' status
  CONFIRMED: 'confirmed',  // Added: Confirmed by barber
  ONGOING: 'ongoing',
  DONE: 'done',
  CANCELLED: 'cancelled'
};

// Notification types (Enhanced)
export const NOTIFICATION_TYPES = {
  APPOINTMENT: 'appointment',
  QUEUE: 'queue',
  REMINDER: 'reminder',
  SYSTEM: 'system',
  BOOKING_REQUEST: 'booking_request',        // New
  APPOINTMENT_CONFIRMED: 'appointment_confirmed',  // New
  APPOINTMENT_DECLINED: 'appointment_declined',    // New
  APPOINTMENT_CANCELLED: 'appointment_cancelled',  // New
  URGENT_BOOKING: 'urgent_booking'          // New
};

// Order statuses
export const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Face shapes for haircut recommendations
export const FACE_SHAPES = [
  'Round',
  'Oval',
  'Square',
  'Heart',
  'Long',
  'Diamond'
];

// Product categories
export const PRODUCT_CATEGORIES = [
  'Hair Care',
  'Styling',
  'Beard Care',
  'Tools',
  'Accessories'
];

// Add-ons are now fetched from database via AddOnsService

// Queue settings (New)
export const QUEUE_SETTINGS = {
  DEFAULT_CAPACITY: 15,        // Max customers per barber per day
  AVERAGE_SERVICE_TIME: 35,    // Minutes per customer
  URGENT_FEE: 100,            // Additional fee for urgent bookings
  MAX_QUEUE_DISPLAY: 20,      // Max queue items to display at once
  REFRESH_INTERVAL: 30000,    // Auto-refresh interval in milliseconds
  WARNING_THRESHOLD: 12       // Queue capacity warning threshold
};

// Booking settings (New)
export const BOOKING_SETTINGS = {
  MAX_SERVICES_PER_BOOKING: 5,     // Max services in one booking
  MAX_ADDONS_PER_BOOKING: 8,       // Max add-ons in one booking
  ADVANCE_BOOKING_DAYS: 30,        // Max days in advance to book
  CANCELLATION_HOURS: 2,           // Hours before appointment to allow cancellation
  RESCHEDULE_LIMIT: 3,             // Max reschedules per appointment
  URGENT_QUEUE_POSITION: 1         // Position for urgent bookings
};

// Time slots for appointments (Deprecated - Using queue system)
export const TIME_SLOTS = (() => {
  const slots = [];
  
  // Morning slots: 8:00 AM - 11:30 AM
  for (let hour = 8; hour <= 11; hour++) {
    for (let minute of ['00', '30']) {
      // End at 11:30 AM
      if (hour === 11 && minute === '30') {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute}`);
        break;
      }
      slots.push(`${hour.toString().padStart(2, '0')}:${minute}`);
    }
  }
  
  // Afternoon slots: 1:00 PM - 4:30 PM
  for (let hour = 13; hour <= 16; hour++) {
    for (let minute of ['00', '30']) {
      // End at 4:30 PM (last slot at 4:00 PM for 30-min service ending at 4:30 PM)
      if (hour === 16 && minute === '30') break;
      slots.push(`${hour.toString().padStart(2, '0')}:${minute}`);
    }
  }
  
  return slots;
})();

// Date format options
export const DATE_FORMATS = {
  SHORT: { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  },
  MEDIUM: { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  },
  LONG: { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  },
  TIME: { 
    hour: '2-digit', 
    minute: '2-digit' 
  },
  DATETIME: { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  }
};

// Routes configuration (Enhanced)
export const ROUTES = {
  // Auth routes
  LOGIN: '/login',
  REGISTER: '/register',
  RESET_PASSWORD: '/reset-password',
  
  // Dashboard routes
  DASHBOARD: '/dashboard',
  
  // Customer routes
  BOOK_APPOINTMENT: '/book',
  MY_APPOINTMENTS: '/appointments',
  HAIRCUT_RECOMMENDER: '/haircut-recommender',
  SHOP_PRODUCTS: '/products',
  CART: '/cart',
  PROFILE: '/profile',
  QUEUE_STATUS: '/queue-status',        // New
  APPOINTMENT_HISTORY: '/history',      // New
  
  // Barber routes
  SCHEDULE: '/schedule',
  QUEUE: '/queue',
  PENDING_REQUESTS: '/pending',         // New
  BARBER_PROFILE: '/barber-profile',    // New
  DAY_OFF_MANAGER: '/day-off-manager',  // New
  
  // Manager routes
  MANAGE_BARBERS: '/manage/barbers',
  MANAGE_SERVICES: '/manage/services',
  MANAGE_PRODUCTS: '/manage/products',
  MANAGE_APPOINTMENTS: '/manage/appointments',
  MANAGE_QUEUE: '/manage/queue',        // New
  REPORTS: '/reports',
  ANALYTICS: '/analytics',              // New
  
  // Common routes
  SETTINGS: '/settings',
  DEBUG: '/debug',
  NOTIFICATIONS: '/notifications'
};

// Local storage keys
export const STORAGE_KEYS = {
  CART: 'cart',
  THEME: 'theme',
  RECENT_SEARCHES: 'recent_searches',
  USER_PREFERENCES: 'user_preferences',
  QUEUE_PREFERENCES: 'queue_preferences',    // New
  BOOKING_DRAFT: 'booking_draft'             // New
};

// API endpoints (for external APIs if used)
export const API_ENDPOINTS = {
  FACE_DETECTION: 'https://api.example.com/face-detection',
  SMS_NOTIFICATIONS: 'https://api.example.com/sms',      // New
  PUSH_NOTIFICATIONS: 'https://api.example.com/push'     // New
};

// Error messages (Enhanced)
export const ERROR_MESSAGES = {
  AUTHENTICATION: 'Authentication failed. Please check your credentials and try again.',
  NETWORK: 'Network error. Please check your connection and try again.',
  PERMISSION: 'You do not have permission to perform this action.',
  VALIDATION: 'Please check your input and try again.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER: 'Server error. Please try again later.',
  UNKNOWN: 'An unknown error occurred. Please try again.',
  QUEUE_FULL: 'The barber\'s queue is full. Please try another barber or time.',        // New
  BOOKING_CONFLICT: 'There is a conflict with your booking. Please refresh and try again.',  // New
  CANCELLATION_TOO_LATE: 'Cannot cancel appointment less than 2 hours before scheduled time.',  // New
  MAX_RESCHEDULES: 'Maximum reschedule limit reached for this appointment.'            // New
};

// Success messages (Enhanced)
export const SUCCESS_MESSAGES = {
  AUTHENTICATION: 'Authentication successful.',
  CREATE: 'Created successfully.',
  UPDATE: 'Updated successfully.',
  DELETE: 'Deleted successfully.',
  APPOINTMENT_BOOKED: 'Your appointment request has been sent to the barber.',         // Updated
  APPOINTMENT_CONFIRMED: 'Your appointment has been confirmed by the barber.',         // New
  APPOINTMENT_CANCELLED: 'Your appointment has been cancelled.',
  APPOINTMENT_COMPLETED: 'Appointment marked as completed.',
  URGENT_BOOKING: 'Urgent booking request sent. You will be prioritized in the queue.',  // New
  RESCHEDULE_SUCCESS: 'Appointment rescheduled successfully.',                         // New
  ORDER_PLACED: 'Your order has been placed successfully.',
  SETTINGS_SAVED: 'Your settings have been saved.'
};

// App settings (Enhanced)
export const APP_SETTINGS = {
  APP_NAME: 'R&RBooker',
  COMPANY_NAME: 'Raf and Rok Barbershop',
  CONTACT_EMAIL: 'contact@rnrbooker.com',
  CONTACT_PHONE: '+1234567890',
  COPYRIGHT_YEAR: new Date().getFullYear(),
  VERSION: '2.0.0',                     // Updated version
  SESSION_TIMEOUT: 30 * 60 * 1000,     // 30 minutes in milliseconds
  SESSION_WARNING: 5 * 60 * 1000,      // 5 minutes warning before timeout
  ITEMS_PER_PAGE: 10,                   // Default pagination
  QUEUE_UPDATE_INTERVAL: 30000,         // Queue update interval
  NOTIFICATION_TIMEOUT: 5000,           // Notification display timeout
  MAX_FILE_SIZE: 5 * 1024 * 1024       // 5MB max file upload
};

// Theme colors
export const THEME_COLORS = {
  PRIMARY: '#007bff',
  SECONDARY: '#6c757d',
  SUCCESS: '#28a745',
  DANGER: '#dc3545',
  WARNING: '#ffc107',
  INFO: '#17a2b8',
  LIGHT: '#f8f9fa',
  DARK: '#343a40',
  URGENT: '#ff6b35',          // New: For urgent bookings
  QUEUE: '#20c997'            // New: For queue-related items
};

// Status badge colors (Enhanced)
export const STATUS_COLORS = {
  [APPOINTMENT_STATUS.PENDING]: 'warning',
  [APPOINTMENT_STATUS.SCHEDULED]: 'info',
  [APPOINTMENT_STATUS.CONFIRMED]: 'success',
  [APPOINTMENT_STATUS.ONGOING]: 'primary',
  [APPOINTMENT_STATUS.DONE]: 'success',
  [APPOINTMENT_STATUS.CANCELLED]: 'danger',
  [ORDER_STATUS.PENDING]: 'warning',
  [ORDER_STATUS.PROCESSING]: 'primary',
  [ORDER_STATUS.COMPLETED]: 'success',
  [ORDER_STATUS.CANCELLED]: 'danger'
};

// Icon mappings (Enhanced)
export const ICONS = {
  APPOINTMENT: 'bi-calendar-check',
  QUEUE: 'bi-people',
  BARBER: 'bi-scissors',
  CUSTOMER: 'bi-person',
  MANAGER: 'bi-person-badge',
  PRODUCT: 'bi-box',
  SERVICE: 'bi-list-check',
  ADDON: 'bi-plus-circle',                    // New
  URGENT: 'bi-lightning-fill',                // New
  PENDING: 'bi-clock-fill',                   // New
  CONFIRMED: 'bi-check-circle-fill',          // New
  DECLINED: 'bi-x-circle-fill',               // New
  RESCHEDULE: 'bi-arrow-repeat',              // New
  CLONE_BOOKING: 'bi-files',                  // New
  REPORT: 'bi-graph-up',
  NOTIFICATION: 'bi-bell',
  SETTINGS: 'bi-gear',
  LOGOUT: 'bi-box-arrow-right',
  LOGIN: 'bi-box-arrow-in-right',
  HOME: 'bi-house',
  DASHBOARD: 'bi-speedometer2',
  PROFILE: 'bi-person-circle',
  EDIT: 'bi-pencil',
  DELETE: 'bi-trash',
  ADD: 'bi-plus-circle',
  SEARCH: 'bi-search',
  FILTER: 'bi-funnel',
  SORT: 'bi-sort-down',
  SUCCESS: 'bi-check-circle',
  ERROR: 'bi-exclamation-circle',
  WARNING: 'bi-exclamation-triangle',
  INFO: 'bi-info-circle',
  PHONE: 'bi-telephone',
  EMAIL: 'bi-envelope',
  LOCATION: 'bi-geo-alt',
  TIME: 'bi-clock',
  MONEY: 'bi-currency-dollar'
};

// Queue status indicators (New)
export const QUEUE_STATUS = {
  OPEN: 'open',
  BUSY: 'busy',
  FULL: 'full',
  CLOSED: 'closed'
};

// Barber availability status (New)
export const BARBER_STATUS = {
  AVAILABLE: 'available',
  BUSY: 'busy',
  BREAK: 'break',
  OFFLINE: 'offline'
};

// Booking priorities (New)
export const BOOKING_PRIORITY = {
  NORMAL: 'normal',
  URGENT: 'urgent',
  VIP: 'vip'
};

// Add-on categories (New)
export const ADDON_CATEGORIES = {
  HAIR_CARE: 'hair_care',
  BEARD_CARE: 'beard_care',
  FACIAL_CARE: 'facial_care',
  STYLING: 'styling',
  GROOMING: 'grooming',
  WELLNESS: 'wellness'
};

// Cancellation reasons (New)
export const CANCELLATION_REASONS = [
  'Personal emergency',
  'Schedule conflict',
  'Feeling unwell',
  'Transportation issues',
  'Changed mind about service',
  'Found another barber',
  'Other'
];

// System actions for logging (Enhanced)
export const SYSTEM_ACTIONS = {
  // Authentication
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_REGISTER: 'user_register',
  
  // Appointments
  APPOINTMENT_REQUESTED: 'appointment_requested',
  APPOINTMENT_CONFIRMED: 'appointment_confirmed',
  APPOINTMENT_DECLINED: 'appointment_declined',
  APPOINTMENT_RESCHEDULED: 'appointment_rescheduled',
  APPOINTMENT_CANCELLED: 'appointment_cancelled',
  APPOINTMENT_COMPLETED: 'appointment_completed',
  APPOINTMENT_NO_SHOW: 'appointment_no_show',
  
  // Queue management
  QUEUE_JOINED: 'queue_joined',
  QUEUE_LEFT: 'queue_left',
  QUEUE_ADVANCED: 'queue_advanced',
  URGENT_BOOKING: 'urgent_booking',
  
  // Barber actions
  BARBER_AVAILABLE: 'barber_available',
  BARBER_BREAK: 'barber_break',
  BARBER_OFFLINE: 'barber_offline',
  
  // System
  SYSTEM_BACKUP: 'system_backup',
  SYSTEM_MAINTENANCE: 'system_maintenance'
};

export default {
  ROLES,
  APPOINTMENT_STATUS,
  NOTIFICATION_TYPES,
  ORDER_STATUS,
  FACE_SHAPES,
  PRODUCT_CATEGORIES,
  QUEUE_SETTINGS,
  BOOKING_SETTINGS,
  TIME_SLOTS,
  DATE_FORMATS,
  ROUTES,
  STORAGE_KEYS,
  API_ENDPOINTS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  APP_SETTINGS,
  THEME_COLORS,
  STATUS_COLORS,
  ICONS,
  QUEUE_STATUS,
  BARBER_STATUS,
  BOOKING_PRIORITY,
  ADDON_CATEGORIES,
  CANCELLATION_REASONS,
  SYSTEM_ACTIONS
};