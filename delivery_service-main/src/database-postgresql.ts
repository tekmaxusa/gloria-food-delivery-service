import { Pool, PoolClient } from 'pg';
import chalk from 'chalk';
import { Merchant, User, Location } from './database-factory';

export interface Order {
  id: string;
  gloriafood_order_id: string;
  store_id: string;  // Keep for backward compatibility
  location_id?: number;  // New: link to location
  location_name?: string;  // Denormalized for display
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

      // Increase timeout for Render databases (free tier can be slow to wake up)
      const isRender = databaseUrl.includes('render.com') || databaseUrl.includes('dpg-');
      const connectionTimeout = isRender ? 60000 : 30000; // 60s for Render, 30s for others
      
      this.pool = new Pool({
        connectionString: fixedUrl,
        ssl: sslConfig,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: connectionTimeout, // Increased timeout for Render databases
        statement_timeout: 60000, // Query timeout
        query_timeout: 60000, // Query timeout
      });
      
      if (isRender) {
        console.log(chalk.blue(`   ⏱️  Using extended timeout (60s) for Render database`));
      }

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

      // Increase timeout for Render databases (free tier can be slow to wake up)
      const isRender = this.config.host.includes('render.com') || this.config.host.includes('dpg-');
      const connectionTimeout = isRender ? 60000 : 30000; // 60s for Render, 30s for others
      
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
        connectionTimeoutMillis: connectionTimeout, // Increased timeout for Render databases
        statement_timeout: 60000, // Query timeout
        query_timeout: 60000, // Query timeout
      });
      
      if (isRender) {
        console.log(chalk.blue(`   ⏱️  Using extended timeout (60s) for Render database`));
      }
    }

    this.initializeTables();
  }

  /**
   * Retry helper for database operations with exponential backoff
   * Especially useful for Render databases that may timeout or be slow to wake up
   */
  private async retryQuery<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const isTimeout = error.message?.includes('timeout') || 
                         error.message?.includes('ETIMEDOUT') ||
                         error.code === 'ETIMEDOUT';
        
        if (isTimeout && attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(chalk.yellow(`   ⚠️  ${operationName} timeout (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`));
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If not a timeout or last attempt, throw immediately
        throw error;
      }
    }
    
    throw lastError;
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

        // Ensure the updated_at trigger function exists before any triggers are created
        await client.query(`
          CREATE OR REPLACE FUNCTION public.update_updated_at_column()
          RETURNS TRIGGER AS $$
          BEGIN
              NEW.updated_at = CURRENT_TIMESTAMP;
              RETURN NEW;
          END;
          $$ language 'plpgsql';
        `);

        // Create orders table if not exists
        // Note: user_id can be NULL for backward compatibility
        await client.query(`
          CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            gloriafood_order_id VARCHAR(255) NOT NULL,
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

        // Add user_id column to orders if it doesn't exist (for existing databases)
        try {
          await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS user_id INTEGER
          `);
          console.log('✅ Added user_id column to orders table');
        } catch (e: any) {
          // Column might already exist, ignore error
          if (e.code !== '42701') {
            console.log('   Note: user_id column may already exist');
          }
        }
        
        // Remove old unique constraint if it exists
        try {
          await client.query(`
            ALTER TABLE orders 
            DROP CONSTRAINT IF EXISTS orders_gloriafood_order_id_key
          `);
        } catch (e: any) {
          // Constraint might not exist, ignore error
        }
        
        // Create unique indexes for orders - allow NULL user_id but enforce uniqueness for non-NULL
        // Do this AFTER adding the column to avoid errors on existing databases
        try {
          await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS orders_user_id_gloriafood_order_id_unique 
            ON orders (user_id, gloriafood_order_id) 
            WHERE user_id IS NOT NULL
          `);
        } catch (e: any) {
          // Index might already exist or column might not exist yet, ignore error
          if (e.code !== '42P07' && e.code !== '42710') {
            console.log('   Note: orders_user_id_gloriafood_order_id_unique index may already exist or user_id column not ready');
          }
        }
        
        // Also allow NULL user_id with unique gloriafood_order_id (for backward compatibility)
        try {
          await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS orders_null_user_gloriafood_order_id_unique 
            ON orders (gloriafood_order_id) 
            WHERE user_id IS NULL
          `);
        } catch (e: any) {
          // Index might already exist, ignore error
          if (e.code !== '42P07' && e.code !== '42710') {
            console.log('   Note: orders_null_user_gloriafood_order_id_unique index may already exist');
          }
        }

        // Create merchants table if not exists
        // Note: user_id can be NULL for backward compatibility
        await client.query(`
          CREATE TABLE IF NOT EXISTS merchants (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            store_id VARCHAR(255),
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

        // Allow store_id to be NULL (store_id now stored in locations)
        try {
          await client.query(`
            ALTER TABLE merchants
            ALTER COLUMN store_id DROP NOT NULL
          `);
        } catch (e: any) {
          // Ignore if already nullable
          if (e.code !== '42701') {
            console.log('   Note: could not drop NOT NULL on merchants.store_id');
          }
        }

        // Add phone, address, and user_id columns if they don't exist (for existing databases)
        try {
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS phone VARCHAR(100)
          `);
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS address TEXT
          `);
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS user_id INTEGER
          `);
          // Add webhook and integration fields
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(500)
          `);
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS webhook_url TEXT
          `);
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS integration_status VARCHAR(50) DEFAULT 'disconnected'
          `);
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS last_webhook_received TIMESTAMP
          `);
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS credentials_encrypted BOOLEAN DEFAULT FALSE
          `);
          await client.query(`
            ALTER TABLE merchants 
            ADD COLUMN IF NOT EXISTS integration_error TEXT
          `);
          // Remove old unique constraint on store_id and add new partial unique indexes
          // Allow NULL user_id for backward compatibility
          try {
            await client.query(`
              ALTER TABLE merchants 
              DROP CONSTRAINT IF EXISTS merchants_store_id_key
            `);
            // Create partial unique index that allows multiple NULL user_id but enforces uniqueness for non-NULL
            await client.query(`
              CREATE UNIQUE INDEX IF NOT EXISTS merchants_user_id_store_id_unique 
              ON merchants (user_id, store_id) 
              WHERE user_id IS NOT NULL
            `);
            // Also allow NULL user_id with unique store_id (for backward compatibility)
            await client.query(`
              CREATE UNIQUE INDEX IF NOT EXISTS merchants_null_user_store_id_unique 
              ON merchants (store_id) 
              WHERE user_id IS NULL
            `);
          } catch (e: any) {
            // Constraint might already exist or not exist, ignore error
            if (e.code !== '42P07' && e.code !== '42710') {
              console.log('   Note: Unique constraint may already exist');
            }
          }
          console.log('✅ Added user_id column to merchants table');
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
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_merchants_user_id ON merchants(user_id)
        `);

        // Ensure drivers table exists for stats/endpoints
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

        // Create locations table for multiple locations per merchant
        await client.query(`
          CREATE TABLE IF NOT EXISTS locations (
            id SERIAL PRIMARY KEY,
            merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
            location_name VARCHAR(255) NOT NULL,
            store_id VARCHAR(255) NOT NULL,
            address TEXT,
            phone VARCHAR(100),
            latitude DECIMAL(10, 8),
            longitude DECIMAL(11, 8),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(merchant_id, store_id)
          )
        `);

        // Create indexes for locations
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_locations_merchant_id ON locations(merchant_id)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_locations_store_id ON locations(store_id)
        `);
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_locations_is_active ON locations(is_active)
        `);

        // Add location_id to orders table if it doesn't exist
        try {
          await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL
          `);
          console.log('✅ Added location_id column to orders table');
        } catch (e: any) {
          if (e.code !== '42701') {
            console.log('   Note: location_id column may already exist');
          }
        }

        // Add location_name to orders table if it doesn't exist (denormalized for display)
        try {
          await client.query(`
            ALTER TABLE orders 
            ADD COLUMN IF NOT EXISTS location_name VARCHAR(255)
          `);
          console.log('✅ Added location_name column to orders table');
        } catch (e: any) {
          if (e.code !== '42701') {
            console.log('   Note: location_name column may already exist');
          }
        }

        // Create index for location_id in orders
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_orders_location_id ON orders(location_id)
        `);

        // Create trigger for locations updated_at
        await client.query(`
          DROP TRIGGER IF EXISTS update_locations_updated_at ON locations;
          CREATE TRIGGER update_locations_updated_at
            BEFORE UPDATE ON locations
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column()
        `);

        // Migration: Create locations from existing merchants (one-time migration)
        // This creates one location per existing merchant for backward compatibility
        try {
          const migrationCheck = await client.query(`
            SELECT COUNT(*) as count FROM locations
          `);
          if (parseInt(migrationCheck.rows[0].count) === 0) {
            // Only migrate if no locations exist yet
            const merchantsResult = await client.query(`
              SELECT id, store_id, merchant_name, address, phone, is_active 
              FROM merchants
            `);
            
            if (merchantsResult.rows.length > 0) {
              console.log(chalk.cyan(`   🔄 Migrating ${merchantsResult.rows.length} merchant(s) to locations...`));
              for (const merchant of merchantsResult.rows) {
                await client.query(`
                  INSERT INTO locations (merchant_id, location_name, store_id, address, phone, is_active)
                  VALUES ($1, $2, $3, $4, $5, $6)
                  ON CONFLICT (merchant_id, store_id) DO NOTHING
                `, [
                  merchant.id,
                  merchant.merchant_name || `Location ${merchant.store_id}`,
                  merchant.store_id,
                  merchant.address || null,
                  merchant.phone || null,
                  merchant.is_active !== false
                ]);
              }
              console.log(chalk.green(`   ✅ Migration complete: Created ${merchantsResult.rows.length} location(s)`));
            }
          }
        } catch (e: any) {
          console.log(chalk.yellow(`   ⚠️  Migration note: ${e.message}`));
        }

        // Create index for orders user_id
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)
        `);

        // Create trigger function for updated_at
        await client.query(`
          CREATE OR REPLACE FUNCTION public.update_updated_at_column()
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
            EXECUTE FUNCTION public.update_updated_at_column()
        `);

        await client.query(`
          DROP TRIGGER IF EXISTS update_merchants_updated_at ON merchants;
          CREATE TRIGGER update_merchants_updated_at
            BEFORE UPDATE ON merchants
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column()
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
                const retryTimeout1 = newUrl.includes('render.com') || newUrl.includes('dpg-') ? 60000 : 30000;
                this.pool = new Pool({
                  connectionString: newUrl,
                  ssl: { rejectUnauthorized: false },
                  max: 10,
                  idleTimeoutMillis: 30000,
                  connectionTimeoutMillis: retryTimeout1,
                  statement_timeout: 60000,
                  query_timeout: 60000,
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
                const retryTimeout2 = newUrl.includes('render.com') || newUrl.includes('dpg-') ? 60000 : 30000;
                this.pool = new Pool({
                  connectionString: newUrl,
                  ssl: { rejectUnauthorized: false },
                  max: 10,
                  idleTimeoutMillis: 30000,
                  connectionTimeoutMillis: retryTimeout2,
                  statement_timeout: 60000,
                  query_timeout: 60000,
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

  async insertOrUpdateOrder(orderData: any, userId?: number): Promise<Order | null> {
    try {
      const customerName = this.extractCustomerName(orderData);
      const customerPhone = this.extractCustomerPhone(orderData);
      const customerEmail = this.extractCustomerEmail(orderData);
      const deliveryAddress = this.extractDeliveryAddress(orderData);
      const scheduledDeliveryTime = this.extractScheduledDeliveryTime(orderData);

      // Extract merchant_name and user_id from orderData if provided, otherwise look it up from merchants table
      let merchantName = orderData.merchant_name || orderData.merchantName || null;
      const orderId = orderData.id?.toString() || orderData.order_id?.toString() || '';
      
      // First, check if order already exists to preserve its user_id
      let orderUserId = userId || orderData.user_id || null;
      let existingOrder = null;
      if (orderId) {
        try {
          // Try to find existing order without user_id filter first (for backward compatibility)
          existingOrder = await this.getOrderByGloriaFoodId(orderId);
          if (existingOrder && (existingOrder as any).user_id) {
            // Preserve existing user_id
            orderUserId = (existingOrder as any).user_id;
          }
        } catch (error) {
          // If lookup fails, continue
        }
      }
      
      // Find location and merchant by store_id
      let locationId: number | undefined = undefined;
      let locationName: string | undefined = undefined;
      // Try multiple possible field names for store_id
      const storeId = orderData.store_id?.toString() || 
                     orderData.restaurant_id?.toString() ||
                     orderData.restaurantId?.toString() ||
                     orderData.storeId?.toString() ||
                     orderData.restaurant?.id?.toString() ||
                     orderData.restaurant?.store_id?.toString() ||
                     orderData.store?.id?.toString() ||
                     orderData.store?.store_id?.toString();
      
      if (storeId) {
        try {
          // First, try to find location by store_id
          const location = await this.getLocationByStoreId(storeId, orderUserId);
          if (location) {
            locationId = location.id;
            locationName = location.location_name;
            
            // Get merchant from location to set user_id and merchant_name
            const merchant = await this.getMerchantByStoreId(storeId, orderUserId);
            if (merchant) {
              if (!orderUserId && merchant.user_id) {
                orderUserId = merchant.user_id;
              }
              if (!merchantName && merchant.merchant_name) {
                merchantName = merchant.merchant_name;
              }
            }
          } else {
            // Fallback: try to find merchant directly (for backward compatibility)
            let merchant = null;
            if (orderData.api_key) {
              merchant = await this.getMerchantByApiKey(orderData.api_key);
            }
            if (!merchant) {
              merchant = await this.getMerchantByStoreId(storeId);
            }
            if (merchant) {
              if (!orderUserId && merchant.user_id) {
                orderUserId = merchant.user_id;
              }
              if (!merchantName && merchant.merchant_name) {
                merchantName = merchant.merchant_name;
              }
            }
          }
        } catch (error) {
          // If lookup fails, continue without location/merchant info
          console.log(`Could not lookup location/merchant for store_id ${storeId}: ${error}`);
        }
      }

      const order: Order = {
        id: '',
        gloriafood_order_id: orderData.id?.toString() || orderData.order_id?.toString() || '',
        store_id: storeId || '',
        location_id: locationId,
        location_name: locationName,
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

      // Check if order exists (with or without user_id) for backward compatibility
      let existingOrderRow = null;
      if (orderId) {
        // First check for order with matching user_id
        if (orderUserId) {
          const existingCheck = await client.query(
            'SELECT * FROM orders WHERE gloriafood_order_id = $1 AND user_id = $2',
            [orderId, orderUserId]
          );
          if (existingCheck.rows.length > 0) {
            existingOrderRow = existingCheck.rows[0];
          }
        }
        // If not found, check for order with NULL user_id (for backward compatibility)
        if (!existingOrderRow) {
          const existingNullCheck = await client.query(
            'SELECT * FROM orders WHERE gloriafood_order_id = $1 AND user_id IS NULL',
            [orderId]
          );
          if (existingNullCheck.rows.length > 0) {
            existingOrderRow = existingNullCheck.rows[0];
            // If existing order has NULL user_id and we have a user_id, update it first
            if (orderUserId) {
              await client.query(
                'UPDATE orders SET user_id = $1 WHERE gloriafood_order_id = $2 AND user_id IS NULL',
                [orderUserId, orderId]
              );
              existingOrderRow.user_id = orderUserId;
            }
          }
        }
        // If existing order has a user_id but we don't, use the existing one
        if (existingOrderRow && existingOrderRow.user_id && !orderUserId) {
          orderUserId = existingOrderRow.user_id;
        }
      }

      // Use INSERT with ON CONFLICT - handle both cases
      // For non-NULL user_id: conflict on (user_id, gloriafood_order_id)
      // For NULL user_id: update existing order if found, otherwise insert
      let result;
      if (existingOrderRow && !orderUserId) {
        // Update existing order with NULL user_id
        const merchantNameParam = order.merchant_name || null;
        const storeIdParam = order.store_id || null;
        
        result = await client.query(`
          UPDATE orders SET
            customer_name = $1,
            customer_phone = $2,
            customer_email = $3,
            delivery_address = $4,
            status = $5,
            total_price = $6,
            order_type = $7,
            items = $8,
            scheduled_delivery_time = $9,
            updated_at = $10,
            fetched_at = $11,
            raw_data = $12,
            location_id = $13,
            location_name = $14,
            merchant_name = CASE 
              WHEN orders.merchant_name IS NOT NULL 
                   AND orders.merchant_name != ''
                   AND orders.merchant_name != orders.store_id
                   AND orders.merchant_name NOT LIKE 'Merchant %'
                   AND orders.merchant_name != 'Unknown Merchant'
                   AND orders.merchant_name != 'N/A'
              THEN orders.merchant_name
              WHEN $15::text IS NOT NULL 
                   AND $15::text != ''
                   AND $15::text != $16::text
                   AND $15::text NOT LIKE 'Merchant %'
                   AND $15::text != 'Unknown Merchant'
                   AND $15::text != 'N/A'
              THEN $15::text
              ELSE COALESCE(orders.merchant_name, $15::text)
            END,
            store_id = $16
          WHERE gloriafood_order_id = $17 AND user_id IS NULL
          RETURNING *
        `, [
          order.customer_name,
          order.customer_phone || null,
          order.customer_email || null,
          order.delivery_address || null,
          order.status,
          order.total_price,
          order.order_type,
          order.items,
          order.scheduled_delivery_time || null,
          order.updated_at,
          order.fetched_at,
          order.raw_data,
          order.location_id || null,
          order.location_name || null,
          merchantNameParam,
          storeIdParam,
          order.gloriafood_order_id
        ]);
      } else {
        // Insert or update with user_id (or NULL user_id for new orders)
        // Use a simpler approach: try INSERT, if conflict then UPDATE
        try {
          result = await client.query(`
            INSERT INTO orders (
              user_id, gloriafood_order_id, store_id, location_id, location_name, merchant_name, customer_name, customer_phone,
              customer_email, delivery_address, total_price, currency,
              status, order_type, items, raw_data, scheduled_delivery_time, created_at, updated_at, fetched_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            RETURNING *
          `, [
            orderUserId,
            order.gloriafood_order_id,
            order.store_id,
            order.location_id || null,
            order.location_name || null,
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
        } catch (insertError: any) {
          // If insert fails due to unique constraint, update instead
          if (insertError.code === '23505') {
            // Unique constraint violation - update existing order
            const merchantNameParam = order.merchant_name || null;
            const storeIdParam = order.store_id || null;
            
            const updateQuery = orderUserId 
              ? `UPDATE orders SET 
                  customer_name = $1, 
                  customer_phone = $2, 
                  customer_email = $3, 
                  delivery_address = $4, 
                  status = $5, 
                  total_price = $6, 
                  order_type = $7, 
                  items = $8, 
                  scheduled_delivery_time = $9, 
                  updated_at = $10, 
                  fetched_at = $11, 
                  raw_data = $12,
                  location_id = $13,
                  location_name = $14,
                  merchant_name = CASE 
                    WHEN orders.merchant_name IS NOT NULL 
                         AND orders.merchant_name != ''
                         AND orders.merchant_name != orders.store_id
                         AND orders.merchant_name NOT LIKE 'Merchant %'
                         AND orders.merchant_name != 'Unknown Merchant'
                         AND orders.merchant_name != 'N/A'
                    THEN orders.merchant_name
                    WHEN $15::text IS NOT NULL 
                         AND $15::text != ''
                         AND $15::text != $16::text
                         AND $15::text NOT LIKE 'Merchant %'
                         AND $15::text != 'Unknown Merchant'
                         AND $15::text != 'N/A'
                    THEN $15::text
                    ELSE COALESCE(orders.merchant_name, $15::text)
                  END, 
                  store_id = $16 
                  WHERE gloriafood_order_id = $17 AND user_id = $18 
                  RETURNING *`
              : `UPDATE orders SET 
                  customer_name = $1, 
                  customer_phone = $2, 
                  customer_email = $3, 
                  delivery_address = $4, 
                  status = $5, 
                  total_price = $6, 
                  order_type = $7, 
                  items = $8, 
                  scheduled_delivery_time = $9, 
                  updated_at = $10, 
                  fetched_at = $11, 
                  raw_data = $12,
                  location_id = $13,
                  location_name = $14,
                  merchant_name = CASE 
                    WHEN orders.merchant_name IS NOT NULL 
                         AND orders.merchant_name != ''
                         AND orders.merchant_name != orders.store_id
                         AND orders.merchant_name NOT LIKE 'Merchant %'
                         AND orders.merchant_name != 'Unknown Merchant'
                         AND orders.merchant_name != 'N/A'
                    THEN orders.merchant_name
                    WHEN $15::text IS NOT NULL 
                         AND $15::text != ''
                         AND $15::text != $16::text
                         AND $15::text NOT LIKE 'Merchant %'
                         AND $15::text != 'Unknown Merchant'
                         AND $15::text != 'N/A'
                    THEN $15::text
                    ELSE COALESCE(orders.merchant_name, $15::text)
                  END, 
                  store_id = $16 
                  WHERE gloriafood_order_id = $17 AND user_id IS NULL 
                  RETURNING *`;
            
            const updateParams = orderUserId
              ? [order.customer_name, order.customer_phone || null, order.customer_email || null, order.delivery_address || null, order.status, order.total_price, order.order_type, order.items, order.scheduled_delivery_time || null, order.updated_at, order.fetched_at, order.raw_data, order.location_id || null, order.location_name || null, merchantNameParam, storeIdParam, order.gloriafood_order_id, orderUserId]
              : [order.customer_name, order.customer_phone || null, order.customer_email || null, order.delivery_address || null, order.status, order.total_price, order.order_type, order.items, order.scheduled_delivery_time || null, order.updated_at, order.fetched_at, order.raw_data, order.location_id || null, order.location_name || null, merchantNameParam, storeIdParam, order.gloriafood_order_id];
            
            result = await client.query(updateQuery, updateParams);
          } else {
            throw insertError;
          }
        }
      }

      client.release();

      const savedOrder = await this.getOrderByGloriaFoodId(order.gloriafood_order_id, orderUserId || undefined);
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
      // Cast status parameter to VARCHAR to match column type and avoid type mismatch errors
      const result = await client.query(
        `UPDATE orders
         SET status = $1::VARCHAR(50),
             updated_at = NOW(),
             accepted_at = CASE 
               WHEN $1::VARCHAR(50) = 'ACCEPTED' AND accepted_at IS NULL THEN NOW()
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

  async getOrderByGloriaFoodId(orderId: string, userId?: number): Promise<Order | null> {
    return this.retryQuery(async () => {
      try {
        const client = await this.pool.connect();
        // If userId is provided, filter by it. Otherwise, get any order with this ID (for backward compatibility)
        let query = 'SELECT * FROM orders WHERE gloriafood_order_id = $1';
        const params: any[] = [orderId];
        
        if (userId !== undefined) {
          query += ' AND user_id = $2';
          params.push(userId);
        }
        
        const result = await client.query(query, params);

        client.release();
        return result.rows.length > 0 ? this.mapRowToOrder(result.rows[0]) : null;
      } catch (error) {
        console.error('Error getting order:', error);
        throw error; // Re-throw to trigger retry
      }
    }, `getOrderByGloriaFoodId(${orderId})`, 3, 1000).catch(() => null);
  }

  async getAllOrders(limit: number = 50, userId?: number): Promise<Order[]> {
    return this.retryQuery(async () => {
      try {
        const client = await this.pool.connect();
        let query = 'SELECT * FROM orders';
        const params: any[] = [];
        
        if (userId !== undefined) {
          // If userId is 1 (default user), also include orders with NULL user_id
          // This ensures orders saved without a user session are visible
          if (userId === 1) {
            query += ' WHERE (user_id = $1 OR user_id IS NULL)';
            params.push(userId);
          } else {
            query += ' WHERE user_id = $1';
            params.push(userId);
          }
        }
        
        query += ' ORDER BY fetched_at DESC LIMIT $' + (params.length + 1);
        params.push(limit);
        
        const result = await client.query(query, params);

        client.release();
        return result.rows.map(row => this.mapRowToOrder(row));
      } catch (error) {
        console.error('Error getting all orders:', error);
        throw error; // Re-throw to trigger retry
      }
    }, `getAllOrders(limit=${limit})`, 3, 1000).catch(() => []);
  }

  async getRecentOrders(minutes: number = 60, userId?: number): Promise<Order[]> {
    try {
      const client = await this.pool.connect();
      let query = `SELECT * FROM orders 
         WHERE fetched_at > NOW() - INTERVAL '${minutes} minutes'`;
      const params: any[] = [];
      
      if (userId !== undefined) {
        // If userId is 1 (default user), also include orders with NULL user_id
        if (userId === 1) {
          query += ' AND (user_id = $1 OR user_id IS NULL)';
          params.push(userId);
        } else {
          query += ' AND user_id = $1';
          params.push(userId);
        }
      }
      
      query += ' ORDER BY fetched_at DESC';
      
      const result = await client.query(query, params);

      client.release();
      return result.rows.map(row => this.mapRowToOrder(row));
    } catch (error) {
      console.error('Error getting recent orders:', error);
      return [];
    }
  }

  async getOrdersByStatus(status: string, userId?: number): Promise<Order[]> {
    try {
      const client = await this.pool.connect();
      let query = 'SELECT * FROM orders WHERE status = $1';
      const params: any[] = [status];
      
      if (userId !== undefined) {
        // If userId is 1 (default user), also include orders with NULL user_id
        if (userId === 1) {
          query += ' AND (user_id = $2 OR user_id IS NULL)';
          params.push(userId);
        } else {
          query += ' AND user_id = $2';
          params.push(userId);
        }
      }
      
      query += ' ORDER BY fetched_at DESC';
      
      const result = await client.query(query, params);

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
    return this.retryQuery(async () => {
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
        throw error; // Re-throw to trigger retry
      }
    }, `getPendingDoorDashOrders(limit=${limit})`, 3, 1000).catch(() => []);
  }

  async getOrderCount(userId?: number): Promise<number> {
    try {
      const client = await this.pool.connect();
      let query = 'SELECT COUNT(*) as count FROM orders';
      const params: any[] = [];
      
      if (userId !== undefined) {
        query += ' WHERE user_id = $1';
        params.push(userId);
      }
      
      const result = await client.query(query, params);

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
      location_id: row.location_id ? parseInt(row.location_id) : undefined,
      location_name: row.location_name || undefined,
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
      // Check if pool is available
      if (!this.pool) {
        console.error('Database pool not initialized');
        throw new Error('Database connection not available');
      }

      const crypto = require('crypto');
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

      const user = await this.getUserByEmail(email);
      if (!user) {
        console.log(`User not found for email: ${email}`);
        return null;
      }

      let client;
      try {
        client = await this.pool.connect();
        const result = await client.query(
          'SELECT password FROM users WHERE email = $1',
          [email]
        );

        if (result.rows.length === 0) {
          console.log(`No password found for user: ${email}`);
          return false;
        }

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
      } finally {
        if (client) {
          client.release();
        }
      }
    } catch (error: any) {
      console.error('Error verifying password:', error);
      console.error('Error details:', error.message, error.stack);
      // Re-throw the error so the caller can handle it properly
      throw error;
    }
  }

  async getAllUsers(userId?: number): Promise<User[]> {
    try {
      const client = await this.pool.connect();
      
      // If userId is provided, only return users who share at least one merchant with this user
      if (userId !== undefined) {
        // Get current user's merchants (store_ids)
        const userMerchantsResult = await client.query(
          'SELECT DISTINCT store_id FROM merchants WHERE user_id = $1 AND is_active = TRUE',
          [userId]
        );
        const userStoreIds = userMerchantsResult.rows.map(row => row.store_id).filter(Boolean);
        
        if (userStoreIds.length === 0) {
          // If user has no merchants, only return the current user
          const currentUserResult = await client.query(
            'SELECT id, email, full_name, role, created_at FROM users WHERE id = $1',
            [userId]
          );
          client.release();
          return currentUserResult.rows.map(row => ({
            id: row.id,
            email: row.email,
            full_name: row.full_name,
            role: row.role || 'user',
            created_at: row.created_at
          }));
        }
        
        // Get all user_ids that have merchants with the same store_ids
        const sharedUsersResult = await client.query(
          `SELECT DISTINCT user_id 
           FROM merchants 
           WHERE store_id = ANY($1::text[]) 
             AND is_active = TRUE 
             AND user_id IS NOT NULL`,
          [userStoreIds]
        );
        
        const sharedUserIds = sharedUsersResult.rows
          .map(row => row.user_id)
          .filter((id): id is number => id !== null && id !== undefined);
        
        // Always include current user
        if (!sharedUserIds.includes(userId)) {
          sharedUserIds.push(userId);
        }
        
        // Get users with those IDs
        if (sharedUserIds.length === 0) {
          client.release();
          return [];
        }
        
        const result = await client.query(
          `SELECT id, email, full_name, role, created_at 
           FROM users 
           WHERE id = ANY($1::int[]) 
           ORDER BY created_at DESC`,
          [sharedUserIds]
        );
        client.release();
        return result.rows.map(row => ({
          id: row.id,
          email: row.email,
          full_name: row.full_name,
          role: row.role || 'user',
          created_at: row.created_at
        }));
      } else {
        // If no userId provided, return all users (for admin/system use)
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
      }
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
  async getDashboardStats(userId?: number): Promise<any> {
    return this.retryQuery(async () => {
      try {
        const client = await this.pool.connect();

        // Ensure drivers table exists before querying stats (self-heal if init missed)
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

        let orderStatsQuery = `
          SELECT 
            COUNT(*) as total_orders,
            SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_orders,
            SUM(CASE WHEN status NOT IN ('DELIVERED', 'CANCELLED', 'CANCELED') THEN 1 ELSE 0 END) as active_orders,
            SUM(CASE WHEN status IN ('CANCELLED', 'CANCELED') THEN 1 ELSE 0 END) as cancelled_orders,
            SUM(CASE WHEN status NOT IN ('CANCELLED', 'CANCELED') THEN total_price ELSE 0 END) as total_revenue
          FROM orders`;
        const orderParams: any[] = [];
        
        if (userId !== undefined) {
          orderStatsQuery += ' WHERE user_id = $1';
          orderParams.push(userId);
        }

        const orderStats = await client.query(orderStatsQuery, orderParams);

        let recentOrdersQuery = `
          SELECT COUNT(*) as count FROM orders 
          WHERE fetched_at >= NOW() - INTERVAL '24 hours'`;
        const recentParams: any[] = [];
        
        if (userId !== undefined) {
          recentOrdersQuery += ' AND user_id = $1';
          recentParams.push(userId);
        }

        const recentOrders = await client.query(recentOrdersQuery, recentParams);

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
        throw error; // Re-throw to trigger retry
      }
    }, `getDashboardStats(userId=${userId})`, 3, 1000).catch(() => {
      return {
        orders: { total: 0, completed: 0, active: 0, cancelled: 0, recent_24h: 0 },
        revenue: { total: 0 },
        drivers: { total: 0, active: 0 }
      };
    });
  }

  // Merchant methods
  async getAllMerchants(userId?: number): Promise<Merchant[]> {
    try {
      const client = await this.pool.connect();
      let query = `SELECT * FROM merchants WHERE is_active = TRUE`;
      const params: any[] = [];
      
      if (userId !== undefined) {
        // Show ONLY merchants for this user (strict per-user isolation)
        // NULL user_id merchants are NOT shown to any user
        query += ` AND user_id = $1`;
        params.push(userId);
      } else {
        // If no userId provided, show only merchants with NULL user_id (for admin/system use)
        query += ` AND user_id IS NULL`;
      }
      
      query += ` ORDER BY merchant_name`;
      
      const result = await client.query(query, params);
      
      // Get locations for each merchant
      const merchantsWithLocations = await Promise.all(
        result.rows.map(async (m) => {
          const locationsQuery = `SELECT * FROM locations WHERE merchant_id = $1 AND is_active = TRUE ORDER BY location_name`;
          const locationsResult = await client.query(locationsQuery, [m.id]);
          
          const locations = locationsResult.rows.map(l => ({
            id: l.id,
            merchant_id: l.merchant_id,
            location_name: l.location_name,
            store_id: l.store_id,
            address: l.address || undefined,
            phone: l.phone || undefined,
            latitude: l.latitude ? parseFloat(l.latitude) : undefined,
            longitude: l.longitude ? parseFloat(l.longitude) : undefined,
            is_active: l.is_active === true,
            created_at: l.created_at,
            updated_at: l.updated_at
          }));
          
          // For backward compatibility: use first location's store_id, address, phone
          // This allows frontend code that expects merchant.store_id to still work
          const firstLocation = locations.length > 0 ? locations[0] : null;
          
          return {
            id: m.id,
            user_id: m.user_id || undefined,
            merchant_name: m.merchant_name,
            api_key: m.api_key,
            api_url: m.api_url,
            master_key: m.master_key,
            is_active: m.is_active === true,
            // Backward compatibility fields (from first location)
            store_id: firstLocation?.store_id || m.store_id || undefined, // Keep old store_id if exists
            address: firstLocation?.address || m.address || undefined,
            phone: firstLocation?.phone || m.phone || undefined,
            // New locations array
            locations: locations,
            created_at: m.created_at,
            updated_at: m.updated_at
          };
        })
      );
      
      client.release();
      return merchantsWithLocations;
    } catch (error) {
      console.error('Error getting merchants:', error);
      return [];
    }
  }

  async getMerchantByStoreId(storeId: string, userId?: number): Promise<Merchant | null> {
    try {
      const client = await this.pool.connect();
      
      // First, find location by store_id
      let locationQuery = `
        SELECT l.*, m.user_id as merchant_user_id 
        FROM locations l
        INNER JOIN merchants m ON l.merchant_id = m.id
        WHERE l.store_id = $1 AND l.is_active = TRUE
      `;
      const locationParams: any[] = [storeId];
      
      if (userId !== undefined) {
        locationQuery += ` AND m.user_id = $2`;
        locationParams.push(userId);
      } else {
        locationQuery += ` AND m.user_id IS NULL`;
      }
      
      const locationResult = await client.query(locationQuery, locationParams);
      
      if (!locationResult.rows || locationResult.rows.length === 0) {
        // Fallback: try old merchant table directly (for backward compatibility)
        let query = `SELECT * FROM merchants WHERE store_id = $1`;
        const params: any[] = [storeId];
        
        if (userId !== undefined) {
          query += ` AND user_id = $2`;
          params.push(userId);
        } else {
          query += ` AND user_id IS NULL`;
        }
        
        const result = await client.query(query, params);
        client.release();

        if (!result.rows || result.rows.length === 0) return null;

        const merchant = result.rows[0];
        // Get first location for backward compatibility fields
        const locationsQuery = `SELECT * FROM locations WHERE merchant_id = $1 AND is_active = TRUE ORDER BY location_name LIMIT 1`;
        const locationsResult = await client.query(locationsQuery, [merchant.id]);
        const firstLocation = locationsResult.rows.length > 0 ? locationsResult.rows[0] : null;
        
        return {
          id: merchant.id,
          user_id: merchant.user_id || undefined,
          merchant_name: merchant.merchant_name,
          api_key: merchant.api_key,
          api_url: merchant.api_url,
          master_key: merchant.master_key,
          is_active: merchant.is_active === true,
          // Backward compatibility fields
          store_id: firstLocation?.store_id || merchant.store_id || undefined,
          address: firstLocation?.address || merchant.address || undefined,
          phone: firstLocation?.phone || merchant.phone || undefined,
          created_at: merchant.created_at,
          updated_at: merchant.updated_at
        };
      }
      
      // Get merchant from location
      const location = locationResult.rows[0];
      const merchantQuery = `SELECT * FROM merchants WHERE id = $1`;
      const merchantResult = await client.query(merchantQuery, [location.merchant_id]);
      
      if (!merchantResult.rows || merchantResult.rows.length === 0) {
        client.release();
        return null;
      }
      
      // Get all locations for this merchant
      const locationsQuery = `SELECT * FROM locations WHERE merchant_id = $1 AND is_active = TRUE ORDER BY location_name`;
      const locationsResult = await client.query(locationsQuery, [location.merchant_id]);
      
      client.release();
      
      const merchant = merchantResult.rows[0];
      const locations = locationsResult.rows.map(l => ({
        id: l.id,
        merchant_id: l.merchant_id,
        location_name: l.location_name,
        store_id: l.store_id,
        address: l.address || undefined,
        phone: l.phone || undefined,
        latitude: l.latitude ? parseFloat(l.latitude) : undefined,
        longitude: l.longitude ? parseFloat(l.longitude) : undefined,
        is_active: l.is_active === true,
        created_at: l.created_at,
        updated_at: l.updated_at
      }));
      
      // Get first location for backward compatibility
      const firstLocation = locations.length > 0 ? locations[0] : null;
      
      return {
        id: merchant.id,
        user_id: merchant.user_id || undefined,
        merchant_name: merchant.merchant_name,
        api_key: merchant.api_key,
        api_url: merchant.api_url,
        master_key: merchant.master_key,
        is_active: merchant.is_active === true,
        locations: locations,
        // Backward compatibility fields (from first location)
        store_id: firstLocation?.store_id || undefined,
        address: firstLocation?.address || undefined,
        phone: firstLocation?.phone || undefined,
        created_at: merchant.created_at,
        updated_at: merchant.updated_at
      };
    } catch (error) {
      console.error('Error getting merchant:', error);
      return null;
    }
  }

  async getMerchantByApiKey(apiKey: string): Promise<Merchant | null> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        `SELECT * FROM merchants WHERE api_key = $1 AND is_active = TRUE`,
        [apiKey]
      );
      client.release();

      if (!result.rows || result.rows.length === 0) return null;

      const merchant = result.rows[0];
      // Get first location for backward compatibility fields
      const locationsQuery = `SELECT * FROM locations WHERE merchant_id = $1 AND is_active = TRUE ORDER BY location_name LIMIT 1`;
      const locationsResult = await client.query(locationsQuery, [merchant.id]);
      const firstLocation = locationsResult.rows.length > 0 ? locationsResult.rows[0] : null;
      
      return {
        id: merchant.id,
        user_id: merchant.user_id || undefined,
        merchant_name: merchant.merchant_name,
        api_key: merchant.api_key,
        api_url: merchant.api_url,
        master_key: merchant.master_key,
        is_active: merchant.is_active === true,
        // Backward compatibility fields (from first location or merchant table)
        store_id: firstLocation?.store_id || merchant.store_id || undefined,
        address: firstLocation?.address || merchant.address || undefined,
        phone: firstLocation?.phone || merchant.phone || undefined,
        created_at: merchant.created_at,
        updated_at: merchant.updated_at
      };
    } catch (error) {
      console.error('Error getting merchant by API key:', error);
      return null;
    }
  }

  async insertOrUpdateMerchant(merchant: Partial<Merchant>): Promise<Merchant | null> {
    try {
      // store_id is optional now (should be in locations), but keep for backward compatibility
      // If store_id is provided, we'll use it for lookup/creation
      if (merchant.user_id === undefined || merchant.user_id === null) {
        throw new Error('user_id is required');
      }

      // For inserts, merchant_name is required
      if (!merchant.merchant_name && !merchant.id) {
        throw new Error('merchant_name is required for new merchants');
      }

      const client = await this.pool.connect();

      // Ensure store_id is nullable for backward compatibility (older DBs may still enforce NOT NULL)
      try {
        await client.query(`
          ALTER TABLE merchants
          ALTER COLUMN store_id DROP NOT NULL
        `);
      } catch (e: any) {
        // 42701: NOT NULL already dropped; ignore other expected states
        if (e.code !== '42701') {
          console.log('   Note: could not drop NOT NULL on merchants.store_id');
        }
      }

      // Check if merchant exists (by id if provided, or by store_id for backward compatibility)
      let existing: Merchant | null = null;
      if (merchant.id) {
        const existingQuery = `SELECT * FROM merchants WHERE id = $1 AND user_id = $2`;
        const existingResult = await client.query(existingQuery, [merchant.id, merchant.user_id]);
        if (existingResult.rows.length > 0) {
          existing = await this.getMerchantByStoreId(existingResult.rows[0].store_id || '', merchant.user_id);
        }
      } else if (merchant.store_id) {
        existing = await this.getMerchantByStoreId(merchant.store_id, merchant.user_id);
      }

      if (existing) {
        // Update existing merchant - use id for WHERE clause
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
          values.push(existing.id);
          values.push(merchant.user_id);
          await client.query(`
            UPDATE merchants 
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
          `, values);
        }
      } else {
        // Insert new merchant (store_id is optional now)
        const insertResult = await client.query(`
          INSERT INTO merchants (user_id, store_id, merchant_name, api_key, api_url, master_key, phone, address, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `, [
          merchant.user_id,
          merchant.store_id || null,
          merchant.merchant_name!.trim(),
          merchant.api_key || null,
          merchant.api_url || null,
          merchant.master_key || null,
          (merchant as any).phone || null,
          (merchant as any).address || null,
          merchant.is_active !== undefined ? merchant.is_active : true
        ]);
        
        // Store the new merchant ID for retrieval
        const newMerchantId = insertResult.rows[0].id;
        
        // Get the newly created merchant by ID (more reliable than by store_id)
        const getQuery = `SELECT * FROM merchants WHERE id = $1`;
        const getResult = await client.query(getQuery, [newMerchantId]);
        client.release();
        
        // Declare updated variable before use
        let updated: Merchant | null = null;
        
        if (getResult.rows.length > 0) {
          const newMerchant = getResult.rows[0];
          // Get locations for this merchant (location might be created after merchant, so check both)
          const locationsQuery = `SELECT * FROM locations WHERE merchant_id = $1 ORDER BY location_name LIMIT 1`;
          const locationsResult = await client.query(locationsQuery, [newMerchant.id]);
          const firstLocation = locationsResult.rows.length > 0 ? locationsResult.rows[0] : null;
          
          updated = {
            id: newMerchant.id,
            user_id: newMerchant.user_id || undefined,
            merchant_name: newMerchant.merchant_name,
            api_key: newMerchant.api_key,
            api_url: newMerchant.api_url,
            master_key: newMerchant.master_key,
            is_active: newMerchant.is_active === true,
            // Prioritize location store_id, but fallback to merchant.store_id if location not created yet
            store_id: firstLocation?.store_id || newMerchant.store_id || undefined,
            address: firstLocation?.address || newMerchant.address || undefined,
            phone: firstLocation?.phone || newMerchant.phone || undefined,
            created_at: newMerchant.created_at,
            updated_at: newMerchant.updated_at
          };
        }
        return updated;
      }
      
      // Get updated merchant (by id if we have it, or by store_id)
      let updated: Merchant | null = null;
      if (existing) {
        client.release();
        updated = await this.getMerchantByStoreId(existing.store_id || '', merchant.user_id);
      } else if (merchant.store_id) {
        client.release();
        // For updates, try to get by store_id, but also check by merchant ID if we have it
        updated = await this.getMerchantByStoreId(merchant.store_id, merchant.user_id);
      } else {
        // Get by user_id and merchant_name (for new merchants without store_id)
        const getQuery = `SELECT * FROM merchants WHERE user_id = $1 AND merchant_name = $2 ORDER BY id DESC LIMIT 1`;
        const getResult = await client.query(getQuery, [merchant.user_id, merchant.merchant_name!.trim()]);
        if (getResult.rows.length > 0) {
          const newMerchant = getResult.rows[0];
          // Get locations for this merchant
          const locationsQuery = `SELECT * FROM locations WHERE merchant_id = $1 ORDER BY location_name LIMIT 1`;
          const locationsResult = await client.query(locationsQuery, [newMerchant.id]);
          const firstLocation = locationsResult.rows.length > 0 ? locationsResult.rows[0] : null;
          
          updated = {
            id: newMerchant.id,
            user_id: newMerchant.user_id || undefined,
            merchant_name: newMerchant.merchant_name,
            api_key: newMerchant.api_key,
            api_url: newMerchant.api_url,
            master_key: newMerchant.master_key,
            is_active: newMerchant.is_active === true,
            store_id: firstLocation?.store_id || newMerchant.store_id || undefined,
            address: firstLocation?.address || newMerchant.address || undefined,
            phone: firstLocation?.phone || newMerchant.phone || undefined,
            created_at: newMerchant.created_at,
            updated_at: newMerchant.updated_at
          };
        }
        client.release();
      }
      
      if (updated) {
        console.log(`Merchant ${updated.id} saved: merchant_name="${updated.merchant_name}", store_id="${updated.store_id || 'N/A'}", user_id="${updated.user_id}"`);
      }
      return updated;
    } catch (error) {
      console.error('Error inserting/updating merchant:', error);
      return null;
    }
  }

  async deleteMerchant(storeId: string, userId?: number): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      // Find merchant by store_id (via location or directly)
      const merchant = await this.getMerchantByStoreId(storeId, userId);
      if (!merchant) {
        client.release();
        return false;
      }
      
      // Delete merchant (locations will be cascade deleted)
      let query = `DELETE FROM merchants WHERE id = $1`;
      const params: any[] = [merchant.id];
      
      if (userId !== undefined) {
        query += ` AND user_id = $2`;
        params.push(userId);
      }
      
      const result = await client.query(query, params);
      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting merchant:', error);
      return false;
    }
  }

  async deleteMerchantById(merchantId: number, userId?: number): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      let query = `DELETE FROM merchants WHERE id = $1`;
      const params: any[] = [merchantId];
      if (userId !== undefined) {
        query += ` AND user_id = $2`;
        params.push(userId);
      } else {
        query += ` AND user_id IS NULL`;
      }
      const result = await client.query(query, params);
      client.release();
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting merchant by id:', error);
      return false;
    }
  }

  // Location methods
  async getAllLocations(merchantId: number, userId?: number): Promise<Location[]> {
    let client;
    try {
      client = await this.pool.connect();
      
      // Verify merchant belongs to user (if userId is provided)
      if (userId !== undefined && userId !== null) {
        const merchantQuery = `SELECT id FROM merchants WHERE id = $1 AND user_id = $2`;
        const merchantCheck = await client.query(merchantQuery, [merchantId, userId]);
        if (!merchantCheck.rows || merchantCheck.rows.length === 0) {
          client.release();
          console.log(`Merchant ${merchantId} not found or doesn't belong to user ${userId}`);
          return [];
        }
      } else {
        // If no userId provided, just check if merchant exists
        const merchantQuery = `SELECT id FROM merchants WHERE id = $1`;
        const merchantCheck = await client.query(merchantQuery, [merchantId]);
        if (!merchantCheck.rows || merchantCheck.rows.length === 0) {
          client.release();
          console.log(`Merchant ${merchantId} not found`);
          return [];
        }
      }
      
      const result = await client.query(
        `SELECT * FROM locations WHERE merchant_id = $1 ORDER BY location_name`,
        [merchantId]
      );
      
      client.release();
      
      return result.rows.map(l => ({
        id: l.id,
        merchant_id: l.merchant_id,
        location_name: l.location_name,
        store_id: l.store_id,
        address: l.address || undefined,
        phone: l.phone || undefined,
        latitude: l.latitude ? parseFloat(String(l.latitude)) : undefined,
        longitude: l.longitude ? parseFloat(String(l.longitude)) : undefined,
        is_active: l.is_active === true,
        created_at: l.created_at,
        updated_at: l.updated_at
      }));
    } catch (error: any) {
      if (client) {
        client.release();
      }
      console.error(`Error getting locations for merchant ${merchantId}:`, error?.message || error);
      // Return empty array instead of throwing to prevent 500 errors
      // The endpoint will handle the empty array gracefully
      return [];
    }
  }

  async getLocationByStoreId(storeId: string, userId?: number): Promise<Location | null> {
    try {
      const client = await this.pool.connect();
      
      let query = `
        SELECT l.* 
        FROM locations l
        INNER JOIN merchants m ON l.merchant_id = m.id
        WHERE l.store_id = $1 AND l.is_active = TRUE
      `;
      const params: any[] = [storeId];
      
      if (userId !== undefined) {
        query += ` AND m.user_id = $2`;
        params.push(userId);
      } else {
        query += ` AND m.user_id IS NULL`;
      }
      
      const result = await client.query(query, params);
      client.release();

      if (!result.rows || result.rows.length === 0) return null;

      const location = result.rows[0];
      return {
        id: location.id,
        merchant_id: location.merchant_id,
        location_name: location.location_name,
        store_id: location.store_id,
        address: location.address || undefined,
        phone: location.phone || undefined,
        latitude: location.latitude ? parseFloat(location.latitude) : undefined,
        longitude: location.longitude ? parseFloat(location.longitude) : undefined,
        is_active: location.is_active === true,
        created_at: location.created_at,
        updated_at: location.updated_at
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  }

  async getLocationById(locationId: number, userId?: number): Promise<Location | null> {
    try {
      const client = await this.pool.connect();
      
      let query = `
        SELECT l.* 
        FROM locations l
        INNER JOIN merchants m ON l.merchant_id = m.id
        WHERE l.id = $1
      `;
      const params: any[] = [locationId];
      
      if (userId !== undefined) {
        query += ` AND m.user_id = $2`;
        params.push(userId);
      } else {
        query += ` AND m.user_id IS NULL`;
      }
      
      const result = await client.query(query, params);
      client.release();

      if (!result.rows || result.rows.length === 0) return null;

      const location = result.rows[0];
      return {
        id: location.id,
        merchant_id: location.merchant_id,
        location_name: location.location_name,
        store_id: location.store_id,
        address: location.address || undefined,
        phone: location.phone || undefined,
        latitude: location.latitude ? parseFloat(location.latitude) : undefined,
        longitude: location.longitude ? parseFloat(location.longitude) : undefined,
        is_active: location.is_active === true,
        created_at: location.created_at,
        updated_at: location.updated_at
      };
    } catch (error) {
      console.error('Error getting location by id:', error);
      return null;
    }
  }

  async insertOrUpdateLocation(location: Partial<Location>, userId?: number): Promise<Location | null> {
    let client: PoolClient | null = null;
    try {
      if (!location.merchant_id) {
        throw new Error('merchant_id is required');
      }
      if (!location.store_id) {
        throw new Error('store_id is required');
      }
      if (!location.location_name) {
        throw new Error('location_name is required');
      }

      client = await this.pool.connect();
      
      // Verify merchant belongs to user (or is system/global)
      const merchantCheckParams: any[] = [location.merchant_id];
      let merchantCheckQuery = `SELECT id FROM merchants WHERE id = $1`;
      if (userId !== undefined) {
        merchantCheckQuery += ` AND user_id = $2`;
        merchantCheckParams.push(userId);
      } else {
        merchantCheckQuery += ` AND user_id IS NULL`;
      }
      const merchantCheck = await client.query(merchantCheckQuery, merchantCheckParams);
      if (!merchantCheck.rows || merchantCheck.rows.length === 0) {
        throw new Error('Merchant not found for user');
      }

      // Check if location already exists
      const existing = await client.query(
        `SELECT * FROM locations WHERE merchant_id = $1 AND store_id = $2`,
        [location.merchant_id, location.store_id]
      );

      if (existing.rows && existing.rows.length > 0) {
        // Update existing location
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (location.location_name !== undefined) {
          updates.push(`location_name = $${paramIndex++}`);
          values.push(location.location_name.trim());
        }
        if (location.address !== undefined) {
          updates.push(`address = $${paramIndex++}`);
          values.push(location.address || null);
        }
        if (location.phone !== undefined) {
          updates.push(`phone = $${paramIndex++}`);
          values.push(location.phone || null);
        }
        if (location.latitude !== undefined) {
          updates.push(`latitude = $${paramIndex++}`);
          values.push(location.latitude || null);
        }
        if (location.longitude !== undefined) {
          updates.push(`longitude = $${paramIndex++}`);
          values.push(location.longitude || null);
        }
        if (location.is_active !== undefined) {
          updates.push(`is_active = $${paramIndex++}`);
          values.push(location.is_active);
        }

        updates.push(`updated_at = NOW()`);

        if (updates.length > 1) {
          values.push(location.merchant_id);
          values.push(location.store_id);
          await client.query(`
            UPDATE locations 
            SET ${updates.join(', ')}
            WHERE merchant_id = $${paramIndex++} AND store_id = $${paramIndex}
          `, values);
        }
      } else {
        // Insert new location
        await client.query(`
          INSERT INTO locations (merchant_id, location_name, store_id, address, phone, latitude, longitude, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          location.merchant_id,
          location.location_name.trim(),
          location.store_id,
          location.address || null,
          location.phone || null,
          location.latitude || null,
          location.longitude || null,
          location.is_active !== undefined ? location.is_active : true
        ]);
      }

      // Get the newly created/updated location
      const getLocationQuery = `SELECT * FROM locations WHERE merchant_id = $1 AND store_id = $2`;
      const getLocationResult = await client.query(getLocationQuery, [location.merchant_id, location.store_id]);
      client.release();
      
      if (getLocationResult.rows && getLocationResult.rows.length > 0) {
        const loc = getLocationResult.rows[0];
        return {
          id: loc.id,
          merchant_id: loc.merchant_id,
          location_name: loc.location_name,
          store_id: loc.store_id,
          address: loc.address || undefined,
          phone: loc.phone || undefined,
          latitude: loc.latitude ? parseFloat(String(loc.latitude)) : undefined,
          longitude: loc.longitude ? parseFloat(String(loc.longitude)) : undefined,
          is_active: loc.is_active === true,
          created_at: loc.created_at,
          updated_at: loc.updated_at
        };
      }
      
      // Fallback: try getLocationByStoreId
      return await this.getLocationByStoreId(location.store_id, userId);
    } catch (error: any) {
      if (client) {
        try { client.release(); } catch { /* ignore */ }
      }
      console.error(`Error inserting/updating location for merchant ${location.merchant_id}:`, error?.message || error);
      if (error.code === '23505') {
        throw new Error('Location already exists for this store_id and merchant');
      }
      if (error.code === '23503') {
        throw new Error('Merchant not found for user');
      }
      throw error;
    } finally {
      if (client) {
        try { client.release(); } catch { /* ignore */ }
      }
    }
  }

  async deleteLocation(locationId: number, userId?: number): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      
      // Verify location belongs to user's merchant
      const location = await this.getLocationById(locationId, userId);
      if (!location) {
        client.release();
        return false;
      }
      
      const result = await client.query(
        `DELETE FROM locations WHERE id = $1`,
        [locationId]
      );
      
      client.release();
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting location:', error);
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
