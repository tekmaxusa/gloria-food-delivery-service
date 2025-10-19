/**
 * XAMPP Database Update Script
 * Run this to update your XAMPP database with DoorDash integration tables
 */

import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { join } from 'path';

async function updateXAMPPDatabase() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '', // Add your XAMPP MySQL password if you have one
    database: 'sueshero_delivery'
  });

  try {
    console.log('🔄 Connecting to XAMPP MySQL database...');
    
    // Execute SQL statements directly
    console.log('📝 Creating deliveries table...');
    
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS deliveries (
          id INT AUTO_INCREMENT PRIMARY KEY,
          external_delivery_id VARCHAR(255) UNIQUE NOT NULL,
          doordash_delivery_id VARCHAR(255) UNIQUE NOT NULL,
          order_id INT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          pickup_address TEXT,
          dropoff_address TEXT,
          pickup_time DATETIME,
          dropoff_time DATETIME,
          driver_name VARCHAR(255),
          driver_phone VARCHAR(20),
          tracking_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          INDEX idx_external_delivery_id (external_delivery_id),
          INDEX idx_doordash_delivery_id (doordash_delivery_id),
          INDEX idx_order_id (order_id),
          INDEX idx_status (status),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Deliveries table created successfully');
    } catch (error: any) {
      if (error.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('⚠️  Deliveries table already exists');
      } else {
        console.log('❌ Failed to create deliveries table:', error.message);
      }
    }

    console.log('📝 Creating delivery_status_history table...');
    
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS delivery_status_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          delivery_id INT NOT NULL,
          old_status VARCHAR(50),
          new_status VARCHAR(50) NOT NULL,
          changed_by VARCHAR(100),
          reason TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          INDEX idx_delivery_id (delivery_id),
          INDEX idx_new_status (new_status),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Delivery status history table created successfully');
    } catch (error: any) {
      if (error.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('⚠️  Delivery status history table already exists');
      } else {
        console.log('❌ Failed to create delivery status history table:', error.message);
      }
    }

    console.log('📝 Updating orders table...');
    
    try {
      await connection.execute(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS delivery_id INT NULL,
        ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) NULL,
        ADD COLUMN IF NOT EXISTS tracking_url TEXT NULL
      `);
      console.log('✅ Orders table updated successfully');
    } catch (error: any) {
      console.log('⚠️  Orders table update skipped (columns may already exist):', error.message);
    }

    console.log('📝 Inserting sample data...');
    
    try {
      await connection.execute(`
        INSERT IGNORE INTO deliveries (
          external_delivery_id, 
          doordash_delivery_id, 
          order_id, 
          status, 
          pickup_address, 
          dropoff_address, 
          pickup_time, 
          dropoff_time,
          tracking_url
        ) VALUES (
          'TEST-001', 
          'dd_test_001', 
          999999, 
          'pending', 
          '{"street_address":"123 Main Street","city":"Your City","state":"Your State","zip_code":"12345","country":"US"}', 
          '{"street_address":"456 Oak Ave","city":"Your City","state":"Your State","zip_code":"12345","country":"US"}', 
          NOW() + INTERVAL 15 MINUTE, 
          NOW() + INTERVAL 45 MINUTE,
          'https://track.doordash.com/test'
        )
      `);
      console.log('✅ Sample data inserted successfully');
    } catch (error: any) {
      console.log('⚠️  Sample data insertion skipped (may already exist):', error.message);
    }

    // Verify tables were created
    console.log('\n🔍 Verifying tables...');
    
    const [tables] = await connection.execute("SHOW TABLES");
    console.log('📊 Available tables:', (tables as any[]).map((table: any) => Object.values(table)[0]));

    // Check deliveries table structure
    const [deliveriesStructure] = await connection.execute("DESCRIBE deliveries");
    console.log('\n📋 Deliveries table structure:');
    console.table(deliveriesStructure);

    // Check webhook_logs table structure
    const [webhookLogsStructure] = await connection.execute("DESCRIBE webhook_logs");
    console.log('\n📋 Webhook logs table structure:');
    console.table(webhookLogsStructure);

    console.log('\n🎉 XAMPP database update completed successfully!');
    console.log('🚀 Your Sue\'s Hero delivery service is ready for DoorDash integration!');

  } catch (error) {
    console.error('❌ Error updating XAMPP database:', error);
  } finally {
    await connection.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the update
updateXAMPPDatabase().catch(console.error);
