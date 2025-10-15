-- Simple Duplicate Notifications Fix
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: IDENTIFY DUPLICATE NOTIFICATIONS
-- ============================================================================

-- Find duplicate notifications (same user, same title, same day)
SELECT 
  'Duplicate Notifications Found' as status,
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
-- STEP 2: REMOVE DUPLICATE NOTIFICATIONS
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
-- STEP 3: CREATE SIMPLE DUPLICATE PREVENTION FUNCTION
-- ============================================================================

-- Simple function to create notification with duplicate prevention
CREATE OR REPLACE FUNCTION create_notification_safe(
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
  p_duplicate_window_hours INTEGER DEFAULT 1
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
  duplicate_count INTEGER;
BEGIN
  -- Check for duplicates if prevention is enabled
  IF p_prevent_duplicates THEN
    SELECT COUNT(*) INTO duplicate_count
    FROM notifications
    WHERE user_id = p_user_id
    AND title = p_title
    AND type = p_type
    AND created_at >= NOW() - (p_duplicate_window_hours || ' hours')::INTERVAL;
    
    -- If duplicate found, return existing notification ID
    IF duplicate_count > 0 THEN
      SELECT id INTO notification_id
      FROM notifications
      WHERE user_id = p_user_id
      AND title = p_title
      AND type = p_type
      AND created_at >= NOW() - (p_duplicate_window_hours || ' hours')::INTERVAL
      ORDER BY created_at DESC
      LIMIT 1;
      
      RAISE NOTICE 'Duplicate notification prevented for user % with title %', p_user_id, p_title;
      RETURN notification_id;
    END IF;
  END IF;
  
  -- Create new notification
  INSERT INTO notifications (
    user_id, title, message, type, data, created_at, updated_at
  ) VALUES (
    p_user_id, p_title, p_message, p_type, 
    jsonb_build_object(
      'category', p_category,
      'priority', p_priority,
      'channels', p_channels,
      'appointment_id', p_appointment_id,
      'order_id', p_order_id,
      'queue_entry_id', p_queue_entry_id
    ) || p_data,
    NOW(), NOW()
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: CREATE SPECIALIZED NOTIFICATION FUNCTIONS
-- ============================================================================

-- Booking confirmation with duplicate prevention
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
  RETURN create_notification_safe(
    p_user_id, p_title, p_message, 'appointment', 'booking', p_priority,
    '["app", "push"]', 
    jsonb_build_object('queue_position', p_queue_position),
    p_appointment_id, NULL, NULL, TRUE, 2 -- 2 hour window
  );
END;
$$ LANGUAGE plpgsql;

-- Status change with duplicate prevention
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
  RETURN create_notification_safe(
    p_user_id, p_title, p_message, 'appointment', 'status_update', p_priority,
    '["app", "push"]',
    jsonb_build_object('status', p_status),
    p_appointment_id, NULL, NULL, TRUE, 1 -- 1 hour window
  );
END;
$$ LANGUAGE plpgsql;

-- Queue position update with duplicate prevention
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
  RETURN create_notification_safe(
    p_user_id, p_title, p_message, 'queue', 'position_update', p_priority,
    '["app", "push"]',
    jsonb_build_object('queue_position', p_queue_position),
    p_appointment_id, NULL, NULL, TRUE, 1 -- 1 hour window
  );
END;
$$ LANGUAGE plpgsql;

-- Order status update with duplicate prevention
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
  RETURN create_notification_safe(
    p_user_id, p_title, p_message, 'order', 'status_update', p_priority,
    '["app", "push"]',
    jsonb_build_object('status', p_status),
    NULL, p_order_id, NULL, TRUE, 1 -- 1 hour window
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: CREATE SIMPLE INDEXES
-- ============================================================================

-- Create basic indexes for duplicate detection
CREATE INDEX IF NOT EXISTS idx_notifications_duplicate_check 
ON notifications(user_id, title, type, created_at);

-- ============================================================================
-- STEP 6: CREATE CLEANUP FUNCTION
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
-- STEP 7: VERIFY CLEANUP
-- ============================================================================

-- Check remaining notifications after cleanup
SELECT 
  'Notifications After Cleanup' as status,
  COUNT(*) as total_notifications,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT title) as unique_titles
FROM notifications;

-- Check for any remaining duplicates
SELECT 
  'Remaining Duplicates Check' as status,
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
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Duplicate notifications fixed successfully!' as status,
       'Simple duplicate prevention functions created' as functions,
       'Basic indexes added' as indexes,
       'Cleanup function available' as cleanup;


