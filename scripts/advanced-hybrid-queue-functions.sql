-- ============================================================================
-- Advanced Hybrid Queue System - Database Functions
-- ============================================================================
-- Purpose: Additional functions needed for the Advanced Hybrid Queue System
-- Date: October 6, 2025
-- ============================================================================

-- ============================================================================
-- FUNCTION: shift_queue_positions
-- ============================================================================
-- Purpose: Automatically reorder queue positions when a new urgent appointment is inserted
-- Used by: AdvancedHybridQueueService.reorderQueue()

CREATE OR REPLACE FUNCTION shift_queue_positions(
  p_barber_id UUID,
  p_date DATE,
  p_new_appointment_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_position INTEGER;
  v_priority VARCHAR;
BEGIN
  -- Get the position and priority of the new appointment
  SELECT queue_position, priority_level 
  INTO v_new_position, v_priority
  FROM appointments
  WHERE id = p_new_appointment_id;

  -- Only shift if it's an urgent or high priority appointment
  IF v_priority IN ('urgent', 'vip', 'high') THEN
    -- Increment queue positions for all appointments at or after this position
    UPDATE appointments
    SET queue_position = queue_position + 1,
        updated_at = NOW()
    WHERE barber_id = p_barber_id
      AND appointment_date = p_date
      AND id != p_new_appointment_id
      AND queue_position >= v_new_position
      AND status IN ('pending', 'scheduled', 'confirmed');

    RAISE NOTICE 'Shifted queue positions from % onwards for barber % on %', 
                 v_new_position, p_barber_id, p_date;
  END IF;
END;
$$;

COMMENT ON FUNCTION shift_queue_positions IS 
'Automatically reorders queue positions when urgent/high priority appointments are inserted';

-- ============================================================================
-- FUNCTION: calculate_timeline_position
-- ============================================================================
-- Purpose: Calculate the optimal position in the unified timeline
-- Considers: scheduled appointments, queue priority, service duration

CREATE OR REPLACE FUNCTION calculate_timeline_position(
  p_barber_id UUID,
  p_date DATE,
  p_appointment_type VARCHAR,
  p_appointment_time TIME DEFAULT NULL,
  p_priority_level VARCHAR DEFAULT 'normal'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_position INTEGER := 1;
  v_scheduled_count INTEGER;
  v_queue_count INTEGER;
  v_priority_weight INTEGER;
BEGIN
  -- Get priority weight (lower is higher priority)
  v_priority_weight := CASE p_priority_level
    WHEN 'urgent' THEN 0
    WHEN 'vip' THEN 0
    WHEN 'high' THEN 1
    WHEN 'normal' THEN 2
    WHEN 'low' THEN 3
    ELSE 2
  END;

  IF p_appointment_type = 'scheduled' THEN
    -- For scheduled, count how many scheduled appointments are before this time
    SELECT COUNT(*) INTO v_scheduled_count
    FROM appointments
    WHERE barber_id = p_barber_id
      AND appointment_date = p_date
      AND appointment_type = 'scheduled'
      AND appointment_time < p_appointment_time
      AND status IN ('scheduled', 'confirmed', 'ongoing');

    v_position := v_scheduled_count + 1;

  ELSE
    -- For queue, calculate based on priority
    SELECT COUNT(*) INTO v_queue_count
    FROM appointments
    WHERE barber_id = p_barber_id
      AND appointment_date = p_date
      AND appointment_type = 'queue'
      AND status IN ('pending', 'scheduled', 'confirmed')
      AND (
        -- Higher priority appointments
        CASE priority_level
          WHEN 'urgent' THEN 0
          WHEN 'vip' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
          ELSE 2
        END < v_priority_weight
        OR
        -- Same priority, but earlier created
        (CASE priority_level
          WHEN 'urgent' THEN 0
          WHEN 'vip' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
          ELSE 2
        END = v_priority_weight AND created_at < NOW())
      );

    v_position := v_queue_count + 1;
  END IF;

  RETURN v_position;
END;
$$;

COMMENT ON FUNCTION calculate_timeline_position IS 
'Calculates the optimal timeline position based on appointment type and priority';

-- ============================================================================
-- FUNCTION: update_wait_time_estimates
-- ============================================================================
-- Purpose: Recalculate wait time estimates for all queue appointments
-- Triggered: After any appointment status change or new appointment

CREATE OR REPLACE FUNCTION update_wait_time_estimates(
  p_barber_id UUID,
  p_date DATE
)
RETURNS TABLE (
  appointment_id UUID,
  old_wait_time INTEGER,
  new_wait_time INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_time TIME;
  v_estimated_time TIME := '08:30:00'; -- Work start time
  v_appointment RECORD;
  v_wait_minutes INTEGER;
BEGIN
  v_current_time := CURRENT_TIME;

  -- Loop through all appointments in order
  FOR v_appointment IN
    SELECT 
      id,
      appointment_time,
      appointment_type,
      total_duration,
      queue_position,
      priority_level,
      created_at,
      EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))/60 AS current_wait
    FROM appointments
    WHERE barber_id = p_barber_id
      AND appointment_date = p_date
      AND status IN ('pending', 'scheduled', 'confirmed')
    ORDER BY
      CASE WHEN appointment_type = 'scheduled' THEN appointment_time ELSE '23:59:59' END,
      CASE priority_level 
        WHEN 'urgent' THEN 0
        WHEN 'vip' THEN 0
        WHEN 'high' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'low' THEN 3
        ELSE 2
      END,
      queue_position NULLS LAST,
      created_at
  LOOP
    -- Calculate wait time
    v_wait_minutes := EXTRACT(EPOCH FROM (v_estimated_time::timestamp - v_appointment.created_at))/60;

    -- Return results
    appointment_id := v_appointment.id;
    old_wait_time := v_appointment.current_wait::INTEGER;
    new_wait_time := v_wait_minutes;
    RETURN NEXT;

    -- Update estimated time for next appointment
    v_estimated_time := v_estimated_time + (COALESCE(v_appointment.total_duration, 30) || ' minutes')::INTERVAL;

    -- Check for lunch break (12:00 - 13:00)
    IF v_estimated_time >= '12:00:00' AND v_estimated_time < '13:00:00' THEN
      v_estimated_time := '13:00:00';
    END IF;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION update_wait_time_estimates IS 
'Recalculates and returns wait time estimates for all pending appointments';

-- ============================================================================
-- FUNCTION: detect_queue_delays
-- ============================================================================
-- Purpose: Detect if the barber is running behind schedule
-- Returns: Delay in minutes if any

CREATE OR REPLACE FUNCTION detect_queue_delays(
  p_barber_id UUID,
  p_date DATE
)
RETURNS TABLE (
  is_delayed BOOLEAN,
  delay_minutes INTEGER,
  affected_appointments INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_apt RECORD;
  v_scheduled_time TIME;
  v_current_time TIME := CURRENT_TIME;
  v_delay INTEGER := 0;
  v_count INTEGER := 0;
BEGIN
  -- Get current ongoing appointment
  SELECT 
    appointment_time,
    total_duration,
    updated_at
  INTO v_current_apt
  FROM appointments
  WHERE barber_id = p_barber_id
    AND appointment_date = p_date
    AND status = 'ongoing'
  ORDER BY updated_at DESC
  LIMIT 1;

  -- If there's an ongoing appointment
  IF FOUND AND v_current_apt.appointment_time IS NOT NULL THEN
    v_scheduled_time := v_current_apt.appointment_time;
    
    -- Expected end time
    DECLARE
      v_expected_end TIME := v_scheduled_time + (COALESCE(v_current_apt.total_duration, 30) || ' minutes')::INTERVAL;
    BEGIN
      -- If current time is past expected end, we're delayed
      IF v_current_time > v_expected_end THEN
        v_delay := EXTRACT(EPOCH FROM (v_current_time::timestamp - v_expected_end::timestamp))/60;
        
        -- Count affected appointments (future scheduled ones)
        SELECT COUNT(*) INTO v_count
        FROM appointments
        WHERE barber_id = p_barber_id
          AND appointment_date = p_date
          AND appointment_time > v_expected_end
          AND status IN ('scheduled', 'confirmed');
      END IF;
    END;
  END IF;

  -- Return results
  is_delayed := v_delay > 5; -- More than 5 min is considered delayed
  delay_minutes := v_delay;
  affected_appointments := v_count;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION detect_queue_delays IS 
'Detects if barber is running behind schedule and calculates delay impact';

-- ============================================================================
-- TRIGGER: auto_update_timeline_on_status_change
-- ============================================================================
-- Purpose: Automatically update timeline when appointment status changes

CREATE OR REPLACE FUNCTION trigger_update_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If status changed to 'done' or 'cancelled', recalculate positions
  IF (OLD.status IN ('ongoing', 'scheduled', 'confirmed') AND 
      NEW.status IN ('done', 'cancelled')) THEN
    
    -- Update wait times for remaining appointments
    PERFORM update_wait_time_estimates(NEW.barber_id, NEW.appointment_date);
    
    -- Log the change
    RAISE NOTICE 'Timeline updated for barber % on % due to status change', 
                 NEW.barber_id, NEW.appointment_date;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS update_timeline_on_status_change ON appointments;

-- Create trigger
CREATE TRIGGER update_timeline_on_status_change
  AFTER UPDATE OF status ON appointments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_update_timeline();

COMMENT ON TRIGGER update_timeline_on_status_change ON appointments IS 
'Automatically updates timeline when appointment status changes';

-- ============================================================================
-- VIEW: unified_queue_view
-- ============================================================================
-- Purpose: Pre-calculated view of unified queue for faster queries

CREATE OR REPLACE VIEW unified_queue_view AS
SELECT 
  a.id,
  a.barber_id,
  a.customer_id,
  a.appointment_date,
  a.appointment_time,
  a.appointment_type,
  a.status,
  a.queue_position,
  a.priority_level,
  a.total_duration,
  a.created_at,
  
  -- Calculate timeline position
  ROW_NUMBER() OVER (
    PARTITION BY a.barber_id, a.appointment_date
    ORDER BY
      CASE WHEN a.appointment_type = 'scheduled' THEN a.appointment_time ELSE '23:59:59' END,
      CASE a.priority_level 
        WHEN 'urgent' THEN 0
        WHEN 'vip' THEN 0
        WHEN 'high' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'low' THEN 3
        ELSE 2
      END,
      a.queue_position NULLS LAST,
      a.created_at
  ) AS timeline_position,
  
  -- Customer info
  c.full_name AS customer_name,
  c.phone AS customer_phone,
  
  -- Barber info
  b.full_name AS barber_name,
  
  -- Service info
  s.name AS service_name,
  s.duration AS service_duration,
  s.price AS service_price

FROM appointments a
LEFT JOIN users c ON a.customer_id = c.id
LEFT JOIN users b ON a.barber_id = b.id
LEFT JOIN services s ON a.service_id = s.id
WHERE a.status IN ('pending', 'scheduled', 'confirmed', 'ongoing')
ORDER BY a.barber_id, a.appointment_date, timeline_position;

COMMENT ON VIEW unified_queue_view IS 
'Pre-calculated unified queue view combining scheduled and queue appointments';

-- ============================================================================
-- INDEXES for Performance
-- ============================================================================

-- Index for real-time queue queries
CREATE INDEX IF NOT EXISTS idx_appointments_realtime_queue
  ON appointments(barber_id, appointment_date, status, appointment_type)
  WHERE status IN ('pending', 'scheduled', 'confirmed', 'ongoing');

-- Index for timeline ordering
CREATE INDEX IF NOT EXISTS idx_appointments_timeline_order
  ON appointments(barber_id, appointment_date, appointment_time, priority_level, created_at)
  WHERE status != 'cancelled';

-- Index for priority-based queries
CREATE INDEX IF NOT EXISTS idx_appointments_priority_queue
  ON appointments(barber_id, appointment_date, priority_level, queue_position)
  WHERE appointment_type = 'queue' AND status IN ('pending', 'scheduled', 'confirmed');

-- ============================================================================
-- GRANTS (Adjust based on your RLS policies)
-- ============================================================================

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION shift_queue_positions TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_timeline_position TO authenticated;
GRANT EXECUTE ON FUNCTION update_wait_time_estimates TO authenticated;
GRANT EXECUTE ON FUNCTION detect_queue_delays TO authenticated;

-- Grant select on view
GRANT SELECT ON unified_queue_view TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Test the functions
DO $$
DECLARE
  test_barber_id UUID := '00000000-0000-0000-0000-000000000000'; -- Replace with actual barber ID
  test_date DATE := CURRENT_DATE;
BEGIN
  RAISE NOTICE '=== Testing Advanced Hybrid Queue Functions ===';
  
  -- Test calculate_timeline_position
  RAISE NOTICE 'Timeline position for new queue appointment: %', 
    calculate_timeline_position(test_barber_id, test_date, 'queue', NULL, 'normal');
  
  -- Test detect_queue_delays
  PERFORM * FROM detect_queue_delays(test_barber_id, test_date);
  
  RAISE NOTICE 'All functions created successfully!';
END $$;

-- ============================================================================
-- COMPLETE!
-- ============================================================================

/*
✅ Functions Created:
1. shift_queue_positions - Reorders queue for urgent appointments
2. calculate_timeline_position - Calculates optimal position
3. update_wait_time_estimates - Updates wait times
4. detect_queue_delays - Detects scheduling delays

✅ Trigger Created:
- update_timeline_on_status_change - Auto-updates on status change

✅ View Created:
- unified_queue_view - Pre-calculated unified queue

✅ Indexes Created:
- Optimized for real-time queries
- Fast timeline ordering
- Efficient priority queries

Next Steps:
1. Update Supabase RLS policies if needed
2. Test functions with actual data
3. Integrate with AdvancedHybridQueueService.js
4. Deploy!
*/

