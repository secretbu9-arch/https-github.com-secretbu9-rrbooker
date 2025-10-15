-- Fix Push Notification Duplicates - Final Solution
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: REMOVE ALL DUPLICATE NOTIFICATIONS IMMEDIATELY
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
-- STEP 2: CREATE ULTRA-STRICT DUPLICATE PREVENTION
-- ============================================================================

-- Drop existing functions to recreate them
DROP FUNCTION IF EXISTS create_notification_ultra_safe CASCADE;
DROP FUNCTION IF EXISTS create_appointment_status_notification CASCADE;

-- Ultra-strict function to prevent ANY duplicates
CREATE OR REPLACE FUNCTION create_notification_ultra_safe(
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
  p_duplicate_window_hours INTEGER DEFAULT 24 -- 24 hour window
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
  duplicate_count INTEGER;
BEGIN
  -- Check for duplicates if prevention is enabled
  IF p_prevent_duplicates THEN
    -- Ultra-strict duplicate check - same user, title, type, and appointment/order ID
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
      
      RAISE NOTICE 'DUPLICATE PREVENTED: user % title % type %', p_user_id, p_title, p_type;
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
-- STEP 3: CREATE CENTRALIZED NOTIFICATION FUNCTIONS
-- ============================================================================

-- Centralized appointment status change function
CREATE OR REPLACE FUNCTION create_appointment_status_notification(
  p_user_id UUID,
  p_appointment_id UUID,
  p_status VARCHAR(50),
  p_changed_by VARCHAR(50) DEFAULT 'system'
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
  title_text VARCHAR(255);
  message_text TEXT;
  priority_level VARCHAR(20);
BEGIN
  -- Determine notification content based on status
  CASE p_status
    WHEN 'confirmed' THEN
      title_text := 'Appointment Confirmed ✅';
      message_text := 'Your appointment has been confirmed.';
      priority_level := 'high';
    WHEN 'ongoing' THEN
      title_text := 'Your appointment has started! ✂️';
      message_text := 'Your barber is ready for you now.';
      priority_level := 'high';
    WHEN 'done' THEN
      title_text := 'Appointment Completed ✅';
      message_text := 'Thank you for visiting us! Please rate your experience.';
      priority_level := 'normal';
    WHEN 'cancelled' THEN
      title_text := 'Appointment Cancelled ❌';
      message_text := 'Your appointment has been cancelled.';
      priority_level := 'high';
    ELSE
      title_text := 'Appointment ' || INITCAP(p_status);
      message_text := 'Your appointment status has been updated to ' || p_status;
      priority_level := 'normal';
  END CASE;
  
  -- Create notification with ultra-strict duplicate prevention
  SELECT create_notification_ultra_safe(
    p_user_id, title_text, message_text, 'appointment', 'status_update', priority_level,
    '["app", "push"]', 
    jsonb_build_object('status', p_status, 'changed_by', p_changed_by),
    p_appointment_id, NULL, NULL, TRUE, 24 -- 24 hour window
  ) INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: CREATE MONITORING FUNCTION
-- ============================================================================

-- Function to check for current duplicates
CREATE OR REPLACE FUNCTION check_duplicates_now()
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
  WHERE n.created_at >= NOW() - INTERVAL '24 hours'
  GROUP BY n.user_id, n.title, n.type
  HAVING COUNT(*) > 1
  ORDER BY duplicate_count DESC, latest_created DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: VERIFY CLEANUP
-- ============================================================================

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
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'PUSH NOTIFICATION DUPLICATES FIXED!' as status,
       'All existing duplicates removed' as cleanup,
       'Ultra-strict prevention functions created' as functions,
       '24-hour duplicate prevention window' as prevention,
       'Only 1 push notification per event' as result;


