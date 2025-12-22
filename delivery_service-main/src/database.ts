import Database from 'better-sqlite3';
import { Merchant } from './database-factory';

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
  sent_to_doordash?: number; // 0 or 1
  doordash_order_id?: string;
  doordash_sent_at?: string;
  doordash_tracking_url?: string;
}

export class OrderDatabase {
  private db: Database.Database;

  constructor(dbPath: string = './orders.db') {
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Create orders table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gloriafood_order_id TEXT UNIQUE NOT NULL,
        store_id TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_email TEXT,
        delivery_address TEXT,
        total_price REAL,
        currency TEXT DEFAULT 'USD',
        status TEXT,
        order_type TEXT,
        items TEXT,
        raw_data TEXT,
        created_at TEXT,
        updated_at TEXT,
        fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
        sent_to_doordash INTEGER DEFAULT 0,
        doordash_order_id TEXT,
        doordash_sent_at TEXT,
        doordash_tracking_url TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_gloriafood_order_id ON orders(gloriafood_order_id);
      CREATE INDEX IF NOT EXISTS idx_store_id ON orders(store_id);
      CREATE INDEX IF NOT EXISTS idx_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_fetched_at ON orders(fetched_at);

      CREATE TABLE IF NOT EXISTS merchants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id TEXT UNIQUE NOT NULL,
        merchant_name TEXT NOT NULL,
        api_key TEXT,
        api_url TEXT,
        master_key TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_merchants_store_id ON merchants(store_id);
      CREATE INDEX IF NOT EXISTS idx_merchants_is_active ON merchants(is_active);
    `);

    // Attempt to add new columns for existing installations (ignore errors if already exist)
    try { this.db.exec(`ALTER TABLE orders ADD COLUMN sent_to_doordash INTEGER DEFAULT 0`); } catch (e) {}
    try { this.db.exec(`ALTER TABLE orders ADD COLUMN doordash_order_id TEXT`); } catch (e) {}
    try { this.db.exec(`ALTER TABLE orders ADD COLUMN doordash_sent_at TEXT`); } catch (e) {}
    try { this.db.exec(`ALTER TABLE orders ADD COLUMN doordash_tracking_url TEXT`); } catch (e) {}
  }

  insertOrUpdateOrder(orderData: any): Order | null {
    try {
      const order: Order = {
        id: '',
        gloriafood_order_id: orderData.id?.toString() || orderData.order_id?.toString() || '',
        store_id: orderData.store_id?.toString() || orderData.restaurant_id?.toString() || '',
        customer_name: this.extractCustomerName(orderData),
        customer_phone: this.extractCustomerPhone(orderData),
        customer_email: this.extractCustomerEmail(orderData),
        delivery_address: this.extractDeliveryAddress(orderData),
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

      const stmt = this.db.prepare(`
        INSERT INTO orders (
          gloriafood_order_id, store_id, customer_name, customer_phone,
          customer_email, delivery_address, total_price, currency,
          status, order_type, items, raw_data, created_at, updated_at, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gloriafood_order_id) DO UPDATE SET
          status = excluded.status,
          total_price = excluded.total_price,
          updated_at = excluded.updated_at,
          fetched_at = excluded.fetched_at,
          raw_data = excluded.raw_data
      `);

      stmt.run(
        order.gloriafood_order_id,
        order.store_id,
        order.customer_name,
        order.customer_phone,
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
      );

      return this.getOrderByGloriaFoodId(order.gloriafood_order_id);
    } catch (error) {
      console.error('Error inserting order:', error);
      return null;
    }
  }

  markOrderSentToDoorDash(gloriafoodOrderId: string, doordashOrderId?: string, trackingUrl?: string): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE orders
        SET sent_to_doordash = 1,
            doordash_order_id = COALESCE(?, doordash_order_id),
            doordash_tracking_url = COALESCE(?, doordash_tracking_url),
            doordash_sent_at = ?,
            updated_at = ?
        WHERE gloriafood_order_id = ?
      `);
      const now = new Date().toISOString();
      stmt.run(doordashOrderId || null, trackingUrl || null, now, now, gloriafoodOrderId);
    } catch (error) {
      console.error('Error updating sent_to_doordash:', error);
    }
  }

  private extractCustomerName(orderData: any): string {
    if (orderData.client?.first_name || orderData.client?.last_name) {
      return `${orderData.client.first_name || ''} ${orderData.client.last_name || ''}`.trim();
    }
    if (orderData.customer?.name) return orderData.customer.name;
    if (orderData.customer_name) return orderData.customer_name;
    return 'Unknown';
  }

  private extractCustomerPhone(orderData: any): string {
    return orderData.client?.phone ||
           orderData.customer?.phone ||
           orderData.customer_phone ||
           orderData.phone ||
           '';
  }

  private extractCustomerEmail(orderData: any): string {
    return orderData.client?.email ||
           orderData.customer?.email ||
           orderData.customer_email ||
           orderData.email ||
           '';
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

  getOrderByGloriaFoodId(orderId: string): Order | null {
    const stmt = this.db.prepare('SELECT * FROM orders WHERE gloriafood_order_id = ?');
    return stmt.get(orderId) as Order | null;
  }

  getAllOrders(limit: number = 50): Order[] {
    const stmt = this.db.prepare('SELECT * FROM orders ORDER BY fetched_at DESC LIMIT ?');
    return stmt.all(limit) as Order[];
  }

  getRecentOrders(minutes: number = 60): Order[] {
    const stmt = this.db.prepare(`
      SELECT * FROM orders 
      WHERE datetime(fetched_at) > datetime('now', '-' || ? || ' minutes')
      ORDER BY fetched_at DESC
    `);
    return stmt.all(minutes) as Order[];
  }

  getOrdersByStatus(status: string): Order[] {
    const stmt = this.db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY fetched_at DESC');
    return stmt.all(status) as Order[];
  }

  getOrderCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM orders');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  // User authentication methods
  createUser(email: string, password: string, fullName: string): any {
    try {
      const crypto = require('crypto');
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
      
      // Create users table if not exists
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_email ON users(email);
      `);
      
      const stmt = this.db.prepare('INSERT INTO users (email, password, full_name) VALUES (?, ?, ?)');
      const result = stmt.run(email, hashedPassword, fullName);
      
      return {
        id: result.lastInsertRowid,
        email,
        full_name: fullName,
        role: 'user'
      };
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.message?.includes('UNIQUE constraint')) {
        throw new Error('Email already exists');
      }
      throw error;
    }
  }

  getUserByEmail(email: string): any | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
      return stmt.get(email) as any | null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  verifyPassword(email: string, password: string): any | null {
    try {
      const crypto = require('crypto');
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
      
      const user = this.getUserByEmail(email);
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
  getAllDrivers(): any[] {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS drivers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          email TEXT,
          vehicle_type TEXT,
          vehicle_plate TEXT,
          rating REAL DEFAULT 0.00,
          status TEXT DEFAULT 'active',
          latitude REAL,
          longitude REAL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_status ON drivers(status);
      `);
      
      const stmt = this.db.prepare('SELECT * FROM drivers ORDER BY name');
      return stmt.all() as any[];
    } catch (error) {
      console.error('Error getting drivers:', error);
      return [];
    }
  }

  getDriverById(id: number): any | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM drivers WHERE id = ?');
      return stmt.get(id) as any | null;
    } catch (error) {
      console.error('Error getting driver:', error);
      return null;
    }
  }

  // Reviews methods
  getAllReviews(): any[] {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER,
          driver_id INTEGER,
          customer_name TEXT,
          rating INTEGER NOT NULL,
          comment TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_order_id ON reviews(order_id);
        CREATE INDEX IF NOT EXISTS idx_driver_id ON reviews(driver_id);
      `);
      
      const stmt = this.db.prepare(`
        SELECT r.*, o.gloriafood_order_id as order_number 
        FROM reviews r 
        LEFT JOIN orders o ON r.order_id = o.id 
        ORDER BY r.created_at DESC
      `);
      return stmt.all() as any[];
    } catch (error) {
      console.error('Error getting reviews:', error);
      return [];
    }
  }

  getReviewsByOrderId(orderId: number): any[] {
    try {
      const stmt = this.db.prepare('SELECT * FROM reviews WHERE order_id = ? ORDER BY created_at DESC');
      return stmt.all(orderId) as any[];
    } catch (error) {
      console.error('Error getting reviews by order:', error);
      return [];
    }
  }

  // Statistics methods
  getDashboardStats(): any {
    try {
      const orderStats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN status NOT IN ('DELIVERED', 'CANCELLED') THEN 1 ELSE 0 END) as active_orders,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(total_price) as total_revenue
        FROM orders
      `).get() as any;
      
      const recentOrders = this.db.prepare(`
        SELECT COUNT(*) as count FROM orders 
        WHERE datetime(fetched_at) > datetime('now', '-24 hours')
      `).get() as any;
      
      const driverStats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_drivers,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_drivers
        FROM drivers
      `).get() as any;
      
      return {
        orders: {
          total: orderStats?.total_orders || 0,
          completed: orderStats?.completed_orders || 0,
          active: orderStats?.active_orders || 0,
          cancelled: orderStats?.cancelled_orders || 0,
          recent_24h: recentOrders?.count || 0
        },
        revenue: {
          total: parseFloat(orderStats?.total_revenue || 0)
        },
        drivers: {
          total: driverStats?.total_drivers || 0,
          active: driverStats?.active_drivers || 0
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
  getAllMerchants(): Merchant[] {
    try {
      const merchants = this.db.prepare(`
        SELECT * FROM merchants WHERE is_active = 1 ORDER BY merchant_name
      `).all() as any[];
      
      return merchants.map(m => ({
        id: m.id,
        store_id: m.store_id,
        merchant_name: m.merchant_name,
        api_key: m.api_key,
        api_url: m.api_url,
        master_key: m.master_key,
        is_active: m.is_active === 1,
        created_at: m.created_at,
        updated_at: m.updated_at
      }));
    } catch (error) {
      console.error('Error getting merchants:', error);
      return [];
    }
  }

  getMerchantByStoreId(storeId: string): Merchant | null {
    try {
      const merchant = this.db.prepare(`
        SELECT * FROM merchants WHERE store_id = ?
      `).get(storeId) as any;
      
      if (!merchant) return null;
      
      return {
        id: merchant.id,
        store_id: merchant.store_id,
        merchant_name: merchant.merchant_name,
        api_key: merchant.api_key,
        api_url: merchant.api_url,
        master_key: merchant.master_key,
        is_active: merchant.is_active === 1,
        created_at: merchant.created_at,
        updated_at: merchant.updated_at
      };
    } catch (error) {
      console.error('Error getting merchant:', error);
      return null;
    }
  }

  insertOrUpdateMerchant(merchant: Partial<Merchant>): Merchant | null {
    try {
      if (!merchant.store_id || !merchant.merchant_name) {
        throw new Error('store_id and merchant_name are required');
      }

      const existing = this.getMerchantByStoreId(merchant.store_id);
      
      if (existing) {
        // Update existing merchant
        this.db.prepare(`
          UPDATE merchants 
          SET merchant_name = ?,
              api_key = COALESCE(?, api_key),
              api_url = COALESCE(?, api_url),
              master_key = COALESCE(?, master_key),
              is_active = COALESCE(?, is_active),
              updated_at = CURRENT_TIMESTAMP
          WHERE store_id = ?
        `).run(
          merchant.merchant_name,
          merchant.api_key || null,
          merchant.api_url || null,
          merchant.master_key || null,
          merchant.is_active !== undefined ? (merchant.is_active ? 1 : 0) : null,
          merchant.store_id
        );
      } else {
        // Insert new merchant
        this.db.prepare(`
          INSERT INTO merchants (store_id, merchant_name, api_key, api_url, master_key, is_active)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          merchant.store_id,
          merchant.merchant_name,
          merchant.api_key || null,
          merchant.api_url || null,
          merchant.master_key || null,
          merchant.is_active !== undefined ? (merchant.is_active ? 1 : 0) : 1
        );
      }
      
      return this.getMerchantByStoreId(merchant.store_id);
    } catch (error) {
      console.error('Error inserting/updating merchant:', error);
      return null;
    }
  }

  deleteMerchant(storeId: string): boolean {
    try {
      const result = this.db.prepare(`
        DELETE FROM merchants WHERE store_id = ?
      `).run(storeId);
      
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting merchant:', error);
      return false;
    }
  }

  close(): void {
    this.db.close();
  }
}

