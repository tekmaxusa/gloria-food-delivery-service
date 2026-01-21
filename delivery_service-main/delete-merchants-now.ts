/**
 * Script to delete all merchants from PostgreSQL database
 * Run with: npx ts-node delete-merchants-now.ts
 */

import { Pool } from 'pg';

const connectionString = 'postgresql://tekmaxusa_delivery_service_2kyj_user:saTb5yrRGXKoNpLutbpnu69tPW09zrlA@dpg-d5o91m6id0rc7394atfg-a.virginia-postgres.render.com/tekmaxusa_delivery_service_2kyj';

async function deleteAllMerchants() {
  const pool = new Pool({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  const client = await pool.connect();

  try {
    console.log('🗑️  Connecting to database...');
    
    // First, get count of merchants
    const countResult = await client.query('SELECT COUNT(*) as count FROM merchants');
    const merchantCount = parseInt(countResult.rows[0].count);
    console.log(`📊 Found ${merchantCount} merchant(s) to delete`);

    if (merchantCount === 0) {
      console.log('✅ No merchants to delete');
      return;
    }

    // Get list of merchants before deletion
    const merchantsResult = await client.query('SELECT id, merchant_name, store_id FROM merchants');
    console.log('\n📋 Merchants to be deleted:');
    merchantsResult.rows.forEach((merchant: any) => {
      console.log(`   - ID: ${merchant.id}, Name: ${merchant.merchant_name}, Store ID: ${merchant.store_id || 'N/A'}`);
    });

    // Get count of locations (will be cascade deleted)
    const locationsResult = await client.query('SELECT COUNT(*) as count FROM locations');
    const locationCount = parseInt(locationsResult.rows[0].count);
    console.log(`\n📊 Found ${locationCount} location(s) that will be cascade deleted`);

    // Delete all locations first (due to foreign key constraint)
    console.log('\n🗑️  Deleting locations...');
    const deleteLocationsResult = await client.query('DELETE FROM locations');
    console.log(`✅ Deleted ${deleteLocationsResult.rowCount} location(s)`);

    // Delete all merchants (including those with NULL user_id)
    console.log('\n🗑️  Deleting merchants...');
    const deleteResult = await client.query('DELETE FROM merchants');
    console.log(`✅ Deleted ${deleteResult.rowCount} merchant(s)`);
    
    // Also try to delete any merchants that might have been missed
    const deleteResult2 = await client.query('DELETE FROM merchants WHERE id IS NOT NULL');
    if (deleteResult2.rowCount && deleteResult2.rowCount > 0) {
      console.log(`✅ Deleted additional ${deleteResult2.rowCount} merchant(s)`);
    }

    // Verify deletion
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM merchants');
    const remainingCount = parseInt(verifyResult.rows[0].count);
    
    console.log('\n📊 Verification:');
    if (remainingCount === 0) {
      console.log('✅ All merchants successfully deleted!');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} merchant(s) still remain`);
    }

    // Also verify locations are deleted
    const locationsVerify = await client.query('SELECT COUNT(*) as count FROM locations');
    const remainingLocations = parseInt(locationsVerify.rows[0].count);
    console.log(`✅ Remaining locations: ${remainingLocations}`);

    console.log('\n✅ Database cleanup completed!');

  } catch (error: any) {
    console.error('\n❌ Error deleting merchants:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
console.log('🚀 Starting merchant deletion script...\n');
deleteAllMerchants()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
