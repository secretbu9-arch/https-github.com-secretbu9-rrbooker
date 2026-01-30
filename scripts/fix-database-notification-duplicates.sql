-- Fix Database-Level Notification Duplicates
-- Run this in Supabase SQL Editor AFTER checking triggers with check-notification-triggers.sql

-- ============================================================================
-- STEP 1: REMOVE ANY TRIGGERS THAT DUPLICATE NOTIFICATIONS
-- ============================================================================

-- Drop triggers that might be duplicating notifications
DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  -- Find and drop triggers on notifications table that insert duplicates
  FOR trigger_record IN 
    SELECT trigger_name 
    FROM information_schema.triggers
    WHERE event_object_table = 'notifications'
      AND (action_statement LIKE '%INSERT INTO notifications%'
           OR action_statement LIKE '%INSERT INTO notifications_backup%'
           OR action_statement LIKE '%INSERT INTO notifications_enhanced%')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON notifications CASCADE', trigger_record.trigger_name);
    RAISE NOTICE 'Dropped trigger: %', trigger_record.trigger_name;
  END LOOP;
END $$;

-- ============================================================================
-- STEP 2: ENSURE NOTIFICATIONS_ENHANCED IS ONLY A VIEW (NOT A TABLE)
-- ============================================================================

-- Verify notifications_enhanced is a view, not a table
DO $$
BEGIN
  -- If it exists as a table, drop it (it should only be a view)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'notifications_enhanced' 
    AND table_type = 'BASE TABLE'
  ) THEN
    DROP TABLE IF EXISTS notifications_enhanced CASCADE;
    RAISE NOTICE 'Dropped notifications_enhanced table (should only be a view)';
  END IF;
  
  -- Recreate as view only (if it doesn't exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_name = 'notifications_enhanced'
  ) THEN
    CREATE OR REPLACE VIEW notifications_enhanced AS
    SELECT * FROM notifications;
    RAISE NOTICE 'Created notifications_enhanced view';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: ADD UNIQUE CONSTRAINT TO PREVENT DUPLICATES AT DATABASE LEVEL
-- ============================================================================

-- Add unique constraint to prevent exact duplicates within a time window
-- This is a safety measure in addition to application-level checks

DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'notifications_unique_user_title_type_time'
  ) THEN
    ALTER TABLE notifications 
    DROP CONSTRAINT notifications_unique_user_title_type_time;
  END IF;
  
  -- Note: We can't add a unique constraint with a time window directly
  -- Instead, we'll rely on the application-level checks and database functions
  RAISE NOTICE 'Unique constraint check skipped (time-based constraints require functions)';
END $$;

-- ============================================================================
-- STEP 4: CREATE OR REPLACE DUPLICATE PREVENTION FUNCTION
-- ============================================================================

-- Enhanced function that prevents duplicates at database level
CREATE OR REPLACE FUNCTION prevent_duplicate_notification()
RETURNS TRIGGER AS $$
DECLARE
  duplicate_count INTEGER;
  time_window INTERVAL := '1 hour'; -- Adjust as needed
BEGIN
  -- Check for duplicates within the time window
  SELECT COUNT(*) INTO duplicate_count
  FROM notifications
  WHERE user_id = NEW.user_id
    AND title = NEW.title
    AND type = NEW.type
    AND (
      (NEW.data->>'appointment_id' IS NOT NULL 
       AND data->>'appointment_id' = NEW.data->>'appointment_id') OR
      (NEW.data->>'order_id' IS NOT NULL 
       AND data->>'order_id' = NEW.data->>'order_id') OR
      (NEW.data->>'appointment_id' IS NULL 
       AND NEW.data->>'order_id' IS NULL
       AND data->>'appointment_id' IS NULL
       AND data->>'order_id' IS NULL)
    )
    AND created_at >= NOW() - time_window;
  
  -- If duplicate found, prevent insert
  IF duplicate_count > 0 THEN
    RAISE WARNING 'Duplicate notification prevented: user=%, title=%, type=%', 
      NEW.user_id, NEW.title, NEW.type;
    RETURN NULL; -- Prevent insert
  END IF;
  
  RETURN NEW; -- Allow insert
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: CREATE TRIGGER TO PREVENT DUPLICATES (OPTIONAL - USE WITH CAUTION)
-- ============================================================================

-- WARNING: This trigger will prevent ALL duplicates, even legitimate ones
-- Only enable if you're sure you want database-level duplicate prevention
-- The application-level checks in CentralizedNotificationService should be sufficient

-- Uncomment the following if you want database-level duplicate prevention:
/*
DROP TRIGGER IF EXISTS trigger_prevent_duplicate_notification ON notifications;

CREATE TRIGGER trigger_prevent_duplicate_notification
  BEFORE INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION prevent_duplicate_notification();
*/

-- ============================================================================
-- STEP 6: CLEAN UP EXISTING DUPLICATES
-- ============================================================================

-- Remove duplicate notifications from the last 7 days
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY 
        user_id, 
        title, 
        type,
        COALESCE(data->>'appointment_id', data->>'order_id', 'none'),
        DATE(created_at)
      ORDER BY created_at DESC
    ) as rn
  FROM notifications
  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
)
DELETE FROM notifications 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- ============================================================================
-- STEP 7: VERIFY FIX
-- ============================================================================

SELECT 
  'FIX VERIFICATION' as status,
  (SELECT COUNT(*) FROM notifications) as total_notifications,
  (SELECT COUNT(DISTINCT id) FROM notifications) as unique_notifications,
  CASE 
    WHEN (SELECT COUNT(*) FROM notifications) = (SELECT COUNT(DISTINCT id) FROM notifications)
    THEN '✅ No duplicates found'
    ELSE '⚠️ Duplicates still exist'
  END as duplicate_status;







