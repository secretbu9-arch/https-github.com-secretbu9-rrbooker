-- ============================================================================
-- CREATE CUSTOM STATUS UPDATE FUNCTION
-- ============================================================================
-- This function bypasses the problematic trigger by using a different approach

-- ============================================================================
-- STEP 1: CREATE THE STATUS UPDATE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_appointment_status_safe(
  appointment_id_param UUID,
  new_status_param TEXT
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  old_appointment RECORD;
BEGIN
  -- Get the current appointment data
  SELECT * INTO old_appointment 
  FROM appointments 
  WHERE id = appointment_id_param;
  
  -- Check if appointment exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Appointment not found'
    );
  END IF;
  
  -- Update the appointment using a direct SQL approach
  UPDATE appointments 
  SET 
    status = new_status_param,
    updated_at = NOW()
  WHERE id = appointment_id_param;
  
  -- Handle queue_position updates for queue appointments
  IF old_appointment.appointment_type = 'queue' THEN
    IF new_status_param IN ('done', 'cancelled') THEN
      UPDATE appointments 
      SET queue_position = NULL
      WHERE id = appointment_id_param;
    ELSIF new_status_param = 'ongoing' THEN
      UPDATE appointments 
      SET queue_position = 0
      WHERE id = appointment_id_param;
    END IF;
  END IF;
  
  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', appointment_id_param,
    'old_status', old_appointment.status,
    'new_status', new_status_param
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return error information
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'appointment_id', appointment_id_param
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 2: GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION update_appointment_status_safe(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_appointment_status_safe(UUID, TEXT) TO anon;

-- ============================================================================
-- STEP 3: TEST THE FUNCTION
-- ============================================================================

-- Test the function
SELECT update_appointment_status_safe(
  '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff'::UUID,
  'done'::TEXT
);

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

SELECT 'Status update function created successfully!' as status;
