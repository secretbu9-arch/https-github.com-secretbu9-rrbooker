-- Quick fix for orders table RLS policies
-- This allows authenticated users to insert orders and view/update their own orders

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow authenticated users to insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users to view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow managers to view all orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users to update their own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow managers to update all orders" ON public.orders;

-- Create permissive policies for orders table
CREATE POLICY "Allow authenticated users to insert orders" ON public.orders
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow users to view their own orders" ON public.orders
FOR SELECT 
TO authenticated
USING (customer_id = auth.uid());

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

CREATE POLICY "Allow users to update their own orders" ON public.orders
FOR UPDATE 
TO authenticated
USING (customer_id = auth.uid())
WITH CHECK (customer_id = auth.uid());

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
WITH CHECK (true);

-- Also fix order_items table
DROP POLICY IF EXISTS "Allow authenticated users to insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Allow users to view order items for their orders" ON public.order_items;
DROP POLICY IF EXISTS "Allow managers to view all order items" ON public.order_items;

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


