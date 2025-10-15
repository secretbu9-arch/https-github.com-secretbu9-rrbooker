-- ============================================================================
-- APPOINTMENT DATA CONSISTENCY FIX
-- ============================================================================
-- This script fixes critical data consistency issues in the appointments table
-- where queue appointments have appointment_time values and missing queue_position

-- ============================================================================
-- STEP 1: IDENTIFY PROBLEMATIC APPOINTMENTS
-- ============================================================================

-- Show current data inconsistencies
SELECT 
    id,
    appointment_type,
    appointment_time,
    queue_position,
    status,
    appointment_date,
    created_at
FROM appointments 
WHERE appointment_type = 'queue' 
    AND (appointment_time IS NOT NULL OR queue_position IS NULL)
ORDER BY created_at DESC;

-- ============================================================================
-- STEP 2: FIX QUEUE APPOINTMENTS WITH INCORRECT appointment_time
-- ============================================================================

-- Set appointment_time to NULL for queue appointments that have a time
UPDATE appointments 
SET 
    appointment_time = NULL,
    updated_at = NOW()
WHERE appointment_type = 'queue' 
    AND appointment_time IS NOT NULL;

-- ============================================================================
-- STEP 3: FIX QUEUE APPOINTMENTS MISSING queue_position
-- ============================================================================

-- Generate queue positions for queue appointments that are missing them
WITH queue_appointments AS (
    SELECT 
        id,
        barber_id,
        appointment_date,
        ROW_NUMBER() OVER (
            PARTITION BY barber_id, appointment_date 
            ORDER BY created_at ASC
        ) as new_queue_position
    FROM appointments 
    WHERE appointment_type = 'queue' 
        AND queue_position IS NULL
        AND status IN ('pending', 'scheduled', 'confirmed', 'ongoing')
)
UPDATE appointments 
SET 
    queue_position = queue_appointments.new_queue_position,
    updated_at = NOW()
FROM queue_appointments
WHERE appointments.id = queue_appointments.id;

-- ============================================================================
-- STEP 4: FIX SCHEDULED APPOINTMENTS WITH INCORRECT queue_position
-- ============================================================================

-- Set queue_position to NULL for scheduled appointments that have a position
UPDATE appointments 
SET 
    queue_position = NULL,
    updated_at = NOW()
WHERE appointment_type = 'scheduled' 
    AND queue_position IS NOT NULL;

-- ============================================================================
-- STEP 5: REORDER QUEUE POSITIONS PROPERLY
-- ============================================================================

-- Reorder all queue positions by barber and date
WITH reordered_queues AS (
    SELECT 
        id,
        barber_id,
        appointment_date,
        ROW_NUMBER() OVER (
            PARTITION BY barber_id, appointment_date 
            ORDER BY 
                CASE 
                    WHEN is_urgent = true THEN 0
                    ELSE 1
                END,
                created_at ASC
        ) as new_queue_position
    FROM appointments 
    WHERE appointment_type = 'queue' 
        AND status IN ('pending', 'scheduled', 'confirmed', 'ongoing')
)
UPDATE appointments 
SET 
    queue_position = reordered_queues.new_queue_position,
    updated_at = NOW()
FROM reordered_queues
WHERE appointments.id = reordered_queues.id;

-- ============================================================================
-- STEP 6: VALIDATE FIXES
-- ============================================================================

-- Check for remaining inconsistencies
SELECT 
    'Queue appointments with appointment_time' as issue,
    COUNT(*) as count
FROM appointments 
WHERE appointment_type = 'queue' AND appointment_time IS NOT NULL

UNION ALL

SELECT 
    'Queue appointments missing queue_position' as issue,
    COUNT(*) as count
FROM appointments 
WHERE appointment_type = 'queue' AND queue_position IS NULL

UNION ALL

SELECT 
    'Scheduled appointments with queue_position' as issue,
    COUNT(*) as count
FROM appointments 
WHERE appointment_type = 'scheduled' AND queue_position IS NOT NULL;

-- ============================================================================
-- STEP 7: SHOW CLEANED DATA
-- ============================================================================

-- Show the cleaned appointment data
SELECT 
    id,
    appointment_type,
    appointment_time,
    queue_position,
    status,
    appointment_date,
    is_urgent,
    created_at
FROM appointments 
WHERE appointment_date = CURRENT_DATE
ORDER BY 
    barber_id,
    appointment_type,
    CASE WHEN appointment_type = 'scheduled' THEN appointment_time ELSE NULL END,
    queue_position;

-- ============================================================================
-- STEP 8: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Create index for queue appointments
CREATE INDEX IF NOT EXISTS idx_appointments_queue_clean 
ON appointments (barber_id, appointment_date, queue_position) 
WHERE appointment_type = 'queue';

-- Create index for scheduled appointments
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_clean 
ON appointments (barber_id, appointment_date, appointment_time) 
WHERE appointment_type = 'scheduled';

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

SELECT 'Appointment data consistency fix completed successfully!' as status;
