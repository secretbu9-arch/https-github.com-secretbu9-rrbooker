-- Cleanup Duplicate Notifications
-- Run this in Supabase SQL Editor to remove existing duplicates

-- ============================================================================
-- STEP 1: IDENTIFY DUPLICATES
-- ============================================================================

-- Show all duplicates before cleanup
SELECT 
  'DUPLICATES FOUND' as status,
  user_id,
  title,
  type,
  DATE(created_at) as notification_date,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as notification_ids
FROM notifications
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id, title, type, DATE(created_at)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, notification_date DESC;

-- ============================================================================
-- STEP 2: REMOVE DUPLICATES (KEEP MOST RECENT)
-- ============================================================================

-- Remove duplicate notifications, keeping only the most recent one
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
-- STEP 3: VERIFY CLEANUP
-- ============================================================================

-- Check if duplicates still exist
SELECT 
  'CLEANUP VERIFICATION' as status,
  COUNT(*) as total_notifications,
  COUNT(DISTINCT id) as unique_notifications,
  CASE 
    WHEN COUNT(*) = COUNT(DISTINCT id)
    THEN '✅ No duplicates found'
    ELSE '⚠️ Duplicates still exist'
  END as duplicate_status
FROM notifications
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days';

-- Show remaining duplicates (if any)
SELECT 
  'REMAINING DUPLICATES' as status,
  user_id,
  title,
  type,
  DATE(created_at) as notification_date,
  COUNT(*) as duplicate_count
FROM notifications
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id, title, type, DATE(created_at)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;







