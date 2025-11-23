-- GloriaFood Orders Database
-- For PostgreSQL (Render, Heroku, etc.)

-- Create database (run this manually in PostgreSQL)
-- CREATE DATABASE gloriafood_orders;

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  gloriafood_order_id VARCHAR(255) UNIQUE NOT NULL,
  store_id VARCHAR(255),
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(100),
  customer_email VARCHAR(255),
  delivery_address TEXT,
  total_price DECIMAL(10, 2) DEFAULT 0.00,
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50),
  order_type VARCHAR(50),
  items TEXT,
  raw_data TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_to_doordash BOOLEAN DEFAULT FALSE,
  doordash_order_id VARCHAR(255),
  doordash_sent_at TIMESTAMP,
  doordash_tracking_url TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_gloriafood_order_id ON orders(gloriafood_order_id);
CREATE INDEX IF NOT EXISTS idx_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_fetched_at ON orders(fetched_at);

-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email ON users(email);

-- Create drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(100),
  email VARCHAR(255),
  vehicle_type VARCHAR(100),
  vehicle_plate VARCHAR(100),
  rating DECIMAL(3, 2) DEFAULT 0.00,
  status VARCHAR(50) DEFAULT 'active',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status ON drivers(status);

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  order_id INTEGER,
  driver_id INTEGER,
  customer_name VARCHAR(255),
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_id ON reviews(driver_id);

-- Add foreign key constraint
ALTER TABLE reviews 
  DROP CONSTRAINT IF EXISTS fk_reviews_order_id;
ALTER TABLE reviews 
  ADD CONSTRAINT fk_reviews_order_id 
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_drivers_updated_at ON drivers;
CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Show success message
SELECT 'Database and tables created successfully!' AS Status;



