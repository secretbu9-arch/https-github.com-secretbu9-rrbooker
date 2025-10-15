-- Diagnose Orders Schema - Check current database state
-- Run this in your Supabase SQL Editor to see what's currently in your database

-- ============================================================================
-- CHECK EXISTING TABLES
-- ============================================================================

SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%order%'
ORDER BY table_name;

-- ============================================================================
-- CHECK ORDERS TABLE STRUCTURE
-- ============================================================================

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================
-- CHECK IF PRODUCTS TABLE EXISTS
-- ============================================================================

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'products' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- ============================================================================
-- CHECK EXISTING DATA IN ORDERS TABLE
-- ============================================================================

SELECT COUNT(*) as order_count FROM orders;

-- ============================================================================
-- CHECK CONSTRAINTS ON ORDERS TABLE
-- ============================================================================

SELECT 
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'orders' 
AND tc.table_schema = 'public';

-- ============================================================================
-- CHECK INDEXES ON ORDERS TABLE
-- ============================================================================

SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'orders' 
AND schemaname = 'public';

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT 
    'Schema Diagnosis Complete' as status,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') as orders_table_exists,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'pickup_date') as pickup_date_exists,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') as products_table_exists;
