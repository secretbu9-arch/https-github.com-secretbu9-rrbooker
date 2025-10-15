-- Migrate Existing Notifications to Unified Structure
-- Run this in Supabase SQL Editor to update your existing notifications table

-- ============================================================================
-- STEP 1: BACKUP EXISTING DATA
-- ============================================================================

-- Create backup table
CREATE TABLE IF NOT EXISTS notifications_backup AS 
SELECT * FROM notifications;

-- ============================================================================
-- STEP 2: ADD NEW COLUMNS TO EXISTING TABLE
-- ============================================================================

-- Add new columns to existing notifications table
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS category VARCHAR(50),
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS channels JSONB DEFAULT '["app"]',
ADD COLUMN IF NOT EXISTS appointment_id UUID,
ADD COLUMN IF NOT EXISTS order_id UUID,
ADD COLUMN IF NOT EXISTS queue_entry_id UUID,
ADD COLUMN IF NOT EXISTS sent_via JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- STEP 3: ADD CONSTRAINTS
-- ============================================================================

-- Add check constraints (drop first if they exist)
DO $$
BEGIN
    -- Drop existing constraints if they exist
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'notifications_priority_check' 
               AND table_name = 'notifications') THEN
        ALTER TABLE notifications DROP CONSTRAINT notifications_priority_check;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'notifications_channels_check' 
               AND table_name = 'notifications') THEN
        ALTER TABLE notifications DROP CONSTRAINT notifications_channels_check;
    END IF;
    
    -- Add new constraints
    ALTER TABLE notifications 
    ADD CONSTRAINT notifications_priority_check 
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
    
    ALTER TABLE notifications 
    ADD CONSTRAINT notifications_channels_check 
    CHECK (jsonb_typeof(channels) = 'array');
END $$;

-- ============================================================================
-- STEP 4: MIGRATE EXISTING DATA
-- ============================================================================

-- Update existing notifications with proper category based on type and content
UPDATE notifications 
SET category = CASE 
  WHEN type = 'appointment' THEN
    CASE 
      WHEN title ILIKE '%book%' OR title ILIKE '%confirm%' THEN 'booking'
      WHEN title ILIKE '%cancel%' THEN 'cancellation'
      WHEN title ILIKE '%remind%' THEN 'reminder'
      ELSE 'status_update'
    END
  WHEN type = 'order' THEN
    CASE 
      WHEN title ILIKE '%ready%' OR title ILIKE '%pickup%' THEN 'ready'
      WHEN title ILIKE '%cancel%' THEN 'cancellation'
      WHEN title ILIKE '%confirm%' THEN 'status_update'
      ELSE 'status_update'
    END
  WHEN type = 'queue' THEN
    CASE 
      WHEN title ILIKE '%position%' THEN 'position_update'
      WHEN title ILIKE '%wait%' THEN 'wait_time'
      ELSE 'status_update'
    END
  WHEN type = 'system' THEN
    CASE 
      WHEN title ILIKE '%announce%' THEN 'announcement'
      WHEN title ILIKE '%maintenance%' THEN 'maintenance'
      ELSE 'announcement'
    END
  ELSE 'status_update'
END
WHERE category IS NULL;

-- Update priority based on content
UPDATE notifications 
SET priority = CASE 
  WHEN title ILIKE '%urgent%' OR title ILIKE '%important%' THEN 'high'
  WHEN title ILIKE '%low%' OR title ILIKE '%minor%' THEN 'low'
  ELSE 'normal'
END
WHERE priority = 'normal';

-- Update channels based on existing data
UPDATE notifications 
SET channels = CASE 
  WHEN data->>'sent_via' = 'email' THEN '["email"]'::jsonb
  WHEN data->>'sent_via' = 'sms' THEN '["sms"]'::jsonb
  WHEN data->>'sent_via' = 'push' THEN '["push"]'::jsonb
  ELSE '["app"]'::jsonb
END
WHERE channels = '["app"]'::jsonb;

-- Update sent_via based on existing data
UPDATE notifications 
SET sent_via = CASE 
  WHEN data->>'sent_via' IS NOT NULL THEN 
    jsonb_build_array(data->>'sent_via')
  ELSE '[]'::jsonb
END
WHERE sent_via = '[]'::jsonb;

-- Set sent_at for existing notifications
UPDATE notifications 
SET sent_at = created_at 
WHERE sent_at IS NULL;

-- ============================================================================
-- STEP 5: MIGRATE ORDER NOTIFICATIONS (if they exist)
-- ============================================================================

-- Check if order_notifications table exists and migrate data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_notifications') THEN
    -- Migrate order_notifications to main notifications table
    INSERT INTO notifications (
      user_id, title, message, type, category, order_id,
      priority, channels, data, sent_at, read_at, created_at
    )
    SELECT 
      user_id,
      title,
      message,
      'order' as type,
      CASE 
        WHEN notification_type = 'order_confirmed' THEN 'status_update'
        WHEN notification_type = 'ready_for_pickup' THEN 'ready'
        WHEN notification_type = 'pickup_reminder' THEN 'reminder'
        WHEN notification_type = 'order_cancelled' THEN 'cancellation'
        ELSE 'status_update'
      END as category,
      order_id,
      'normal' as priority,
      CASE 
        WHEN sent_via = 'app' THEN '["app"]'::jsonb
        WHEN sent_via = 'email' THEN '["email"]'::jsonb
        WHEN sent_via = 'sms' THEN '["sms"]'::jsonb
        ELSE '["app"]'::jsonb
      END as channels,
      jsonb_build_object(
        'original_type', notification_type,
        'sent_via', sent_via,
        'migrated_from', 'order_notifications'
      ) as data,
      sent_at,
      read_at,
      created_at
    FROM order_notifications
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications n2 
      WHERE n2.order_id = order_notifications.order_id 
      AND n2.title = order_notifications.title
      AND n2.message = order_notifications.message
    );
    
    RAISE NOTICE 'Migrated order_notifications data';
  ELSE
    RAISE NOTICE 'No order_notifications table found';
  END IF;
END $$;

-- ============================================================================
-- STEP 6: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Create indexes for new columns
DO $$
BEGIN
    -- Create indexes if they don't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_category') THEN
        CREATE INDEX idx_notifications_category ON notifications(category);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_priority') THEN
        CREATE INDEX idx_notifications_priority ON notifications(priority);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_appointment_id') THEN
        CREATE INDEX idx_notifications_appointment_id ON notifications(appointment_id) WHERE appointment_id IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_order_id') THEN
        CREATE INDEX idx_notifications_order_id ON notifications(order_id) WHERE order_id IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_queue_entry_id') THEN
        CREATE INDEX idx_notifications_queue_entry_id ON notifications(queue_entry_id) WHERE queue_entry_id IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_sent_at') THEN
        CREATE INDEX idx_notifications_sent_at ON notifications(sent_at) WHERE sent_at IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_read_at') THEN
        CREATE INDEX idx_notifications_read_at ON notifications(read_at) WHERE read_at IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_scheduled_for') THEN
        CREATE INDEX idx_notifications_scheduled_for ON notifications(scheduled_for) WHERE scheduled_for IS NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notifications_expires_at') THEN
        CREATE INDEX idx_notifications_expires_at ON notifications(expires_at) WHERE expires_at IS NOT NULL;
    END IF;
END $$;

-- ============================================================================
-- STEP 7: CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to create appointment notification
CREATE OR REPLACE FUNCTION create_appointment_notification(
  p_user_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_category VARCHAR(50),
  p_appointment_id UUID DEFAULT NULL,
  p_priority VARCHAR(20) DEFAULT 'normal',
  p_channels JSONB DEFAULT '["app"]',
  p_data JSONB DEFAULT '{}',
  p_scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id, title, message, type, category, appointment_id,
    priority, channels, data, scheduled_for, created_at, updated_at
  ) VALUES (
    p_user_id, p_title, p_message, 'appointment', p_category, p_appointment_id,
    p_priority, p_channels, p_data, p_scheduled_for, NOW(), NOW()
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create order notification
CREATE OR REPLACE FUNCTION create_order_notification(
  p_user_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_category VARCHAR(50),
  p_order_id UUID DEFAULT NULL,
  p_priority VARCHAR(20) DEFAULT 'normal',
  p_channels JSONB DEFAULT '["app"]',
  p_data JSONB DEFAULT '{}',
  p_scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id, title, message, type, category, order_id,
    priority, channels, data, scheduled_for, created_at, updated_at
  ) VALUES (
    p_user_id, p_title, p_message, 'order', p_category, p_order_id,
    p_priority, p_channels, p_data, p_scheduled_for, NOW(), NOW()
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create queue notification
CREATE OR REPLACE FUNCTION create_queue_notification(
  p_user_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_category VARCHAR(50),
  p_queue_entry_id UUID DEFAULT NULL,
  p_priority VARCHAR(20) DEFAULT 'normal',
  p_channels JSONB DEFAULT '["app"]',
  p_data JSONB DEFAULT '{}',
  p_scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id, title, message, type, category, queue_entry_id,
    priority, channels, data, scheduled_for, created_at, updated_at
  ) VALUES (
    p_user_id, p_title, p_message, 'queue', p_category, p_queue_entry_id,
    p_priority, p_channels, p_data, p_scheduled_for, NOW(), NOW()
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create system notification
CREATE OR REPLACE FUNCTION create_system_notification(
  p_user_id UUID,
  p_title VARCHAR(255),
  p_message TEXT,
  p_category VARCHAR(50),
  p_priority VARCHAR(20) DEFAULT 'normal',
  p_channels JSONB DEFAULT '["app"]',
  p_data JSONB DEFAULT '{}',
  p_scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (
    user_id, title, message, type, category,
    priority, channels, data, scheduled_for, created_at, updated_at
  ) VALUES (
    p_user_id, p_title, p_message, 'system', p_category,
    p_priority, p_channels, p_data, p_scheduled_for, NOW(), NOW()
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE notifications 
  SET read_at = NOW(), updated_at = NOW(), read = true, is_read = true
  WHERE id = p_notification_id 
  AND user_id = auth.uid()
  AND read_at IS NULL;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to mark all user notifications as read
CREATE OR REPLACE FUNCTION mark_all_notifications_read(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE notifications 
  SET read_at = NOW(), updated_at = NOW(), read = true, is_read = true
  WHERE user_id = p_user_id 
  AND read_at IS NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unread_count
  FROM notifications
  WHERE user_id = p_user_id 
  AND (read_at IS NULL OR read = false OR is_read = false)
  AND (expires_at IS NULL OR expires_at > NOW());
  
  RETURN unread_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 8: CREATE VIEW FOR ENHANCED QUERIES
-- ============================================================================

-- Create view for enhanced notification queries
CREATE OR REPLACE VIEW notifications_enhanced AS
SELECT 
  n.id,
  n.user_id,
  n.title,
  n.message,
  n.type,
  n.category,
  n.priority,
  n.channels,
  n.data,
  n.appointment_id,
  n.order_id,
  n.queue_entry_id,
  n.sent_via,
  n.sent_at,
  n.delivered_at,
  n.read_at,
  n.scheduled_for,
  n.expires_at,
  n.created_at,
  n.updated_at,
  -- Legacy fields for compatibility
  n.read,
  n.is_read,
  -- Computed fields
  CASE 
    WHEN n.read_at IS NOT NULL OR n.read = true OR n.is_read = true THEN true
    ELSE false
  END as is_read_computed,
  CASE 
    WHEN n.expires_at IS NOT NULL AND n.expires_at < NOW() THEN true
    ELSE false
  END as is_expired
FROM notifications n;

-- ============================================================================
-- STEP 9: VERIFY MIGRATION
-- ============================================================================

-- Check migration results
SELECT 
  'Migration Summary' as status,
  COUNT(*) as total_notifications,
  COUNT(CASE WHEN category IS NOT NULL THEN 1 END) as with_category,
  COUNT(CASE WHEN priority IS NOT NULL THEN 1 END) as with_priority,
  COUNT(CASE WHEN channels IS NOT NULL THEN 1 END) as with_channels,
  COUNT(CASE WHEN read_at IS NOT NULL THEN 1 END) as read_notifications,
  COUNT(CASE WHEN read_at IS NULL THEN 1 END) as unread_notifications
FROM notifications;

-- Check category distribution
SELECT 
  'Category Distribution' as status,
  category,
  COUNT(*) as count
FROM notifications
WHERE category IS NOT NULL
GROUP BY category
ORDER BY count DESC;

-- Check type distribution
SELECT 
  'Type Distribution' as status,
  type,
  COUNT(*) as count
FROM notifications
GROUP BY type
ORDER BY count DESC;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Existing notifications table migrated to unified structure successfully!' as status;
