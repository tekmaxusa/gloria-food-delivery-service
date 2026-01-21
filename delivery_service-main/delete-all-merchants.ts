/**
 * Script to delete all merchants from the database
 * Run with: npx ts-node delete-all-merchants.ts
 */

import * as dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

async function deleteAllMerchants() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gloriafood_orders',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  const client = await pool.connect();

  try {
    console.log('🗑️  Starting merchant deletion...');
    
    // First, get count of merchants
    const countResult = await client.query('SELECT COUNT(*) as count FROM merchants');
    const merchantCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Found ${merchantCount} merchant(s) to delete`);

    if (merchantCount === 0) {
      console.log('✅ No merchants to delete');
      return;
    }

    // Get count of locations (will be cascade deleted)
    const locationsResult = await client.query('SELECT COUNT(*) as count FROM locations');
    const locationCount = parseInt(locationsResult.rows[0].count);
    console.log(`📊 Found ${locationCount} location(s) that will be cascade deleted`);

    // Delete all merchants (locations will be cascade deleted due to foreign key)
    const deleteResult = await client.query('DELETE FROM merchants');
    console.log(`✅ Deleted ${deleteResult.rowCount} merchant(s)`);

    // Verify deletion
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM merchants');
    const remainingCount = parseInt(verifyResult.rows[0].count);
    
    if (remainingCount === 0) {
      console.log('✅ All merchants successfully deleted!');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} merchant(s) still remain`);
    }

    // Also verify locations are deleted
    const locationsVerify = await client.query('SELECT COUNT(*) as count FROM locations');
    const remainingLocations = parseInt(locationsVerify.rows[0].count);
    console.log(`📊 Remaining locations: ${remainingLocations}`);

  } catch (error: any) {
    console.error('❌ Error deleting merchants:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
deleteAllMerchants()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
