-- Fix Orders Schema - Handle existing tables
-- Run this in your Supabase SQL Editor

-- ============================================================================
-- CHECK AND FIX EXISTING ORDERS TABLE
-- ============================================================================

-- First, let's check if the orders table exists and what columns it has
DO $$
BEGIN
    -- Check if orders table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'orders') THEN
        -- Check if pickup_date column exists
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'orders' AND column_name = 'pickup_date') THEN
            -- Add missing columns to existing orders table
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_date DATE;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_time TIME;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_location VARCHAR(255) DEFAULT 'R&R Barber Shop';
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_flags JSONB DEFAULT '[]';
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS verification_required BOOLEAN DEFAULT FALSE;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'none';
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20);
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS manager_notes TEXT;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
            
            -- Add constraints (will fail gracefully if they already exist)
            ALTER TABLE orders ADD CONSTRAINT orders_status_check 
                CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready_for_pickup', 'picked_up', 'cancelled', 'refunded'));
            ALTER TABLE orders ADD CONSTRAINT orders_verification_status_check 
                CHECK (verification_status IN ('none', 'pending', 'verified', 'failed'));
            
            RAISE NOTICE 'Added missing columns to existing orders table';
        ELSE
            RAISE NOTICE 'Orders table already has pickup_date column';
        END IF;
    ELSE
        RAISE NOTICE 'Orders table does not exist, will be created by main script';
    END IF;
END $$;

-- ============================================================================
-- CREATE MISSING TABLES IF THEY DON'T EXIST
-- ============================================================================

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  
  -- Product snapshot (in case product details change)
  product_name VARCHAR(255) NOT NULL,
  product_description TEXT,
  product_image_url TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Add check constraint separately
  CONSTRAINT order_items_quantity_check CHECK (quantity > 0)
);

-- Order verification attempts table
CREATE TABLE IF NOT EXISTS order_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  verification_type VARCHAR(50) NOT NULL,
  verification_code VARCHAR(10),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '15 minutes'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order fraud analysis table
CREATE TABLE IF NOT EXISTS order_fraud_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  analysis_type VARCHAR(50) NOT NULL,
  risk_factors JSONB DEFAULT '[]',
  risk_score INTEGER DEFAULT 0,
  recommendations JSONB DEFAULT '[]',
  analysis_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Order notifications table
CREATE TABLE IF NOT EXISTS order_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  sent_via VARCHAR(20) DEFAULT 'app',
  sent_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Add check constraint separately
  CONSTRAINT order_notifications_sent_via_check CHECK (sent_via IN ('app', 'email', 'sms'))
);

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_date ON orders(pickup_date);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_risk_score ON orders(risk_score);

-- Order items indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Verification indexes
CREATE INDEX IF NOT EXISTS idx_order_verifications_order_id ON order_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_verifications_type ON order_verifications(verification_type);
CREATE INDEX IF NOT EXISTS idx_order_verifications_expires_at ON order_verifications(expires_at);

-- Fraud analysis indexes
CREATE INDEX IF NOT EXISTS idx_order_fraud_analysis_order_id ON order_fraud_analysis(order_id);
CREATE INDEX IF NOT EXISTS idx_order_fraud_analysis_type ON order_fraud_analysis(analysis_type);
CREATE INDEX IF NOT EXISTS idx_order_fraud_analysis_risk_score ON order_fraud_analysis(risk_score);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_order_notifications_order_id ON order_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notifications_user_id ON order_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_order_notifications_type ON order_notifications(notification_type);

-- ============================================================================
-- CREATE FUNCTIONS
-- ============================================================================

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  order_num TEXT;
  counter INTEGER;
BEGIN
  -- Get current date in YYYYMMDD format
  order_num := TO_CHAR(NOW(), 'YYYYMMDD');
  
  -- Get count of orders today
  SELECT COUNT(*) + 1 INTO counter
  FROM orders
  WHERE DATE(created_at) = CURRENT_DATE;
  
  -- Format as ORD-YYYYMMDD-XXX
  order_num := 'ORD-' || order_num || '-' || LPAD(counter::TEXT, 3, '0');
  
  RETURN order_num;
END;
$$ LANGUAGE plpgsql;

-- Function to update order total when items change
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the order total
  UPDATE orders
  SET total_amount = (
    SELECT COALESCE(SUM(total_price), 0)
    FROM order_items
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to update product stock when order is confirmed
CREATE OR REPLACE FUNCTION update_product_stock_on_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update stock when order status changes to confirmed
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    -- Reduce stock for each item
    UPDATE products
    SET stock_quantity = stock_quantity - oi.quantity
    FROM order_items oi
    WHERE products.id = oi.product_id
    AND oi.order_id = NEW.id;
  END IF;
  
  -- Restore stock if order is cancelled
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- Restore stock for each item
    UPDATE products
    SET stock_quantity = stock_quantity + oi.quantity
    FROM order_items oi
    WHERE products.id = oi.product_id
    AND oi.order_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CREATE TRIGGERS
-- ============================================================================

-- Trigger to generate order number on insert
DROP TRIGGER IF EXISTS trigger_generate_order_number ON orders;
CREATE TRIGGER trigger_generate_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();

-- Trigger to update order total when items change
DROP TRIGGER IF EXISTS trigger_update_order_total ON order_items;
CREATE TRIGGER trigger_update_order_total
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_order_total();

-- Trigger to update product stock on order status change
DROP TRIGGER IF EXISTS trigger_update_product_stock ON orders;
CREATE TRIGGER trigger_update_product_stock
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_product_stock_on_order();

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS trigger_orders_updated_at ON orders;
CREATE TRIGGER trigger_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_fraud_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE RLS POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Customers can view own orders" ON orders;
DROP POLICY IF EXISTS "Customers can create orders" ON orders;
DROP POLICY IF EXISTS "Customers can update own pending orders" ON orders;
DROP POLICY IF EXISTS "Managers can view all orders" ON orders;
DROP POLICY IF EXISTS "Managers can update all orders" ON orders;

-- Orders policies
CREATE POLICY "Customers can view own orders" ON orders
  FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Customers can create orders" ON orders
  FOR INSERT WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Customers can update own pending orders" ON orders
  FOR UPDATE USING (
    customer_id = auth.uid() 
    AND status IN ('pending', 'confirmed')
  );

CREATE POLICY "Managers can view all orders" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

CREATE POLICY "Managers can update all orders" ON orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Order items policies
DROP POLICY IF EXISTS "Users can view order items for own orders" ON order_items;
DROP POLICY IF EXISTS "Users can create order items for own orders" ON order_items;

CREATE POLICY "Users can view order items for own orders" ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE id = order_id 
      AND (customer_id = auth.uid() OR 
           EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'))
    )
  );

CREATE POLICY "Users can create order items for own orders" ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE id = order_id 
      AND customer_id = auth.uid()
    )
  );

-- Verification policies
DROP POLICY IF EXISTS "Users can view verifications for own orders" ON order_verifications;

CREATE POLICY "Users can view verifications for own orders" ON order_verifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE id = order_id 
      AND (customer_id = auth.uid() OR 
           EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'manager'))
    )
  );

-- Fraud analysis policies (managers only)
DROP POLICY IF EXISTS "Managers can view fraud analysis" ON order_fraud_analysis;

CREATE POLICY "Managers can view fraud analysis" ON order_fraud_analysis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'manager'
    )
  );

-- Notification policies
DROP POLICY IF EXISTS "Users can view own notifications" ON order_notifications;
DROP POLICY IF EXISTS "System can create notifications" ON order_notifications;

CREATE POLICY "Users can view own notifications" ON order_notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can create notifications" ON order_notifications
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- VERIFY SCHEMA
-- ============================================================================

-- Check if all required columns exist
DO $$
DECLARE
    missing_columns TEXT[] := ARRAY[]::TEXT[];
    col TEXT;
    required_columns TEXT[] := ARRAY[
        'pickup_date', 'pickup_time', 'pickup_location', 'notes',
        'risk_score', 'fraud_flags', 'verification_required', 'verification_status',
        'customer_phone', 'customer_email', 'manager_notes', 'cancellation_reason',
        'confirmed_at', 'ready_at', 'picked_up_at', 'cancelled_at', 'updated_at'
    ];
BEGIN
    FOREACH col IN ARRAY required_columns
    LOOP
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                      WHERE table_name = 'orders' AND column_name = col) THEN
            missing_columns := array_append(missing_columns, col);
        END IF;
    END LOOP;
    
    IF array_length(missing_columns, 1) > 0 THEN
        RAISE EXCEPTION 'Missing columns in orders table: %', array_to_string(missing_columns, ', ');
    ELSE
        RAISE NOTICE 'All required columns exist in orders table';
    END IF;
END $$;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Orders schema fix completed successfully!' as status;
