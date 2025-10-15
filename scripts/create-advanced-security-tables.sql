-- Create advanced security tables for fake user prevention
-- Run this in your Supabase SQL Editor

-- Rate limiting logs table
CREATE TABLE IF NOT EXISTS rate_limit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  action VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User behavior logs table
CREATE TABLE IF NOT EXISTS user_behavior_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(100) NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  device_fingerprint VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security violations table
CREATE TABLE IF NOT EXISTS security_violations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  violation_type VARCHAR(100) NOT NULL,
  action VARCHAR(100),
  ip_address INET,
  details JSONB DEFAULT '{}',
  severity VARCHAR(20) DEFAULT 'medium',
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Device fingerprints table
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  fingerprint_hash VARCHAR(255) UNIQUE NOT NULL,
  device_data JSONB DEFAULT '{}',
  first_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_trusted BOOLEAN DEFAULT FALSE,
  risk_score INTEGER DEFAULT 0
);

-- IP analysis cache table
CREATE TABLE IF NOT EXISTS ip_analysis_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address INET UNIQUE NOT NULL,
  analysis_data JSONB DEFAULT '{}',
  risk_score INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Social media verifications table
CREATE TABLE IF NOT EXISTS social_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  provider VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  profile_data JSONB DEFAULT '{}',
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Phone verifications table
CREATE TABLE IF NOT EXISTS phone_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  phone_number VARCHAR(20) NOT NULL,
  verification_code VARCHAR(10),
  verified BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  verified_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Email domain analysis cache
CREATE TABLE IF NOT EXISTS email_domain_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  domain VARCHAR(255) UNIQUE NOT NULL,
  analysis_data JSONB DEFAULT '{}',
  risk_score INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_user_action ON rate_limit_logs(user_id, action);
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_ip_action ON rate_limit_logs(ip_address, action);
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_created_at ON rate_limit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_user_behavior_logs_user_id ON user_behavior_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_logs_action ON user_behavior_logs(action);
CREATE INDEX IF NOT EXISTS idx_user_behavior_logs_created_at ON user_behavior_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_behavior_logs_fingerprint ON user_behavior_logs(device_fingerprint);

CREATE INDEX IF NOT EXISTS idx_security_violations_user_id ON security_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_security_violations_type ON security_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_security_violations_severity ON security_violations(severity);
CREATE INDEX IF NOT EXISTS idx_security_violations_created_at ON security_violations(created_at);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_hash ON device_fingerprints(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user_id ON device_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_risk_score ON device_fingerprints(risk_score);

CREATE INDEX IF NOT EXISTS idx_ip_analysis_ip ON ip_analysis_cache(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_analysis_expires ON ip_analysis_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_social_verifications_user_id ON social_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_social_verifications_provider ON social_verifications(provider);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_user_id ON phone_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone ON phone_verifications(phone_number);

CREATE INDEX IF NOT EXISTS idx_email_domain_cache_domain ON email_domain_cache(domain);
CREATE INDEX IF NOT EXISTS idx_email_domain_cache_expires ON email_domain_cache(expires_at);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at columns where needed
ALTER TABLE device_fingerprints ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE ip_analysis_cache ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE email_domain_cache ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create triggers
CREATE TRIGGER trigger_update_device_fingerprints_updated_at
  BEFORE UPDATE ON device_fingerprints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_ip_analysis_cache_updated_at
  BEFORE UPDATE ON ip_analysis_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_email_domain_cache_updated_at
  BEFORE UPDATE ON email_domain_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE rate_limit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_behavior_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_analysis_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_domain_cache ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Rate limit logs - only managers can view
CREATE POLICY "Managers can view rate limit logs" ON rate_limit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- User behavior logs - users can view their own, managers can view all
CREATE POLICY "Users can view own behavior logs" ON user_behavior_logs
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Security violations - only managers can view
CREATE POLICY "Managers can view security violations" ON security_violations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Device fingerprints - users can view their own, managers can view all
CREATE POLICY "Users can view own device fingerprints" ON device_fingerprints
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- IP analysis cache - only managers can view
CREATE POLICY "Managers can view IP analysis cache" ON ip_analysis_cache
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Social verifications - users can view their own, managers can view all
CREATE POLICY "Users can view own social verifications" ON social_verifications
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Phone verifications - users can view their own, managers can view all
CREATE POLICY "Users can view own phone verifications" ON phone_verifications
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Email domain cache - only managers can view
CREATE POLICY "Managers can view email domain cache" ON email_domain_cache
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Add comments
COMMENT ON TABLE rate_limit_logs IS 'Logs rate limiting attempts and violations';
COMMENT ON TABLE user_behavior_logs IS 'Logs user behavior patterns for analysis';
COMMENT ON TABLE security_violations IS 'Logs security violations and incidents';
COMMENT ON TABLE device_fingerprints IS 'Stores device fingerprints for tracking';
COMMENT ON TABLE ip_analysis_cache IS 'Caches IP address analysis results';
COMMENT ON TABLE social_verifications IS 'Stores social media verification data';
COMMENT ON TABLE phone_verifications IS 'Stores phone number verification data';
COMMENT ON TABLE email_domain_cache IS 'Caches email domain analysis results';
