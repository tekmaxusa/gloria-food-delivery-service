import { Pool, PoolClient } from 'pg';
import chalk from 'chalk';
import { Merchant, User } from './database-factory';

export interface Order {
  id: string;
  gloriafood_order_id: string;
  store_id: string;
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
      this.pool = new Pool({
        connectionString: databaseUrl,
        ssl: databaseUrl.includes('sslmode=require') || databaseUrl.includes('ssl=true') 
          ? { rejectUnauthorized: false } 
          : false,
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
      // Get config from environment or use defaults
      let host = config?.host || process.env.DB_HOST || 'localhost';
      
      // Fix Render PostgreSQL hostname if incomplete (missing domain)
      // Render hostnames like "dpg-xxxxx-a" need ".render.com" suffix
      if (host && host.startsWith('dpg-') && !host.includes('.')) {
        console.log(chalk.yellow(`   ⚠️  Incomplete hostname detected: ${host}`));
        console.log(chalk.yellow(`   💡 Adding .render.com suffix for Render PostgreSQL...`));
        host = `${host}.render.com`;
        console.log(chalk.green(`   ✅ Using hostname: ${host}`));
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
    try {
      console.log('🔌 Connecting to PostgreSQL database...');
      console.log(`   Host: ${this.config.host}:${this.config.port}`);
      console.log(`   Database: ${this.config.database}`);
      console.log(`   User: ${this.config.user}`);
      
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          sent_to_doordash BOOLEAN DEFAULT FALSE,
          doordash_order_id VARCHAR(255),
          doordash_sent_at TIMESTAMP,
          doordash_tracking_url TEXT
        )
      `);

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

      // Create merchants table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS merchants (
          id SERIAL PRIMARY KEY,
          store_id VARCHAR(255) UNIQUE NOT NULL,
          merchant_name VARCHAR(255) NOT NULL,
          api_key VARCHAR(500),
          api_url VARCHAR(500),
          master_key VARCHAR(500),
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

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
    } catch (error: any) {
      console.error('❌ Error initializing database tables:', error);
      console.error(`   Error message: ${error.message}`);
      if (error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo ENOTFOUND')) {
        console.error('   ⚠️  Cannot resolve database hostname!');
        console.error('   💡 For Render PostgreSQL, use one of these options:');
        console.error('      Option 1 (Recommended): Set DATABASE_URL environment variable');
        console.error('         DATABASE_URL=postgresql://user:password@host:5432/dbname');
        console.error('      Option 2: Use full hostname with .render.com suffix');
        console.error('         DB_HOST=dpg-xxxxx-a.render.com');
        console.error('      Option 3: Use connection pooler hostname from Render dashboard');
        console.error('   📝 Check your Render PostgreSQL dashboard for the correct connection details.');
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.error('   ⚠️  Cannot connect to PostgreSQL. Check your connection settings!');
        console.error('   ⚠️  Make sure the database host is accessible and credentials are correct.');
      } else if (error.code === '3D000') {
        console.error(`   ⚠️  Database "${this.config.database}" does not exist. Please create it first!`);
      } else if (error.code === '28P01') {
        console.error('   ⚠️  Access denied. Check your PostgreSQL username and password!');
      }
      throw error;
    }
  }

  async insertOrUpdateOrder(orderData: any): Promise<Order | null> {
    try {
      const customerName = this.extractCustomerName(orderData);
      const customerPhone = this.extractCustomerPhone(orderData);
      const customerEmail = this.extractCustomerEmail(orderData);
      const deliveryAddress = this.extractDeliveryAddress(orderData);
      
      const order: Order = {
        id: '',
        gloriafood_order_id: orderData.id?.toString() || orderData.order_id?.toString() || '',
        store_id: orderData.store_id?.toString() || orderData.restaurant_id?.toString() || '',
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
        created_at: orderData.created_at || orderData.order_date || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        fetched_at: new Date().toISOString()
      };

      const client = await this.pool.connect();
      
      const result = await client.query(`
        INSERT INTO orders (
          gloriafood_order_id, store_id, customer_name, customer_phone,
          customer_email, delivery_address, total_price, currency,
          status, order_type, items, raw_data, created_at, updated_at, fetched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (gloriafood_order_id) DO UPDATE SET
          customer_name = EXCLUDED.customer_name,
          customer_phone = EXCLUDED.customer_phone,
          customer_email = EXCLUDED.customer_email,
          delivery_address = EXCLUDED.delivery_address,
          status = EXCLUDED.status,
          total_price = EXCLUDED.total_price,
          order_type = EXCLUDED.order_type,
          items = EXCLUDED.items,
          updated_at = EXCLUDED.updated_at,
          fetched_at = EXCLUDED.fetched_at,
          raw_data = EXCLUDED.raw_data
        RETURNING *
      `, [
        order.gloriafood_order_id,
        order.store_id,
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
      
      return null;
    } catch (error) {
      console.error('Error verifying password:', error);
      return null;
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
          SUM(CASE WHEN status NOT IN ('DELIVERED', 'CANCELLED') THEN 1 ELSE 0 END) as active_orders,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(total_price) as total_revenue
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
      if (!merchant.store_id || !merchant.merchant_name) {
        throw new Error('store_id and merchant_name are required');
      }

      const client = await this.pool.connect();
      const existing = await this.getMerchantByStoreId(merchant.store_id);
      
      if (existing) {
        // Update existing merchant
        await client.query(`
          UPDATE merchants 
          SET merchant_name = $1,
              api_key = COALESCE($2, api_key),
              api_url = COALESCE($3, api_url),
              master_key = COALESCE($4, master_key),
              is_active = COALESCE($5, is_active),
              updated_at = NOW()
          WHERE store_id = $6
        `, [
          merchant.merchant_name,
          merchant.api_key || null,
          merchant.api_url || null,
          merchant.master_key || null,
          merchant.is_active !== undefined ? merchant.is_active : null,
          merchant.store_id
        ]);
      } else {
        // Insert new merchant
        await client.query(`
          INSERT INTO merchants (store_id, merchant_name, api_key, api_url, master_key, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          merchant.store_id,
          merchant.merchant_name,
          merchant.api_key || null,
          merchant.api_url || null,
          merchant.master_key || null,
          merchant.is_active !== undefined ? merchant.is_active : true
        ]);
      }
      
      client.release();
      return await this.getMerchantByStoreId(merchant.store_id);
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
