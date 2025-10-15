-- Check if products table exists and create it if it doesn't
-- Also add sample products if the table is empty

-- First, check if products table exists
DO $$
BEGIN
    -- Create products table if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
        CREATE TABLE products (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10,2) NOT NULL,
            category VARCHAR(100),
            image_url TEXT,
            stock_quantity INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Create indexes
        CREATE INDEX idx_products_category ON products(category);
        CREATE INDEX idx_products_is_active ON products(is_active);
        CREATE INDEX idx_products_created_at ON products(created_at);

        -- Enable RLS
        ALTER TABLE products ENABLE ROW LEVEL SECURITY;

        -- Create RLS policies
        CREATE POLICY "Products are viewable by everyone" ON products
            FOR SELECT USING (true);

        CREATE POLICY "Products are manageable by managers" ON products
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM users 
                    WHERE users.id = auth.uid() 
                    AND users.role = 'manager'
                )
            );

        RAISE NOTICE 'Products table created successfully';
    ELSE
        RAISE NOTICE 'Products table already exists';
    END IF;
END $$;

-- Check if products table has any data
DO $$
DECLARE
    product_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO product_count FROM products;
    
    IF product_count = 0 THEN
        RAISE NOTICE 'Products table is empty, adding sample products...';
        
        -- Insert sample products
        INSERT INTO products (name, description, price, category, image_url, stock_quantity, is_active) VALUES
        ('Premium Hair Shampoo', 'Professional grade shampoo for all hair types', 15.99, 'Hair Care', 'https://via.placeholder.com/300x300?text=Shampoo', 50, true),
        ('Styling Gel', 'Strong hold styling gel for perfect hairstyles', 12.99, 'Styling', 'https://via.placeholder.com/300x300?text=Gel', 30, true),
        ('Hair Oil Treatment', 'Nourishing hair oil for deep conditioning', 18.99, 'Hair Care', 'https://via.placeholder.com/300x300?text=Oil', 25, true),
        ('Beard Trimmer', 'Professional beard trimming tool', 45.99, 'Tools', 'https://via.placeholder.com/300x300?text=Trimmer', 15, true),
        ('Hair Scissors Set', 'Professional barber scissors set', 89.99, 'Tools', 'https://via.placeholder.com/300x300?text=Scissors', 10, true),
        ('Styling Pomade', 'Classic styling pomade for vintage looks', 14.99, 'Styling', 'https://via.placeholder.com/300x300?text=Pomade', 40, true),
        ('Hair Conditioner', 'Moisturizing conditioner for healthy hair', 13.99, 'Hair Care', 'https://via.placeholder.com/300x300?text=Conditioner', 35, true),
        ('Beard Balm', 'Softening beard balm with natural ingredients', 16.99, 'Beard Care', 'https://via.placeholder.com/300x300?text=Balm', 20, true),
        ('Hair Spray', 'Flexible hold hair spray for all-day styling', 11.99, 'Styling', 'https://via.placeholder.com/300x300?text=Spray', 45, true),
        ('Scalp Massager', 'Relaxing scalp massager for better circulation', 22.99, 'Tools', 'https://via.placeholder.com/300x300?text=Massager', 12, true);

        RAISE NOTICE 'Sample products added successfully';
    ELSE
        RAISE NOTICE 'Products table has % products', product_count;
    END IF;
END $$;

-- Show current products
SELECT 
    id,
    name,
    price,
    category,
    stock_quantity,
    is_active,
    created_at
FROM products 
ORDER BY created_at DESC;


