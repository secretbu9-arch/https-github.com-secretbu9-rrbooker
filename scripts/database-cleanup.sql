-- Database Cleanup Script
-- This script removes unnecessary tables and data based on current system requirements

-- WARNING: This script will permanently delete data. Run the analysis script first!
-- Make sure to backup your database before running this cleanup.

-- ==============================================
-- 1. REMOVE BACKUP TABLES (if no longer needed)
-- ==============================================

-- Check if backup tables are empty or no longer needed
-- Uncomment these lines if you want to remove backup tables

-- DROP TABLE IF EXISTS public.notifications_backup CASCADE;
-- DROP TABLE IF EXISTS public.order_notifications_backup CASCADE;

-- ==============================================
-- 2. REMOVE UNUSED FRAUD PREVENTION TABLES
-- ==============================================

-- These tables were part of the fraud prevention system that was removed
-- Uncomment if you want to remove them completely

-- DROP TABLE IF EXISTS public.fake_user_analysis CASCADE;
-- DROP TABLE IF EXISTS public.order_fraud_analysis CASCADE;
-- DROP TABLE IF EXISTS public.order_verifications CASCADE;

-- ==============================================
-- 3. REMOVE UNUSED FEATURE TABLES
-- ==============================================

-- These tables might be from unused features
-- Uncomment if you want to remove them

-- DROP TABLE IF EXISTS public.haircut_recommendations CASCADE;
-- DROP TABLE IF EXISTS public.customer_preferences CASCADE;
-- DROP TABLE IF EXISTS public.user_preferences CASCADE;
-- DROP TABLE IF EXISTS public.queue_snapshots CASCADE;
-- DROP TABLE IF EXISTS public.system_logs CASCADE;

-- ==============================================
-- 4. CLEAN UP ORPHANED DATA
-- ==============================================

-- Remove orphaned order items (items without valid orders)
DELETE FROM public.order_items 
WHERE order_id NOT IN (
    SELECT id FROM public.orders
);

-- Remove orphaned order items (items without valid products)
DELETE FROM public.order_items 
WHERE product_id NOT IN (
    SELECT id FROM public.products
);

-- Remove orphaned appointments (appointments without valid customers)
DELETE FROM public.appointments 
WHERE customer_id NOT IN (
    SELECT id FROM public.users
);

-- Remove orphaned appointments (appointments without valid barbers)
DELETE FROM public.appointments 
WHERE barber_id NOT IN (
    SELECT id FROM public.users
);

-- Remove orphaned appointments (appointments without valid services)
DELETE FROM public.appointments 
WHERE service_id NOT IN (
    SELECT id FROM public.services
);

-- Remove orphaned notifications (notifications without valid users)
DELETE FROM public.notifications 
WHERE user_id NOT IN (
    SELECT id FROM public.users
);

-- Remove orphaned reviews (reviews without valid appointments)
DELETE FROM public.reviews 
WHERE appointment_id NOT IN (
    SELECT id FROM public.appointments
);

-- Remove orphaned reviews (reviews without valid customers)
DELETE FROM public.reviews 
WHERE customer_id NOT IN (
    SELECT id FROM public.users
);

-- Remove orphaned reviews (reviews without valid barbers)
DELETE FROM public.reviews 
WHERE barber_id NOT IN (
    SELECT id FROM public.users
);

-- ==============================================
-- 5. CLEAN UP OLD/EXPIRED DATA
-- ==============================================

-- Remove old notifications (older than 90 days and read)
DELETE FROM public.notifications 
WHERE created_at < NOW() - INTERVAL '90 days'
    AND (is_read = true OR read = true);

-- Remove old appointment history (older than 1 year)
DELETE FROM public.appointment_history 
WHERE created_at < NOW() - INTERVAL '1 year';

-- Remove old system logs (older than 6 months)
DELETE FROM public.system_logs 
WHERE created_at < NOW() - INTERVAL '6 months';

-- Remove expired order verifications
DELETE FROM public.order_verifications 
WHERE expires_at < NOW() 
    AND verified = false;

-- ==============================================
-- 6. CLEAN UP INACTIVE DATA
-- ==============================================

-- Remove inactive products (if you want to permanently delete them)
-- DELETE FROM public.products WHERE is_active = false;

-- Remove inactive services (if you want to permanently delete them)
-- DELETE FROM public.services WHERE is_active = false;

-- Remove inactive add-ons (if you want to permanently delete them)
-- DELETE FROM public.add_ons WHERE is_active = false;

-- ==============================================
-- 7. VACUUM AND ANALYZE
-- ==============================================

-- Vacuum all tables to reclaim space
VACUUM ANALYZE;

-- ==============================================
-- 8. VERIFICATION QUERIES
-- ==============================================

-- Check remaining table sizes after cleanup
SELECT 
    schemaname,
    tablename,
    n_live_tup as row_count,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- Check for any remaining orphaned data
SELECT 'order_items' as table_name, COUNT(*) as orphaned_count
FROM public.order_items oi
LEFT JOIN public.orders o ON oi.order_id = o.id
WHERE o.id IS NULL

UNION ALL

SELECT 'appointments' as table_name, COUNT(*) as orphaned_count
FROM public.appointments a
LEFT JOIN public.users u ON a.customer_id = u.id
WHERE u.id IS NULL

UNION ALL

SELECT 'notifications' as table_name, COUNT(*) as orphaned_count
FROM public.notifications n
LEFT JOIN public.users u ON n.user_id = u.id
WHERE u.id IS NULL;


