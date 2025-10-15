-- Create fake user detection analysis table
-- This table stores analysis results for user registrations

CREATE TABLE IF NOT EXISTS fake_user_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  full_name VARCHAR(255),
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
  flags TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  is_suspicious BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_fake_user_analysis_email ON fake_user_analysis(email);
CREATE INDEX IF NOT EXISTS idx_fake_user_analysis_phone ON fake_user_analysis(phone);
CREATE INDEX IF NOT EXISTS idx_fake_user_analysis_risk_level ON fake_user_analysis(risk_level);
CREATE INDEX IF NOT EXISTS idx_fake_user_analysis_suspicious ON fake_user_analysis(is_suspicious);
CREATE INDEX IF NOT EXISTS idx_fake_user_analysis_created_at ON fake_user_analysis(created_at);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_fake_user_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_fake_user_analysis_updated_at
  BEFORE UPDATE ON fake_user_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_fake_user_analysis_updated_at();

-- Add comments
COMMENT ON TABLE fake_user_analysis IS 'Stores fake user detection analysis results';
COMMENT ON COLUMN fake_user_analysis.risk_score IS 'Risk score from 0-100';
COMMENT ON COLUMN fake_user_analysis.risk_level IS 'Risk level: very_low, low, medium, high';
COMMENT ON COLUMN fake_user_analysis.flags IS 'Array of detected risk flags';
COMMENT ON COLUMN fake_user_analysis.recommendations IS 'Array of security recommendations';
COMMENT ON COLUMN fake_user_analysis.is_suspicious IS 'Whether the user is considered suspicious';

-- Create RLS policies
ALTER TABLE fake_user_analysis ENABLE ROW LEVEL SECURITY;

-- Only managers can view fake user analysis
CREATE POLICY "Managers can view fake user analysis" ON fake_user_analysis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Only managers can insert fake user analysis
CREATE POLICY "Managers can insert fake user analysis" ON fake_user_analysis
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Only managers can update fake user analysis
CREATE POLICY "Managers can update fake user analysis" ON fake_user_analysis
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );
