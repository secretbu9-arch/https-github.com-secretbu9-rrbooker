-- Simple fix for appointments status constraint to include 'pending' and 'confirmed'
-- This addresses the constraint violation issues

-- ============================================================================
-- STEP 1: DROP EXISTING STATUS CONSTRAINT
-- ============================================================================

-- Drop the existing constraint if it exists
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the appointments status constraint
    SELECT cc.constraint_name INTO constraint_name
    FROM information_schema.check_constraints cc
    JOIN information_schema.table_constraints tc ON cc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'appointments' 
    AND cc.constraint_name LIKE '%status%'
    LIMIT 1;
    
    IF constraint_name IS NOT NULL THEN
        -- Drop the constraint
        EXECUTE 'ALTER TABLE appointments DROP CONSTRAINT ' || constraint_name;
        RAISE NOTICE 'Dropped appointments status constraint: %', constraint_name;
    ELSE
        RAISE NOTICE 'No appointments status constraint found';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: ADD PROPER STATUS CONSTRAINT
-- ============================================================================

-- Add a proper status constraint that allows all our status values
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check 
CHECK (status IN ('pending', 'scheduled', 'confirmed', 'ongoing', 'done', 'cancelled'));

-- ============================================================================
-- STEP 3: UPDATE EXISTING APPOINTMENTS
-- ============================================================================

-- Update any appointments that might have invalid status values
UPDATE appointments 
SET status = 'pending' 
WHERE status NOT IN ('pending', 'scheduled', 'confirmed', 'ongoing', 'done', 'cancelled');

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 
    'Appointments status constraint fixed successfully!' as status,
    'All status values (pending, scheduled, confirmed, ongoing, done, cancelled) are now allowed' as message,
    NOW() as completed_at;
