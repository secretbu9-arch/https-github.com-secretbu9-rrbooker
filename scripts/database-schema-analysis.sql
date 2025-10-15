-- Database Schema Analysis and Cleanup
-- This script analyzes the current database schema and identifies cleanup opportunities

-- 1. Check for unused/duplicate tables
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Check table sizes and row counts
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- 3. Check for foreign key constraints that might be broken
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- 4. Check for tables with no data
SELECT 
    schemaname,
    tablename,
    n_live_tup as row_count
FROM pg_stat_user_tables 
WHERE schemaname = 'public' 
    AND n_live_tup = 0
ORDER BY tablename;

-- 5. Check for potential duplicate functionality
-- Look for tables that might serve similar purposes
SELECT 
    'notifications' as table_name,
    'Main notifications table' as purpose,
    n_live_tup as row_count
FROM pg_stat_user_tables 
WHERE tablename = 'notifications'

UNION ALL

SELECT 
    'notifications_backup' as table_name,
    'Backup of notifications' as purpose,
    n_live_tup as row_count
FROM pg_stat_user_tables 
WHERE tablename = 'notifications_backup'

UNION ALL

SELECT 
    'order_notifications_backup' as table_name,
    'Backup of order notifications' as purpose,
    n_live_tup as row_count
FROM pg_stat_user_tables 
WHERE tablename = 'order_notifications_backup';

-- 6. Check for tables that might be unused based on current system
-- These tables might be from old implementations or unused features
SELECT 
    tablename,
    'Potentially unused - check if needed' as status
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
    AND tablename IN (
        'fake_user_analysis',
        'order_fraud_analysis', 
        'order_verifications',
        'haircut_recommendations',
        'customer_preferences',
        'user_preferences',
        'queue_snapshots',
        'system_logs'
    )
ORDER BY tablename;


