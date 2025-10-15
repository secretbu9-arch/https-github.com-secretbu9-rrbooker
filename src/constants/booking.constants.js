/**
 * Booking Constants
 * 
 * Central source of truth for all booking-related constants
 * Use these constants throughout the application for consistency
 */

// ============================================================================
// BOOKING TYPES
// ============================================================================

export const BOOKING_TYPES = {
  QUEUE: 'queue',
  SCHEDULED: 'scheduled'
};

// ============================================================================
// BOOKING STATUS
// ============================================================================

export const BOOKING_STATUS = {
  PENDING: 'pending',      // Waiting for barber confirmation
  SCHEDULED: 'scheduled',  // Confirmed scheduled appointment
  CONFIRMED: 'confirmed',  // Barber confirmed the appointment
  ONGOING: 'ongoing',      // Currently in progress
  DONE: 'done',           // Completed
  CANCELLED: 'cancelled'   // Cancelled by user or barber
};

// ============================================================================
// PRIORITY LEVELS
// ============================================================================

export const PRIORITY_LEVELS = {
  NORMAL: 'normal',
  URGENT: 'urgent',
  VIP: 'vip'
};

// ============================================================================
// APPOINTMENT DATABASE FIELDS
// ============================================================================

export const APPOINTMENT_FIELDS = {
  // IDs
  ID: 'id',
  CUSTOMER_ID: 'customer_id',
  BARBER_ID: 'barber_id',
  
  // Service information
  SERVICE_ID: 'service_id',           // Primary service
  SERVICES_DATA: 'services_data',     // Array of all selected services
  ADD_ONS_DATA: 'add_ons_data',      // Array of selected add-ons
  
  // Scheduling
  APPOINTMENT_DATE: 'appointment_date',
  APPOINTMENT_TIME: 'appointment_time',  // null for queue appointments
  APPOINTMENT_TYPE: 'appointment_type',  // 'queue' or 'scheduled'
  
  // Queue management (STANDARDIZED)
  QUEUE_POSITION: 'queue_position',   // Position in queue (null for scheduled)
  PRIORITY_LEVEL: 'priority_level',   // 'normal', 'urgent', or 'vip'
  IS_URGENT: 'is_urgent',            // Boolean flag for urgent bookings
  
  // Status and pricing
  STATUS: 'status',
  TOTAL_PRICE: 'total_price',
  TOTAL_DURATION: 'total_duration',
  
  // Additional information
  NOTES: 'notes',
  SPECIAL_REQUESTS: 'special_requests',
  
  // Double booking (booking for friend)
  IS_DOUBLE_BOOKING: 'is_double_booking',
  DOUBLE_BOOKING_DATA: 'double_booking_data',
  PRIMARY_CUSTOMER_ID: 'primary_customer_id',
  
  // Friend booking (stored in double_booking_data JSON)
  BOOK_FOR_FRIEND: 'book_for_friend',  // Used in UI, stored in double_booking_data
  FRIEND_NAME: 'friend_name',          // Used in UI, stored in double_booking_data
  FRIEND_PHONE: 'friend_phone',        // Used in UI, stored in double_booking_data
  
  // Queue insertion tracking
  QUEUE_INSERTION_REASON: 'queue_insertion_reason',
  QUEUE_INSERTION_TIME: 'queue_insertion_time',
  
  // Timestamps
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  EMAIL_SENT_AT: 'email_sent_at',
  
  // Confirmation
  CONFIRMATION_CODE: 'confirmation_code',
  CONFIRMED_AT: 'confirmed_at'
};

// ============================================================================
// BOOKING VALIDATION RULES
// ============================================================================

export const BOOKING_VALIDATION = {
  MAX_SERVICES: 5,              // Maximum services per booking
  MAX_ADDONS: 8,                // Maximum add-ons per booking
  MIN_SERVICES: 1,              // Minimum services required
  ADVANCE_BOOKING_DAYS: 30,     // Maximum days in advance
  CANCELLATION_HOURS: 2,        // Hours before to allow cancellation
  RESCHEDULE_LIMIT: 3,          // Maximum reschedules per appointment
  MIN_DURATION: 15,             // Minimum appointment duration (minutes)
  MAX_DURATION: 240             // Maximum appointment duration (minutes)
};

// ============================================================================
// QUEUE SETTINGS
// ============================================================================

export const QUEUE_SETTINGS = {
  DEFAULT_CAPACITY: 15,         // Max customers per barber per day
  AVERAGE_SERVICE_TIME: 35,     // Minutes per customer
  URGENT_FEE: 100,             // Additional fee for urgent bookings (₱)
  MAX_QUEUE_DISPLAY: 20,       // Max queue items to display
  REFRESH_INTERVAL: 30000,     // Auto-refresh interval (ms)
  WARNING_THRESHOLD: 12,       // Queue capacity warning threshold
  URGENT_POSITION: 1           // Position for urgent bookings
};

// ============================================================================
// TIME SLOTS CONFIGURATION
// ============================================================================

export const TIME_SLOTS_CONFIG = {
  MORNING_START: '08:00',      // Business start time (8:00 AM)
  MORNING_END: '12:00',        // Lunch break start (12:00 PM)
  AFTERNOON_START: '13:00',    // Afternoon start (1:00 PM)
  AFTERNOON_END: '17:00',      // Business end time
  SLOT_INTERVAL: 30,           // Minutes between slots
  LUNCH_BREAK_START: '12:00',
  LUNCH_BREAK_END: '13:00'
};

// ============================================================================
// BOOKING DATA STRUCTURE TEMPLATE
// ============================================================================

/**
 * Standard booking data structure
 * Use this as a template for creating appointments
 */
export const BOOKING_DATA_TEMPLATE = {
  [APPOINTMENT_FIELDS.CUSTOMER_ID]: null,
  [APPOINTMENT_FIELDS.BARBER_ID]: null,
  [APPOINTMENT_FIELDS.SERVICE_ID]: null,
  [APPOINTMENT_FIELDS.SERVICES_DATA]: [],
  [APPOINTMENT_FIELDS.ADD_ONS_DATA]: [],
  [APPOINTMENT_FIELDS.APPOINTMENT_DATE]: null,
  [APPOINTMENT_FIELDS.APPOINTMENT_TIME]: null,
  [APPOINTMENT_FIELDS.APPOINTMENT_TYPE]: BOOKING_TYPES.QUEUE,
  [APPOINTMENT_FIELDS.QUEUE_POSITION]: null,
  [APPOINTMENT_FIELDS.PRIORITY_LEVEL]: PRIORITY_LEVELS.NORMAL,
  [APPOINTMENT_FIELDS.STATUS]: BOOKING_STATUS.PENDING,
  [APPOINTMENT_FIELDS.TOTAL_PRICE]: 0,
  [APPOINTMENT_FIELDS.TOTAL_DURATION]: 0,
  [APPOINTMENT_FIELDS.NOTES]: '',
  [APPOINTMENT_FIELDS.IS_URGENT]: false,
  [APPOINTMENT_FIELDS.IS_DOUBLE_BOOKING]: false,
  [APPOINTMENT_FIELDS.BOOK_FOR_FRIEND]: false,
  [APPOINTMENT_FIELDS.FRIEND_NAME]: '',
  [APPOINTMENT_FIELDS.FRIEND_PHONE]: ''
};

// ============================================================================
// BOOKING STEPS
// ============================================================================

export const BOOKING_STEPS = {
  SELECT_DATE_AND_BARBER: 1,
  SELECT_SERVICES: 2,
  SELECT_ADDONS: 3,
  REVIEW_AND_CONFIRM: 4,
  SUCCESS: 5
};

export const BOOKING_STEP_NAMES = {
  [BOOKING_STEPS.SELECT_DATE_AND_BARBER]: 'Select Date & Barber',
  [BOOKING_STEPS.SELECT_SERVICES]: 'Select Services',
  [BOOKING_STEPS.SELECT_ADDONS]: 'Select Add-ons',
  [BOOKING_STEPS.REVIEW_AND_CONFIRM]: 'Review & Confirm',
  [BOOKING_STEPS.SUCCESS]: 'Booking Complete'
};

// ============================================================================
// QUEUE INSERTION REASONS
// ============================================================================

export const QUEUE_INSERTION_REASONS = {
  WALK_IN: 'walk_in',
  SCHEDULED_TO_QUEUE: 'scheduled_to_queue',
  RESCHEDULED: 'rescheduled',
  URGENT: 'urgent',
  DIRECT_BOOKING: 'direct_booking'
};

// ============================================================================
// BOOKING ACTIONS (for logging)
// ============================================================================

export const BOOKING_ACTIONS = {
  CREATED: 'booking_created',
  CONFIRMED: 'booking_confirmed',
  DECLINED: 'booking_declined',
  RESCHEDULED: 'booking_rescheduled',
  CANCELLED: 'booking_cancelled',
  COMPLETED: 'booking_completed',
  NO_SHOW: 'booking_no_show',
  URGENT_REQUEST: 'booking_urgent_request',
  ADDED_TO_QUEUE: 'booking_added_to_queue',
  REMOVED_FROM_QUEUE: 'booking_removed_from_queue'
};

// ============================================================================
// ERROR MESSAGES (booking-specific)
// ============================================================================

export const BOOKING_ERRORS = {
  NO_BARBER_SELECTED: 'Please select a barber',
  NO_SERVICE_SELECTED: 'Please select at least one service',
  NO_DATE_SELECTED: 'Please select an appointment date',
  NO_TIME_SLOT: 'Please select a time slot for scheduled appointments',
  QUEUE_FULL: 'The barber\'s queue is full. Please try another barber or date.',
  TIME_CONFLICT: 'The selected time slot is no longer available',
  PAST_DATE: 'Cannot book appointments in the past',
  TOO_FAR_ADVANCE: `Cannot book more than ${BOOKING_VALIDATION.ADVANCE_BOOKING_DAYS} days in advance`,
  CANCELLATION_TOO_LATE: `Cannot cancel less than ${BOOKING_VALIDATION.CANCELLATION_HOURS} hours before appointment`,
  MAX_RESCHEDULES: `Maximum ${BOOKING_VALIDATION.RESCHEDULE_LIMIT} reschedules reached`,
  MAX_SERVICES: `Cannot select more than ${BOOKING_VALIDATION.MAX_SERVICES} services`,
  MAX_ADDONS: `Cannot select more than ${BOOKING_VALIDATION.MAX_ADDONS} add-ons`,
  DUPLICATE_BOOKING: 'You already have an appointment on this date',
  INVALID_FRIEND_DATA: 'Please provide friend\'s name and phone number'
};

// ============================================================================
// SUCCESS MESSAGES (booking-specific)
// ============================================================================

export const BOOKING_SUCCESS = {
  CREATED: 'Your appointment request has been sent to the barber',
  CONFIRMED: 'Your appointment has been confirmed',
  RESCHEDULED: 'Appointment rescheduled successfully',
  CANCELLED: 'Appointment cancelled successfully',
  URGENT_REQUESTED: 'Urgent booking request sent. You will be prioritized in the queue.',
  ADDED_TO_QUEUE: 'Successfully added to queue'
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  BOOKING_TYPES,
  BOOKING_STATUS,
  PRIORITY_LEVELS,
  APPOINTMENT_FIELDS,
  BOOKING_VALIDATION,
  QUEUE_SETTINGS,
  TIME_SLOTS_CONFIG,
  BOOKING_DATA_TEMPLATE,
  BOOKING_STEPS,
  BOOKING_STEP_NAMES,
  QUEUE_INSERTION_REASONS,
  BOOKING_ACTIONS,
  BOOKING_ERRORS,
  BOOKING_SUCCESS
};

