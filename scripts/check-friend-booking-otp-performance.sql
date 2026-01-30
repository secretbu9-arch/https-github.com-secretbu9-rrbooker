-- Script: check-friend-booking-otp-performance.sql
-- Description: Check and optimize friend_booking_otps table performance
-- Usage: Run this script in Supabase SQL editor to diagnose and fix performance issues

-- 1. Check if RLS (Row Level Security) is enabled (can slow down queries)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'friend_booking_otps';

-- 2. Check existing indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'friend_booking_otps'
ORDER BY indexname;

-- 3. Check if optimized index exists
SELECT EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'friend_booking_otps'
    AND indexname = 'idx_friend_booking_otps_verify_lookup'
) AS optimized_index_exists;

-- 4. Analyze table statistics (helps query planner)
ANALYZE public.friend_booking_otps;

-- 5. Check table size and row count
SELECT 
    pg_size_pretty(pg_total_relation_size('public.friend_booking_otps')) AS total_size,
    pg_size_pretty(pg_relation_size('public.friend_booking_otps')) AS table_size,
    (SELECT COUNT(*) FROM public.friend_booking_otps) AS row_count;

-- 6. If RLS is enabled, check policies (RLS can slow queries)
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'friend_booking_otps';

-- 7. Disable RLS if not needed (ONLY IF YOU DON'T NEED ROW-LEVEL SECURITY)
-- ALTER TABLE public.friend_booking_otps DISABLE ROW LEVEL SECURITY;

-- 8. Enable RLS if needed (with proper policies)
-- ALTER TABLE public.friend_booking_otps ENABLE ROW LEVEL SECURITY;

