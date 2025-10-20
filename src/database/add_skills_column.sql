-- Add skills column to users table for barbers
-- This migration adds a skills column to store barber specializations

-- Add the skills column to the users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS skills TEXT;

-- Add a comment to document the column purpose
COMMENT ON COLUMN users.skills IS 'Comma-separated list of barber skills/specializations';

-- Update existing barbers with some default skills (optional)
-- You can customize these based on your barbers' actual skills
UPDATE users 
SET skills = 'Haircut, Beard Trim, Styling'
WHERE role = 'barber' 
AND skills IS NULL;

-- Create an index on skills for better search performance (optional)
CREATE INDEX IF NOT EXISTS idx_users_skills ON users USING gin(to_tsvector('english', skills));

-- Grant necessary permissions (adjust based on your RLS policies)
-- The column will inherit the same permissions as the users table
