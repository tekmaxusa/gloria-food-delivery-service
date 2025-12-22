-- GloriaFood Filippino Orders Database
-- For XAMPP MySQL/MariaDB

-- Create database
CREATE DATABASE IF NOT EXISTS gloriafood_orders CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Use the database
USE gloriafood_orders;

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gloriafood_order_id (gloriafood_order_id),
  INDEX idx_store_id (store_id),
  INDEX idx_status (status),
  INDEX idx_fetched_at (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(100),
  email VARCHAR(255),
  vehicle_type VARCHAR(100),
  vehicle_plate VARCHAR(100),
  rating DECIMAL(3, 2) DEFAULT 0.00,
  status VARCHAR(50) DEFAULT 'active',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT,
  driver_id INT,
  customer_name VARCHAR(255),
  rating INT NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_id (order_id),
  INDEX idx_driver_id (driver_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create merchants table for multi-merchant support
CREATE TABLE IF NOT EXISTS merchants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id VARCHAR(255) UNIQUE NOT NULL,
  merchant_name VARCHAR(255) NOT NULL,
  api_key VARCHAR(500),
  api_url VARCHAR(500),
  master_key VARCHAR(500),
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_store_id (store_id),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Show success message
SELECT 'Database and tables created successfully!' AS Status;

