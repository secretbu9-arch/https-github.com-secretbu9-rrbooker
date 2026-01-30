# Auto-Cancel Unconfirmed Items Setup Guide

This guide explains how to set up automatic cancellation of unconfirmed orders and appointments.

## Overview

The auto-cancel system automatically cancels:
- **Orders** that are `pending`, have a `pickup_date` in the past, and were never confirmed (`confirmed_at IS NULL`)
- **Appointments** that are `pending`, have an `appointment_date` in the past, and were never confirmed (`confirmed_at IS NULL`)

## Components

1. **Database Function** (`auto_cancel_unconfirmed_items()`)
   - Performs the actual cancellation logic
   - Can be called manually or via cron job

2. **Supabase Edge Function** (`auto-cancel-unconfirmed`)
   - HTTP endpoint that triggers the cancellation
   - Can be called manually or via external cron service

3. **Service** (`AutoCancelService.js`)
   - Client-side service for manual execution
   - Provides statistics and helper methods

## Setup Instructions

### Step 1: Create Database Function

Run the SQL script to create the database function:

```sql
-- Run this in Supabase SQL Editor
\i scripts/create-auto-cancel-function.sql
```

Or copy and paste the contents of `scripts/create-auto-cancel-function.sql` into the Supabase SQL Editor.

### Step 2: Deploy Edge Function

Deploy the Edge Function to Supabase:

```bash
# Make sure you have Supabase CLI installed
supabase functions deploy auto-cancel-unconfirmed
```

Or use the Supabase Dashboard:
1. Go to Edge Functions
2. Create new function
3. Copy the contents of `supabase/functions/auto-cancel-unconfirmed/index.ts`

### Step 3: Set Up Cron Job (Recommended)

#### Option A: Using pg_cron (Database-level)

1. Enable pg_cron extension in Supabase Dashboard:
   - Go to Database > Extensions
   - Search for "pg_cron"
   - Click Enable

2. Run the cron setup script:

```sql
-- Run this in Supabase SQL Editor
\i scripts/setup-auto-cancel-cron.sql
```

This will schedule the job to run daily at 1:00 AM UTC. Adjust the schedule as needed.

#### Option B: Using External Cron Service

You can use services like:
- **Cron-job.org** (free)
- **EasyCron** (free tier available)
- **GitHub Actions** (free for public repos)
- **Vercel Cron** (if using Vercel)

Set up a cron job to call:
```
POST https://YOUR_PROJECT.supabase.co/functions/v1/auto-cancel-unconfirmed
Headers:
  Authorization: Bearer YOUR_SERVICE_ROLE_KEY
```

Schedule: `0 1 * * *` (Daily at 1:00 AM UTC)

## Manual Execution

### Via Database Function

```sql
SELECT auto_cancel_unconfirmed_items();
```

### Via Edge Function

```bash
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/auto-cancel-unconfirmed \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### Via Service (Client-side)

```javascript
import AutoCancelService from './services/AutoCancelService';

// Cancel unconfirmed items
const result = await AutoCancelService.cancelUnconfirmedItems();
console.log(`Cancelled ${result.cancelledOrders} orders and ${result.cancelledAppointments} appointments`);

// Get statistics
const stats = await AutoCancelService.getUnconfirmedItemsStats();
console.log(`Unconfirmed items: ${stats.total}`);
```

## How It Works

1. **Orders**: 
   - Status must be `pending`
   - `pickup_date` must be before today
   - `confirmed_at` must be NULL
   - When cancelled: status → `cancelled`, adds cancellation reason

2. **Appointments**:
   - Status must be `pending`
   - `appointment_date` must be before today
   - `confirmed_at` must be NULL
   - When cancelled: status → `cancelled`, clears queue_position, adds cancellation reason

## Monitoring

### Check Job Status (pg_cron)

```sql
-- View scheduled jobs
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job 
WHERE jobname = 'auto-cancel-unconfirmed-daily';

-- View job execution history
SELECT 
  jrd.jobid,
  j.jobname,
  jrd.command,
  jrd.status,
  jrd.return_message,
  jrd.start_time,
  jrd.end_time
FROM cron.job_run_details jrd
INNER JOIN cron.job j ON jrd.jobid = j.jobid
WHERE j.jobname = 'auto-cancel-unconfirmed-daily'
ORDER BY jrd.start_time DESC
LIMIT 10;
```

### Check Cancelled Items

```sql
-- View recently cancelled orders
SELECT id, pickup_date, cancelled_at, cancellation_reason
FROM orders
WHERE status = 'cancelled'
  AND cancellation_reason LIKE 'Automatically cancelled%'
ORDER BY cancelled_at DESC
LIMIT 10;

-- View recently cancelled appointments
SELECT id, appointment_date, cancelled_at, cancellation_reason
FROM appointments
WHERE status = 'cancelled'
  AND cancellation_reason LIKE 'Automatically cancelled%'
ORDER BY cancelled_at DESC
LIMIT 10;
```

## Customization

### Change Cancellation Time

Edit the cron schedule in `scripts/setup-auto-cancel-cron.sql`:

```sql
-- Run at 2:00 AM UTC instead
SELECT cron.schedule('auto-cancel-unconfirmed-daily', '0 2 * * *', $$SELECT auto_cancel_unconfirmed_items();$$);
```

### Change Cancellation Logic

Edit the function in `scripts/create-auto-cancel-function.sql`:

```sql
-- Example: Cancel items that are 2 days past scheduled date
WHERE 
  status = 'pending'
  AND pickup_date < v_today - INTERVAL '2 days'
  AND (confirmed_at IS NULL OR confirmed_at = '')
```

## Troubleshooting

### pg_cron Not Available

If pg_cron is not available in your Supabase plan:
- Use an external cron service (Option B above)
- Or manually trigger the Edge Function periodically

### Function Not Found

Make sure you've run `scripts/create-auto-cancel-function.sql` in the Supabase SQL Editor.

### Edge Function Not Working

1. Check Edge Function logs in Supabase Dashboard
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Edge Function secrets
3. Test the function manually via curl or Postman

## Security Notes

- The database function uses `SECURITY DEFINER` to run with elevated privileges
- The Edge Function uses the service role key for database access
- Only authenticated users and service role can execute the function
- Cancellation reasons are logged for audit purposes

