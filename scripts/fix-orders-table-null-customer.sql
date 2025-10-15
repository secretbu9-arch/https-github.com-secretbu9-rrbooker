-- Fix orders table to allow null customer_id for walk-in purchases
-- This allows managers to create orders without requiring customer user records

-- Check if the orders table exists and modify it to allow null customer_id
DO $$
BEGIN
    -- Check if the orders table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
        
        -- Check if customer_id column exists and is NOT NULL
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'orders' 
            AND column_name = 'customer_id' 
            AND is_nullable = 'NO'
        ) THEN
            -- Make customer_id nullable for walk-in purchases
            ALTER TABLE public.orders 
            ALTER COLUMN customer_id DROP NOT NULL;
            
            RAISE NOTICE 'Made customer_id column nullable in orders table';
        ELSE
            RAISE NOTICE 'customer_id column is already nullable or does not exist';
        END IF;
        
        -- Ensure RLS policies allow order creation with null customer_id
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'orders' 
            AND policyname = 'Allow order creation with null customer'
        ) THEN
            -- Create policy to allow order creation with null customer_id
            CREATE POLICY "Allow order creation with null customer" ON public.orders
            FOR INSERT WITH CHECK (true);
            
            RAISE NOTICE 'Created RLS policy for order creation with null customer_id';
        ELSE
            RAISE NOTICE 'RLS policy for order creation with null customer_id already exists';
        END IF;
        
        -- Ensure RLS policies allow order selection
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'orders' 
            AND policyname = 'Allow order selection'
        ) THEN
            -- Create policy to allow order selection
            CREATE POLICY "Allow order selection" ON public.orders
            FOR SELECT USING (true);
            
            RAISE NOTICE 'Created RLS policy for order selection';
        ELSE
            RAISE NOTICE 'RLS policy for order selection already exists';
        END IF;
        
        -- Ensure RLS policies allow order updates
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'orders' 
            AND policyname = 'Allow order updates'
        ) THEN
            -- Create policy to allow order updates
            CREATE POLICY "Allow order updates" ON public.orders
            FOR UPDATE USING (true);
            
            RAISE NOTICE 'Created RLS policy for order updates';
        ELSE
            RAISE NOTICE 'RLS policy for order updates already exists';
        END IF;
        
    ELSE
        RAISE NOTICE 'Orders table does not exist';
    END IF;
END
$$;

-- Test the fix by trying to insert a test order with null customer_id
DO $$
DECLARE
    test_order_id uuid;
BEGIN
    -- Try to insert a test order with null customer_id
    INSERT INTO public.orders (
        customer_id, 
        total_amount, 
        pickup_date, 
        pickup_time, 
        pickup_location, 
        notes, 
        customer_phone, 
        customer_email, 
        status
    )
    VALUES (
        NULL, -- null customer_id for walk-in
        100.00,
        CURRENT_DATE,
        '12:00',
        'R&R Barber Shop',
        'Test walk-in order',
        'N/A',
        'N/A',
        'pending'
    )
    RETURNING id INTO test_order_id;
    
    -- If successful, delete the test order
    DELETE FROM public.orders WHERE id = test_order_id;
    
    RAISE NOTICE 'Test order creation with null customer_id successful';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test order creation failed: %', SQLERRM;
END
$$;


