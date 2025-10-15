-- ============================================================================
-- TARGETED FIX FOR SPECIFIC APPOINTMENT DATA ISSUES
-- ============================================================================
-- This script fixes the specific data issues found in the appointment table

-- ============================================================================
-- STEP 1: FIX QUEUE_POSITION DATA TYPES (String to Integer)
-- ============================================================================

-- Fix queue_position for queue appointments - convert strings to integers
UPDATE appointments 
SET 
    queue_position = CASE 
        WHEN queue_position = '0' THEN 0
        WHEN queue_position = '1' THEN 1
        WHEN queue_position = '2' THEN 2
        WHEN queue_position = '3' THEN 3
        WHEN queue_position = '4' THEN 4
        WHEN queue_position = '5' THEN 5
        WHEN queue_position = '6' THEN 6
        WHEN queue_position = '7' THEN 7
        WHEN queue_position = '8' THEN 8
        WHEN queue_position = '9' THEN 9
        WHEN queue_position = '10' THEN 10
        ELSE NULL
    END,
    updated_at = NOW()
WHERE appointment_type = 'queue' 
    AND queue_position IS NOT NULL
    AND queue_position ~ '^[0-9]+$'; -- Only update if it's a numeric string

-- ============================================================================
-- STEP 2: FIX SPECIFIC APPOINTMENTS WITH WRONG FIELD COMBINATIONS
-- ============================================================================

-- Fix appointment cbdd0186-e9ae-4666-9a19-64e0355b8a9c (queue with appointment_time)
UPDATE appointments 
SET 
    appointment_time = NULL,
    updated_at = NOW()
WHERE id = 'cbdd0186-e9ae-4666-9a19-64e0355b8a9c'
    AND appointment_type = 'queue';

-- Fix appointment 68fcb808-b033-4b91-9e0b-5569d7250f86 (queue with appointment_time)
UPDATE appointments 
SET 
    appointment_time = NULL,
    updated_at = NOW()
WHERE id = '68fcb808-b033-4b91-9e0b-5569d7250f86'
    AND appointment_type = 'queue';

-- Fix appointment 8c9f7f81-82c1-4308-8fce-ea6e8c3c2961 (queue with appointment_time)
UPDATE appointments 
SET 
    appointment_time = NULL,
    updated_at = NOW()
WHERE id = '8c9f7f81-82c1-4308-8fce-ea6e8c3c2961'
    AND appointment_type = 'queue';

-- ============================================================================
-- STEP 3: REORDER QUEUE POSITIONS PROPERLY
-- ============================================================================

-- Reorder queue positions for the specific barber and date
WITH reordered_queues AS (
    SELECT 
        id,
        ROW_NUMBER() OVER (
            ORDER BY 
                CASE 
                    WHEN is_urgent = true THEN 0
                    ELSE 1
                END,
                created_at ASC
        ) as new_queue_position
    FROM appointments 
    WHERE barber_id = 'f5c19b20-d74c-4afc-8e0e-4848f2f29049'
        AND appointment_date = '2025-10-07'
        AND appointment_type = 'queue'
        AND status IN ('pending', 'scheduled', 'confirmed', 'ongoing')
)
UPDATE appointments 
SET 
    queue_position = reordered_queues.new_queue_position,
    updated_at = NOW()
FROM reordered_queues
WHERE appointments.id = reordered_queues.id;

-- ============================================================================
-- STEP 4: VALIDATE FIXES
-- ============================================================================

-- Check the fixed data
SELECT 
    id,
    appointment_type,
    appointment_time,
    queue_position,
    status,
    is_urgent,
    created_at
FROM appointments 
WHERE barber_id = 'f5c19b20-d74c-4afc-8e0e-4848f2f29049'
    AND appointment_date = '2025-10-07'
ORDER BY 
    appointment_type,
    CASE WHEN appointment_type = 'scheduled' THEN appointment_time ELSE NULL END,
    queue_position;

-- ============================================================================
-- STEP 5: CHECK FOR REMAINING ISSUES
-- ============================================================================

-- Check for any remaining data type issues
SELECT 
    'Queue appointments with appointment_time' as issue,
    COUNT(*) as count
FROM appointments 
WHERE appointment_type = 'queue' AND appointment_time IS NOT NULL

UNION ALL

SELECT 
    'Queue appointments with string queue_position' as issue,
    COUNT(*) as count
FROM appointments 
WHERE appointment_type = 'queue' 
    AND queue_position IS NOT NULL 
    AND queue_position::text ~ '^[0-9]+$'

UNION ALL

SELECT 
    'Scheduled appointments with queue_position' as issue,
    COUNT(*) as count
FROM appointments 
WHERE appointment_type = 'scheduled' AND queue_position IS NOT NULL;

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

SELECT 'Targeted appointment data fix completed successfully!' as status;
