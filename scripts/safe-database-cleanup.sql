-- Safe Database Cleanup Script
-- This script provides safe cleanup options with verification steps

-- ==============================================
-- STEP 1: ANALYSIS - Run this first to see what can be cleaned
-- ==============================================

-- Check current table sizes
SELECT 
    'Current Table Sizes' as info,
    tablename,
    n_live_tup as row_count,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- Check for empty tables
SELECT 
    'Empty Tables' as info,
    tablename,
    n_live_tup as row_count
FROM pg_stat_user_tables 
WHERE schemaname = 'public' 
    AND n_live_tup = 0
ORDER BY tablename;

-- Check for orphaned data
SELECT 
    'Orphaned order_items' as info,
    COUNT(*) as count
FROM public.order_items oi
LEFT JOIN public.orders o ON oi.order_id = o.id
WHERE o.id IS NULL;

SELECT 
    'Orphaned appointments' as info,
    COUNT(*) as count
FROM public.appointments a
LEFT JOIN public.users u ON a.customer_id = u.id
WHERE u.id IS NULL;

SELECT 
    'Orphaned notifications' as info,
    COUNT(*) as count
FROM public.notifications n
LEFT JOIN public.users u ON n.user_id = u.id
WHERE u.id IS NULL;

-- ==============================================
-- STEP 2: SAFE CLEANUP OPTIONS
-- ==============================================

-- Option A: Clean up orphaned data (SAFE - removes broken references)
-- Uncomment to run:

/*
-- Remove orphaned order items
DELETE FROM public.order_items 
WHERE order_id NOT IN (SELECT id FROM public.orders);

-- Remove orphaned order items without valid products
DELETE FROM public.order_items 
WHERE product_id NOT IN (SELECT id FROM public.products);

-- Remove orphaned appointments
DELETE FROM public.appointments 
WHERE customer_id NOT IN (SELECT id FROM public.users)
   OR barber_id NOT IN (SELECT id FROM public.users)
   OR service_id NOT IN (SELECT id FROM public.services);

-- Remove orphaned notifications
DELETE FROM public.notifications 
WHERE user_id NOT IN (SELECT id FROM public.users);

-- Remove orphaned reviews
DELETE FROM public.reviews 
WHERE appointment_id NOT IN (SELECT id FROM public.appointments)
   OR customer_id NOT IN (SELECT id FROM public.users)
   OR barber_id NOT IN (SELECT id FROM public.users);
*/

-- Option B: Clean up old data (SAFE - removes old, read notifications)
-- Uncomment to run:

/*
-- Remove old read notifications (older than 90 days)
DELETE FROM public.notifications 
WHERE created_at < NOW() - INTERVAL '90 days'
    AND (is_read = true OR read = true);

-- Remove old appointment history (older than 1 year)
DELETE FROM public.appointment_history 
WHERE created_at < NOW() - INTERVAL '1 year';

-- Remove expired order verifications
DELETE FROM public.order_verifications 
WHERE expires_at < NOW() 
    AND verified = false;
*/

-- Option C: Remove backup tables (SAFE if backups are no longer needed)
-- Uncomment to run:

/*
-- Check if backup tables are empty first
SELECT 'notifications_backup' as table_name, COUNT(*) as row_count FROM public.notifications_backup;
SELECT 'order_notifications_backup' as table_name, COUNT(*) as row_count FROM public.order_notifications_backup;

-- If they are empty or no longer needed, remove them:
-- DROP TABLE IF EXISTS public.notifications_backup CASCADE;
-- DROP TABLE IF EXISTS public.order_notifications_backup CASCADE;
*/

-- Option D: Remove unused fraud prevention tables (SAFE - system no longer uses these)
-- Uncomment to run:

/*
-- These tables are no longer used since fraud prevention was removed
-- DROP TABLE IF EXISTS public.fake_user_analysis CASCADE;
-- DROP TABLE IF EXISTS public.order_fraud_analysis CASCADE;
-- DROP TABLE IF EXISTS public.order_verifications CASCADE;
*/

-- Option E: Remove unused feature tables (REVIEW CAREFULLY)
-- Uncomment only if you're sure these features are not used:

/*
-- Check if these tables have data first
SELECT 'haircut_recommendations' as table_name, COUNT(*) as row_count FROM public.haircut_recommendations;
SELECT 'customer_preferences' as table_name, COUNT(*) as row_count FROM public.customer_preferences;
SELECT 'user_preferences' as table_name, COUNT(*) as row_count FROM public.user_preferences;
SELECT 'queue_snapshots' as table_name, COUNT(*) as row_count FROM public.queue_snapshots;
SELECT 'system_logs' as table_name, COUNT(*) as row_count FROM public.system_logs;

-- If they are empty or unused, remove them:
-- DROP TABLE IF EXISTS public.haircut_recommendations CASCADE;
-- DROP TABLE IF EXISTS public.customer_preferences CASCADE;
-- DROP TABLE IF EXISTS public.user_preferences CASCADE;
-- DROP TABLE IF EXISTS public.queue_snapshots CASCADE;
-- DROP TABLE IF EXISTS public.system_logs CASCADE;
*/

-- ==============================================
-- STEP 3: FINAL CLEANUP AND OPTIMIZATION
-- ==============================================

-- After running any of the above options, run this to optimize:

/*
-- Vacuum to reclaim space
VACUUM ANALYZE;

-- Check final table sizes
SELECT 
    'Final Table Sizes' as info,
    tablename,
    n_live_tup as row_count,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
*/

-- ==============================================
-- RECOMMENDED CLEANUP SEQUENCE
-- ==============================================

/*
1. Run the analysis queries first to see current state
2. Start with Option A (orphaned data cleanup) - this is always safe
3. Then Option B (old data cleanup) - this is also safe
4. Review Option C (backup tables) - remove if no longer needed
5. Consider Option D (fraud prevention tables) - safe since feature was removed
6. Be careful with Option E (feature tables) - only remove if truly unused
7. Run the final vacuum and analysis
*/


