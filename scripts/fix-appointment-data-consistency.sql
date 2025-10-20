-- Fix appointment data consistency issues
-- This script fixes queue appointments that have appointment_time and scheduled appointments that have queue_position

-- Fix queue appointments that have appointment_time (should be null)
UPDATE appointments 
SET 
  appointment_time = NULL,
  updated_at = NOW()
WHERE 
  appointment_type = 'queue' 
  AND appointment_time IS NOT NULL;

-- Fix scheduled appointments that have queue_position (should be null)
UPDATE appointments 
SET 
  queue_position = NULL,
  updated_at = NOW()
WHERE 
  appointment_type = 'scheduled' 
  AND queue_position IS NOT NULL;

-- Show the results
SELECT 
  'Queue appointments with appointment_time fixed' as description,
  COUNT(*) as count
FROM appointments 
WHERE appointment_type = 'queue' AND appointment_time IS NULL;

SELECT 
  'Scheduled appointments with queue_position fixed' as description,
  COUNT(*) as count
FROM appointments 
WHERE appointment_type = 'scheduled' AND queue_position IS NULL;

-- Verify the fixes
SELECT 
  appointment_type,
  COUNT(*) as total,
  COUNT(appointment_time) as with_appointment_time,
  COUNT(queue_position) as with_queue_position
FROM appointments 
WHERE appointment_type IN ('scheduled', 'queue')
GROUP BY appointment_type;