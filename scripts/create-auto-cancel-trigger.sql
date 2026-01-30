-- Auto-Cancel Trigger for Immediate Cancellation
-- This trigger automatically cancels appointments that are set to 'pending'
-- with a past appointment_date, without waiting for the daily cron job

-- ============================================================================
-- FUNCTION: Check and auto-cancel appointment if needed
-- ============================================================================

CREATE OR REPLACE FUNCTION check_and_auto_cancel_appointment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check if status is being set to 'pending'
  IF NEW.status = 'pending' THEN
    -- Check if appointment_date is in the past and confirmed_at is NULL
    IF NEW.appointment_date < CURRENT_DATE AND NEW.confirmed_at IS NULL THEN
      -- Auto-cancel immediately
      NEW.status := 'cancelled';
      NEW.cancellation_reason := 'Automatically cancelled: Appointment was set to pending with a past date';
      NEW.updated_at := NOW();
      NEW.queue_position := NULL;
      
      RAISE NOTICE 'Auto-cancelled appointment %: past date (%) and not confirmed', NEW.id, NEW.appointment_date;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE TRIGGER
-- ============================================================================

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_cancel_pending_appointments ON appointments;

-- Create trigger that fires BEFORE INSERT or UPDATE
CREATE TRIGGER trigger_auto_cancel_pending_appointments
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_and_auto_cancel_appointment();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION check_and_auto_cancel_appointment() IS 
  'Automatically cancels appointments that are set to pending status with a past appointment_date and no confirmed_at timestamp. Runs immediately on insert/update, not waiting for daily cron job.';

COMMENT ON TRIGGER trigger_auto_cancel_pending_appointments ON appointments IS 
  'Triggers immediate auto-cancellation when appointments are set to pending with past dates.';








