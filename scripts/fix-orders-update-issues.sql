-- Fix Orders Update Issues
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: CHECK AND FIX STATUS CONSTRAINT
-- ============================================================================

-- Check if there's a status constraint that might be causing issues
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Check if there's a status check constraint
    SELECT cc.constraint_name INTO constraint_name
    FROM information_schema.check_constraints cc
    JOIN information_schema.table_constraints tc ON cc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'orders' 
    AND cc.constraint_name LIKE '%status%'
    LIMIT 1;
    
    IF constraint_name IS NOT NULL THEN
        -- Drop the constraint
        EXECUTE 'ALTER TABLE orders DROP CONSTRAINT ' || constraint_name;
        RAISE NOTICE 'Dropped status constraint: %', constraint_name;
    ELSE
        RAISE NOTICE 'No status constraint found';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: ADD PROPER STATUS CONSTRAINT
-- ============================================================================

-- Add a proper status constraint that allows all our status values
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready_for_pickup', 'picked_up', 'cancelled', 'refunded'));

-- ============================================================================
-- STEP 3: CHECK AND FIX ROW LEVEL SECURITY
-- ============================================================================

-- Ensure RLS policies allow updates
DROP POLICY IF EXISTS "Customers can update own pending orders" ON orders;
DROP POLICY IF EXISTS "Managers can update all orders" ON orders;

-- Recreate policies
CREATE POLICY "Customers can update own pending orders" ON orders
  FOR UPDATE USING (
    customer_id = auth.uid() 
    AND status IN ('pending', 'confirmed')
  );

CREATE POLICY "Managers can update all orders" ON orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- ============================================================================
-- STEP 4: CHECK FOR TRIGGER ISSUES
-- ============================================================================

-- Check if there are any triggers that might be causing issues
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'orders'
AND event_object_schema = 'public';

-- ============================================================================
-- STEP 5: TEST UPDATE FUNCTIONALITY
-- ============================================================================

-- Test updating an order (if any exist)
DO $$
DECLARE
    test_order_id UUID;
    update_result RECORD;
BEGIN
    -- Get the first order ID
    SELECT id INTO test_order_id FROM orders LIMIT 1;
    
    IF test_order_id IS NOT NULL THEN
        -- Try to update the order
        UPDATE orders 
        SET updated_at = NOW() 
        WHERE id = test_order_id
        RETURNING id, status, updated_at INTO update_result;
        
        RAISE NOTICE 'Test update successful for order: %', update_result.id;
    ELSE
        RAISE NOTICE 'No orders found to test update';
    END IF;
END $$;

-- ============================================================================
-- STEP 6: VERIFY FINAL STATE
-- ============================================================================

-- Check final constraints
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'orders' 
AND tc.table_schema = 'public';

-- Check RLS policies
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'orders';

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Orders update issues fixed successfully!' as status;
