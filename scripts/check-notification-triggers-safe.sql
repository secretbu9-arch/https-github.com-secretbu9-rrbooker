-- Check for Database Triggers That Might Duplicate Notifications (SAFE VERSION)
-- Run this in Supabase SQL Editor to identify the issue
-- This version handles missing tables gracefully

-- ============================================================================
-- STEP 1: CHECK FOR TRIGGERS ON NOTIFICATIONS TABLE
-- ============================================================================

SELECT 
  'TRIGGERS ON NOTIFICATIONS TABLE' as check_type,
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'notifications'
ORDER BY trigger_name;

-- ============================================================================
-- STEP 2: CHECK FOR TRIGGERS THAT MIGHT INSERT INTO NOTIFICATIONS
-- ============================================================================

SELECT 
  'TRIGGERS THAT INSERT INTO NOTIFICATIONS' as check_type,
  trigger_name,
  event_object_table as source_table,
  action_statement
FROM information_schema.triggers
WHERE action_statement LIKE '%INSERT INTO notifications%'
   OR action_statement LIKE '%INSERT INTO notifications_enhanced%'
   OR action_statement LIKE '%INSERT INTO notifications_backup%'
ORDER BY trigger_name;

-- ============================================================================
-- STEP 3: CHECK FOR FUNCTIONS THAT MIGHT DUPLICATE NOTIFICATIONS
-- ============================================================================

SELECT 
  'FUNCTIONS THAT INSERT INTO NOTIFICATIONS' as check_type,
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_definition LIKE '%INSERT INTO notifications%'
  AND routine_schema = 'public'
ORDER BY routine_name;

-- ============================================================================
-- STEP 4: CHECK IF NOTIFICATIONS_ENHANCED VIEW HAS TRIGGERS
-- ============================================================================

SELECT 
  'TRIGGERS ON NOTIFICATIONS_ENHANCED VIEW' as check_type,
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'notifications_enhanced'
ORDER BY trigger_name;

-- ============================================================================
-- STEP 5: CHECK FOR ROW LEVEL SECURITY POLICIES THAT MIGHT CAUSE ISSUES
-- ============================================================================

SELECT 
  'RLS POLICIES ON NOTIFICATIONS' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('notifications', 'notifications_enhanced', 'notifications_backup', 'notifications_backup_emergency')
ORDER BY tablename, policyname;

-- ============================================================================
-- STEP 6: CHECK FOR REAL-TIME SUBSCRIPTIONS (PostgreSQL Replication)
-- ============================================================================

SELECT 
  'PUBLICATION STATUS' as check_type,
  pubname,
  puballtables,
  pubinsert,
  pubupdate,
  pubdelete
FROM pg_publication
WHERE pubname LIKE '%notification%' OR puballtables = true;

-- ============================================================================
-- STEP 7: SUMMARY - COUNT NOTIFICATIONS IN EACH TABLE/VIEW (SAFE)
-- ============================================================================

-- Count from main notifications table
SELECT 
  'notifications' as source,
  COUNT(*) as total_count
FROM notifications

UNION ALL

-- Count from notifications_enhanced view (if it exists)
SELECT 
  'notifications_enhanced (view)' as source,
  COUNT(*) as total_count
FROM notifications_enhanced
WHERE EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'notifications_enhanced' AND table_schema = 'public')

UNION ALL

-- Count from notifications_backup table (if it exists) - using DO block for safety
DO $$
DECLARE
  backup_count INTEGER := 0;
  emergency_count INTEGER := 0;
BEGIN
  -- Check notifications_backup
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications_backup' AND table_schema = 'public') THEN
    EXECUTE 'SELECT COUNT(*) FROM notifications_backup' INTO backup_count;
    RAISE NOTICE 'notifications_backup: % notifications', backup_count;
  ELSE
    RAISE NOTICE 'notifications_backup: table does not exist';
  END IF;
  
  -- Check notifications_backup_emergency
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications_backup_emergency' AND table_schema = 'public') THEN
    EXECUTE 'SELECT COUNT(*) FROM notifications_backup_emergency' INTO emergency_count;
    RAISE NOTICE 'notifications_backup_emergency: % notifications', emergency_count;
  ELSE
    RAISE NOTICE 'notifications_backup_emergency: table does not exist';
  END IF;
END $$;

-- Final summary query (only for tables/views that definitely exist)
SELECT 
  'notifications' as source,
  COUNT(*) as total_count
FROM notifications

UNION ALL

SELECT 
  'notifications_enhanced (view)' as source,
  COUNT(*) as total_count
FROM notifications_enhanced
WHERE EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'notifications_enhanced' AND table_schema = 'public');







