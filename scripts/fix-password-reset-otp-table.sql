-- Script: fix-password-reset-otp-table.sql
-- Description: Fixes the password_reset_otps table by adding missing columns
-- Usage: Run this script if you get errors about missing columns

-- Add verification_status column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'password_reset_otps' 
    AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE public.password_reset_otps 
    ADD COLUMN verification_status text DEFAULT 'pending';
  END IF;
END $$;

-- Ensure all other columns exist
DO $$ 
BEGIN
  -- Add verified_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'password_reset_otps' 
    AND column_name = 'verified_at'
  ) THEN
    ALTER TABLE public.password_reset_otps 
    ADD COLUMN verified_at timestamptz;
  END IF;

  -- Add created_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'password_reset_otps' 
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.password_reset_otps 
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());
  END IF;

  -- Add updated_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'password_reset_otps' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.password_reset_otps 
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());
  END IF;
END $$;

-- Create indexes (will skip if they already exist)
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

-- Ensure updated_at trigger exists
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

-- Analyze table to update statistics
ANALYZE public.password_reset_otps;


