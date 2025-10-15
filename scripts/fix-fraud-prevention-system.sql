-- Fix fraud prevention system - create missing tables and RLS policies
-- This addresses multiple errors in the OrderScamPreventionService

-- 1. Create device_fingerprints table
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    fingerprint_hash VARCHAR(255) NOT NULL,
    user_agent TEXT,
    screen_resolution VARCHAR(50),
    timezone VARCHAR(100),
    language VARCHAR(10),
    platform VARCHAR(50),
    risk_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for device_fingerprints
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user_id ON public.device_fingerprints(user_id);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_hash ON public.device_fingerprints(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_risk_score ON public.device_fingerprints(risk_score);

-- 2. Create order_fraud_analysis table
CREATE TABLE IF NOT EXISTS public.order_fraud_analysis (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    risk_score INTEGER NOT NULL DEFAULT 0,
    fraud_flags JSONB DEFAULT '[]'::jsonb,
    analysis_data JSONB DEFAULT '{}'::jsonb,
    device_analysis JSONB DEFAULT '{}'::jsonb,
    contact_analysis JSONB DEFAULT '{}'::jsonb,
    behavioral_analysis JSONB DEFAULT '{}'::jsonb,
    recommendation VARCHAR(50) DEFAULT 'approve', -- 'approve', 'review', 'reject'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for order_fraud_analysis
CREATE INDEX IF NOT EXISTS idx_order_fraud_analysis_order_id ON public.order_fraud_analysis(order_id);
CREATE INDEX IF NOT EXISTS idx_order_fraud_analysis_user_id ON public.order_fraud_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_order_fraud_analysis_risk_score ON public.order_fraud_analysis(risk_score);

-- 3. Create user_behavioral_data table
CREATE TABLE IF NOT EXISTS public.user_behavioral_data (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    action_type VARCHAR(100) NOT NULL, -- 'login', 'order', 'view', 'click', etc.
    action_data JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for user_behavioral_data
CREATE INDEX IF NOT EXISTS idx_user_behavioral_data_user_id ON public.user_behavioral_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavioral_data_session_id ON public.user_behavioral_data(session_id);
CREATE INDEX IF NOT EXISTS idx_user_behavioral_data_action_type ON public.user_behavioral_data(action_type);
CREATE INDEX IF NOT EXISTS idx_user_behavioral_data_timestamp ON public.user_behavioral_data(timestamp);

-- Enable RLS on all tables
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fraud_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_behavioral_data ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow users to manage their own device fingerprints" ON public.device_fingerprints;
DROP POLICY IF EXISTS "Allow system to manage device fingerprints" ON public.device_fingerprints;
DROP POLICY IF EXISTS "Allow users to view their own fraud analysis" ON public.order_fraud_analysis;
DROP POLICY IF EXISTS "Allow system to manage fraud analysis" ON public.order_fraud_analysis;
DROP POLICY IF EXISTS "Allow managers to view all fraud analysis" ON public.order_fraud_analysis;
DROP POLICY IF EXISTS "Allow users to manage their own behavioral data" ON public.user_behavioral_data;
DROP POLICY IF EXISTS "Allow system to manage behavioral data" ON public.user_behavioral_data;

-- RLS Policies for device_fingerprints
CREATE POLICY "Allow users to manage their own device fingerprints" ON public.device_fingerprints
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow system to manage device fingerprints" ON public.device_fingerprints
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'barber'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'barber'))
    );

-- RLS Policies for order_fraud_analysis
CREATE POLICY "Allow users to view their own fraud analysis" ON public.order_fraud_analysis
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Allow system to manage fraud analysis" ON public.order_fraud_analysis
    FOR ALL
    USING (
        user_id = auth.uid()
        OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'barber'))
    )
    WITH CHECK (
        user_id = auth.uid()
        OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'barber'))
    );

CREATE POLICY "Allow managers to view all fraud analysis" ON public.order_fraud_analysis
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager')
    );

-- RLS Policies for user_behavioral_data
CREATE POLICY "Allow users to manage their own behavioral data" ON public.user_behavioral_data
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Allow system to manage behavioral data" ON public.user_behavioral_data
    FOR ALL
    USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'barber'))
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'barber'))
    );

-- Create secure functions for fraud analysis operations

-- Function to save fraud analysis
CREATE OR REPLACE FUNCTION public.save_fraud_analysis(
    p_order_id uuid,
    p_user_id uuid,
    p_risk_score integer,
    p_fraud_flags jsonb DEFAULT '[]'::jsonb,
    p_analysis_data jsonb DEFAULT '{}'::jsonb,
    p_device_analysis jsonb DEFAULT '{}'::jsonb,
    p_contact_analysis jsonb DEFAULT '{}'::jsonb,
    p_behavioral_analysis jsonb DEFAULT '{}'::jsonb,
    p_recommendation varchar(50) DEFAULT 'approve'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_analysis_id uuid;
BEGIN
    -- Check permissions
    IF NOT (
        p_user_id = auth.uid()
        OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'barber'))
    ) THEN
        RAISE EXCEPTION 'Insufficient permissions to save fraud analysis';
    END IF;
    
    -- Insert fraud analysis
    INSERT INTO public.order_fraud_analysis (
        order_id,
        user_id,
        risk_score,
        fraud_flags,
        analysis_data,
        device_analysis,
        contact_analysis,
        behavioral_analysis,
        recommendation
    ) VALUES (
        p_order_id,
        p_user_id,
        p_risk_score,
        p_fraud_flags,
        p_analysis_data,
        p_device_analysis,
        p_contact_analysis,
        p_behavioral_analysis,
        p_recommendation
    ) RETURNING id INTO v_analysis_id;
    
    RETURN v_analysis_id;
END;
$$;

-- Function to save device fingerprint
CREATE OR REPLACE FUNCTION public.save_device_fingerprint(
    p_user_id uuid,
    p_fingerprint_hash varchar(255),
    p_user_agent text DEFAULT NULL,
    p_screen_resolution varchar(50) DEFAULT NULL,
    p_timezone varchar(100) DEFAULT NULL,
    p_language varchar(10) DEFAULT NULL,
    p_platform varchar(50) DEFAULT NULL,
    p_risk_score integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_fingerprint_id uuid;
BEGIN
    -- Check permissions
    IF NOT (
        p_user_id = auth.uid()
        OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'barber'))
    ) THEN
        RAISE EXCEPTION 'Insufficient permissions to save device fingerprint';
    END IF;
    
    -- Insert or update device fingerprint
    INSERT INTO public.device_fingerprints (
        user_id,
        fingerprint_hash,
        user_agent,
        screen_resolution,
        timezone,
        language,
        platform,
        risk_score
    ) VALUES (
        p_user_id,
        p_fingerprint_hash,
        p_user_agent,
        p_screen_resolution,
        p_timezone,
        p_language,
        p_platform,
        p_risk_score
    )
    ON CONFLICT (user_id, fingerprint_hash) 
    DO UPDATE SET
        user_agent = EXCLUDED.user_agent,
        screen_resolution = EXCLUDED.screen_resolution,
        timezone = EXCLUDED.timezone,
        language = EXCLUDED.language,
        platform = EXCLUDED.platform,
        risk_score = EXCLUDED.risk_score,
        updated_at = now()
    RETURNING id INTO v_fingerprint_id;
    
    RETURN v_fingerprint_id;
END;
$$;

-- Function to save behavioral data
CREATE OR REPLACE FUNCTION public.save_behavioral_data(
    p_user_id uuid,
    p_session_id varchar(255),
    p_action_type varchar(100),
    p_action_data jsonb DEFAULT '{}'::jsonb,
    p_ip_address inet DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_behavior_id uuid;
BEGIN
    -- Check permissions
    IF NOT (
        p_user_id = auth.uid()
        OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('manager', 'barber'))
    ) THEN
        RAISE EXCEPTION 'Insufficient permissions to save behavioral data';
    END IF;
    
    -- Insert behavioral data
    INSERT INTO public.user_behavioral_data (
        user_id,
        session_id,
        action_type,
        action_data,
        ip_address,
        user_agent
    ) VALUES (
        p_user_id,
        p_session_id,
        p_action_type,
        p_action_data,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO v_behavior_id;
    
    RETURN v_behavior_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.save_fraud_analysis TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_device_fingerprint TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_behavioral_data TO authenticated;

-- Success message
SELECT '✅ Fraud prevention system tables and functions created successfully!' as status;


