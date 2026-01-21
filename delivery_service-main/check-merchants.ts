/**
 * Script to check merchants in database
 */

import { Pool } from 'pg';

const connectionString = 'postgresql://tekmaxusa_delivery_service_2kyj_user:saTb5yrRGXKoNpLutbpnu69tPW09zrlA@dpg-d5o91m6id0rc7394atfg-a.virginia-postgres.render.com/tekmaxusa_delivery_service_2kyj';

async function checkMerchants() {
  const pool = new Pool({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  const client = await pool.connect();

  try {
    console.log('🔍 Checking database...\n');
    
    // Check all merchants
    const merchantsResult = await client.query('SELECT id, merchant_name, store_id, user_id, is_active, created_at FROM merchants ORDER BY id');
    console.log(`📊 Total merchants: ${merchantsResult.rows.length}`);
    
    if (merchantsResult.rows.length > 0) {
      console.log('\n📋 Merchants found:');
      merchantsResult.rows.forEach((merchant: any) => {
        console.log(`   ID: ${merchant.id}`);
        console.log(`   Name: ${merchant.merchant_name}`);
        console.log(`   Store ID: ${merchant.store_id || 'N/A'}`);
        console.log(`   User ID: ${merchant.user_id || 'NULL'}`);
        console.log(`   Active: ${merchant.is_active}`);
        console.log(`   Created: ${merchant.created_at}`);
        console.log('   ---');
      });
    } else {
      console.log('✅ No merchants found in database');
    }

    // Check locations
    const locationsResult = await client.query('SELECT id, merchant_id, location_name, store_id FROM locations ORDER BY merchant_id');
    console.log(`\n📊 Total locations: ${locationsResult.rows.length}`);
    
    if (locationsResult.rows.length > 0) {
      console.log('\n📋 Locations found:');
      locationsResult.rows.forEach((loc: any) => {
        console.log(`   ID: ${loc.id}, Merchant ID: ${loc.merchant_id}, Name: ${loc.location_name}, Store ID: ${loc.store_id}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

checkMerchants()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
