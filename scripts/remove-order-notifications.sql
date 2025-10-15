-- Remove Order Notifications Table
-- Run this in Supabase SQL Editor AFTER running migrate-existing-notifications.sql

-- ============================================================================
-- STEP 1: VERIFY MIGRATION COMPLETED
-- ============================================================================

-- Check if order_notifications table exists
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_notifications') 
    THEN 'order_notifications table exists'
    ELSE 'order_notifications table does not exist'
  END as status;

-- Check if notifications table has the new columns
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'category')
    THEN 'Notifications table has been migrated'
    ELSE 'Notifications table migration incomplete'
  END as migration_status;

-- ============================================================================
-- STEP 2: BACKUP ORDER NOTIFICATIONS (if they exist)
-- ============================================================================

-- Create backup table for order_notifications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_notifications') THEN
    -- Create backup table
    CREATE TABLE IF NOT EXISTS order_notifications_backup AS 
    SELECT * FROM order_notifications;
    
    RAISE NOTICE 'Order notifications backed up to order_notifications_backup table';
  ELSE
    RAISE NOTICE 'No order_notifications table found to backup';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: VERIFY DATA MIGRATION
-- ============================================================================

-- Check if order notifications were migrated to main notifications table
SELECT 
  'Order Notifications Migration Check' as status,
  (SELECT COUNT(*) FROM order_notifications WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_notifications')) as original_count,
  (SELECT COUNT(*) FROM notifications WHERE type = 'order') as migrated_count,
  (SELECT COUNT(*) FROM notifications WHERE data->>'migrated_from' = 'order_notifications') as explicitly_migrated;

-- ============================================================================
-- STEP 4: DROP ORDER NOTIFICATIONS TABLE
-- ============================================================================

-- Drop the order_notifications table
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_notifications') THEN
    -- Drop the table
    DROP TABLE order_notifications CASCADE;
    RAISE NOTICE 'order_notifications table dropped successfully';
  ELSE
    RAISE NOTICE 'order_notifications table does not exist';
  END IF;
END $$;

-- ============================================================================
-- STEP 5: CLEAN UP RELATED OBJECTS
-- ============================================================================

-- Drop any indexes that might have been created for order_notifications
DO $$
BEGIN
  -- Drop indexes if they exist
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_order_notifications_order_id') THEN
    DROP INDEX idx_order_notifications_order_id;
    RAISE NOTICE 'Dropped idx_order_notifications_order_id index';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_order_notifications_user_id') THEN
    DROP INDEX idx_order_notifications_user_id;
    RAISE NOTICE 'Dropped idx_order_notifications_user_id index';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_order_notifications_type') THEN
    DROP INDEX idx_order_notifications_type;
    RAISE NOTICE 'Dropped idx_order_notifications_type index';
  END IF;
END $$;

-- ============================================================================
-- STEP 6: VERIFY CLEANUP
-- ============================================================================

-- Verify order_notifications table is gone
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_notifications') 
    THEN 'ERROR: order_notifications table still exists'
    ELSE 'SUCCESS: order_notifications table removed'
  END as cleanup_status;

-- Check that order notifications are still available in main table
SELECT 
  'Order Notifications in Main Table' as status,
  COUNT(*) as total_order_notifications,
  COUNT(CASE WHEN read_at IS NULL THEN 1 END) as unread_order_notifications
FROM notifications 
WHERE type = 'order';

-- ============================================================================
-- STEP 7: OPTIONAL - CLEAN UP BACKUP TABLE
-- ============================================================================

-- Uncomment the following lines if you want to remove the backup table
-- (Only do this after confirming everything works correctly)

/*
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_notifications_backup') THEN
    DROP TABLE order_notifications_backup;
    RAISE NOTICE 'Backup table removed';
  END IF;
END $$;
*/

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Order notifications table cleanup completed successfully!' as status;


