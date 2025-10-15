-- Fix RLS policies for orders table to allow proper access

-- First, let's check the current RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'orders';

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users to view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow managers to view all orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users to update their own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow managers to update all orders" ON public.orders;

-- Create new comprehensive RLS policies for orders table

-- 1. Allow authenticated users to insert orders (for customers creating orders)
CREATE POLICY "Allow authenticated users to insert orders" ON public.orders
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- 2. Allow users to view their own orders (customers can see their orders)
CREATE POLICY "Allow users to view their own orders" ON public.orders
FOR SELECT 
TO authenticated
USING (customer_id = auth.uid());

-- 3. Allow managers to view all orders
CREATE POLICY "Allow managers to view all orders" ON public.orders
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role = 'manager'
  )
);

-- 4. Allow users to update their own orders (for status updates, cancellations)
CREATE POLICY "Allow users to update their own orders" ON public.orders
FOR UPDATE 
TO authenticated
USING (customer_id = auth.uid())
WITH CHECK (customer_id = auth.uid());

-- 5. Allow managers to update all orders (for status management)
CREATE POLICY "Allow managers to update all orders" ON public.orders
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role = 'manager'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role = 'manager'
  )
);

-- 6. Allow managers to delete orders (for cleanup)
CREATE POLICY "Allow managers to delete orders" ON public.orders
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role = 'manager'
  )
);

-- Also fix RLS policies for order_items table
DROP POLICY IF EXISTS "Allow authenticated users to insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Allow users to view order items for their orders" ON public.order_items;
DROP POLICY IF EXISTS "Allow managers to view all order items" ON public.order_items;

-- Create RLS policies for order_items table
CREATE POLICY "Allow authenticated users to insert order items" ON public.order_items
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow users to view order items for their orders" ON public.order_items
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_items.order_id 
    AND orders.customer_id = auth.uid()
  )
);

CREATE POLICY "Allow managers to view all order items" ON public.order_items
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role = 'manager'
  )
);

-- Verify the policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename IN ('orders', 'order_items')
ORDER BY tablename, policyname;


