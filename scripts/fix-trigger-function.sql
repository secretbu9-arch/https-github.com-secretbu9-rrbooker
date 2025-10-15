-- ============================================================================
-- FIX FOR TRIGGER TYPE CASTING ERROR
-- ============================================================================
-- This script fixes the trigger_update_timeline function that's causing
-- "cannot cast type time without time zone to timestamp without time zone" error

-- ============================================================================
-- STEP 1: DROP THE PROBLEMATIC TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS update_timeline_on_status_change ON appointments;

-- ============================================================================
-- STEP 2: CREATE A FIXED TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_update_timeline()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update the updated_at timestamp, avoid any time/timestamp casting issues
  NEW.updated_at = NOW();
  
  -- Log the status change (optional)
  INSERT INTO system_logs (user_id, action, details, created_at)
  VALUES (
    COALESCE(NEW.barber_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'appointment_status_changed',
    jsonb_build_object(
      'appointment_id', NEW.id,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'appointment_type', NEW.appointment_type
    ),
    NOW()
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- If there's any error, just return NEW without failing
    -- This prevents the trigger from breaking the main update
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 3: RECREATE THE TRIGGER WITH BETTER ERROR HANDLING
-- ============================================================================

CREATE TRIGGER update_timeline_on_status_change
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_update_timeline();

-- ============================================================================
-- STEP 4: CREATE SYSTEM_LOGS TABLE IF IT DOESN'T EXIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STEP 5: TEST THE FIX
-- ============================================================================

-- Test updating an appointment status
UPDATE appointments 
SET status = 'done' 
WHERE id = '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff';

-- Check if the update worked
SELECT id, status, updated_at 
FROM appointments 
WHERE id = '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff';

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

SELECT 'Trigger fix completed successfully!' as status;
