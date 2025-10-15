-- Debug Orders Update Issues
-- Run this in Supabase SQL Editor to check for potential issues

-- ============================================================================
-- CHECK ORDERS TABLE CONSTRAINTS
-- ============================================================================

-- Check for any constraints that might prevent updates
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'orders' 
AND tc.table_schema = 'public';

-- ============================================================================
-- CHECK STATUS COLUMN VALUES
-- ============================================================================

-- Check what status values are currently in the database
SELECT DISTINCT status, COUNT(*) as count
FROM orders 
GROUP BY status
ORDER BY status;

-- ============================================================================
-- CHECK FOR TRIGGERS
-- ============================================================================

-- Check if there are any triggers on the orders table that might be causing issues
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders'
AND event_object_schema = 'public';

-- ============================================================================
-- CHECK ROW LEVEL SECURITY
-- ============================================================================

-- Check if RLS is enabled and what policies exist
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    hasrules
FROM pg_tables 
WHERE tablename = 'orders';

-- Check RLS policies
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'orders';

-- ============================================================================
-- TEST SIMPLE UPDATE
-- ============================================================================

-- Try a simple update to see if it works
UPDATE orders 
SET updated_at = NOW() 
WHERE id IN (
    SELECT id FROM orders LIMIT 1
);

-- Check if the update worked
SELECT 
    id,
    status,
    updated_at,
    created_at
FROM orders 
ORDER BY created_at DESC 
LIMIT 5;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Orders debug completed!' as status;
