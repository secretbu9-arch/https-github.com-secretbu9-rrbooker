-- Fix appointments status constraint to include 'pending' and 'confirmed'
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
-- STEP 3: VERIFY THE CONSTRAINT
-- ============================================================================

-- Test the constraint by checking if we can insert with each status
DO $$
DECLARE
    test_statuses TEXT[] := ARRAY['pending', 'scheduled', 'confirmed', 'ongoing', 'done', 'cancelled'];
    test_status TEXT;
    test_customer_id UUID;
    test_barber_id UUID;
    test_service_id UUID;
BEGIN
    RAISE NOTICE 'Testing status constraint...';
    
    -- Get test IDs
    SELECT id INTO test_customer_id FROM users WHERE role = 'customer' LIMIT 1;
    SELECT id INTO test_barber_id FROM users WHERE role = 'barber' LIMIT 1;
    SELECT id INTO test_service_id FROM services LIMIT 1;
    
    -- Only test if we have the required data
    IF test_customer_id IS NOT NULL AND test_barber_id IS NOT NULL AND test_service_id IS NOT NULL THEN
        FOREACH test_status IN ARRAY test_statuses
        LOOP
            BEGIN
                -- Try to insert a test record
                INSERT INTO appointments (
                    customer_id, 
                    barber_id, 
                    service_id, 
                    appointment_date, 
                    status
                ) VALUES (
                    test_customer_id,
                    test_barber_id,
                    test_service_id,
                    CURRENT_DATE,
                    test_status
                );
                
                -- If we get here, the status is valid
                RAISE NOTICE '✅ Status "%" is valid', test_status;
                
                -- Delete the test record
                DELETE FROM appointments 
                WHERE customer_id = test_customer_id 
                AND barber_id = test_barber_id 
                AND service_id = test_service_id 
                AND appointment_date = CURRENT_DATE 
                AND status = test_status;
                
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '❌ Status "%" failed: %', test_status, SQLERRM;
            END;
        END LOOP;
    ELSE
        RAISE NOTICE '⚠️ Skipping constraint test - missing test data (customers, barbers, or services)';
    END IF;
END $$;

-- ============================================================================
-- STEP 4: UPDATE EXISTING APPOINTMENTS
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
