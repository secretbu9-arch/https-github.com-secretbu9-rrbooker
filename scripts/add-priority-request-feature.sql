-- Add Priority Request Feature
-- This allows customers to request priority on existing appointments
-- Managers can approve/reject and apply fees

-- Add priority_request_status column to appointments table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'priority_request_status'
    ) THEN
        ALTER TABLE appointments ADD COLUMN priority_request_status VARCHAR(20) DEFAULT NULL;
        RAISE NOTICE 'Added priority_request_status column';
        
        -- Add comment
        COMMENT ON COLUMN appointments.priority_request_status IS 
            'Status of priority request: NULL (no request), pending (awaiting approval), approved (manager approved), rejected (manager rejected)';
    ELSE
        RAISE NOTICE 'priority_request_status column already exists';
    END IF;
END $$;

-- Add priority_requested_at timestamp
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'priority_requested_at'
    ) THEN
        ALTER TABLE appointments ADD COLUMN priority_requested_at TIMESTAMPTZ;
        RAISE NOTICE 'Added priority_requested_at column';
    ELSE
        RAISE NOTICE 'priority_requested_at column already exists';
    END IF;
END $$;

-- Add priority_request_notes for manager notes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'appointments' AND column_name = 'priority_request_notes'
    ) THEN
        ALTER TABLE appointments ADD COLUMN priority_request_notes TEXT;
        RAISE NOTICE 'Added priority_request_notes column';
    ELSE
        RAISE NOTICE 'priority_request_notes column already exists';
    END IF;
END $$;

-- Create index for faster queries on pending priority requests
CREATE INDEX IF NOT EXISTS idx_appointments_priority_request_status 
ON appointments(priority_request_status) 
WHERE priority_request_status = 'pending';




