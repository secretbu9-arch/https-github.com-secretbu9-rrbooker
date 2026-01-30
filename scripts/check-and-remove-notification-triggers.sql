-- ============================================================================
-- CHECK AND REMOVE NOTIFICATION TRIGGERS
-- ============================================================================
-- This script identifies and removes any database triggers that might be
-- automatically creating notifications, which could cause duplicates
-- ============================================================================

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
-- STEP 2: CHECK FOR TRIGGERS THAT INSERT INTO NOTIFICATIONS
-- ============================================================================

SELECT 
  'TRIGGERS THAT INSERT INTO NOTIFICATIONS' as check_type,
  trigger_name,
  event_object_table as source_table,
  action_statement
FROM information_schema.triggers
WHERE action_statement LIKE '%INSERT INTO notifications%'
   OR action_statement LIKE '%INSERT INTO notifications_enhanced%'
   OR action_statement LIKE '%notifications%INSERT%'
ORDER BY trigger_name;

-- ============================================================================
-- STEP 3: CHECK FOR FUNCTIONS THAT INSERT INTO NOTIFICATIONS
-- ============================================================================

SELECT 
  'FUNCTIONS THAT INSERT INTO NOTIFICATIONS' as check_type,
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_definition LIKE '%INSERT INTO notifications%'
  AND routine_schema = 'public'
ORDER BY routine_name;

-- ============================================================================
-- STEP 4: REMOVE TRIGGERS THAT CREATE NOTIFICATIONS (if found)
-- ============================================================================
-- WARNING: Only run this if you find triggers that are creating duplicates
-- Review the results from steps 1-3 first!

-- Example: Remove a trigger (uncomment and modify as needed)
-- DROP TRIGGER IF EXISTS trigger_name_here ON table_name_here;

-- ============================================================================
-- STEP 5: CHECK FOR TRIGGERS ON APPOINTMENTS TABLE THAT MIGHT CREATE NOTIFICATIONS
-- ============================================================================

SELECT 
  'TRIGGERS ON APPOINTMENTS TABLE' as check_type,
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'appointments'
  AND (action_statement LIKE '%notification%' OR action_statement LIKE '%INSERT INTO notifications%')
ORDER BY trigger_name;

-- ============================================================================
-- STEP 6: CHECK FOR TRIGGERS ON ORDERS TABLE THAT MIGHT CREATE NOTIFICATIONS
-- ============================================================================

SELECT 
  'TRIGGERS ON ORDERS TABLE' as check_type,
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'orders'
  AND (action_statement LIKE '%notification%' OR action_statement LIKE '%INSERT INTO notifications%')
ORDER BY trigger_name;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. If you find triggers that create notifications, they should be removed
--    as notifications should only be created through CentralizedNotificationService
-- 2. The application code should handle all notification creation
-- 3. Database triggers for notifications can cause duplicates because they
--    don't have access to the duplicate prevention logic in CentralizedNotificationService
-- ============================================================================







