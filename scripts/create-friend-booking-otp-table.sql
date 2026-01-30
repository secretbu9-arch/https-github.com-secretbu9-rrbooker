-- Script: create-friend-booking-otp-table.sql
-- Description: Creates the friend_booking_otps table used for storing email OTP codes
-- Usage: Run this script in Supabase SQL editor or via migration tooling before deploying the OTP feature.

CREATE TABLE IF NOT EXISTS public.friend_booking_otps (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  verification_status text DEFAULT 'pending',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure updated_at stays current
CREATE OR REPLACE FUNCTION public.friend_booking_otps_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_friend_booking_otps_set_updated_at ON public.friend_booking_otps;
CREATE TRIGGER tr_friend_booking_otps_set_updated_at
BEFORE UPDATE ON public.friend_booking_otps
FOR EACH ROW EXECUTE PROCEDURE public.friend_booking_otps_set_updated_at();

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_friend_booking_otps_email ON public.friend_booking_otps (email);
CREATE INDEX IF NOT EXISTS idx_friend_booking_otps_email_code ON public.friend_booking_otps (email, code);
CREATE INDEX IF NOT EXISTS idx_friend_booking_otps_status ON public.friend_booking_otps (verification_status);

-- Optional: add a policy if using RLS
-- COMMENT ON TABLE public.friend_booking_otps IS 'Stores OTP codes for friend/child booking verification.';







