-- QUICK FIX: Make verification fast for double booking (book a child)
-- Run this script in Supabase SQL Editor to fix slow verification

-- ============================================
-- STEP 1: Check if the critical index exists
-- ============================================
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND tablename = 'friend_booking_otps'
            AND indexname = 'idx_friend_booking_otps_verify_lookup'
        ) THEN '✅ Index EXISTS - verification should be fast'
        ELSE '❌ Index MISSING - creating it now...'
    END AS status;

-- ============================================
-- STEP 2: Create the optimized index (if missing)
-- ============================================
-- This is the MOST IMPORTANT index for fast verification
CREATE INDEX IF NOT EXISTS idx_friend_booking_otps_verify_lookup 
  ON public.friend_booking_otps (email, code, expires_at)
  WHERE verified_at IS NULL;

-- Additional indexes for better performance
CREATE INDEX IF NOT EXISTS idx_friend_booking_otps_email_verified 
  ON public.friend_booking_otps (email)
  WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_friend_booking_otps_expires_verified 
  ON public.friend_booking_otps (expires_at)
  WHERE verified_at IS NULL;

-- ============================================
-- STEP 3: Update table statistics (CRITICAL!)
-- ============================================
-- This tells PostgreSQL to use the new indexes
ANALYZE public.friend_booking_otps;

-- ============================================
-- STEP 4: Verify indexes were created
-- ============================================
SELECT 
    '✅ Indexes Created' AS status,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'friend_booking_otps'
AND indexname LIKE '%verify_lookup%'
ORDER BY indexname;

-- ============================================
-- STEP 5: Test query speed (should be FAST now)
-- ============================================
-- This shows if the index is being used (should show "Index Scan")
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM public.friend_booking_otps
WHERE email = 'test@example.com'
  AND code = '123456'
  AND verified_at IS NULL
  AND expires_at > NOW()
LIMIT 1;

-- ============================================
-- RESULT: Verification should now be FAST (< 50ms instead of > 1000ms)
-- ============================================
SELECT '✅ DONE! Verification should now be fast. Try verifying a code now.' AS result;


