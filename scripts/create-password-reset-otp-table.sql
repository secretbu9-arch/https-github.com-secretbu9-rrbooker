-- Script: create-password-reset-otp-table.sql
-- Description: Creates the password_reset_otps table used for storing password reset OTP codes
-- Usage: Run this script in Supabase SQL editor before using the password reset feature.

-- Drop table if it exists (to fix any schema issues)
DROP TABLE IF EXISTS public.password_reset_otps CASCADE;

CREATE TABLE public.password_reset_otps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  verification_status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure updated_at stays current
CREATE OR REPLACE FUNCTION public.password_reset_otps_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_password_reset_otps_set_updated_at ON public.password_reset_otps;
CREATE TRIGGER tr_password_reset_otps_set_updated_at
BEFORE UPDATE ON public.password_reset_otps
FOR EACH ROW EXECUTE PROCEDURE public.password_reset_otps_set_updated_at();

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON public.password_reset_otps (email);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email_code ON public.password_reset_otps (email, code);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_status ON public.password_reset_otps (verification_status);

-- Optimized composite index for verification queries
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_verify_lookup 
  ON public.password_reset_otps (email, code, expires_at)
  WHERE verified_at IS NULL;

-- Index for cleanup queries (expired codes)
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_expires 
  ON public.password_reset_otps (expires_at)
  WHERE verified_at IS NULL;

-- Analyze table to update statistics
ANALYZE public.password_reset_otps;

