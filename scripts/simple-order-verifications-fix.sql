-- Simple fix for order_verifications RLS policy issue
-- This script creates the table and policies needed for order verification

-- Create order_verifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.order_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    verification_type VARCHAR(50) NOT NULL, -- 'phone', 'email', 'identity'
    verification_code VARCHAR(10),
    verification_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'verified', 'failed', 'expired'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    expires_at TIMESTAMP WITH TIME ZONE,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_order_verifications_order_id ON public.order_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_verifications_status ON public.order_verifications(verification_status);
CREATE INDEX IF NOT EXISTS idx_order_verifications_type ON public.order_verifications(verification_type);

-- Enable RLS
ALTER TABLE public.order_verifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow users to view their own verifications" ON public.order_verifications;
DROP POLICY IF EXISTS "Allow system to create verifications" ON public.order_verifications;
DROP POLICY IF EXISTS "Allow system to update verifications" ON public.order_verifications;
DROP POLICY IF EXISTS "Allow managers to view all verifications" ON public.order_verifications;
DROP POLICY IF EXISTS "Allow barbers to view relevant verifications" ON public.order_verifications;

-- Create RLS policies

-- Policy 1: Allow users to view their own order verifications
CREATE POLICY "Allow users to view their own verifications" ON public.order_verifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE orders.id = order_verifications.order_id 
            AND orders.customer_id = auth.uid()
        )
    );

-- Policy 2: Allow system/service to create verifications
CREATE POLICY "Allow system to create verifications" ON public.order_verifications
    FOR INSERT
    WITH CHECK (
        -- Allow if the order belongs to the current user
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE orders.id = order_verifications.order_id 
            AND orders.customer_id = auth.uid()
        )
        OR
        -- Allow if user is a manager
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'manager'
        )
        OR
        -- Allow if user is a barber
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'barber'
        )
    );

-- Policy 3: Allow system/service to update verifications
CREATE POLICY "Allow system to update verifications" ON public.order_verifications
    FOR UPDATE
    USING (
        -- Allow if the order belongs to the current user
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE orders.id = order_verifications.order_id 
            AND orders.customer_id = auth.uid()
        )
        OR
        -- Allow if user is a manager
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'manager'
        )
        OR
        -- Allow if user is a barber
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'barber'
        )
    )
    WITH CHECK (
        -- Same conditions for updates
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE orders.id = order_verifications.order_id 
            AND orders.customer_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'manager'
        )
        OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'barber'
        )
    );

-- Policy 4: Allow managers to view all verifications
CREATE POLICY "Allow managers to view all verifications" ON public.order_verifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'manager'
        )
    );

-- Policy 5: Allow barbers to view verifications
CREATE POLICY "Allow barbers to view relevant verifications" ON public.order_verifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role = 'barber'
        )
    );

-- Create secure function for verification creation
CREATE OR REPLACE FUNCTION public.create_order_verification(
    p_order_id uuid,
    p_verification_type varchar(50),
    p_verification_code varchar(10) DEFAULT NULL,
    p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_verification_id uuid;
    v_customer_id uuid;
BEGIN
    -- Get the customer ID for the order
    SELECT customer_id INTO v_customer_id
    FROM public.orders
    WHERE id = p_order_id;
    
    -- Check if the current user has permission to create verification
    IF NOT (
        -- User owns the order
        v_customer_id = auth.uid()
        OR
        -- User is a manager
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager')
        OR
        -- User is a barber
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'barber')
    ) THEN
        RAISE EXCEPTION 'Insufficient permissions to create verification for this order';
    END IF;
    
    -- Create the verification record
    INSERT INTO public.order_verifications (
        order_id,
        verification_type,
        verification_code,
        expires_at
    ) VALUES (
        p_order_id,
        p_verification_type,
        p_verification_code,
        COALESCE(p_expires_at, now() + interval '15 minutes')
    ) RETURNING id INTO v_verification_id;
    
    RETURN v_verification_id;
END;
$$;

-- Create secure function for verification status updates
CREATE OR REPLACE FUNCTION public.update_verification_status(
    p_verification_id uuid,
    p_status varchar(20),
    p_verification_code varchar(10) DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id uuid;
    v_customer_id uuid;
    v_current_attempts integer;
    v_max_attempts integer;
BEGIN
    -- Get order and customer info
    SELECT ov.order_id, o.customer_id, ov.attempts, ov.max_attempts
    INTO v_order_id, v_customer_id, v_current_attempts, v_max_attempts
    FROM public.order_verifications ov
    JOIN public.orders o ON o.id = ov.order_id
    WHERE ov.id = p_verification_id;
    
    -- Check permissions
    IF NOT (
        v_customer_id = auth.uid()
        OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager')
        OR
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'barber')
    ) THEN
        RAISE EXCEPTION 'Insufficient permissions to update this verification';
    END IF;
    
    -- Update the verification
    UPDATE public.order_verifications
    SET 
        verification_status = p_status,
        attempts = CASE 
            WHEN p_status = 'failed' THEN attempts + 1
            ELSE attempts
        END,
        verified_at = CASE 
            WHEN p_status = 'verified' THEN now()
            ELSE verified_at
        END,
        updated_at = now()
    WHERE id = p_verification_id;
    
    RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_order_verification TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_verification_status TO authenticated;

-- Success message
SELECT '✅ Order verifications RLS policies and functions created successfully!' as status;


