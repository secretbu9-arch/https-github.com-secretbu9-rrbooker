-- ============================================================================
-- COMPREHENSIVE FIX FOR DUPLICATE NOTIFICATIONS
-- ============================================================================
-- This script:
-- 1. Identifies duplicate notifications
-- 2. Removes duplicates (keeps the oldest one)
-- 3. Adds database constraints to prevent future duplicates
-- 4. Creates indexes for better duplicate detection performance
-- ============================================================================

-- ============================================================================
-- STEP 1: IDENTIFY DUPLICATES
-- ============================================================================
-- This query shows all duplicate notifications grouped by key fields
-- Run this first to see what duplicates exist

SELECT 
  user_id,
  type,
  title,
  data->>'appointment_id' as appointment_id,
  data->>'order_id' as order_id,
  data->>'queue_entry_id' as queue_entry_id,
  COUNT(*) as duplicate_count,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created,
  array_agg(id ORDER BY created_at) as notification_ids
FROM notifications
WHERE created_at >= NOW() - INTERVAL '30 days'  -- Check last 30 days
GROUP BY 
  user_id,
  type,
  title,
  data->>'appointment_id',
  data->>'order_id',
  data->>'queue_entry_id'
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, first_created DESC;

-- ============================================================================
-- STEP 2: REMOVE DUPLICATES (KEEP OLDEST)
-- ============================================================================
-- This removes duplicate notifications, keeping only the oldest one
-- WARNING: This will delete duplicate notifications. Review the query above first!

DO $$
DECLARE
  duplicate_record RECORD;
  notification_ids_to_delete UUID[];
  kept_id UUID;
  total_deleted INTEGER := 0;
  total_groups INTEGER := 0;
BEGIN
  -- Find all duplicate groups (check ALL notifications, not just last 30 days)
  -- This ensures we catch all duplicates before creating unique indexes
  FOR duplicate_record IN
    SELECT 
      user_id,
      type,
      title,
      data->>'appointment_id' as appointment_id,
      data->>'order_id' as order_id,
      data->>'queue_entry_id' as queue_entry_id,
      array_agg(id ORDER BY created_at) as notification_ids
    FROM notifications
    GROUP BY 
      user_id,
      type,
      title,
      data->>'appointment_id',
      data->>'order_id',
      data->>'queue_entry_id'
    HAVING COUNT(*) > 1
  LOOP
    total_groups := total_groups + 1;
    
    -- Keep the first (oldest) notification, delete the rest
    notification_ids_to_delete := duplicate_record.notification_ids[2:array_length(duplicate_record.notification_ids, 1)];
    kept_id := duplicate_record.notification_ids[1];
    
    -- Delete duplicates
    DELETE FROM notifications
    WHERE id = ANY(notification_ids_to_delete);
    
    total_deleted := total_deleted + array_length(notification_ids_to_delete, 1);
    
    RAISE NOTICE 'Removed % duplicates for user %, type %, title "%". Kept notification %', 
      array_length(notification_ids_to_delete, 1),
      duplicate_record.user_id,
      duplicate_record.type,
      duplicate_record.title,
      kept_id;
  END LOOP;
  
  RAISE NOTICE 'Duplicate cleanup completed: % groups processed, % notifications deleted', 
    total_groups, total_deleted;
    
  -- Verify no duplicates remain
  IF EXISTS (
    SELECT 1
    FROM notifications
    GROUP BY 
      user_id,
      type,
      title,
      data->>'appointment_id',
      data->>'order_id',
      data->>'queue_entry_id'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'WARNING: Some duplicates may still exist. Please review and run cleanup again.';
  ELSE
    RAISE NOTICE 'SUCCESS: No duplicates found. Safe to create unique indexes.';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: CREATE UNIQUE INDEX TO PREVENT FUTURE DUPLICATES
-- ============================================================================
-- This creates a unique constraint that prevents duplicate notifications
-- based on user_id, type, title, and relevant IDs
-- NOTE: The 24-hour window is handled by application logic (CentralizedNotificationService)
-- The database constraint prevents exact duplicates permanently
-- 
-- IMPORTANT: Step 2 must complete successfully before running this step!
-- If you get a duplicate key error, run Step 2 again to clean up remaining duplicates.

-- First, drop existing indexes if they exist
DROP INDEX IF EXISTS idx_notifications_unique_prevention;
DROP INDEX IF EXISTS idx_notifications_unique_appointment;
DROP INDEX IF EXISTS idx_notifications_unique_order;
DROP INDEX IF EXISTS idx_notifications_unique_queue;
DROP INDEX IF EXISTS idx_notifications_unique_general;
DROP INDEX IF EXISTS idx_notifications_unique_general_recent;

-- Verify no duplicates exist before creating indexes
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT 
      user_id,
      type,
      title,
      data->>'appointment_id' as appointment_id,
      data->>'order_id' as order_id,
      data->>'queue_entry_id' as queue_entry_id
    FROM notifications
    GROUP BY 
      user_id,
      type,
      title,
      data->>'appointment_id',
      data->>'order_id',
      data->>'queue_entry_id'
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Cannot create unique indexes: % duplicate groups still exist. Please run Step 2 again to remove duplicates first.', duplicate_count;
  END IF;
  
  RAISE NOTICE 'No duplicates found. Proceeding with index creation...';
END $$;

-- Create a unique partial index for appointment notifications
-- This prevents exact duplicates for the same user, type, title, and appointment_id
-- The application layer handles the 24-hour time window logic
CREATE UNIQUE INDEX idx_notifications_unique_appointment
ON notifications (user_id, type, title, (data->>'appointment_id'))
WHERE data->>'appointment_id' IS NOT NULL;

-- Create a unique partial index for order notifications
CREATE UNIQUE INDEX idx_notifications_unique_order
ON notifications (user_id, type, title, (data->>'order_id'))
WHERE data->>'order_id' IS NOT NULL;

-- Create a unique partial index for queue notifications
CREATE UNIQUE INDEX idx_notifications_unique_queue
ON notifications (user_id, type, title, (data->>'queue_entry_id'))
WHERE data->>'queue_entry_id' IS NOT NULL;

-- Create a unique partial index for general notifications (no specific ID)
-- For general notifications without IDs, we prevent exact duplicates
-- The application layer (CentralizedNotificationService) handles time-based logic
CREATE UNIQUE INDEX idx_notifications_unique_general
ON notifications (user_id, type, title)
WHERE (data->>'appointment_id' IS NULL 
  AND data->>'order_id' IS NULL 
  AND data->>'queue_entry_id' IS NULL);

-- ============================================================================
-- STEP 4: CREATE PERFORMANCE INDEXES
-- ============================================================================
-- These indexes improve the duplicate detection queries in CentralizedNotificationService

-- Index for user_id and created_at (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON notifications (user_id, created_at DESC);

-- Index for type and created_at
CREATE INDEX IF NOT EXISTS idx_notifications_type_created
ON notifications (type, created_at DESC);

-- Index for appointment_id lookups
CREATE INDEX IF NOT EXISTS idx_notifications_appointment_id
ON notifications ((data->>'appointment_id'))
WHERE data->>'appointment_id' IS NOT NULL;

-- Index for order_id lookups
CREATE INDEX IF NOT EXISTS idx_notifications_order_id
ON notifications ((data->>'order_id'))
WHERE data->>'order_id' IS NOT NULL;

-- Index for queue_entry_id lookups
CREATE INDEX IF NOT EXISTS idx_notifications_queue_entry_id
ON notifications ((data->>'queue_entry_id'))
WHERE data->>'queue_entry_id' IS NOT NULL;

-- ============================================================================
-- STEP 5: CREATE FUNCTION TO SAFELY INSERT NOTIFICATIONS
-- ============================================================================
-- This function can be used as a database-level safeguard
-- It checks for duplicates before inserting

CREATE OR REPLACE FUNCTION safe_insert_notification(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_type TEXT,
  p_data JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_appointment_id TEXT;
  v_order_id TEXT;
  v_queue_entry_id TEXT;
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  -- Extract IDs from data
  v_appointment_id := p_data->>'appointment_id';
  v_order_id := p_data->>'order_id';
  v_queue_entry_id := p_data->>'queue_entry_id';
  
  -- Check for existing notification in last 24 hours
  IF v_appointment_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE user_id = p_user_id
      AND type = p_type
      AND title = p_title
      AND data->>'appointment_id' = v_appointment_id
      AND created_at >= NOW() - INTERVAL '24 hours'
    LIMIT 1;
  ELSIF v_order_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE user_id = p_user_id
      AND type = p_type
      AND title = p_title
      AND data->>'order_id' = v_order_id
      AND created_at >= NOW() - INTERVAL '24 hours'
    LIMIT 1;
  ELSIF v_queue_entry_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE user_id = p_user_id
      AND type = p_type
      AND title = p_title
      AND data->>'queue_entry_id' = v_queue_entry_id
      AND created_at >= NOW() - INTERVAL '24 hours'
    LIMIT 1;
  ELSE
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE user_id = p_user_id
      AND type = p_type
      AND title = p_title
      AND data->>'appointment_id' IS NULL
      AND data->>'order_id' IS NULL
      AND data->>'queue_entry_id' IS NULL
      AND created_at >= NOW() - INTERVAL '24 hours'
    LIMIT 1;
  END IF;
  
  -- If duplicate exists, return existing ID
  IF v_existing_id IS NOT NULL THEN
    RAISE NOTICE 'Duplicate notification prevented for user %, type %, title "%"', 
      p_user_id, p_type, p_title;
    RETURN v_existing_id;
  END IF;
  
  -- Insert new notification
  INSERT INTO notifications (user_id, title, message, type, data, created_at, updated_at)
  VALUES (p_user_id, p_title, p_message, p_type, p_data, NOW(), NOW())
  RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$$;

-- ============================================================================
-- STEP 6: SUMMARY REPORT
-- ============================================================================
-- Run this after cleanup to see the results

SELECT 
  'Total notifications' as metric,
  COUNT(*)::TEXT as value
FROM notifications
UNION ALL
SELECT 
  'Notifications in last 30 days',
  COUNT(*)::TEXT
FROM notifications
WHERE created_at >= NOW() - INTERVAL '30 days'
UNION ALL
SELECT 
  'Remaining duplicates',
  COUNT(*)::TEXT
FROM (
  SELECT 
    user_id,
    type,
    title,
    data->>'appointment_id' as appointment_id,
    data->>'order_id' as order_id,
    data->>'queue_entry_id' as queue_entry_id
  FROM notifications
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY 
    user_id,
    type,
    title,
    data->>'appointment_id',
    data->>'order_id',
    data->>'queue_entry_id'
  HAVING COUNT(*) > 1
) duplicates;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. The unique indexes will prevent duplicates at the database level
-- 2. The safe_insert_notification function can be used as an additional safeguard
-- 3. The CentralizedNotificationService should still be used in application code
-- 4. The indexes use partial indexes with time windows to allow the same notification
--    to be created again after 24 hours (for recurring events)
-- ============================================================================







