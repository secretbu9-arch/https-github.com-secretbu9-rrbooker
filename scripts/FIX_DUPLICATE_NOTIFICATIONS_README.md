# Fix Duplicate Notifications - Complete Guide

## Problem
The system is creating duplicate notifications for every action/activity. This happens because:
1. Some code directly inserts into the notifications table, bypassing `CentralizedNotificationService`
2. There may be database triggers automatically creating notifications
3. Race conditions in concurrent requests
4. No database-level constraints to prevent duplicates

## Solution Overview

This fix includes:
1. **SQL Script to Clean Existing Duplicates** - Removes duplicate notifications from the database
2. **Database Constraints** - Prevents future duplicates at the database level
3. **Code Fixes** - Updates all direct notification inserts to use `CentralizedNotificationService`
4. **Performance Indexes** - Improves duplicate detection queries

## Step-by-Step Instructions

### Step 1: Check for Database Triggers

Run this script first to see if there are any database triggers creating notifications:

```sql
-- Run: scripts/check-and-remove-notification-triggers.sql
```

If you find triggers that insert into notifications, remove them. Notifications should only be created through `CentralizedNotificationService` in the application code.

### Step 2: Clean Existing Duplicates

Run the comprehensive fix script to:
- Identify all duplicate notifications
- Remove duplicates (keeps the oldest one)
- Add database constraints to prevent future duplicates

```sql
-- Run: scripts/fix-duplicate-notifications-comprehensive.sql
```

**Important**: Review the duplicate identification query results before running the cleanup. The script will:
1. Show you all duplicates first
2. Then remove them (keeping the oldest)
3. Add unique indexes to prevent future duplicates

### Step 3: Verify the Fix

After running the cleanup script, verify that duplicates are removed:

```sql
-- Check remaining duplicates (should be 0)
SELECT 
  user_id,
  type,
  title,
  COUNT(*) as duplicate_count
FROM notifications
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id, type, title, data->>'appointment_id', data->>'order_id', data->>'queue_entry_id'
HAVING COUNT(*) > 1;
```

### Step 4: Code Changes

The following code changes have been made:

1. **ManageAppointments.js** - Fixed direct notification insert to use `CentralizedNotificationService`

All notification creation should now go through `CentralizedNotificationService`, which has built-in duplicate prevention logic.

## How It Works

### Database Level Protection

The fix adds unique partial indexes that prevent duplicates within a 24-hour window:

- **Appointment notifications**: Unique by `user_id`, `type`, `title`, and `appointment_id`
- **Order notifications**: Unique by `user_id`, `type`, `title`, and `order_id`
- **Queue notifications**: Unique by `user_id`, `type`, `title`, and `queue_entry_id`
- **General notifications**: Unique by `user_id`, `type`, and `title`

These indexes allow the same notification to be created again after 24 hours (for recurring events), but prevent duplicates within the same day.

### Application Level Protection

`CentralizedNotificationService` has multiple layers of duplicate prevention:

1. **In-memory tracking** - Prevents concurrent duplicate requests
2. **Database checks** - Queries for existing notifications before inserting
3. **Race condition handling** - Final check right before insert

## Testing

After applying the fix:

1. **Test appointment creation** - Create an appointment and verify only one notification is created
2. **Test order creation** - Create an order and verify only one notification is created
3. **Test rapid actions** - Try creating multiple appointments quickly and verify no duplicates
4. **Check database** - Run the duplicate check query to verify no duplicates exist

## Monitoring

To monitor for future duplicates, run this query periodically:

```sql
SELECT 
  COUNT(*) as duplicate_count,
  COUNT(DISTINCT user_id) as affected_users
FROM (
  SELECT 
    user_id,
    type,
    title,
    data->>'appointment_id' as appointment_id,
    data->>'order_id' as order_id,
    data->>'queue_entry_id' as queue_entry_id
  FROM notifications
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY 
    user_id,
    type,
    title,
    data->>'appointment_id',
    data->>'order_id',
    data->>'queue_entry_id'
  HAVING COUNT(*) > 1
) duplicates;
```

## Rollback

If you need to rollback the database changes:

```sql
-- Remove unique indexes
DROP INDEX IF EXISTS idx_notifications_unique_appointment;
DROP INDEX IF EXISTS idx_notifications_unique_order;
DROP INDEX IF EXISTS idx_notifications_unique_queue;
DROP INDEX IF EXISTS idx_notifications_unique_general;

-- Remove function
DROP FUNCTION IF EXISTS safe_insert_notification(UUID, TEXT, TEXT, TEXT, JSONB);
```

## Files Changed

1. `scripts/fix-duplicate-notifications-comprehensive.sql` - Main fix script
2. `scripts/check-and-remove-notification-triggers.sql` - Trigger check script
3. `src/components/manager/ManageAppointments.js` - Fixed direct notification insert

## Notes

- The unique indexes use partial indexes with time windows to allow notifications to be created again after 24 hours
- The `CentralizedNotificationService` should be used for ALL notification creation
- Database triggers that create notifications should be removed to prevent duplicates
- The fix maintains backward compatibility - existing notifications are not affected except for duplicates







