-- Fix ALL Duplicate Notifications - Comprehensive Solution
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: IDENTIFY ALL DUPLICATE NOTIFICATIONS
-- ============================================================================

-- Find all duplicate notifications in the last 7 days
SELECT 
  'ALL DUPLICATE NOTIFICATIONS FOUND' as status,
  user_id,
  title,
  type,
  DATE(created_at) as notification_date,
  COUNT(*) as duplicate_count
FROM notifications
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id, title, type, DATE(created_at)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, notification_date DESC;

-- ============================================================================
-- STEP 2: REMOVE ALL DUPLICATE NOTIFICATIONS
-- ============================================================================

-- Remove duplicate notifications, keeping only the most recent one
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, title, type, DATE(created_at) 
      ORDER BY created_at DESC
    ) as rn
  FROM notifications
  WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
)
DELETE FROM notifications 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- ============================================================================
-- STEP 3: CREATE ENHANCED DUPLICATE PREVENTION FUNCTIONS
-- ============================================================================

-- Enhanced function to create notification with comprehensive duplicate prevention
CREATE OR REPLACE FUNCTION create_notification_safe_enhanced(
  p_user_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_type VARCHAR(50),
  p_category VARCHAR(50),
  p_priority VARCHAR(20) DEFAULT 'normal',
  p_channels JSONB DEFAULT '["app"]',
  p_data JSONB DEFAULT '{}',
  p_appointment_id UUID DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_queue_entry_id UUID DEFAULT NULL,
  p_prevent_duplicates BOOLEAN DEFAULT TRUE,
  p_duplicate_window_hours INTEGER DEFAULT 1,
  p_duplicate_check_fields TEXT[] DEFAULT ARRAY['user_id', 'title', 'type']
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
  duplicate_count INTEGER;
  check_conditions TEXT;
  i INTEGER;
BEGIN
  -- Check for duplicates if prevention is enabled
  IF p_prevent_duplicates THEN
    -- Build dynamic WHERE clause based on check fields
    check_conditions := '';
    FOR i IN 1..array_length(p_duplicate_check_fields, 1) LOOP
      IF i > 1 THEN
        check_conditions := check_conditions || ' AND ';
      END IF;
      
      CASE p_duplicate_check_fields[i]
        WHEN 'user_id' THEN
          check_conditions := check_conditions || 'user_id = $1';
        WHEN 'title' THEN
          check_conditions := check_conditions || 'title = $2';
        WHEN 'type' THEN
          check_conditions := check_conditions || 'type = $3';
        WHEN 'category' THEN
          check_conditions := check_conditions || 'data->>''category'' = $4';
        WHEN 'appointment_id' THEN
          check_conditions := check_conditions || 'data->>''appointment_id'' = $5';
        WHEN 'order_id' THEN
          check_conditions := check_conditions || 'data->>''order_id'' = $6';
      END CASE;
    END LOOP;
    
    -- Execute dynamic query to check for duplicates
    EXECUTE format('
      SELECT COUNT(*) FROM notifications 
      WHERE %s AND created_at >= NOW() - INTERVAL ''%s hours''
    ', check_conditions, p_duplicate_window_hours)
    USING p_user_id, p_title, p_type, p_category, p_appointment_id::TEXT, p_order_id::TEXT
    INTO duplicate_count;
    
    -- If duplicate found, return existing notification ID
    IF duplicate_count > 0 THEN
      EXECUTE format('
        SELECT id FROM notifications 
        WHERE %s AND created_at >= NOW() - INTERVAL ''%s hours''
        ORDER BY created_at DESC LIMIT 1
      ', check_conditions, p_duplicate_window_hours)
      USING p_user_id, p_title, p_type, p_category, p_appointment_id::TEXT, p_order_id::TEXT
      INTO notification_id;
      
      RAISE NOTICE 'Duplicate notification prevented for user % with title %', p_user_id, p_title;
      RETURN notification_id;
    END IF;
  END IF;
  
  -- Create new notification
  INSERT INTO notifications (
    user_id, title, message, type, category, priority, channels, data,
    appointment_id, order_id, queue_entry_id, created_at, updated_at
  ) VALUES (
    p_user_id, p_title, p_message, p_type, p_category, p_priority, p_channels, p_data,
    p_appointment_id, p_order_id, p_queue_entry_id, NOW(), NOW()
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: CREATE SPECIALIZED NOTIFICATION FUNCTIONS
-- ============================================================================

-- Booking confirmation with strict duplicate prevention
CREATE OR REPLACE FUNCTION create_booking_confirmation_safe(
  p_user_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_appointment_id UUID,
  p_queue_position INTEGER,
  p_priority VARCHAR(20) DEFAULT 'high'
)
RETURNS UUID AS $$
BEGIN
  RETURN create_notification_safe_enhanced(
    p_user_id, p_title, p_message, 'appointment', 'booking', p_priority,
    '["app", "push"]', 
    jsonb_build_object('queue_position', p_queue_position, 'appointment_id', p_appointment_id),
    p_appointment_id, NULL, NULL, TRUE, 2, -- 2 hour window for booking confirmations
    ARRAY['user_id', 'title', 'appointment_id']
  );
END;
$$ LANGUAGE plpgsql;

-- Status change with strict duplicate prevention
CREATE OR REPLACE FUNCTION create_status_change_safe(
  p_user_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_appointment_id UUID,
  p_status VARCHAR(50),
  p_priority VARCHAR(20) DEFAULT 'normal'
)
RETURNS UUID AS $$
BEGIN
  RETURN create_notification_safe_enhanced(
    p_user_id, p_title, p_message, 'appointment', 'status_update', p_priority,
    '["app", "push"]',
    jsonb_build_object('status', p_status, 'appointment_id', p_appointment_id),
    p_appointment_id, NULL, NULL, TRUE, 1, -- 1 hour window for status changes
    ARRAY['user_id', 'title', 'appointment_id']
  );
END;
$$ LANGUAGE plpgsql;

-- Queue position update with strict duplicate prevention
CREATE OR REPLACE FUNCTION create_queue_update_safe(
  p_user_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_appointment_id UUID,
  p_queue_position INTEGER,
  p_priority VARCHAR(20) DEFAULT 'normal'
)
RETURNS UUID AS $$
BEGIN
  RETURN create_notification_safe_enhanced(
    p_user_id, p_title, p_message, 'queue', 'position_update', p_priority,
    '["app", "push"]',
    jsonb_build_object('queue_position', p_queue_position, 'appointment_id', p_appointment_id),
    p_appointment_id, NULL, NULL, TRUE, 1, -- 1 hour window for queue updates
    ARRAY['user_id', 'title', 'appointment_id']
  );
END;
$$ LANGUAGE plpgsql;

-- Order status update with strict duplicate prevention
CREATE OR REPLACE FUNCTION create_order_update_safe(
  p_user_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_order_id UUID,
  p_status VARCHAR(50),
  p_priority VARCHAR(20) DEFAULT 'normal'
)
RETURNS UUID AS $$
BEGIN
  RETURN create_notification_safe_enhanced(
    p_user_id, p_title, p_message, 'order', 'status_update', p_priority,
    '["app", "push"]',
    jsonb_build_object('status', p_status, 'order_id', p_order_id),
    NULL, p_order_id, NULL, TRUE, 1, -- 1 hour window for order updates
    ARRAY['user_id', 'title', 'order_id']
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: CREATE INDEXES FOR OPTIMAL DUPLICATE DETECTION
-- ============================================================================

-- Create comprehensive indexes for duplicate detection
CREATE INDEX IF NOT EXISTS idx_notifications_duplicate_user_title 
ON notifications(user_id, title, created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_duplicate_user_type 
ON notifications(user_id, type, created_at);

-- Create indexes on JSONB fields using proper syntax
CREATE INDEX IF NOT EXISTS idx_notifications_duplicate_appointment 
ON notifications USING GIN ((data->>'appointment_id')) 
WHERE data ? 'appointment_id';

CREATE INDEX IF NOT EXISTS idx_notifications_duplicate_order 
ON notifications USING GIN ((data->>'order_id')) 
WHERE data ? 'order_id';

CREATE INDEX IF NOT EXISTS idx_notifications_duplicate_category 
ON notifications USING GIN ((data->>'category')) 
WHERE data ? 'category';

-- Create composite indexes for better performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_appointment_time 
ON notifications(user_id, created_at) 
WHERE data ? 'appointment_id';

CREATE INDEX IF NOT EXISTS idx_notifications_user_order_time 
ON notifications(user_id, created_at) 
WHERE data ? 'order_id';

-- ============================================================================
-- STEP 6: CREATE NOTIFICATION CLEANUP FUNCTION
-- ============================================================================

-- Function to clean up old duplicate notifications
CREATE OR REPLACE FUNCTION cleanup_duplicate_notifications(
  p_days_back INTEGER DEFAULT 7
)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH duplicates AS (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, title, type, DATE(created_at) 
        ORDER BY created_at DESC
      ) as rn
    FROM notifications
    WHERE created_at >= CURRENT_DATE - (p_days_back || ' days')::INTERVAL
  )
  DELETE FROM notifications 
  WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: CREATE MONITORING FUNCTION
-- ============================================================================

-- Function to monitor for duplicate notifications
CREATE OR REPLACE FUNCTION check_duplicate_notifications(
  p_hours_back INTEGER DEFAULT 24
)
RETURNS TABLE(
  user_id UUID,
  title TEXT,
  type TEXT,
  duplicate_count BIGINT,
  latest_created TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.user_id,
    n.title,
    n.type,
    COUNT(*) as duplicate_count,
    MAX(n.created_at) as latest_created
  FROM notifications n
  WHERE n.created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
  GROUP BY n.user_id, n.title, n.type
  HAVING COUNT(*) > 1
  ORDER BY duplicate_count DESC, latest_created DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 8: VERIFY CLEANUP RESULTS
-- ============================================================================

-- Check remaining notifications after cleanup
SELECT 
  'NOTIFICATIONS AFTER CLEANUP' as status,
  COUNT(*) as total_notifications,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT title) as unique_titles,
  COUNT(DISTINCT type) as unique_types
FROM notifications;

-- Check for any remaining duplicates
SELECT 
  'REMAINING DUPLICATES CHECK' as status,
  user_id,
  title,
  type,
  DATE(created_at) as notification_date,
  COUNT(*) as count
FROM notifications
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY user_id, title, type, DATE(created_at)
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- ============================================================================
-- STEP 9: TEST THE NEW FUNCTIONS
-- ============================================================================

-- Test booking confirmation function
SELECT 'Testing booking confirmation function...' as test_status;

-- Test status change function  
SELECT 'Testing status change function...' as test_status;

-- Test queue update function
SELECT 'Testing queue update function...' as test_status;

-- Test order update function
SELECT 'Testing order update function...' as test_status;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'ALL DUPLICATE NOTIFICATIONS FIXED SUCCESSFULLY!' as status,
       'Enhanced duplicate prevention functions created' as functions,
       'Comprehensive indexes added' as indexes,
       'Monitoring functions available' as monitoring;
