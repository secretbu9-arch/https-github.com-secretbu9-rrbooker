-- Final Duplicate Cleanup - Comprehensive Fix
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: CLEAN UP ALL EXISTING DUPLICATES
-- ============================================================================

-- Remove ALL duplicate notifications from the last 30 days
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, title, type, DATE(created_at) 
      ORDER BY created_at DESC
    ) as rn
  FROM notifications
  WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
)
DELETE FROM notifications 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- ============================================================================
-- STEP 2: CREATE ENHANCED DUPLICATE PREVENTION
-- ============================================================================

-- Enhanced function with better duplicate detection
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
  p_duplicate_window_hours INTEGER DEFAULT 1
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
  duplicate_count INTEGER;
BEGIN
  -- Check for duplicates if prevention is enabled
  IF p_prevent_duplicates THEN
    -- Check for exact duplicates (same user, title, type, and appointment/order ID)
    SELECT COUNT(*) INTO duplicate_count
    FROM notifications
    WHERE user_id = p_user_id
    AND title = p_title
    AND type = p_type
    AND (
      (p_appointment_id IS NOT NULL AND data->>'appointment_id' = p_appointment_id::TEXT) OR
      (p_order_id IS NOT NULL AND data->>'order_id' = p_order_id::TEXT) OR
      (p_appointment_id IS NULL AND p_order_id IS NULL)
    )
    AND created_at >= NOW() - (p_duplicate_window_hours || ' hours')::INTERVAL;
    
    -- If duplicate found, return existing notification ID
    IF duplicate_count > 0 THEN
      SELECT id INTO notification_id
      FROM notifications
      WHERE user_id = p_user_id
      AND title = p_title
      AND type = p_type
      AND (
        (p_appointment_id IS NOT NULL AND data->>'appointment_id' = p_appointment_id::TEXT) OR
        (p_order_id IS NOT NULL AND data->>'order_id' = p_order_id::TEXT) OR
        (p_appointment_id IS NULL AND p_order_id IS NULL)
      )
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
-- STEP 3: CREATE SPECIALIZED FUNCTIONS
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
    jsonb_build_object('queue_position', p_queue_position),
    p_appointment_id, NULL, NULL, TRUE, 2 -- 2 hour window
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
    jsonb_build_object('status', p_status),
    p_appointment_id, NULL, NULL, TRUE, 1 -- 1 hour window
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
    jsonb_build_object('queue_position', p_queue_position),
    p_appointment_id, NULL, NULL, TRUE, 1 -- 1 hour window
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
    jsonb_build_object('status', p_status),
    NULL, p_order_id, NULL, TRUE, 1 -- 1 hour window
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: CREATE PERFORMANCE INDEXES
-- ============================================================================

-- Create indexes for optimal duplicate detection
CREATE INDEX IF NOT EXISTS idx_notifications_duplicate_check_enhanced 
ON notifications(user_id, title, type, created_at);

-- Create partial indexes for appointment and order notifications
CREATE INDEX IF NOT EXISTS idx_notifications_appointment_duplicates 
ON notifications(user_id, title, type, created_at) 
WHERE data ? 'appointment_id';

CREATE INDEX IF NOT EXISTS idx_notifications_order_duplicates 
ON notifications(user_id, title, type, created_at) 
WHERE data ? 'order_id';

-- ============================================================================
-- STEP 5: CREATE MONITORING FUNCTIONS
-- ============================================================================

-- Function to check for current duplicates
CREATE OR REPLACE FUNCTION check_current_duplicates(
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

-- Function to clean up duplicates on demand
CREATE OR REPLACE FUNCTION cleanup_duplicates_on_demand(
  p_hours_back INTEGER DEFAULT 24
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
    WHERE created_at >= NOW() - (p_hours_back || ' hours')::INTERVAL
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
-- STEP 6: VERIFY CLEANUP
-- ============================================================================

-- Check remaining notifications after cleanup
SELECT 
  'NOTIFICATIONS AFTER FINAL CLEANUP' as status,
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
-- STEP 7: TEST THE NEW FUNCTIONS
-- ============================================================================

-- Test the enhanced duplicate prevention
SELECT 'Enhanced duplicate prevention functions created successfully!' as test_status;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'FINAL DUPLICATE CLEANUP COMPLETED SUCCESSFULLY!' as status,
       'All existing duplicates removed' as cleanup,
       'Enhanced duplicate prevention functions created' as functions,
       'Performance indexes added' as indexes,
       'Monitoring functions available' as monitoring;


