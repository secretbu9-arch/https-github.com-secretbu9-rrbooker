-- Simplified fraud prevention without device fingerprinting
-- This creates only the essential tables for basic fraud prevention

-- Create order_fraud_analysis table (simplified)
CREATE TABLE IF NOT EXISTS public.order_fraud_analysis (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    risk_score INTEGER NOT NULL DEFAULT 0,
    fraud_flags JSONB DEFAULT '[]'::jsonb,
    analysis_data JSONB DEFAULT '{}'::jsonb,
    recommendation VARCHAR(50) DEFAULT 'approve', -- 'approve', 'review', 'reject'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_fraud_analysis_order_id ON public.order_fraud_analysis(order_id);
CREATE INDEX IF NOT EXISTS idx_order_fraud_analysis_user_id ON public.order_fraud_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_order_fraud_analysis_risk_score ON public.order_fraud_analysis(risk_score);

-- Enable RLS
ALTER TABLE public.order_fraud_analysis ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow users to view their own fraud analysis" ON public.order_fraud_analysis;
DROP POLICY IF EXISTS "Allow system to manage fraud analysis" ON public.order_fraud_analysis;
DROP POLICY IF EXISTS "Allow managers to view all fraud analysis" ON public.order_fraud_analysis;

-- Create RLS policies
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

-- Create simplified fraud analysis function
CREATE OR REPLACE FUNCTION public.save_simple_fraud_analysis(
    p_order_id uuid,
    p_user_id uuid,
    p_risk_score integer,
    p_fraud_flags jsonb DEFAULT '[]'::jsonb,
    p_analysis_data jsonb DEFAULT '{}'::jsonb,
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
        recommendation
    ) VALUES (
        p_order_id,
        p_user_id,
        p_risk_score,
        p_fraud_flags,
        p_analysis_data,
        p_recommendation
    ) RETURNING id INTO v_analysis_id;
    
    RETURN v_analysis_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.save_simple_fraud_analysis TO authenticated;

-- Success message
SELECT '✅ Simplified fraud prevention system created successfully!' as status;


