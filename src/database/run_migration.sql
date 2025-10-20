-- Safe migration script for barber day-offs functionality
-- This script can be run multiple times safely

-- Create barber_day_offs table if it doesn't exist
CREATE TABLE IF NOT EXISTS barber_day_offs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('day_off', 'sick_leave', 'vacation', 'emergency')),
  reason TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure start_date is not after end_date
  CONSTRAINT valid_date_range CHECK (start_date <= end_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_barber_day_offs_barber_id ON barber_day_offs(barber_id);
CREATE INDEX IF NOT EXISTS idx_barber_day_offs_dates ON barber_day_offs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_barber_day_offs_active ON barber_day_offs(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE barber_day_offs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Barbers can manage their own day-offs" ON barber_day_offs;
CREATE POLICY "Barbers can manage their own day-offs" ON barber_day_offs
  FOR ALL USING (barber_id = auth.uid());

DROP POLICY IF EXISTS "Managers can view all day-offs" ON barber_day_offs;
CREATE POLICY "Managers can view all day-offs" ON barber_day_offs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'manager'
    )
  );

DROP POLICY IF EXISTS "Customers can view active day-offs" ON barber_day_offs;
CREATE POLICY "Customers can view active day-offs" ON barber_day_offs
  FOR SELECT USING (is_active = true);

-- Create or replace functions
CREATE OR REPLACE FUNCTION update_barber_day_offs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_day_off_overlap(
  p_barber_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if there are any overlapping active day-offs
  RETURN EXISTS (
    SELECT 1 FROM barber_day_offs 
    WHERE barber_id = p_barber_id 
    AND is_active = true
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
    AND (
      (p_start_date BETWEEN start_date AND end_date) OR
      (p_end_date BETWEEN start_date AND end_date) OR
      (p_start_date <= start_date AND p_end_date >= end_date)
    )
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_barber_availability(
  p_barber_id UUID,
  p_date DATE
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if barber has an active day-off on the given date
  RETURN NOT EXISTS (
    SELECT 1 FROM barber_day_offs 
    WHERE barber_id = p_barber_id 
    AND p_date BETWEEN start_date AND end_date 
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_barber_next_available_date(
  p_barber_id UUID,
  p_from_date DATE DEFAULT CURRENT_DATE
)
RETURNS DATE AS $$
DECLARE
  next_date DATE := p_from_date;
  max_days INTEGER := 30; -- Look ahead maximum 30 days
  day_count INTEGER := 0;
BEGIN
  WHILE day_count < max_days LOOP
    -- Check if this date is available
    IF check_barber_availability(p_barber_id, next_date) THEN
      RETURN next_date;
    END IF;
    
    next_date := next_date + INTERVAL '1 day';
    day_count := day_count + 1;
  END LOOP;
  
  -- If no available date found in 30 days, return NULL
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist and recreate them
DROP TRIGGER IF EXISTS update_barber_day_offs_updated_at ON barber_day_offs;
CREATE TRIGGER update_barber_day_offs_updated_at
  BEFORE UPDATE ON barber_day_offs
  FOR EACH ROW
  EXECUTE FUNCTION update_barber_day_offs_updated_at();

-- Test the setup
SELECT 'Barber day-offs setup completed successfully!' as status;
