import Database from 'better-sqlite3';

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

  getOrderByGloriaFoodId(orderId: string): Order | null {
    const stmt = this.db.prepare('SELECT * FROM orders WHERE gloriafood_order_id = ?');
    return stmt.get(orderId) as Order | null;
  }

  deleteOrder(gloriafoodOrderId: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM orders WHERE gloriafood_order_id = ?');
      const result = stmt.run(gloriafoodOrderId);
      return (result.changes || 0) > 0;
    } catch (error) {
      console.error('Error deleting order:', error);
      return false;
    }
  }

  deleteOrders(gloriafoodOrderIds: string[]): number {
    try {
      if (!gloriafoodOrderIds || gloriafoodOrderIds.length === 0) {
        return 0;
      }
      
      const placeholders = gloriafoodOrderIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`DELETE FROM orders WHERE gloriafood_order_id IN (${placeholders})`);
      const result = stmt.run(...gloriafoodOrderIds);
      return result.changes || 0;
    } catch (error) {
      console.error('Error deleting orders:', error);
      return 0;
    }
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

  close(): void {
    this.db.close();
  }
}

