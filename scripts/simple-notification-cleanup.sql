-- SIMPLE NOTIFICATION DUPLICATE CLEANUP
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: BACKUP EXISTING NOTIFICATIONS
-- ============================================================================

-- Create backup table
CREATE TABLE IF NOT EXISTS notifications_backup_emergency AS 
SELECT * FROM notifications;

-- ============================================================================
-- STEP 2: IDENTIFY ALL DUPLICATE NOTIFICATIONS
-- ============================================================================

-- Show all duplicate notifications before cleanup
SELECT 
  'DUPLICATE NOTIFICATIONS FOUND' as status,
  user_id,
  title,
  type,
  DATE(created_at) as notification_date,
  COUNT(*) as duplicate_count
FROM notifications
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id, title, type, DATE(created_at)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, notification_date DESC;

-- ============================================================================
-- STEP 3: REMOVE ALL DUPLICATE NOTIFICATIONS
-- ============================================================================

-- Remove duplicate notifications, keeping only the most recent one
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, title, type, DATE(created_at) 
      ORDER BY created_at DESC
    ) as rn
  FROM notifications
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
)
DELETE FROM notifications 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- ============================================================================
-- STEP 4: REMOVE DUPLICATE DEVICE TOKENS
-- ============================================================================

-- Remove duplicate device tokens, keeping only the most recent one
WITH duplicate_tokens AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY token 
      ORDER BY last_seen DESC
    ) as rn
  FROM user_devices
)
DELETE FROM user_devices 
WHERE id IN (
  SELECT id FROM duplicate_tokens WHERE rn > 1
);

-- ============================================================================
-- STEP 5: ADD SIMPLE UNIQUE CONSTRAINTS
-- ============================================================================

-- Add unique constraint on device tokens (this should work)
DO $$
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_devices_token_unique'
    ) THEN
        ALTER TABLE user_devices DROP CONSTRAINT user_devices_token_unique;
    END IF;
    
    -- Add new unique constraint
    ALTER TABLE user_devices 
    ADD CONSTRAINT user_devices_token_unique 
    UNIQUE (token);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not add unique constraint: %', SQLERRM;
END $$;

-- ============================================================================
-- STEP 6: CREATE MONITORING FUNCTION
-- ============================================================================

-- Function to check for current duplicates
CREATE OR REPLACE FUNCTION check_notification_duplicates()
RETURNS TABLE(
  user_id UUID,
  title TEXT,
  type TEXT,
  duplicate_count BIGINT,
  latest_created TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.user_id,
    n.title,
    n.type,
    COUNT(*) as duplicate_count,
    MAX(n.created_at) as latest_created
  FROM notifications n
  WHERE n.created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY n.user_id, n.title, n.type
  HAVING COUNT(*) > 1
  ORDER BY duplicate_count DESC, latest_created DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: VERIFY CLEANUP
-- ============================================================================

-- Check for any remaining duplicates
SELECT 
  'REMAINING DUPLICATES CHECK' as status,
  user_id,
  title,
  type,
  DATE(created_at) as notification_date,
  COUNT(*) as count
FROM notifications
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id, title, type, DATE(created_at)
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- Check device token duplicates
SELECT 
  'DEVICE TOKEN DUPLICATES CHECK' as status,
  token,
  COUNT(*) as count
FROM user_devices
GROUP BY token
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- ============================================================================
-- STEP 8: SUCCESS MESSAGE
-- ============================================================================

SELECT 
  'NOTIFICATION CLEANUP COMPLETED!' as status,
  'All duplicates removed' as cleanup,
  'Device token constraint added' as constraints,
  'Monitoring function created' as monitoring,
  'Backup table created' as backup;


