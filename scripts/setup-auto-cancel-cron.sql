-- Setup Auto-Cancel Cron Job
-- This script sets up a pg_cron job to automatically cancel unconfirmed items daily
-- 
-- IMPORTANT: pg_cron extension must be enabled in your Supabase project
-- To enable: Go to Database > Extensions > Enable pg_cron

-- ============================================================================
-- STEP 1: ENABLE PG_CRON EXTENSION (if not already enabled)
-- ============================================================================

-- Note: This may require superuser privileges
-- If you get a permission error, enable it via Supabase Dashboard:
-- Database > Extensions > Search for "pg_cron" > Enable

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- STEP 2: SCHEDULE DAILY AUTO-CANCEL JOB
-- ============================================================================

-- Schedule the job to run daily at 1:00 AM UTC (adjust timezone as needed)
-- This ensures it runs after the scheduled day has passed
-- 
-- Cron format: minute hour day month weekday
-- '0 1 * * *' = Every day at 1:00 AM UTC

-- First, remove any existing job with the same name (if exists)
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  -- Check if job exists by jobname (preferred) or by command
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'auto-cancel-unconfirmed-daily'
     OR command LIKE '%auto_cancel_unconfirmed_items%'
  LIMIT 1;
  
  IF v_jobid IS NOT NULL THEN
    -- Unschedule by jobid
    BEGIN
      PERFORM cron.unschedule(v_jobid);
      RAISE NOTICE 'Unscheduled existing auto-cancel job (jobid: %)', v_jobid;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not unschedule job, will try to create new one anyway';
    END;
  ELSE
    RAISE NOTICE 'No existing job found, will create new one';
  END IF;
END $$;

-- Schedule the new job
SELECT cron.schedule(
  'auto-cancel-unconfirmed-daily',           -- Job name
  '0 1 * * *',                              -- Cron schedule: Daily at 1:00 AM UTC
  $$SELECT auto_cancel_unconfirmed_items();$$ -- SQL to execute
);

-- ============================================================================
-- ALTERNATIVE SCHEDULES
-- ============================================================================

-- If you want to run it at a different time, use one of these:

-- Run daily at 2:00 AM UTC
-- SELECT cron.schedule('auto-cancel-unconfirmed-daily', '0 2 * * *', $$SELECT auto_cancel_unconfirmed_items();$$);

-- Run daily at midnight UTC
-- SELECT cron.schedule('auto-cancel-unconfirmed-daily', '0 0 * * *', $$SELECT auto_cancel_unconfirmed_items();$$);

-- Run every 6 hours (for testing)
-- SELECT cron.schedule('auto-cancel-unconfirmed-daily', '0 */6 * * *', $$SELECT auto_cancel_unconfirmed_items();$$);

-- ============================================================================
-- VERIFY THE JOB
-- ============================================================================

-- Check if the job was scheduled successfully
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job 
WHERE jobname = 'auto-cancel-unconfirmed-daily'
   OR command LIKE '%auto_cancel_unconfirmed_items%';

-- View all scheduled jobs
SELECT * FROM cron.job;

-- ============================================================================
-- MANAGE THE JOB
-- ============================================================================

-- To unschedule the job:
-- SELECT cron.unschedule('auto-cancel-unconfirmed-daily');

-- To update the schedule:
-- SELECT cron.unschedule('auto-cancel-unconfirmed-daily');
-- SELECT cron.schedule('auto-cancel-unconfirmed-daily', 'NEW_CRON_SCHEDULE', $$SELECT auto_cancel_unconfirmed_items();$$);

-- ============================================================================
-- VIEW JOB HISTORY
-- ============================================================================

-- View recent job runs (last 10)
SELECT 
  jrd.jobid,
  j.jobname,
  jrd.runid,
  jrd.job_pid,
  jrd.database,
  jrd.username,
  jrd.command,
  jrd.status,
  jrd.return_message,
  jrd.start_time,
  jrd.end_time
FROM cron.job_run_details jrd
INNER JOIN cron.job j ON jrd.jobid = j.jobid
WHERE j.jobname = 'auto-cancel-unconfirmed-daily'
   OR j.command LIKE '%auto_cancel_unconfirmed_items%'
ORDER BY jrd.start_time DESC
LIMIT 10;

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. The job runs in UTC time. Adjust the schedule based on your timezone.
--    For example, if you're in PST (UTC-8), 1:00 AM UTC = 5:00 PM PST previous day
--
-- 2. The function cancels items where:
--    - Orders: status='pending' AND pickup_date < CURRENT_DATE AND confirmed_at IS NULL
--    - Appointments: status='pending' AND appointment_date < CURRENT_DATE AND confirmed_at IS NULL
--
-- 3. You can also trigger this manually by calling:
--    SELECT auto_cancel_unconfirmed_items();
--
-- 4. Or via the Edge Function:
--    POST /functions/v1/auto-cancel-unconfirmed

