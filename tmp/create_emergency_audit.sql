-- Create emergency_audit table
CREATE TABLE IF NOT EXISTS emergency_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT
);

-- Ensure priority_level can handle '1' and handle sorting
-- If priority_level is currently a string, we can still sort DESC if we use '1' and '0'
-- But let's check if we want to add an index for the new sorting logic
CREATE INDEX IF NOT EXISTS idx_appointments_priority_status_time 
ON appointments (status, priority_level DESC, estimated_start_time ASC);
