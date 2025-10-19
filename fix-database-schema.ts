/**
 * Fix XAMPP Database Schema
 * Updates the orders table to include missing columns
 */

import mysql from 'mysql2/promise';

async function fixXAMPPDatabaseSchema() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '', // Add your XAMPP MySQL password if you have one
    database: 'sueshero_delivery'
  });

  try {
    console.log('🔧 Fixing XAMPP database schema...');
    
    // Check current orders table structure
    console.log('📋 Checking current orders table structure...');
    const [currentStructure] = await connection.execute("DESCRIBE orders");
    console.table(currentStructure);

    // Add missing columns to orders table
    console.log('📝 Adding missing columns to orders table...');
    
    const columnsToAdd = [
      'order_status VARCHAR(50) DEFAULT "pending"',
      'order_type VARCHAR(20) DEFAULT "delivery"',
      'gloria_food_data TEXT',
      'delivery_id INT NULL',
      'delivery_status VARCHAR(50) NULL',
      'tracking_url TEXT NULL'
    ];

    for (const column of columnsToAdd) {
      try {
        const columnName = column.split(' ')[0];
        await connection.execute(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${column}`);
        console.log(`✅ Added column: ${columnName}`);
      } catch (error: any) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`⚠️  Column already exists: ${column.split(' ')[0]}`);
        } else {
          console.log(`❌ Failed to add column ${column.split(' ')[0]}:`, error.message);
        }
      }
    }

    // Add indexes for better performance
    console.log('📝 Adding indexes...');
    const indexesToAdd = [
      'ADD INDEX IF NOT EXISTS idx_order_status (order_status)',
      'ADD INDEX IF NOT EXISTS idx_order_type (order_type)',
      'ADD INDEX IF NOT EXISTS idx_delivery_id (delivery_id)',
      'ADD INDEX IF NOT EXISTS idx_delivery_status (delivery_status)',
      'ADD INDEX IF NOT EXISTS idx_created_at (created_at)'
    ];

    for (const index of indexesToAdd) {
      try {
        await connection.execute(`ALTER TABLE orders ${index}`);
        console.log(`✅ Added index: ${index.split(' ')[2]}`);
      } catch (error: any) {
        console.log(`⚠️  Index may already exist: ${index.split(' ')[2]}`);
      }
    }

    // Verify the updated structure
    console.log('\n📋 Updated orders table structure:');
    const [updatedStructure] = await connection.execute("DESCRIBE orders");
    console.table(updatedStructure);

    // Insert sample data for testing
    console.log('\n📝 Inserting sample order data...');
    try {
      await connection.execute(`
        INSERT IGNORE INTO orders (
          gloria_food_order_id, order_number, customer_name, customer_email, 
          customer_phone, delivery_address, delivery_city, delivery_state, 
          delivery_zip, delivery_country, order_total, order_status, 
          order_type, created_at, updated_at
        ) VALUES (
          123456, 'SUE-001', 'John Doe', 'john@example.com',
          '+1234567890', '123 Main St', 'Your City', 'Your State',
          '12345', 'US', 25.99, 'pending',
          'delivery', NOW(), NOW()
        )
      `);
      console.log('✅ Sample order data inserted');
    } catch (error: any) {
      console.log('⚠️  Sample data may already exist:', error.message);
    }

    // Test the statistics query
    console.log('\n🧪 Testing statistics query...');
    try {
      const [statsResult] = await connection.execute(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(order_total) as total_revenue,
          AVG(order_total) as average_order_value,
          order_status,
          COUNT(*) as count_by_status
        FROM orders 
        GROUP BY order_status
      `);
      console.log('✅ Statistics query successful:');
      console.table(statsResult);
    } catch (error: any) {
      console.log('❌ Statistics query failed:', error.message);
    }

    console.log('\n🎉 XAMPP database schema fix completed!');
    console.log('🚀 Your Sue\'s Hero delivery service should now work properly!');

  } catch (error) {
    console.error('❌ Error fixing XAMPP database schema:', error);
  } finally {
    await connection.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the fix
fixXAMPPDatabaseSchema().catch(console.error);
