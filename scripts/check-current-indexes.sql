-- Quick script to check current indexes on friend_booking_otps table
-- Run this in Supabase SQL Editor to see what indexes currently exist

SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'friend_booking_otps'
ORDER BY indexname;

-- Check specifically if the optimized index exists
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND tablename = 'friend_booking_otps'
            AND indexname = 'idx_friend_booking_otps_verify_lookup'
        ) THEN '✅ Optimized index EXISTS - verification should be fast'
        ELSE '❌ Optimized index MISSING - verification will be slow (run optimize-friend-booking-otp-indexes.sql)'
    END AS index_status;


