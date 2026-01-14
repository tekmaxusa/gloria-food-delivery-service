import { Pool, PoolClient } from 'pg';
import chalk from 'chalk';
import { Merchant, User } from './database-factory';

export interface Order {
  id: string;
  gloriafood_order_id: string;
  store_id: string;
  merchant_name?: string; // Store merchant name with order for historical accuracy
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address?: string;
  total_price: number;
  currency: string;
  status: string;
  order_type: string;
  items: string; // JSON string
  raw_data: string; // Full JSON from API
  scheduled_delivery_time?: string;
  created_at: string;
  updated_at: string;
  fetched_at: string;
  sent_to_doordash?: number;
  doordash_order_id?: string;
  doordash_sent_at?: string;
  doordash_tracking_url?: string;
}

interface PostgreSQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
}

export class OrderDatabasePostgreSQL {
  private pool: Pool;
  private config: PostgreSQLConfig;

  constructor(config?: Partial<PostgreSQLConfig>) {
    // Check if DATABASE_URL is provided (common in cloud platforms like Render)
    const databaseUrl = process.env.DATABASE_URL;

    if (databaseUrl) {
      // Use connection string (common in Render, Heroku, etc.)
      console.log('   Using DATABASE_URL connection string');

      // Fix incomplete Render PostgreSQL URLs
      // Render sometimes provides URLs without port or domain
      let fixedUrl = databaseUrl;

      // Check if it's a Render database (contains dpg-)
      const isRenderDb = databaseUrl.includes('dpg-');

      if (isRenderDb) {
        // Use Render Internal Database URL exactly as provided
        // Only add missing port and SSL parameter if needed
        const hostnameMatch = databaseUrl.match(/@(dpg-[^\/:]+)/);

        if (hostnameMatch) {
          const hostname = hostnameMatch[1];

          // Add port if missing (before database name)
          if (!databaseUrl.includes(':5432') && !databaseUrl.match(/@[^:]+:\d+\//)) {
            fixedUrl = databaseUrl.replace(`@${hostname}/`, `@${hostname}:5432/`);
            console.log(chalk.blue(`   🔧 Added port :5432 to connection string`));
          }

          // Log hostname format
          if (!hostname.includes('.')) {
            console.log(chalk.yellow(`   ⚠️  Hostname without domain: ${hostname}`));
            console.log(chalk.blue(`   💡 Trying as-is first (Render internal network format)`));
            console.log(chalk.gray(`   💡 If this fails, will try with .render.com domain`));

            // Store original URL for fallback
            const urlWithPort = fixedUrl;

            // If connection fails later, we'll try with domain
            // For now, use as-is (Render internal network should resolve it)
          } else if (hostname.includes('.render.com') && !hostname.includes('pooler')) {
            console.log(chalk.blue(`   ✅ Using direct connection: ${hostname}`));
          } else if (hostname.includes('pooler')) {
            console.log(chalk.blue(`   ✅ Using connection pooler: ${hostname}`));
          }
        }

        // For Render databases, DO NOT add sslmode=require to connection string
        // Instead, we'll use the ssl option in Pool config with rejectUnauthorized: false
        // This is critical because sslmode=require in the URL forces certificate validation
        // which will fail with Render's self-signed certificates

        // Remove any existing sslmode parameters that might force validation
        fixedUrl = fixedUrl.replace(/[?&]sslmode=[^&]*/g, '');
        fixedUrl = fixedUrl.replace(/[?&]ssl=[^&]*/g, '');

        console.log(chalk.blue('   🔒 Removed sslmode from URL (will use Pool ssl option instead)'));
        console.log(chalk.blue('   🔒 Will use rejectUnauthorized: false for SSL (Render self-signed certs)'));
      }

      // For Render PostgreSQL, always enable SSL with rejectUnauthorized: false
      // Render uses self-signed certificates, so we need to disable certificate validation
      // Note: We removed sslmode from URL, so we check isRenderDb directly
      const needsSSL = isRenderDb;

      console.log(chalk.gray(`   Final connection string: ${fixedUrl.replace(/:[^:@]+@/, ':****@')}`));

      // Always use rejectUnauthorized: false for Render databases to handle self-signed certificates
      // This is critical - Render PostgreSQL uses self-signed certs that will fail validation
      const sslConfig = needsSSL ? {
        rejectUnauthorized: false
      } : false;

      if (isRenderDb) {
        console.log(chalk.blue('   🔒 SSL enabled with rejectUnauthorized: false (for Render self-signed certificates)'));
      } else if (needsSSL) {
        console.log(chalk.blue('   🔒 SSL enabled with rejectUnauthorized: false'));
      }

      this.pool = new Pool({
        connectionString: fixedUrl,
        ssl: sslConfig,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 30000, // Increased timeout for cloud databases
      });

      // Set dummy config for logging
      this.config = {
        host: 'from-url',
        port: 5432,
        user: 'from-url',
        password: '***',
        database: 'from-url',
        ssl: true
      };
    } else {
      // Warn if DATABASE_URL is not set (especially for Render)
      if (process.env.DB_HOST && process.env.DB_HOST.includes('dpg-')) {
        console.log(chalk.red(`   ⚠️  WARNING: DATABASE_URL is not set!`));
        console.log(chalk.yellow(`   💡 For Render PostgreSQL, DATABASE_URL is REQUIRED and more reliable.`));
        console.log(chalk.yellow(`   📝 Get it from: Render Dashboard → PostgreSQL → "Internal Database URL"`));
        console.log(chalk.gray(`   ⏳ Attempting connection with individual variables (may fail)...`));
      }

      // Get config from environment or use defaults
      let host = config?.host || process.env.DB_HOST || 'localhost';

      // Fix Render PostgreSQL hostname if incomplete (missing domain)
      // Render hostnames like "dpg-xxxxx-a" need connection pooler format
      if (host && host.startsWith('dpg-') && !host.includes('.')) {
        console.log(chalk.yellow(`   ⚠️  Incomplete hostname detected: ${host}`));
        console.log(chalk.yellow(`   💡 Trying connection pooler format for Render PostgreSQL...`));
        // Try pooler format first (more reliable for Render)
        host = `${host}-pooler.render.com`;
        console.log(chalk.green(`   ✅ Using hostname: ${host}`));
        console.log(chalk.gray(`   💡 If this fails, use DATABASE_URL from Render dashboard instead`));
      } else if (host && host.includes('dpg-') && host.includes('.render.com') && !host.includes('pooler')) {
        // If direct hostname doesn't work, try pooler
        console.log(chalk.yellow(`   ⚠️  Direct hostname detected. Trying pooler format...`));
        const poolerHost = host.replace('.render.com', '-pooler.render.com');
        console.log(chalk.blue(`   🔄 Switching to pooler: ${poolerHost}`));
        host = poolerHost;
      }

      this.config = {
        host: host,
        port: config?.port || parseInt(process.env.DB_PORT || '5432'),
        user: config?.user || process.env.DB_USER || 'postgres',
        password: config?.password || process.env.DB_PASSWORD || '',
        database: config?.database || process.env.DB_NAME || 'gloriafood_orders',
        ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === '1' || config?.ssl || false,
      };

      // For Render PostgreSQL, always use SSL
      if (this.config.host.includes('.render.com')) {
        this.config.ssl = true;
        console.log(chalk.blue('   🔒 SSL enabled for Render PostgreSQL connection'));
      }

      // Create connection pool
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 30000, // Increased timeout for cloud databases
      });
    }

    this.initializeTables();
  }

  private async initializeTables(): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        console.log('🔌 Connecting to PostgreSQL database...');

        // If using DATABASE_URL, show that we're using it (don't show credentials)
        if (this.config.host === 'from-url') {
          console.log('   Using DATABASE_URL connection string');
          const dbUrl = process.env.DATABASE_URL || '';
          if (dbUrl) {
            // Show hostname from URL without credentials
            try {
              const url = new URL(dbUrl.replace('postgresql://', 'http://'));
              console.log(`   Host: ${url.hostname}:${url.port || '5432'}`);
              console.log(`   Database: ${url.pathname.replace('/', '') || 'default'}`);
              console.log(`   User: ${url.username || 'default'}`);
            } catch (e) {
              console.log('   Connection string format detected');
            }
          }
        } else {
          console.log(`   Host: ${this.config.host}:${this.config.port}`);
          console.log(`   Database: ${this.config.database}`);
          console.log(`   User: ${this.config.user}`);
        }

        const client = await this.pool.connect();
        console.log('✅ PostgreSQL connection successful!');

        // Create orders table if not exists
        await client.query(`
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
            scheduled_delivery_time TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            sent_to_doordash BOOLEAN DEFAULT FALSE,
            doordash_order_id VARCHAR(255),
            doordash_sent_at TIMESTAMP,
            doordash_tracking_url TEXT,
            ready_for_pickup TIMESTAMP,
            accepted_at TIMESTAMP
          )
        `);

        // Add scheduled_delivery_time column if it doesn't exist (for existing databases)
        try {
          await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS scheduled_delivery_time TIMESTAMP
          `);
        } catch (e: any) {
          // Column might already exist, ignore error
          if (e.code !== '42701') {
            console.log('   Note: scheduled_delivery_time column may already exist');
          }
        }

        // Add merchant_name column if it doesn't exist (for existing databases)
        try {
          await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(255)
          `);
          console.log('✅ Added merchant_name column to orders table');
        } catch (e: any) {
          // Column might already exist, ignore error
          if (e.code !== '42701') {
            console.log('   Note: merchant_name column may already exist');
          }
        }

        // Create indexes
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_gloriafood_order_id ON orders(gloriafood_order_id)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_store_id ON orders(store_id)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_status ON orders(status)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_fetched_at ON orders(fetched_at)
        `);

        // Add missing columns for existing installations (ignore errors if already exist)
        try {
          await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS doordash_tracking_url TEXT`);
          console.log('✅ Added doordash_tracking_url column to existing table');
        } catch (e: any) {
          // Column already exists or other error - ignore
          if (e.code !== '42701') {
            console.log('   Note: doordash_tracking_url column may already exist');
          }
        }

        // Add ready_for_pickup column if it doesn't exist (for existing databases)
        try {
          await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS ready_for_pickup TIMESTAMP
          `);
          console.log('✅ Added ready_for_pickup column to orders table');
        } catch (e: any) {
          // Column might already exist, ignore error
          if (e.code !== '42701') {
            console.log('   Note: ready_for_pickup column may already exist');
          }
        }

        // Add accepted_at column if it doesn't exist (for existing databases)
        try {
          await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP
          `);
          console.log('✅ Added accepted_at column to orders table');
        } catch (e: any) {
          // Column might already exist, ignore error
          if (e.code !== '42701') {
            console.log('   Note: accepted_at column may already exist');
          }
        }

        // Create merchants table if not exists
        await client.query(`
          CREATE TABLE IF NOT EXISTS merchants (
            id SERIAL PRIMARY KEY,
            store_id VARCHAR(255) UNIQUE NOT NULL,
            merchant_name VARCHAR(255) NOT NULL,
            api_key VARCHAR(500),
            api_url VARCHAR(500),
            master_key VARCHAR(500),
            phone VARCHAR(100),
            address TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Add phone and address columns if they don't exist (for existing databases)
        try {
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS phone VARCHAR(100)
          `);
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS address TEXT
          `);
        } catch (e) {
          // Columns might already exist, ignore error
        }

        // Create indexes for merchants
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_merchants_store_id ON merchants(store_id)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_merchants_is_active ON merchants(is_active)
        `);

        // Create trigger function for updated_at
        await client.query(`
          CREATE OR REPLACE FUNCTION update_updated_at_column()
          RETURNS TRIGGER AS $$
          BEGIN
              NEW.updated_at = CURRENT_TIMESTAMP;
              RETURN NEW;
          END;
          $$ language 'plpgsql'
        `);

        // Create triggers for updated_at
        await client.query(`
          DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
          CREATE TRIGGER update_orders_updated_at
            BEFORE UPDATE ON orders
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `);

        await client.query(`
          DROP TRIGGER IF EXISTS update_merchants_updated_at ON merchants;
          CREATE TRIGGER update_merchants_updated_at
            BEFORE UPDATE ON merchants
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        `);

        client.release();
        console.log('✅ Database table initialized successfully!');
        return; // Success - exit retry loop
      } catch (error: any) {
        attempt++;
        const isLastAttempt = attempt >= maxRetries;

        // If ENOTFOUND and using DATABASE_URL without domain, try adding domain
        if ((error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo ENOTFOUND')) &&
          this.config.host === 'from-url' &&
          !isLastAttempt) {
          const dbUrl = process.env.DATABASE_URL || '';
          if (dbUrl && dbUrl.includes('dpg-')) {
            const hostnameMatch = dbUrl.match(/@(dpg-[^\/:]+)/);
            if (hostnameMatch && !hostnameMatch[1].includes('.')) {
              const hostname = hostnameMatch[1];
              console.error(`   ⚠️  Attempt ${attempt} failed: Hostname without domain`);

              // Try with .render.com domain
              if (attempt === 1) {
                console.log(chalk.blue(`   🔄 Retrying with .render.com domain...`));
                let newUrl = dbUrl.replace(`@${hostname}/`, `@${hostname}.render.com:5432/`);
                // Remove any sslmode parameters - we'll use Pool ssl option instead
                newUrl = newUrl.replace(/[?&]sslmode=[^&]*/g, '');
                newUrl = newUrl.replace(/[?&]ssl=[^&]*/g, '');

                // Recreate pool with new URL (no sslmode in URL, use Pool ssl option)
                this.pool.end().catch(() => { });
                this.pool = new Pool({
                  connectionString: newUrl,
                  ssl: { rejectUnauthorized: false },
                  max: 10,
                  idleTimeoutMillis: 30000,
                  connectionTimeoutMillis: 30000,
                });
                continue; // Retry connection
              }
              // Try with -pooler.render.com domain
              else if (attempt === 2) {
                console.log(chalk.blue(`   🔄 Retrying with -pooler.render.com domain...`));
                let newUrl = dbUrl.replace(`@${hostname}/`, `@${hostname}-pooler.render.com:5432/`);
                // Remove any sslmode parameters - we'll use Pool ssl option instead
                newUrl = newUrl.replace(/[?&]sslmode=[^&]*/g, '');
                newUrl = newUrl.replace(/[?&]ssl=[^&]*/g, '');

                // Recreate pool with new URL (no sslmode in URL, use Pool ssl option)
                this.pool.end().catch(() => { });
                this.pool = new Pool({
                  connectionString: newUrl,
                  ssl: { rejectUnauthorized: false },
                  max: 10,
                  idleTimeoutMillis: 30000,
                  connectionTimeoutMillis: 30000,
                });
                continue; // Retry connection
              }
            }
          }
        }

        // If last attempt or not retryable error, show full error message
        if (isLastAttempt || !(error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo ENOTFOUND'))) {
          console.error('❌ Error initializing database tables:', error);
          console.error(`   Error message: ${error.message}`);

          // Check if DATABASE_URL is set
          const dbUrl = process.env.DATABASE_URL;
          if (dbUrl) {
            try {
              const url = new URL(dbUrl.replace('postgresql://', 'http://'));
              console.error('');
              console.error('   📊 Current DATABASE_URL Configuration:');
              console.error(`      Host: ${url.hostname}`);
              console.error(`      Port: ${url.port || '5432'}`);
              console.error(`      Database: ${url.pathname.replace('/', '') || 'default'}`);
              console.error(`      User: ${url.username || 'default'}`);
            } catch (e) {
              console.error(`   Current DATABASE_URL: ${dbUrl.substring(0, 50)}...`);
            }
          } else {
            console.error('');
            console.error('   ⚠️  DATABASE_URL is NOT SET!');
          }

          if (error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo ENOTFOUND')) {
            console.error('');
            console.error('   🚨 CRITICAL: Database hostname cannot be resolved!');
            console.error('');
            console.error('   💡 This usually means:');
            console.error('      • You created a NEW database (old one expired)');
            console.error('      • DATABASE_URL still points to OLD database hostname');
            console.error('      • Need to update DATABASE_URL with NEW database URL');
            console.error('');
            console.error('   📋 STEP-BY-STEP FIX:');
            console.error('');
            console.error('   1. ✅ Go to Render Dashboard → PostgreSQL Database');
            console.error('      - Click on your NEW database (not the old one)');
            console.error('      - Check database status is "Available"');
            console.error('');
            console.error('   2. ✅ Copy "Internal Database URL"');
            console.error('      - Look for "Internal Database URL" (NOT External)');
            console.error('      - Copy the ENTIRE connection string');
            console.error('      - Should look like:');
            console.error('        postgresql://user:pass@dpg-NEW-xxxxx-a.render.com:5432/dbname');
            console.error('');
            console.error('   3. ✅ Update DATABASE_URL in Web Service');
            console.error('      - Go to Render Dashboard → Web Service → Environment');
            console.error('      - Find DATABASE_URL variable');
            console.error('      - Replace with NEW database URL from step 2');
            console.error('      - Save (Render will auto-restart)');
            console.error('');
            console.error('   4. ✅ Verify Connection');
            console.error('      - Check logs after restart');
            console.error('      - Should see: "✅ PostgreSQL connection successful!"');
            console.error('');
            console.error('   ⚠️  If you still see errors:');
            console.error('      - Make sure database and web service are in SAME region');
            console.error('      - Try using "-pooler.render.com" format if available');
            console.error('      - Check if database is paused (free tier may pause after inactivity)');
            console.error('      - If different, recreate database in same region');
            console.error('');
            console.error('   📝 Your current DATABASE_URL:');
            const dbUrl2 = process.env.DATABASE_URL || '';
            if (dbUrl2) {
              try {
                const url = new URL(dbUrl2.replace('postgresql://', 'http://'));
                console.error(`      Host: ${url.hostname || 'N/A'} ${url.hostname && !url.hostname.includes('.') ? '⚠️ (NO DOMAIN!)' : ''}`);
                console.error(`      Port: ${url.port || '5432'}`);
                console.error(`      Database: ${url.pathname.replace('/', '') || 'N/A'}`);
                if (url.hostname && !url.hostname.includes('.')) {
                  console.error('');
                  console.error('   ❌ PROBLEM: Hostname has no domain!');
                  console.error('   💡 The Internal Database URL from Render should include .render.com');
                  console.error('   💡 Get the COMPLETE URL from Render Dashboard (not just the hostname)');
                }
              } catch (e) {
                console.error(`      ${dbUrl2.substring(0, 80)}...`);
              }
            }
            console.error('');
            console.error('   ⚠️  If database was recreated, the hostname changed - get new URL!');
          } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.error('   ⚠️  Cannot connect to PostgreSQL. Check your connection settings!');
            console.error('   ⚠️  Make sure the database host is accessible and credentials are correct.');
          } else if (error.code === '3D000') {
            console.error(`   ⚠️  Database "${this.config.database}" does not exist. Please create it first!`);
          } else if (error.code === '28P01') {
            console.error('   ⚠️  Access denied. Check your PostgreSQL username and password!');
          }
        }

        // If last attempt, throw error; otherwise continue retry loop
        if (isLastAttempt) {
          throw error;
        }
      }
    }
  }

  async insertOrUpdateOrder(orderData: any): Promise<Order | null> {
    try {
      const customerName = this.extractCustomerName(orderData);
      const customerPhone = this.extractCustomerPhone(orderData);
      const customerEmail = this.extractCustomerEmail(orderData);
      const deliveryAddress = this.extractDeliveryAddress(orderData);
      const scheduledDeliveryTime = this.extractScheduledDeliveryTime(orderData);

      // Extract merchant_name from orderData if provided, otherwise look it up from merchants table
      let merchantName = orderData.merchant_name || orderData.merchantName || null;
      
      // If merchant_name is not provided, look it up from merchants table using store_id
      if (!merchantName) {
        const storeId = orderData.store_id?.toString() || orderData.restaurant_id?.toString();
        if (storeId) {
          try {
            const merchant = await this.getMerchantByStoreId(storeId);
            if (merchant && merchant.merchant_name) {
              merchantName = merchant.merchant_name;
            }
          } catch (error) {
            // If lookup fails, continue without merchant_name
            console.log(`Could not lookup merchant_name for store_id ${storeId}: ${error}`);
          }
        }
      }

      const order: Order = {
        id: '',
        gloriafood_order_id: orderData.id?.toString() || orderData.order_id?.toString() || '',
        store_id: orderData.store_id?.toString() || orderData.restaurant_id?.toString() || '',
        merchant_name: merchantName || undefined,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        delivery_address: deliveryAddress,
        total_price: parseFloat(orderData.total_price || orderData.total || '0'),
        currency: orderData.currency || 'USD',
        status: orderData.status || orderData.order_status || 'unknown',
        order_type: orderData.order_type || orderData.type || 'unknown',
        items: JSON.stringify(orderData.items || orderData.order_items || []),
        raw_data: JSON.stringify(orderData),
        scheduled_delivery_time: scheduledDeliveryTime || undefined,
        created_at: orderData.created_at || orderData.order_date || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        fetched_at: new Date().toISOString()
      };

      const client = await this.pool.connect();

      const result = await client.query(`
        INSERT INTO orders (
          gloriafood_order_id, store_id, merchant_name, customer_name, customer_phone,
          customer_email, delivery_address, total_price, currency,
          status, order_type, items, raw_data, scheduled_delivery_time, created_at, updated_at, fetched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (gloriafood_order_id) DO UPDATE SET
          customer_name = EXCLUDED.customer_name,
          customer_phone = EXCLUDED.customer_phone,
          customer_email = EXCLUDED.customer_email,
          delivery_address = EXCLUDED.delivery_address,
          status = EXCLUDED.status,
          total_price = EXCLUDED.total_price,
          order_type = EXCLUDED.order_type,
          items = EXCLUDED.items,
          scheduled_delivery_time = EXCLUDED.scheduled_delivery_time,
          updated_at = EXCLUDED.updated_at,
          fetched_at = EXCLUDED.fetched_at,
          raw_data = EXCLUDED.raw_data,
          merchant_name = CASE 
            -- Priority 1: Keep existing valid merchant_name if it's not a fallback
            WHEN orders.merchant_name IS NOT NULL 
                 AND orders.merchant_name != ''
                 AND orders.merchant_name != orders.store_id
                 AND orders.merchant_name NOT LIKE 'Merchant %'
                 AND orders.merchant_name != 'Unknown Merchant'
                 AND orders.merchant_name != 'N/A'
            THEN orders.merchant_name
            -- Priority 2: Use new merchant_name if it's valid
            WHEN EXCLUDED.merchant_name IS NOT NULL 
                 AND EXCLUDED.merchant_name != ''
                 AND EXCLUDED.merchant_name != EXCLUDED.store_id
                 AND EXCLUDED.merchant_name NOT LIKE 'Merchant %'
                 AND EXCLUDED.merchant_name != 'Unknown Merchant'
                 AND EXCLUDED.merchant_name != 'N/A'
            THEN EXCLUDED.merchant_name
            -- Priority 3: Fallback to existing or new (but prefer existing)
            ELSE COALESCE(orders.merchant_name, EXCLUDED.merchant_name)
          END,
          store_id = EXCLUDED.store_id
        RETURNING *
      `, [
        order.gloriafood_order_id,
        order.store_id,
        order.merchant_name || null,
        order.customer_name,
        order.customer_phone || null,
        order.customer_email || null,
        order.delivery_address || null,
        order.total_price,
        order.currency,
        order.status,
        order.order_type,
        order.items,
        order.raw_data,
        order.scheduled_delivery_time || null,
        order.created_at,
        order.updated_at,
        order.fetched_at
      ]);

      client.release();

      const savedOrder = await this.getOrderByGloriaFoodId(order.gloriafood_order_id);
      return savedOrder;
    } catch (error: any) {
      console.error('❌ Error inserting order to PostgreSQL:', error.message);
      console.error('   Full error:', error);
      if (error.code === '42P01') {
        console.error('   ⚠️  Orders table does not exist. Check database setup.');
      }
      return null;
    }
  }

  async markOrderSentToDoorDash(gloriafoodOrderId: string, doordashOrderId?: string, trackingUrl?: string): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query(
        `UPDATE orders
         SET sent_to_doordash = TRUE,
             doordash_order_id = COALESCE($1, doordash_order_id),
             doordash_tracking_url = COALESCE($2, doordash_tracking_url),
             doordash_sent_at = NOW(),
             updated_at = NOW()
         WHERE gloriafood_order_id = $3`,
        [doordashOrderId || null, trackingUrl || null, gloriafoodOrderId]
      );
      client.release();
    } catch (error) {
      console.error('Error updating sent_to_doordash in PostgreSQL:', error);
    }
  }

  async updateOrderStatus(gloriafoodOrderId: string, newStatus: string): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      
      // Check current status to detect ACCEPTED status change
      const currentOrder = await client.query(
        `SELECT status FROM orders WHERE gloriafood_order_id = $1`,
        [gloriafoodOrderId]
      );
      
      const currentStatus = currentOrder.rows[0]?.status;
      const isAccepting = newStatus.toUpperCase() === 'ACCEPTED' && 
                         currentStatus?.toUpperCase() !== 'ACCEPTED';
      
      // Update status and set accepted_at if status is changing to ACCEPTED
      const result = await client.query(
        `UPDATE orders
         SET status = $1,
             updated_at = NOW(),
             accepted_at = CASE 
               WHEN $1 = 'ACCEPTED' AND accepted_at IS NULL THEN NOW()
               ELSE accepted_at
             END
         WHERE gloriafood_order_id = $2`,
        [newStatus, gloriafoodOrderId]
      );
      client.release();
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error updating order status in PostgreSQL:', error);
      return false;
    }
  }

  /**
   * Update merchant_name for orders that have fallback names when merchant name is updated
   * Only updates orders with fallback merchant names (like "Merchant {store_id}"), preserves valid historical names
   */
  async updateOrdersMerchantName(storeId: string, newMerchantName: string): Promise<number> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        `UPDATE orders
         SET merchant_name = $1, updated_at = NOW()
         WHERE store_id = $2
           AND (
             merchant_name IS NULL
             OR merchant_name = ''
             OR merchant_name = store_id
             OR merchant_name LIKE 'Merchant %'
             OR merchant_name = 'Unknown Merchant'
           )`,
        [newMerchantName, storeId]
      );
      client.release();
      const updatedCount = result.rowCount || 0;
      if (updatedCount > 0) {
        console.log(`Updated merchant_name for ${updatedCount} order(s) with store_id ${storeId} to "${newMerchantName}"`);
      }
      return updatedCount;
    } catch (error) {
      console.error('Error updating orders merchant_name in PostgreSQL:', error);
      return 0;
    }
  }

  async getOrderByDoorDashId(doordashOrderId: string): Promise<Order | null> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT * FROM orders WHERE doordash_order_id = $1',
        [doordashOrderId]
      );
      client.release();
      return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
    } catch (error) {
      console.error('Error getting order by DoorDash ID:', error);
      return null;
    }
  }

  private extractCustomerName(orderData: any): string {
    if (orderData.client_first_name || orderData.client_last_name) {
      const name = `${orderData.client_first_name || ''} ${orderData.client_last_name || ''}`.trim();
      if (name) return name;
    }
    if (orderData.client_name && String(orderData.client_name).trim()) return String(orderData.client_name).trim();

    if (orderData.client) {
      if (orderData.client.first_name || orderData.client.last_name) {
        const name = `${orderData.client.first_name || ''} ${orderData.client.last_name || ''}`.trim();
        if (name) return name;
      }
      if (orderData.client.name) return String(orderData.client.name);
    }

    if (orderData.customer) {
      if (orderData.customer.name) return String(orderData.customer.name);
      if (orderData.customer.first_name || orderData.customer.last_name) {
        const name = `${orderData.customer.first_name || ''} ${orderData.customer.last_name || ''}`.trim();
        if (name) return name;
      }
    }

    if (orderData.customer_name && String(orderData.customer_name).trim()) return String(orderData.customer_name).trim();
    if (orderData.name && String(orderData.name).trim()) return String(orderData.name).trim();

    return 'Unknown';
  }

  private extractCustomerPhone(orderData: any): string {
    if (orderData.client_phone && String(orderData.client_phone).trim()) return String(orderData.client_phone).trim();
    if (orderData.client?.phone && String(orderData.client.phone).trim()) return String(orderData.client.phone).trim();
    if (orderData.customer?.phone && String(orderData.customer.phone).trim()) return String(orderData.customer.phone).trim();
    if (orderData.customer_phone && String(orderData.customer_phone).trim()) return String(orderData.customer_phone).trim();
    if (orderData.phone && String(orderData.phone).trim()) return String(orderData.phone).trim();

    return '';
  }

  private extractCustomerEmail(orderData: any): string {
    if (orderData.client_email && String(orderData.client_email).trim()) return String(orderData.client_email).trim();
    if (orderData.client?.email && String(orderData.client.email).trim()) return String(orderData.client.email).trim();
    if (orderData.customer?.email && String(orderData.customer.email).trim()) return String(orderData.customer.email).trim();
    if (orderData.customer_email && String(orderData.customer_email).trim()) return String(orderData.customer_email).trim();
    if (orderData.email && String(orderData.email).trim()) return String(orderData.email).trim();

    return '';
  }

  private extractDeliveryAddress(orderData: any): string {
    if (orderData.client_address && String(orderData.client_address).trim()) {
      return String(orderData.client_address).trim();
    }

    if (orderData.delivery?.address) {
      const addr = orderData.delivery.address;
      const addressParts = [
        addr.street || addr.address_line_1 || addr.address,
        addr.address_line_2 || addr.line2 || addr.apt,
        addr.city || addr.locality,
        addr.state || addr.province,
        addr.zip || addr.postal_code || addr.postcode,
        addr.country
      ].filter(Boolean).map(s => String(s).trim());
      if (addressParts.length > 0) {
        return addressParts.join(', ');
      }
    }

    if (orderData.delivery_address && String(orderData.delivery_address).trim()) return String(orderData.delivery_address).trim();
    if (orderData.address && String(orderData.address).trim()) return String(orderData.address).trim();

    return '';
  }

  private extractScheduledDeliveryTime(orderData: any): string | null {
    // Check for scheduled delivery time in various possible fields
    const deliveryObj = orderData.delivery || {};
    const scheduleObj = orderData.schedule || {};
    const timeObj = orderData.time || {};

    // Check if "Later" option is selected (not ASAP)
    const isAsap = orderData.asap === true ||
      orderData.is_asap === true ||
      orderData.isAsap === true ||
      String(orderData.asap || '').toLowerCase() === 'true' ||
      String(orderData.asap || '').toLowerCase() === '1' ||
      String(orderData.asap || '').toLowerCase() === 'yes';

    const deliveryType = String(orderData.delivery_type || orderData.delivery_option || orderData.deliveryOption || orderData.deliveryType || orderData.delivery_time_type || orderData.time_type || orderData.delivery_method || '').toLowerCase();
    const deliveryOption = String(orderData.delivery_option || orderData.deliveryOption || orderData.available_time || orderData.availableTime || orderData.time_option || orderData.timeOption || orderData.selected_time_option || '').toLowerCase();

    const isLaterSelected = deliveryType === 'later' ||
      deliveryType === 'scheduled' ||
      deliveryOption === 'later' ||
      deliveryOption === 'scheduled' ||
      deliveryOption === 'schedule' ||
      orderData.is_scheduled === true ||
      orderData.isScheduled === true ||
      orderData.scheduled === true ||
      orderData.is_later === true ||
      orderData.isLater === true;

    // If explicitly ASAP (and not "Later"), it's not scheduled
    if (isAsap && !isLaterSelected) {
      return null; // It's ASAP, not scheduled
    }

    // If "Later" is explicitly selected, we should extract the scheduled time even if no date/time found yet
    // (Gloria Food might send it in a different format)

    // Try to get scheduled time from various fields (check more comprehensively)
    let scheduledTime = orderData.scheduled_delivery_time ||
      orderData.scheduledDeliveryTime ||
      orderData.delivery_time ||
      orderData.deliveryTime ||
      orderData.delivery_datetime ||
      orderData.deliveryDateTime ||
      orderData.requested_delivery_time ||
      orderData.requestedDeliveryTime ||
      orderData.preferred_delivery_time ||
      orderData.preferredDeliveryTime ||
      orderData.selected_delivery_time ||
      orderData.selectedDeliveryTime ||
      orderData.chosen_delivery_time ||
      orderData.chosenDeliveryTime ||
      orderData.scheduled_at ||
      orderData.scheduledAt ||
      orderData.schedule_time ||
      orderData.scheduleTime ||
      deliveryObj.scheduled_delivery_time ||
      deliveryObj.scheduledDeliveryTime ||
      deliveryObj.delivery_time ||
      deliveryObj.deliveryTime ||
      deliveryObj.requested_delivery_time ||
      deliveryObj.requestedDeliveryTime ||
      scheduleObj.delivery_time ||
      scheduleObj.scheduled_delivery_time ||
      scheduleObj.requested_delivery_time ||
      scheduleObj.scheduled_time ||
      timeObj.delivery_time ||
      timeObj.scheduled_delivery_time ||
      timeObj.delivery ||
      null;

    // If date and time are separate, combine them
    if (!scheduledTime) {
      const deliveryDate = orderData.delivery_date ||
        orderData.deliveryDate ||
        orderData.scheduled_date ||
        orderData.scheduledDate ||
        orderData.selected_delivery_date ||
        orderData.selectedDeliveryDate ||
        orderData.chosen_delivery_date ||
        orderData.chosenDeliveryDate ||
        orderData.preferred_delivery_date ||
        orderData.preferredDeliveryDate ||
        deliveryObj.delivery_date ||
        deliveryObj.deliveryDate ||
        scheduleObj.delivery_date ||
        scheduleObj.scheduled_date ||
        (orderData.schedule && orderData.schedule.date) ||
        (orderData.schedule && orderData.schedule.delivery_date);

      const deliveryTimeOnly = orderData.delivery_time_only ||
        orderData.deliveryTimeOnly ||
        orderData.scheduled_time ||
        orderData.scheduledTime ||
        orderData.selected_delivery_time ||
        orderData.selectedDeliveryTime ||
        orderData.chosen_delivery_time ||
        orderData.chosenDeliveryTime ||
        orderData.preferred_delivery_time ||
        orderData.preferredDeliveryTime ||
        orderData.time_slot ||
        orderData.delivery_time_slot ||
        deliveryObj.delivery_time_only ||
        deliveryObj.deliveryTimeOnly ||
        scheduleObj.delivery_time_only ||
        scheduleObj.deliveryTimeOnly ||
        scheduleObj.scheduled_time ||
        (orderData.schedule && orderData.schedule.time) ||
        (orderData.schedule && orderData.schedule.delivery_time);

      if (deliveryDate && deliveryTimeOnly) {
        // Combine date and time
        scheduledTime = `${deliveryDate} ${deliveryTimeOnly}`;
        // Try to parse and validate
        try {
          const testDate = new Date(scheduledTime);
          if (isNaN(testDate.getTime())) {
            // Try ISO format
            scheduledTime = `${deliveryDate}T${deliveryTimeOnly}`;
          }
        } catch (e) {
          // Use combined string as is
        }
      } else if (deliveryDate) {
        scheduledTime = deliveryDate;
      } else if (deliveryTimeOnly) {
        // If only time, combine with today's date
        const today = new Date().toISOString().split('T')[0];
        scheduledTime = `${today} ${deliveryTimeOnly}`;
      }
    }

    // Validate and format the scheduled time
    if (scheduledTime) {
      try {
        const date = new Date(scheduledTime);
        if (!isNaN(date.getTime())) {
          // Check if it's in the future (scheduled order)
          const now = new Date();
          // If "Later" is explicitly selected, accept the time even if it's very soon (within 1 minute)
          // This handles cases where the time is set but might be just a few seconds in the future
          if (date > now || (isLaterSelected && date >= new Date(now.getTime() - 60000))) {
            return date.toISOString();
          }
        }
      } catch (e) {
        // Invalid date format, but if "Later" is selected, still try to return the raw value
        // The frontend will handle parsing
        if (isLaterSelected && scheduledTime) {
          return scheduledTime;
        }
        return null;
      }
    }

    // If "Later" is explicitly selected but no time found, check if we have date/time separately
    // This is important for Gloria Food "in later" orders
    if (isLaterSelected && !scheduledTime) {
      // Try one more time with date/time combination
      const deliveryDate = orderData.delivery_date ||
        orderData.deliveryDate ||
        orderData.scheduled_date ||
        orderData.scheduledDate ||
        deliveryObj.delivery_date ||
        scheduleObj.delivery_date ||
        scheduleObj.scheduled_date;

      const deliveryTimeOnly = orderData.delivery_time_only ||
        orderData.deliveryTimeOnly ||
        orderData.scheduled_time ||
        deliveryObj.delivery_time_only ||
        scheduleObj.scheduled_time;

      if (deliveryDate || deliveryTimeOnly) {
        // If we have at least date or time, and "Later" is selected, consider it scheduled
        // Return a combined value or just the date
        if (deliveryDate && deliveryTimeOnly) {
          return `${deliveryDate} ${deliveryTimeOnly}`;
        } else if (deliveryDate) {
          return deliveryDate;
        } else if (deliveryTimeOnly) {
          const today = new Date().toISOString().split('T')[0];
          return `${today} ${deliveryTimeOnly}`;
        }
      }
    }

    return null;
  }

  async getOrderByGloriaFoodId(orderId: string): Promise<Order | null> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT * FROM orders WHERE gloriafood_order_id = $1',
        [orderId]
      );

      client.release();
      return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
    } catch (error) {
      console.error('Error getting order:', error);
      return null;
    }
  }

  async getAllOrders(limit: number = 50): Promise<Order[]> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT * FROM orders ORDER BY fetched_at DESC LIMIT $1',
        [limit]
      );

      client.release();
      return result.rows.map(row => this.mapRowToOrder(row));
    } catch (error) {
      console.error('Error getting all orders:', error);
      return [];
    }
  }

  async getRecentOrders(minutes: number = 60): Promise<Order[]> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        `SELECT * FROM orders 
         WHERE fetched_at > NOW() - INTERVAL '${minutes} minutes'
         ORDER BY fetched_at DESC`
      );

      client.release();
      return result.rows.map(row => this.mapRowToOrder(row));
    } catch (error) {
      console.error('Error getting recent orders:', error);
      return [];
    }
  }

  async getOrdersByStatus(status: string): Promise<Order[]> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT * FROM orders WHERE status = $1 ORDER BY fetched_at DESC',
        [status]
      );

      client.release();
      return result.rows.map(row => this.mapRowToOrder(row));
    } catch (error) {
      console.error('Error getting orders by status:', error);
      return [];
    }
  }

  /**
   * Get pending DoorDash orders efficiently - only orders that need status sync
   * Also checks orders with tracking URLs that might be DoorDash orders
   */
  async getPendingDoorDashOrders(limit: number = 100): Promise<Order[]> {
    try {
      const client = await this.pool.connect();
      // Check for orders that have been sent to DoorDash (by any indicator)
      // Include orders with doordash_order_id, sent_to_doordash flag, or doordash_tracking_url
      // Also check for tracking URLs in raw_data that might indicate DoorDash orders
      const result = await client.query(
        `SELECT * FROM orders 
         WHERE (
           doordash_order_id IS NOT NULL 
           OR sent_to_doordash = TRUE 
           OR doordash_tracking_url IS NOT NULL
           OR (raw_data::text LIKE '%doordash%' OR raw_data::text LIKE '%tracking%')
         )
           AND status NOT IN ('CANCELLED', 'CANCELED', 'DELIVERED', 'COMPLETED')
         ORDER BY fetched_at DESC
         LIMIT $1`,
        [limit]
      );

      client.release();
      return result.rows.map(row => this.mapRowToOrder(row));
    } catch (error) {
      console.error('Error getting pending DoorDash orders:', error);
      return [];
    }
  }

  async getOrderCount(): Promise<number> {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT COUNT(*) as count FROM orders');

      client.release();
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch (error) {
      console.error('Error getting order count:', error);
      return 0;
    }
  }

  private mapRowToOrder(row: any): Order {
    return {
      id: row.id?.toString() || '',
      gloriafood_order_id: row.gloriafood_order_id || '',
      store_id: row.store_id || '',
      merchant_name: row.merchant_name || undefined,
      customer_name: row.customer_name || '',
      customer_phone: row.customer_phone || '',
      customer_email: row.customer_email,
      delivery_address: row.delivery_address,
      total_price: parseFloat(row.total_price || '0'),
      currency: row.currency || 'USD',
      status: row.status || '',
      order_type: row.order_type || '',
      items: row.items || '[]',
      raw_data: row.raw_data || '{}',
      scheduled_delivery_time: row.scheduled_delivery_time ? new Date(row.scheduled_delivery_time).toISOString() : undefined,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      fetched_at: row.fetched_at ? new Date(row.fetched_at).toISOString() : new Date().toISOString(),
      sent_to_doordash: row.sent_to_doordash ? 1 : 0,
      doordash_order_id: row.doordash_order_id,
      doordash_sent_at: row.doordash_sent_at ? new Date(row.doordash_sent_at).toISOString() : undefined,
      doordash_tracking_url: row.doordash_tracking_url
    };
  }

  // User authentication methods
  async createUser(email: string, password: string, fullName: string): Promise<User | null> {
    try {
      const crypto = require('crypto');
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

      const client = await this.pool.connect();

      // Create users table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_email ON users(email)
      `);

      const result = await client.query(`
        INSERT INTO users (email, password, full_name) VALUES ($1, $2, $3)
        RETURNING id, email, full_name, role, created_at
      `, [email, hashedPassword, fullName]);

      client.release();

      return {
        id: result.rows[0].id,
        email: result.rows[0].email,
        full_name: result.rows[0].full_name,
        role: result.rows[0].role || 'user',
        created_at: result.rows[0].created_at
      };
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.code === '23505') {
        throw new Error('Email already exists');
      }
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      client.release();
      return result.rows.length > 0 ? {
        id: result.rows[0].id,
        email: result.rows[0].email,
        full_name: result.rows[0].full_name,
        role: result.rows[0].role || 'user',
        created_at: result.rows[0].created_at
      } : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async verifyPassword(email: string, password: string): Promise<boolean | User | null> {
    try {
      const crypto = require('crypto');
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

      const user = await this.getUserByEmail(email);
      if (!user) {
        return null;
      }

      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT password FROM users WHERE email = $1',
        [email]
      );
      client.release();

      if (result.rows[0]?.password === hashedPassword) {
        return {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          created_at: user.created_at
        };
      }

      return false;
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT id, email, full_name, role, created_at FROM users ORDER BY created_at DESC'
      );
      client.release();
      return result.rows.map(row => ({
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role: row.role || 'user',
        created_at: row.created_at
      }));
    } catch (error) {
      console.error('Error getting all users:', error);
      return [];
    }
  }

  async deleteUser(email: string): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'DELETE FROM users WHERE email = $1',
        [email]
      );
      client.release();
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }

  // Drivers methods
  async getAllDrivers(): Promise<any[]> {
    try {
      const client = await this.pool.connect();

      // Create drivers table if not exists
      await client.query(`
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
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status)
      `);

      const result = await client.query('SELECT * FROM drivers ORDER BY name');
      client.release();
      return result.rows || [];
    } catch (error) {
      console.error('Error getting drivers:', error);
      return [];
    }
  }

  async getDriverById(id: number): Promise<any | null> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT * FROM drivers WHERE id = $1',
        [id]
      );

      client.release();
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Error getting driver:', error);
      return null;
    }
  }

  async createDriver(driverData: { name: string; phone?: string; email?: string; vehicle_type?: string; vehicle_plate?: string }): Promise<any | null> {
    try {
      const client = await this.pool.connect();

      // Create drivers table if not exists
      await client.query(`
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
        )
      `);

      const result = await client.query(
        `INSERT INTO drivers (name, phone, email, vehicle_type, vehicle_plate, status) 
         VALUES ($1, $2, $3, $4, $5, 'active') 
         RETURNING id, name, phone, email, vehicle_type, vehicle_plate, rating, status, created_at`,
        [
          driverData.name,
          driverData.phone || null,
          driverData.email || null,
          driverData.vehicle_type || null,
          driverData.vehicle_plate || null
        ]
      );

      client.release();
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error creating driver:', error);
      return null;
    }
  }

  async deleteDriver(id: number): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'DELETE FROM drivers WHERE id = $1',
        [id]
      );
      client.release();
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting driver:', error);
      return false;
    }
  }

  // Reviews methods
  async getAllReviews(): Promise<any[]> {
    try {
      const client = await this.pool.connect();

      // Create reviews table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id SERIAL PRIMARY KEY,
          order_id INTEGER,
          driver_id INTEGER,
          customer_name VARCHAR(255),
          rating INTEGER NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_reviews_driver_id ON reviews(driver_id)
      `);

      const result = await client.query(`
        SELECT r.*, o.gloriafood_order_id as order_number 
        FROM reviews r 
        LEFT JOIN orders o ON r.order_id = o.id 
        ORDER BY r.created_at DESC
      `);

      client.release();
      return result.rows || [];
    } catch (error) {
      console.error('Error getting reviews:', error);
      return [];
    }
  }

  async getReviewsByOrderId(orderId: number): Promise<any[]> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT * FROM reviews WHERE order_id = $1 ORDER BY created_at DESC',
        [orderId]
      );

      client.release();
      return result.rows || [];
    } catch (error) {
      console.error('Error getting reviews by order:', error);
      return [];
    }
  }

  // Statistics methods
  async getDashboardStats(): Promise<any> {
    try {
      const client = await this.pool.connect();

      const orderStats = await client.query(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN status NOT IN ('DELIVERED', 'CANCELLED', 'CANCELED') THEN 1 ELSE 0 END) as active_orders,
          SUM(CASE WHEN status IN ('CANCELLED', 'CANCELED') THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(CASE WHEN status NOT IN ('CANCELLED', 'CANCELED') THEN total_price ELSE 0 END) as total_revenue
        FROM orders
      `);

      const recentOrders = await client.query(`
        SELECT COUNT(*) as count FROM orders 
        WHERE fetched_at >= NOW() - INTERVAL '24 hours'
      `);

      const driverStats = await client.query(`
        SELECT 
          COUNT(*) as total_drivers,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_drivers
        FROM drivers
      `);

      client.release();

      return {
        orders: {
          total: parseInt(orderStats.rows[0]?.total_orders || '0', 10),
          completed: parseInt(orderStats.rows[0]?.completed_orders || '0', 10),
          active: parseInt(orderStats.rows[0]?.active_orders || '0', 10),
          cancelled: parseInt(orderStats.rows[0]?.cancelled_orders || '0', 10),
          recent_24h: parseInt(recentOrders.rows[0]?.count || '0', 10)
        },
        revenue: {
          total: parseFloat(orderStats.rows[0]?.total_revenue || '0')
        },
        drivers: {
          total: parseInt(driverStats.rows[0]?.total_drivers || '0', 10),
          active: parseInt(driverStats.rows[0]?.active_drivers || '0', 10)
        }
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      return {
        orders: { total: 0, completed: 0, active: 0, cancelled: 0, recent_24h: 0 },
        revenue: { total: 0 },
        drivers: { total: 0, active: 0 }
      };
    }
  }

  // Merchant methods
  async getAllMerchants(): Promise<Merchant[]> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(`
        SELECT * FROM merchants WHERE is_active = TRUE ORDER BY merchant_name
      `);
      client.release();

      return result.rows.map(m => ({
        id: m.id,
        store_id: m.store_id,
        merchant_name: m.merchant_name,
        api_key: m.api_key,
        api_url: m.api_url,
        master_key: m.master_key,
        phone: m.phone || null,
        address: m.address || null,
        is_active: m.is_active === true,
        created_at: m.created_at,
        updated_at: m.updated_at
      }));
    } catch (error) {
      console.error('Error getting merchants:', error);
      return [];
    }
  }

  async getMerchantByStoreId(storeId: string): Promise<Merchant | null> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        `SELECT * FROM merchants WHERE store_id = $1`,
        [storeId]
      );
      client.release();

      if (!result.rows || result.rows.length === 0) return null;

      const merchant = result.rows[0];
      return {
        id: merchant.id,
        store_id: merchant.store_id,
        merchant_name: merchant.merchant_name,
        api_key: merchant.api_key,
        api_url: merchant.api_url,
        master_key: merchant.master_key,
        phone: merchant.phone || null,
        address: merchant.address || null,
        is_active: merchant.is_active === true,
        created_at: merchant.created_at,
        updated_at: merchant.updated_at
      };
    } catch (error) {
      console.error('Error getting merchant:', error);
      return null;
    }
  }

  async insertOrUpdateMerchant(merchant: Partial<Merchant>): Promise<Merchant | null> {
    try {
      if (!merchant.store_id) {
        throw new Error('store_id is required');
      }

      // For updates, merchant_name is optional (can update other fields without changing name)
      // For inserts, merchant_name is required
      const existing = await this.getMerchantByStoreId(merchant.store_id);
      if (!existing && !merchant.merchant_name) {
        throw new Error('merchant_name is required for new merchants');
      }

      const client = await this.pool.connect();

      if (existing) {
        // Update existing merchant - only update fields that are provided
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (merchant.merchant_name !== undefined) {
          updates.push(`merchant_name = $${paramIndex++}`);
          values.push(merchant.merchant_name.trim());
        }
        if (merchant.api_key !== undefined) {
          updates.push(`api_key = $${paramIndex++}`);
          values.push(merchant.api_key || null);
        }
        if (merchant.api_url !== undefined) {
          updates.push(`api_url = $${paramIndex++}`);
          values.push(merchant.api_url || null);
        }
        if (merchant.master_key !== undefined) {
          updates.push(`master_key = $${paramIndex++}`);
          values.push(merchant.master_key || null);
        }
        if ((merchant as any).phone !== undefined) {
          updates.push(`phone = $${paramIndex++}`);
          values.push((merchant as any).phone || null);
        }
        if ((merchant as any).address !== undefined) {
          updates.push(`address = $${paramIndex++}`);
          values.push((merchant as any).address || null);
        }
        if (merchant.is_active !== undefined) {
          updates.push(`is_active = $${paramIndex++}`);
          values.push(merchant.is_active);
        }

        // Always update updated_at
        updates.push(`updated_at = NOW()`);

        if (updates.length > 1) { // More than just updated_at
          values.push(merchant.store_id);
          await client.query(`
            UPDATE merchants 
            SET ${updates.join(', ')}
            WHERE store_id = $${paramIndex}
          `, values);
        }
      } else {
        // Insert new merchant
        await client.query(`
          INSERT INTO merchants (store_id, merchant_name, api_key, api_url, master_key, phone, address, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          merchant.store_id,
          merchant.merchant_name!.trim(),
          merchant.api_key || null,
          merchant.api_url || null,
          merchant.master_key || null,
          (merchant as any).phone || null,
          (merchant as any).address || null,
          merchant.is_active !== undefined ? merchant.is_active : true
        ]);
      }

      client.release();
      const updated = await this.getMerchantByStoreId(merchant.store_id);
      if (updated) {
        console.log(`Merchant ${merchant.store_id} saved: merchant_name="${updated.merchant_name}", store_id="${updated.store_id}"`);
      }
      return updated;
    } catch (error) {
      console.error('Error inserting/updating merchant:', error);
      return null;
    }
  }

  async deleteMerchant(storeId: string): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        `DELETE FROM merchants WHERE store_id = $1`,
        [storeId]
      );
      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting merchant:', error);
      return false;
    }
  }

  async deleteOrder(orderId: string): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      // Try to delete by gloriafood_order_id first, then by id
      const result = await client.query(
        `DELETE FROM orders WHERE gloriafood_order_id = $1 OR id::text = $1`,
        [orderId]
      );
      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting order:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
