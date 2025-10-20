// Database setup script for barber day-offs functionality
// Run this script to create the necessary table and functions

import { supabase } from '../supabaseClient.js';

async function setupBarberDayOffs() {
  try {
    console.log('🚀 Setting up barber day-offs functionality...');

    // Read the migration file
    const migrationSQL = `
-- Create barber_day_offs table for managing barber unavailability
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
  
  -- Note: Overlap prevention will be handled by application logic
  -- due to uuid not having default operator class for gist
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_barber_day_offs_barber_id ON barber_day_offs(barber_id);
CREATE INDEX IF NOT EXISTS idx_barber_day_offs_dates ON barber_day_offs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_barber_day_offs_active ON barber_day_offs(is_active) WHERE is_active = true;

-- Create RLS policies
ALTER TABLE barber_day_offs ENABLE ROW LEVEL SECURITY;

-- Policy: Barbers can manage their own day-offs
CREATE POLICY "Barbers can manage their own day-offs" ON barber_day_offs
  FOR ALL USING (barber_id = auth.uid());

-- Policy: Managers can view all day-offs
CREATE POLICY "Managers can view all day-offs" ON barber_day_offs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'manager'
    )
  );

-- Policy: Customers can view day-offs for booking purposes
CREATE POLICY "Customers can view active day-offs" ON barber_day_offs
  FOR SELECT USING (is_active = true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_barber_day_offs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_barber_day_offs_updated_at
  BEFORE UPDATE ON barber_day_offs
  FOR EACH ROW
  EXECUTE FUNCTION update_barber_day_offs_updated_at();

-- Create function to check for overlapping day-offs
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

-- Create function to check barber availability
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

-- Create function to get barber's next available date
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
`;

    // Execute the migration
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      console.error('❌ Error setting up barber day-offs:', error);
      return false;
    }

    console.log('✅ Barber day-offs functionality setup complete!');
    return true;

  } catch (error) {
    console.error('❌ Setup failed:', error);
    return false;
  }
}

// Run the setup
setupBarberDayOffs();
