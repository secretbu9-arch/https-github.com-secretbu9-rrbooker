-- Check current user role and profile
-- Run this in Supabase SQL Editor to diagnose role issues

-- Check current authenticated user
SELECT 
    auth.uid() as current_user_id,
    auth.role() as auth_role;

-- Check user profile in users table
SELECT 
    id,
    email,
    full_name,
    role,
    created_at,
    updated_at
FROM public.users 
WHERE id = auth.uid();

-- Check if user exists in users table
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()) 
        THEN 'User exists in users table'
        ELSE 'User NOT found in users table'
    END as user_status;

-- Check all users with manager role
SELECT 
    id,
    email,
    full_name,
    role,
    created_at
FROM public.users 
WHERE role = 'manager'
ORDER BY created_at DESC;

-- Check RLS policies on users table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users';


