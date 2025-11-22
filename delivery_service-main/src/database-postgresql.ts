import { Pool, QueryResult } from 'pg';
import chalk from 'chalk';

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

  constructor(config?: Partial<PostgreSQLConfig> | string) {
    // Support DATABASE_URL format
    if (typeof config === 'string') {
      // Parse DATABASE_URL
      const url = new URL(config);
      this.config = {
        host: url.hostname,
        port: parseInt(url.port || '5432'),
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1), // Remove leading /
        ssl: url.searchParams.get('ssl') === 'true' || process.env.DB_SSL === 'true'
      };
    } else {
      // Get config from environment or use provided config
      this.config = {
        host: config?.host || process.env.DB_HOST || 'localhost',
        port: config?.port || parseInt(process.env.DB_PORT || '5432'),
        user: config?.user || process.env.DB_USER || 'postgres',
        password: config?.password || process.env.DB_PASSWORD || '',
        database: config?.database || process.env.DB_NAME || 'gloriafood_orders',
        ssl: config?.ssl !== undefined ? config.ssl : (process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production')
      };
    }

    // Create connection pool
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: 10, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    this.pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });

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
      await client.query(`CREATE INDEX IF NOT EXISTS idx_gloriafood_order_id ON orders(gloriafood_order_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_store_id ON orders(store_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_status ON orders(status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_fetched_at ON orders(fetched_at)`);

      // Add missing columns for existing installations
      try {
        await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS doordash_tracking_url TEXT`);
      } catch (e: any) {
        // Column may already exist - ignore
      }

      client.release();
      console.log('✅ Database table initialized successfully!');
    } catch (error: any) {
      console.error('❌ Error initializing database tables:', error);
      console.error(`   Error message: ${error.message}`);
      if (error.code === 'ECONNREFUSED') {
        console.error('   ⚠️  Cannot connect to PostgreSQL. Check your connection settings!');
      } else if (error.code === '3D000') {
        console.error(`   ⚠️  Database "${this.config.database}" does not exist. Please create it first!`);
      } else if (error.code === '28P01') {
        console.error('   ⚠️  Authentication failed. Check your PostgreSQL username and password!');
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
      
      return result.rows[0] as Order;
    } catch (error: any) {
      console.error('❌ Error inserting order to PostgreSQL:', error.message);
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

  // Comprehensive extraction methods matching MySQL version
  private extractCustomerName(orderData: any): string {
    // Try root level client_* fields first (GloriaFood format)
    if (orderData.client_first_name || orderData.client_last_name) {
      const name = `${orderData.client_first_name || ''} ${orderData.client_last_name || ''}`.trim();
      if (name) return name;
    }
    if (orderData.client_name && String(orderData.client_name).trim()) return String(orderData.client_name).trim();
    
    // Try client object (nested format)
    if (orderData.client) {
      if (orderData.client.first_name || orderData.client.last_name) {
        const name = `${orderData.client.first_name || ''} ${orderData.client.last_name || ''}`.trim();
        if (name) return name;
      }
      if (orderData.client.name) return String(orderData.client.name);
      if (orderData.client.full_name) return String(orderData.client.full_name);
      if (orderData.client.firstName) return String(orderData.client.firstName);
      if (orderData.client.lastName) return String(orderData.client.lastName);
    }
    
    // Try customer object
    if (orderData.customer) {
      if (orderData.customer.name) return String(orderData.customer.name);
      if (orderData.customer.first_name || orderData.customer.last_name) {
        const name = `${orderData.customer.first_name || ''} ${orderData.customer.last_name || ''}`.trim();
        if (name) return name;
      }
      if (orderData.customer.full_name) return String(orderData.customer.full_name);
      if (orderData.customer.firstName || orderData.customer.lastName) {
        const name = `${orderData.customer.firstName || ''} ${orderData.customer.lastName || ''}`.trim();
        if (name) return name;
      }
    }
    
    // Try root level fields (check for string and not empty)
    if (orderData.customer_name && String(orderData.customer_name).trim()) return String(orderData.customer_name).trim();
    if (orderData.name && String(orderData.name).trim()) return String(orderData.name).trim();
    if (orderData.first_name || orderData.last_name) {
      const name = `${orderData.first_name || ''} ${orderData.last_name || ''}`.trim();
      if (name) return name;
    }
    
    // Try nested in order object (if webhook structure wraps it)
    if (orderData.order?.client?.first_name || orderData.order?.client?.last_name) {
      const name = `${orderData.order.client.first_name || ''} ${orderData.order.client.last_name || ''}`.trim();
      if (name) return name;
    }
    if (orderData.order?.customer?.name) return String(orderData.order.customer.name);
    if (orderData.order?.customer_name) return String(orderData.order.customer_name);
    if (orderData.order?.client?.name) return String(orderData.order.client.name);
    
    return 'Unknown';
  }

  private extractCustomerPhone(orderData: any): string {
    // Try root level client_* fields first (GloriaFood format)
    if (orderData.client_phone && String(orderData.client_phone).trim()) return String(orderData.client_phone).trim();
    if (orderData.client_phone_number && String(orderData.client_phone_number).trim()) return String(orderData.client_phone_number).trim();
    
    // Try client object (nested format)
    if (orderData.client?.phone && String(orderData.client.phone).trim()) return String(orderData.client.phone).trim();
    if (orderData.client?.phone_number && String(orderData.client.phone_number).trim()) return String(orderData.client.phone_number).trim();
    if (orderData.client?.mobile && String(orderData.client.mobile).trim()) return String(orderData.client.mobile).trim();
    if (orderData.client?.tel && String(orderData.client.tel).trim()) return String(orderData.client.tel).trim();
    if (orderData.client?.telephone && String(orderData.client.telephone).trim()) return String(orderData.client.telephone).trim();
    
    // Try customer object
    if (orderData.customer?.phone && String(orderData.customer.phone).trim()) return String(orderData.customer.phone).trim();
    if (orderData.customer?.phone_number && String(orderData.customer.phone_number).trim()) return String(orderData.customer.phone_number).trim();
    if (orderData.customer?.mobile && String(orderData.customer.mobile).trim()) return String(orderData.customer.mobile).trim();
    if (orderData.customer?.tel && String(orderData.customer.tel).trim()) return String(orderData.customer.tel).trim();
    
    // Try root level fields
    if (orderData.customer_phone && String(orderData.customer_phone).trim()) return String(orderData.customer_phone).trim();
    if (orderData.phone && String(orderData.phone).trim()) return String(orderData.phone).trim();
    if (orderData.phone_number && String(orderData.phone_number).trim()) return String(orderData.phone_number).trim();
    if (orderData.mobile && String(orderData.mobile).trim()) return String(orderData.mobile).trim();
    if (orderData.tel && String(orderData.tel).trim()) return String(orderData.tel).trim();
    
    // Try nested in order object
    if (orderData.order?.client?.phone && String(orderData.order.client.phone).trim()) return String(orderData.order.client.phone).trim();
    if (orderData.order?.customer?.phone && String(orderData.order.customer.phone).trim()) return String(orderData.order.customer.phone).trim();
    if (orderData.order?.phone && String(orderData.order.phone).trim()) return String(orderData.order.phone).trim();
    
    return '';
  }

  private extractCustomerEmail(orderData: any): string {
    // Try root level client_* fields first (GloriaFood format)
    if (orderData.client_email && String(orderData.client_email).trim()) return String(orderData.client_email).trim();
    
    // Try client object (nested format)
    if (orderData.client?.email && String(orderData.client.email).trim()) return String(orderData.client.email).trim();
    if (orderData.client?.email_address && String(orderData.client.email_address).trim()) return String(orderData.client.email_address).trim();
    
    // Try customer object
    if (orderData.customer?.email && String(orderData.customer.email).trim()) return String(orderData.customer.email).trim();
    if (orderData.customer?.email_address && String(orderData.customer.email_address).trim()) return String(orderData.customer.email_address).trim();
    
    // Try root level fields
    if (orderData.customer_email && String(orderData.customer_email).trim()) return String(orderData.customer_email).trim();
    if (orderData.email && String(orderData.email).trim()) return String(orderData.email).trim();
    if (orderData.email_address && String(orderData.email_address).trim()) return String(orderData.email_address).trim();
    
    // Try nested in order object
    if (orderData.order?.client?.email && String(orderData.order.client.email).trim()) return String(orderData.order.client.email).trim();
    if (orderData.order?.customer?.email && String(orderData.order.customer.email).trim()) return String(orderData.order.customer.email).trim();
    if (orderData.order?.email && String(orderData.order.email).trim()) return String(orderData.order.email).trim();
    
    return '';
  }

  private extractDeliveryAddress(orderData: any): string {
    if (orderData.delivery?.address) {
      const addr = orderData.delivery.address;
      return [
        addr.street || addr.address_line_1,
        addr.city,
        addr.state,
        addr.zip || addr.postal_code,
        addr.country
      ].filter(Boolean).join(', ');
    }
    if (orderData.delivery_address) return orderData.delivery_address;
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
      return result.rows.length > 0 ? result.rows[0] as Order : null;
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
      return result.rows as Order[];
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
      return result.rows as Order[];
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
      return result.rows as Order[];
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
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      console.error('Error getting order count:', error);
      return 0;
    }
  }

  // User authentication methods
  async createUser(email: string, password: string, fullName: string): Promise<any> {
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
      
      await client.query(`CREATE INDEX IF NOT EXISTS idx_email ON users(email)`);
      
      const result = await client.query(`
        INSERT INTO users (email, password, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, role
      `, [email, hashedPassword, fullName]);
      
      client.release();
      
      return {
        id: result.rows[0].id,
        email: result.rows[0].email,
        full_name: result.rows[0].full_name,
        role: result.rows[0].role || 'user'
      };
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.code === '23505') { // Unique violation
        throw new Error('Email already exists');
      }
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<any | null> {
    try {
      const client = await this.pool.connect();
      const result = await client.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      client.release();
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async verifyPassword(email: string, password: string): Promise<any | null> {
    try {
      const crypto = require('crypto');
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
      
      const user = await this.getUserByEmail(email);
      if (!user) {
        return null;
      }
      
      if (user.password === hashedPassword) {
        return {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
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
      
      await client.query(`CREATE INDEX IF NOT EXISTS idx_status ON drivers(status)`);
      
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
      
      await client.query(`CREATE INDEX IF NOT EXISTS idx_order_id ON reviews(order_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_driver_id ON reviews(driver_id)`);
      
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
      
      const orderStatsResult = await client.query(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN status NOT IN ('DELIVERED', 'CANCELLED') THEN 1 ELSE 0 END) as active_orders,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(total_price) as total_revenue
        FROM orders
      `);
      
      const recentOrdersResult = await client.query(`
        SELECT COUNT(*) as count FROM orders 
        WHERE fetched_at >= NOW() - INTERVAL '24 hours'
      `);
      
      const driverStatsResult = await client.query(`
        SELECT 
          COUNT(*) as total_drivers,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_drivers
        FROM drivers
      `);
      
      client.release();
      
      const orderStats = orderStatsResult.rows[0];
      const recentOrders = recentOrdersResult.rows[0];
      const driverStats = driverStatsResult.rows[0];
      
      return {
        orders: {
          total: parseInt(orderStats?.total_orders || '0'),
          completed: parseInt(orderStats?.completed_orders || '0'),
          active: parseInt(orderStats?.active_orders || '0'),
          cancelled: parseInt(orderStats?.cancelled_orders || '0'),
          recent_24h: parseInt(recentOrders?.count || '0')
        },
        revenue: {
          total: parseFloat(orderStats?.total_revenue || '0')
        },
        drivers: {
          total: parseInt(driverStats?.total_drivers || '0'),
          active: parseInt(driverStats?.active_drivers || '0')
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

  async close(): Promise<void> {
    await this.pool.end();
  }
}

