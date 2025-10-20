-- Test script to verify the barber_day_offs table migration
-- Run this after applying the migration to test functionality

-- Test 1: Create a test barber day-off
INSERT INTO barber_day_offs (barber_id, start_date, end_date, type, reason, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001', -- Replace with actual barber UUID
  '2024-01-15',
  '2024-01-15',
  'day_off',
  'Test day off',
  true
);

-- Test 2: Try to create overlapping day-off (should fail)
INSERT INTO barber_day_offs (barber_id, start_date, end_date, type, reason, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001', -- Same barber
  '2024-01-15',
  '2024-01-16',
  'sick_leave',
  'Overlapping test',
  true
);

-- Test 3: Check barber availability function
SELECT check_barber_availability('00000000-0000-0000-0000-000000000001', '2024-01-15'); -- Should return false
SELECT check_barber_availability('00000000-0000-0000-0000-000000000001', '2024-01-16'); -- Should return true

-- Test 4: Check overlap function
SELECT check_day_off_overlap('00000000-0000-0000-0000-000000000001', '2024-01-14', '2024-01-16'); -- Should return true
SELECT check_day_off_overlap('00000000-0000-0000-0000-000000000001', '2024-01-20', '2024-01-21'); -- Should return false

-- Test 5: Get next available date
SELECT get_barber_next_available_date('00000000-0000-0000-0000-000000000001', '2024-01-15'); -- Should return 2024-01-16

-- Clean up test data
DELETE FROM barber_day_offs WHERE barber_id = '00000000-0000-0000-0000-000000000001';
