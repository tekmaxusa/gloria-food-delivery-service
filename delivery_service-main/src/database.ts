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
        doordash_sent_at TEXT
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

  markOrderSentToDoorDash(gloriafoodOrderId: string, doordashOrderId?: string): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE orders
        SET sent_to_doordash = 1,
            doordash_order_id = COALESCE(?, doordash_order_id),
            doordash_sent_at = ?,
            updated_at = ?
        WHERE gloriafood_order_id = ?
      `);
      const now = new Date().toISOString();
      stmt.run(doordashOrderId || null, now, now, gloriafoodOrderId);
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

  close(): void {
    this.db.close();
  }
}

