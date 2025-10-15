-- Fix users table UUID generation for walk-in customers
-- This script ensures the users table can properly generate UUIDs for new customers

-- Check if the users table exists and has proper UUID setup
DO $$
BEGIN
    -- Check if the users table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        
        -- Check if the id column has a default value
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'id' 
            AND column_default IS NOT NULL
        ) THEN
            -- Add default UUID generation to the id column
            ALTER TABLE public.users 
            ALTER COLUMN id SET DEFAULT gen_random_uuid();
            
            RAISE NOTICE 'Added UUID default to users.id column';
        ELSE
            RAISE NOTICE 'Users.id column already has a default value';
        END IF;
        
        -- Ensure the id column is properly typed as UUID
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'users' 
            AND column_name = 'id' 
            AND data_type != 'uuid'
        ) THEN
            -- Convert id column to UUID type
            ALTER TABLE public.users 
            ALTER COLUMN id TYPE uuid USING id::uuid;
            
            RAISE NOTICE 'Converted users.id column to UUID type';
        ELSE
            RAISE NOTICE 'Users.id column is already UUID type';
        END IF;
        
        -- Ensure RLS policies allow user creation
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'users' 
            AND policyname = 'Allow user creation'
        ) THEN
            -- Create policy to allow user creation
            CREATE POLICY "Allow user creation" ON public.users
            FOR INSERT WITH CHECK (true);
            
            RAISE NOTICE 'Created RLS policy for user creation';
        ELSE
            RAISE NOTICE 'RLS policy for user creation already exists';
        END IF;
        
        -- Ensure RLS policies allow user selection
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'users' 
            AND policyname = 'Allow user selection'
        ) THEN
            -- Create policy to allow user selection
            CREATE POLICY "Allow user selection" ON public.users
            FOR SELECT USING (true);
            
            RAISE NOTICE 'Created RLS policy for user selection';
        ELSE
            RAISE NOTICE 'RLS policy for user selection already exists';
        END IF;
        
    ELSE
        RAISE NOTICE 'Users table does not exist';
    END IF;
END
$$;

-- Test the fix by trying to insert a test user
DO $$
DECLARE
    test_user_id uuid;
BEGIN
    -- Try to insert a test user
    INSERT INTO public.users (email, full_name, phone, role)
    VALUES ('test_walkin@temp.com', 'Test Walk-in', '0000000000', 'customer')
    RETURNING id INTO test_user_id;
    
    -- If successful, delete the test user
    DELETE FROM public.users WHERE id = test_user_id;
    
    RAISE NOTICE 'Test user creation successful - UUID generation is working';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Test user creation failed: %', SQLERRM;
END
$$;


