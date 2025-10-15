-- ============================================================================
-- Database Migration: Standardize Appointment Schema
-- ============================================================================
-- Purpose: Ensure all appointment-related tables use consistent column names
-- Main Change: Standardize on 'queue_position' (remove 'queue_number' if exists)
-- Date: October 6, 2025
-- ============================================================================

-- BACKUP REMINDER
-- ============================================================================
-- IMPORTANT: Create a backup before running this migration!
-- Command: pg_dump -h [host] -U [user] -d [database] > backup_$(date +%Y%m%d_%H%M%S).sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Check and Standardize queue_position Column
-- ============================================================================

DO $$
DECLARE
    has_queue_number BOOLEAN;
    has_queue_position BOOLEAN;
BEGIN
    -- Check if queue_number column exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'appointments' 
        AND column_name = 'queue_number'
    ) INTO has_queue_number;
    
    -- Check if queue_position column exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'appointments' 
        AND column_name = 'queue_position'
    ) INTO has_queue_position;
    
    RAISE NOTICE 'Has queue_number: %', has_queue_number;
    RAISE NOTICE 'Has queue_position: %', has_queue_position;
    
    -- Case 1: Has queue_number but NOT queue_position
    -- Rename queue_number to queue_position
    IF has_queue_number AND NOT has_queue_position THEN
        RAISE NOTICE 'Renaming queue_number to queue_position...';
        ALTER TABLE appointments RENAME COLUMN queue_number TO queue_position;
        RAISE NOTICE 'Column renamed successfully';
    
    -- Case 2: Has BOTH queue_number and queue_position
    -- Migrate data from queue_number to queue_position, then drop queue_number
    ELSIF has_queue_number AND has_queue_position THEN
        RAISE NOTICE 'Both columns exist. Migrating data from queue_number to queue_position...';
        
        -- Update queue_position from queue_number where queue_position is null
        UPDATE appointments 
        SET queue_position = queue_number 
        WHERE queue_number IS NOT NULL 
        AND queue_position IS NULL;
        
        -- Drop queue_number column
        ALTER TABLE appointments DROP COLUMN queue_number;
        RAISE NOTICE 'Data migrated and queue_number column dropped';
    
    -- Case 3: Has queue_position but NOT queue_number
    -- Already correct, do nothing
    ELSIF NOT has_queue_number AND has_queue_position THEN
        RAISE NOTICE 'Already using queue_position. No changes needed.';
    
    -- Case 4: Has NEITHER
    -- Create queue_position column
    ELSE
        RAISE NOTICE 'Creating queue_position column...';
        ALTER TABLE appointments ADD COLUMN queue_position INTEGER;
        RAISE NOTICE 'Column created successfully';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Ensure All Required Columns Exist
-- ============================================================================

-- Add appointment_type if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'appointment_type'
    ) THEN
        ALTER TABLE appointments ADD COLUMN appointment_type VARCHAR(20) DEFAULT 'queue';
        RAISE NOTICE 'Added appointment_type column';
    END IF;
END $$;

-- Add priority_level if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'priority_level'
    ) THEN
        ALTER TABLE appointments ADD COLUMN priority_level VARCHAR(20) DEFAULT 'normal';
        RAISE NOTICE 'Added priority_level column';
    END IF;
END $$;

-- Add is_urgent if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'is_urgent'
    ) THEN
        ALTER TABLE appointments ADD COLUMN is_urgent BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_urgent column';
    END IF;
END $$;

-- Add queue_insertion_reason if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'queue_insertion_reason'
    ) THEN
        ALTER TABLE appointments ADD COLUMN queue_insertion_reason VARCHAR(100);
        RAISE NOTICE 'Added queue_insertion_reason column';
    END IF;
END $$;

-- Add queue_insertion_time if not exists  
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'queue_insertion_time'
    ) THEN
        ALTER TABLE appointments ADD COLUMN queue_insertion_time TIMESTAMPTZ;
        RAISE NOTICE 'Added queue_insertion_time column';
    END IF;
END $$;

-- Add book_for_friend if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'book_for_friend'
    ) THEN
        ALTER TABLE appointments ADD COLUMN book_for_friend BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added book_for_friend column';
    END IF;
END $$;

-- Add friend_name if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'friend_name'
    ) THEN
        ALTER TABLE appointments ADD COLUMN friend_name TEXT;
        RAISE NOTICE 'Added friend_name column';
    END IF;
END $$;

-- Add friend_phone if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'friend_phone'
    ) THEN
        ALTER TABLE appointments ADD COLUMN friend_phone TEXT;
        RAISE NOTICE 'Added friend_phone column';
    END IF;
END $$;

-- Add is_double_booking if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'is_double_booking'
    ) THEN
        ALTER TABLE appointments ADD COLUMN is_double_booking BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_double_booking column';
    END IF;
END $$;

-- Add double_booking_data if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'double_booking_data'
    ) THEN
        ALTER TABLE appointments ADD COLUMN double_booking_data JSONB;
        RAISE NOTICE 'Added double_booking_data column';
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Create/Update Indexes for Performance
-- ============================================================================

-- Drop old indexes if they exist (with queue_number)
DROP INDEX IF EXISTS idx_appointments_queue_number;
DROP INDEX IF EXISTS idx_queue_number;

-- Create queue_position index
CREATE INDEX IF NOT EXISTS idx_appointments_queue_position 
  ON appointments(barber_id, appointment_date, queue_position) 
  WHERE queue_position IS NOT NULL;

-- Create composite index for queue queries
CREATE INDEX IF NOT EXISTS idx_appointments_queue_management
  ON appointments(barber_id, appointment_date, status, queue_position)
  WHERE appointment_type = 'queue';

-- Create index for scheduled appointments
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled
  ON appointments(barber_id, appointment_date, appointment_time)
  WHERE appointment_type = 'scheduled';

-- Create index for priority-based queries
CREATE INDEX IF NOT EXISTS idx_appointments_priority
  ON appointments(barber_id, appointment_date, priority_level, queue_position)
  WHERE status IN ('pending', 'scheduled', 'ongoing');

-- ============================================================================
-- STEP 4: Update Database Functions
-- ============================================================================

-- Ensure get_next_queue_position function exists and uses queue_position
CREATE OR REPLACE FUNCTION get_next_queue_position(
    p_barber_id UUID,
    p_appointment_date DATE,
    p_priority_level VARCHAR DEFAULT 'normal'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_next_position INTEGER;
    v_max_position INTEGER;
BEGIN
    -- For urgent priority, always return 1 (caller will shift others)
    IF p_priority_level = 'urgent' OR p_priority_level = 'vip' THEN
        RETURN 1;
    END IF;

    -- Get the maximum current queue position
    SELECT COALESCE(MAX(queue_position), 0) INTO v_max_position
    FROM appointments
    WHERE barber_id = p_barber_id
    AND appointment_date = p_appointment_date
    AND status IN ('scheduled', 'pending', 'ongoing')
    AND queue_position IS NOT NULL;

    -- Return next position
    RETURN v_max_position + 1;
END $$;

-- ============================================================================
-- STEP 5: Data Validation and Cleanup
-- ============================================================================

-- Set appointment_type based on existing data
UPDATE appointments 
SET appointment_type = CASE 
    WHEN appointment_time IS NOT NULL THEN 'scheduled'
    WHEN queue_position IS NOT NULL THEN 'queue'
    ELSE 'queue'
END
WHERE appointment_type IS NULL;

-- Set priority_level for urgent appointments
UPDATE appointments
SET priority_level = 'urgent'
WHERE is_urgent = true AND priority_level = 'normal';

-- Clean up null values
UPDATE appointments
SET is_urgent = false
WHERE is_urgent IS NULL;

UPDATE appointments
SET book_for_friend = false
WHERE book_for_friend IS NULL;

UPDATE appointments
SET is_double_booking = false
WHERE is_double_booking IS NULL;

-- ============================================================================
-- STEP 6: Add Constraints
-- ============================================================================

-- Ensure queue appointments have queue_position
-- (This is a soft constraint via application logic, not database constraint)

-- Ensure scheduled appointments have appointment_time
-- (This is a soft constraint via application logic, not database constraint)

-- ============================================================================
-- STEP 7: Verification Queries
-- ============================================================================

-- Count appointments by type
DO $$
DECLARE
    queue_count INTEGER;
    scheduled_count INTEGER;
    total_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO queue_count FROM appointments WHERE appointment_type = 'queue';
    SELECT COUNT(*) INTO scheduled_count FROM appointments WHERE appointment_type = 'scheduled';
    SELECT COUNT(*) INTO total_count FROM appointments;
    
    RAISE NOTICE '=== Migration Verification ===';
    RAISE NOTICE 'Total appointments: %', total_count;
    RAISE NOTICE 'Queue appointments: %', queue_count;
    RAISE NOTICE 'Scheduled appointments: %', scheduled_count;
    RAISE NOTICE '=============================';
END $$;

-- Check for any appointments with inconsistent data
DO $$
DECLARE
    inconsistent_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO inconsistent_count
    FROM appointments
    WHERE (appointment_type = 'queue' AND queue_position IS NULL AND status != 'cancelled')
       OR (appointment_type = 'scheduled' AND appointment_time IS NULL);
    
    IF inconsistent_count > 0 THEN
        RAISE WARNING 'Found % appointments with inconsistent data. Please review.', inconsistent_count;
    ELSE
        RAISE NOTICE 'All appointments have consistent data.';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (Save for emergency)
-- ============================================================================

/*
BEGIN;

-- If you need to rollback, run this:
-- (Only works if you haven't dropped queue_number yet)

-- Rename queue_position back to queue_number
-- ALTER TABLE appointments RENAME COLUMN queue_position TO queue_number;

-- Drop new indexes
-- DROP INDEX IF EXISTS idx_appointments_queue_position;
-- DROP INDEX IF EXISTS idx_appointments_queue_management;
-- DROP INDEX IF EXISTS idx_appointments_scheduled;
-- DROP INDEX IF EXISTS idx_appointments_priority;

COMMIT;
*/

-- ============================================================================
-- POST-MIGRATION CHECKLIST
-- ============================================================================

/*
After running this migration:

1. ✅ Verify all appointments have correct appointment_type
2. ✅ Check queue_position is set for all queue appointments
3. ✅ Test booking flow (queue and scheduled)
4. ✅ Test barber queue management
5. ✅ Test manager walk-in creation
6. ✅ Verify get_next_queue_position function works
7. ✅ Monitor application logs for errors
8. ✅ Update application code to use APPOINTMENT_FIELDS constants

For Application Code Updates:
- Replace all references to 'queue_number' with 'queue_position'
- Import and use constants from src/constants/booking.constants.js
- Update all services to use APPOINTMENT_FIELDS
*/

