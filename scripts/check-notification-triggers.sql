-- Check for Database Triggers That Might Duplicate Notifications
-- Run this in Supabase SQL Editor to identify the issue

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
-- STEP 7: SUMMARY - COUNT NOTIFICATIONS IN EACH TABLE/VIEW
-- ============================================================================

-- Use DO block to safely check tables that may not exist
DO $$
DECLARE
  main_count INTEGER;
  enhanced_count INTEGER;
  backup_count INTEGER;
  emergency_count INTEGER;
  result_text TEXT := '';
BEGIN
  -- Count from main notifications table
  SELECT COUNT(*) INTO main_count FROM notifications;
  result_text := result_text || 'notifications: ' || main_count || E'\n';
  
  -- Count from notifications_enhanced view (if it exists)
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'notifications_enhanced' AND table_schema = 'public') THEN
    EXECUTE 'SELECT COUNT(*) FROM notifications_enhanced' INTO enhanced_count;
    result_text := result_text || 'notifications_enhanced (view): ' || enhanced_count || E'\n';
  ELSE
    result_text := result_text || 'notifications_enhanced (view): does not exist' || E'\n';
  END IF;
  
  -- Count from notifications_backup table (if it exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications_backup' AND table_schema = 'public') THEN
    EXECUTE 'SELECT COUNT(*) FROM notifications_backup' INTO backup_count;
    result_text := result_text || 'notifications_backup: ' || backup_count || E'\n';
  ELSE
    result_text := result_text || 'notifications_backup: does not exist' || E'\n';
  END IF;
  
  -- Count from notifications_backup_emergency table (if it exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications_backup_emergency' AND table_schema = 'public') THEN
    EXECUTE 'SELECT COUNT(*) FROM notifications_backup_emergency' INTO emergency_count;
    result_text := result_text || 'notifications_backup_emergency: ' || emergency_count || E'\n';
  ELSE
    result_text := result_text || 'notifications_backup_emergency: does not exist' || E'\n';
  END IF;
  
  RAISE NOTICE '%', result_text;
END $$;

-- Also return a simple query result for the main table
SELECT 
  'notifications' as source,
  COUNT(*) as total_count
FROM notifications;







