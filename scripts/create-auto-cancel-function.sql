-- Auto-Cancel Unconfirmed Orders and Appointments
-- This function automatically cancels unconfirmed orders and appointments
-- that haven't been accepted/claimed within the day they were scheduled

-- ============================================================================
-- ENSURE REQUIRED COLUMNS EXIST
-- ============================================================================

-- Add confirmed_at column to orders if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orders' AND column_name = 'confirmed_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN confirmed_at TIMESTAMP WITH TIME ZONE;
    RAISE NOTICE 'Added confirmed_at column to orders table';
  END IF;
END $$;

-- Add confirmed_at column to appointments if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'appointments' AND column_name = 'confirmed_at'
  ) THEN
    ALTER TABLE appointments ADD COLUMN confirmed_at TIMESTAMP WITH TIME ZONE;
    RAISE NOTICE 'Added confirmed_at column to appointments table';
  END IF;
END $$;

-- Add cancellation_reason column to appointments if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'appointments' AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE appointments ADD COLUMN cancellation_reason TEXT;
    RAISE NOTICE 'Added cancellation_reason column to appointments table';
  END IF;
END $$;

-- ============================================================================
-- FUNCTION: Auto-cancel unconfirmed orders and appointments
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_cancel_unconfirmed_items()
RETURNS TABLE(
  cancelled_orders_count INTEGER,
  cancelled_appointments_count INTEGER,
  cancelled_order_ids UUID[],
  cancelled_appointment_ids UUID[]
) AS $$
DECLARE
  v_cancelled_orders_count INTEGER := 0;
  v_cancelled_appointments_count INTEGER := 0;
  v_cancelled_order_ids UUID[] := ARRAY[]::UUID[];
  v_cancelled_appointment_ids UUID[] := ARRAY[]::UUID[];
  v_today DATE := CURRENT_DATE;
BEGIN
  -- ============================================================================
  -- CANCEL UNCONFIRMED ORDERS
  -- ============================================================================
  -- Cancel orders that are:
  -- - Status is 'pending'
  -- - pickup_date is before today (past scheduled date)
  -- - confirmed_at is NULL (never confirmed)
  
  WITH cancelled_orders AS (
    UPDATE orders
    SET 
      status = 'cancelled',
      cancellation_reason = 'Automatically cancelled: Order was not confirmed by the scheduled pickup date',
      cancelled_at = NOW(),
      updated_at = NOW()
    WHERE 
      status = 'pending'
      AND pickup_date < v_today
      AND confirmed_at IS NULL
    RETURNING id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO 
    v_cancelled_orders_count,
    v_cancelled_order_ids
  FROM cancelled_orders;

  -- ============================================================================
  -- CANCEL UNCONFIRMED APPOINTMENTS
  -- ============================================================================
  -- Cancel appointments that are:
  -- - Status is 'pending'
  -- - appointment_date is before today (past scheduled date)
  -- - confirmed_at is NULL (never confirmed)
  
  WITH cancelled_appointments AS (
    UPDATE appointments
    SET 
      status = 'cancelled',
      cancellation_reason = 'Automatically cancelled: Appointment was not confirmed by the scheduled date',
      updated_at = NOW(),
      queue_position = NULL
    WHERE 
      status = 'pending'
      AND appointment_date < v_today
      AND confirmed_at IS NULL
    RETURNING id
  )
  SELECT 
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO 
    v_cancelled_appointments_count,
    v_cancelled_appointment_ids
  FROM cancelled_appointments;

  -- Return results
  RETURN QUERY SELECT 
    v_cancelled_orders_count,
    v_cancelled_appointments_count,
    v_cancelled_order_ids,
    v_cancelled_appointment_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CREATE INDEXES FOR PERFORMANCE (if they don't exist)
-- ============================================================================

-- Indexes for orders
CREATE INDEX IF NOT EXISTS idx_orders_status_pickup_date 
  ON orders(status, pickup_date) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_orders_confirmed_at 
  ON orders(confirmed_at) 
  WHERE confirmed_at IS NULL;

-- Indexes for appointments
CREATE INDEX IF NOT EXISTS idx_appointments_status_appointment_date 
  ON appointments(status, appointment_date) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_appointments_confirmed_at 
  ON appointments(confirmed_at) 
  WHERE confirmed_at IS NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION auto_cancel_unconfirmed_items() IS 
  'Automatically cancels unconfirmed orders and appointments that are past their scheduled date. Runs daily via cron job or can be called manually.';

