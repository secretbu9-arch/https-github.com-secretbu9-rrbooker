-- Fix Notification System - Complete Migration
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: MIGRATE EXISTING NOTIFICATIONS
-- ============================================================================

-- Run the existing migration
\i scripts/migrate-existing-notifications.sql

-- ============================================================================
-- STEP 2: REMOVE ORDER NOTIFICATIONS TABLE
-- ============================================================================

-- Run the cleanup
\i scripts/remove-order-notifications.sql

-- ============================================================================
-- STEP 3: VERIFY MIGRATION
-- ============================================================================

-- Check notifications table structure
SELECT 
  'Notifications Table Structure' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'notifications' 
ORDER BY ordinal_position;

-- Check notification data
SELECT 
  'Notification Data Summary' as check_type,
  COUNT(*) as total_notifications,
  COUNT(CASE WHEN type = 'appointment' THEN 1 END) as appointment_notifications,
  COUNT(CASE WHEN type = 'order' THEN 1 END) as order_notifications,
  COUNT(CASE WHEN type = 'queue' THEN 1 END) as queue_notifications,
  COUNT(CASE WHEN type = 'system' THEN 1 END) as system_notifications
FROM notifications;

-- Check categories
SELECT 
  'Category Distribution' as check_type,
  data->>'category' as category,
  COUNT(*) as count
FROM notifications
WHERE data->>'category' IS NOT NULL
GROUP BY data->>'category'
ORDER BY count DESC;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Notification system migration completed successfully!' as status;


