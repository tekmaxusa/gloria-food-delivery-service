/**
 * Script to delete ALL data from PostgreSQL database
 * ⚠️ WARNING: This will permanently delete all data from all tables!
 * Run with: npx ts-node delete-all-database-data.ts
 */

import { Pool } from 'pg';

const connectionString = 'postgresql://tekmaxusa_delivery_service_2kyj_user:saTb5yrRGXKoNpLutbpnu69tPW09zrlA@dpg-d5o91m6id0rc7394atfg-a.virginia-postgres.render.com/tekmaxusa_delivery_service_2kyj';

async function deleteAllData() {
  const pool = new Pool({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  const client = await pool.connect();

  try {
    console.log('🗑️  Connecting to database...');
    console.log('⚠️  WARNING: This will delete ALL data from ALL tables!');
    
    // Get counts before deletion
    const tables = [
      'reviews',
      'orders',
      'locations',
      'merchants',
      'drivers',
      'users',
      'settings'
    ];

    console.log('\n📊 Current data counts:');
    const counts: { [key: string]: number } = {};
    const existingTables: string[] = [];
    
    for (const table of tables) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        counts[table] = parseInt(result.rows[0].count);
        existingTables.push(table);
        console.log(`   ${table}: ${counts[table]} row(s)`);
      } catch (error: any) {
        if (error.code === '42P01') {
          // Table doesn't exist, skip it
          console.log(`   ${table}: Table does not exist (skipping)`);
          counts[table] = 0;
        } else {
          console.log(`   ${table}: Error - ${error.message}`);
          counts[table] = 0;
        }
      }
    }

    const totalRows = Object.values(counts).reduce((sum, count) => sum + count, 0);
    
    if (totalRows === 0) {
      console.log('\n✅ Database is already empty. Nothing to delete.');
      return;
    }

    console.log(`\n⚠️  About to delete ${totalRows} total row(s) from ${tables.length} table(s)`);
    console.log('   This action cannot be undone!\n');

    // Delete in correct order to respect foreign key constraints
    // Only delete from tables that exist
    if (existingTables.includes('reviews')) {
      console.log('🗑️  Deleting reviews...');
      const deleteReviews = await client.query('DELETE FROM reviews');
      console.log(`   ✅ Deleted ${deleteReviews.rowCount} review(s)`);
    }

    if (existingTables.includes('orders')) {
      console.log('🗑️  Deleting orders...');
      const deleteOrders = await client.query('DELETE FROM orders');
      console.log(`   ✅ Deleted ${deleteOrders.rowCount} order(s)`);
    }

    if (existingTables.includes('locations')) {
      console.log('🗑️  Deleting locations...');
      const deleteLocations = await client.query('DELETE FROM locations');
      console.log(`   ✅ Deleted ${deleteLocations.rowCount} location(s)`);
    }

    if (existingTables.includes('merchants')) {
      console.log('🗑️  Deleting merchants...');
      const deleteMerchants = await client.query('DELETE FROM merchants');
      console.log(`   ✅ Deleted ${deleteMerchants.rowCount} merchant(s)`);
    }

    if (existingTables.includes('drivers')) {
      console.log('🗑️  Deleting drivers...');
      const deleteDrivers = await client.query('DELETE FROM drivers');
      console.log(`   ✅ Deleted ${deleteDrivers.rowCount} driver(s)`);
    }

    if (existingTables.includes('users')) {
      console.log('🗑️  Deleting users...');
      const deleteUsers = await client.query('DELETE FROM users');
      console.log(`   ✅ Deleted ${deleteUsers.rowCount} user(s)`);
    }

    if (existingTables.includes('settings')) {
      console.log('🗑️  Deleting settings...');
      const deleteSettings = await client.query('DELETE FROM settings');
      console.log(`   ✅ Deleted ${deleteSettings.rowCount} setting(s)`);
    }

    // Verify deletion
    console.log('\n📊 Verifying deletion...');
    let allEmpty = true;
    for (const table of existingTables) {
      try {
        const result = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        const remaining = parseInt(result.rows[0].count);
        if (remaining > 0) {
          console.log(`   ⚠️  ${table}: ${remaining} row(s) still remain`);
          allEmpty = false;
        } else {
          console.log(`   ✅ ${table}: Empty`);
        }
      } catch (error: any) {
        console.log(`   ⚠️  ${table}: Error checking - ${error.message}`);
      }
    }

    if (allEmpty) {
      console.log('\n✅ All data successfully deleted from all tables!');
      console.log('   Database structure (tables, indexes, constraints) is preserved.');
    } else {
      console.log('\n⚠️  Some data may still remain. Please check manually.');
    }

  } catch (error: any) {
    console.error('\n❌ Error deleting data:', error.message);
    console.error('   Stack:', error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
    console.log('\n✅ Database connection closed.');
  }
}

// Run the script
deleteAllData()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
