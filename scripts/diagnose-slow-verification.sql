-- Comprehensive diagnostic script for slow OTP verification
-- Run this in Supabase SQL Editor to diagnose the issue

-- ============================================
-- STEP 1: Check if indexes exist
-- ============================================
SELECT 
    'Index Check' AS diagnostic_step,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND tablename = 'friend_booking_otps'
            AND indexname = 'idx_friend_booking_otps_verify_lookup'
        ) THEN '✅ CRITICAL INDEX EXISTS'
        ELSE '❌ CRITICAL INDEX MISSING - THIS IS LIKELY THE PROBLEM!'
    END AS index_status;

-- Show all indexes
SELECT 
    'All Indexes' AS diagnostic_step,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'friend_booking_otps'
ORDER BY indexname;

-- ============================================
-- STEP 2: Check table statistics
-- ============================================
SELECT 
    'Table Statistics' AS diagnostic_step,
    pg_size_pretty(pg_total_relation_size('public.friend_booking_otps')) AS total_size,
    pg_size_pretty(pg_relation_size('public.friend_booking_otps')) AS table_size,
    (SELECT COUNT(*) FROM public.friend_booking_otps) AS total_rows,
    (SELECT COUNT(*) FROM public.friend_booking_otps WHERE verified_at IS NULL) AS unverified_rows,
    (SELECT COUNT(*) FROM public.friend_booking_otps WHERE verified_at IS NOT NULL) AS verified_rows;

-- ============================================
-- STEP 3: Analyze table (update statistics)
-- ============================================
ANALYZE public.friend_booking_otps;

SELECT 'Statistics Updated' AS diagnostic_step, 'Table statistics have been refreshed' AS status;

-- ============================================
-- STEP 4: Test query performance with EXPLAIN
-- ============================================
-- This shows what PostgreSQL's query planner will do
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id
FROM public.friend_booking_otps
WHERE email = 'test@example.com'
  AND code = '123456'
  AND verified_at IS NULL
  AND expires_at > NOW()
LIMIT 1;

-- ============================================
-- STEP 5: Check for performance issues
-- ============================================
-- Check if there are many expired codes that should be cleaned up
SELECT 
    'Cleanup Recommendation' AS diagnostic_step,
    COUNT(*) AS expired_unverified_count,
    CASE 
        WHEN COUNT(*) > 1000 THEN '⚠️ Consider cleaning up expired codes (may slow down queries)'
        ELSE '✅ OK - not many expired codes'
    END AS recommendation
FROM public.friend_booking_otps
WHERE expires_at < NOW()
  AND verified_at IS NULL;

-- ============================================
-- STEP 6: Check index usage statistics
-- ============================================
SELECT 
    'Index Usage' AS diagnostic_step,
    schemaname,
    tablename,
    indexname,
    idx_scan AS index_scans,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public' 
AND tablename = 'friend_booking_otps'
ORDER BY indexname;


