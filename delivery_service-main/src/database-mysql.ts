import mysql from 'mysql2/promise';
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
}

interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class OrderDatabaseMySQL {
  private pool: mysql.Pool;
  private config: MySQLConfig;

  constructor(config?: Partial<MySQLConfig>) {
    // Get config from environment or use defaults
    this.config = {
      host: config?.host || process.env.DB_HOST || 'localhost',
      port: config?.port || parseInt(process.env.DB_PORT || '3306'),
      user: config?.user || process.env.DB_USER || 'root',
      password: config?.password || process.env.DB_PASSWORD || '',
      database: config?.database || process.env.DB_NAME || 'gloriafood_orders',
    };

    // Create connection pool
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: '+00:00',
    });

    this.initializeTables();
  }

  private async initializeTables(): Promise<void> {
    try {
      console.log('🔌 Connecting to MySQL database...');
      console.log(`   Host: ${this.config.host}:${this.config.port}`);
      console.log(`   Database: ${this.config.database}`);
      console.log(`   User: ${this.config.user}`);
      
      const connection = await this.pool.getConnection();
      console.log('✅ MySQL connection successful!');
      
      // Create orders table if not exists
      await connection.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          sent_to_doordash TINYINT(1) DEFAULT 0,
          doordash_order_id VARCHAR(255),
          doordash_sent_at DATETIME,
          INDEX idx_gloriafood_order_id (gloriafood_order_id),
          INDEX idx_store_id (store_id),
          INDEX idx_status (status),
          INDEX idx_fetched_at (fetched_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Release connection and finish (no ALTERs to avoid pool/DDL issues)
      connection.release();
      console.log('✅ Database table initialized successfully!');
    } catch (error: any) {
      console.error('❌ Error initializing database tables:', error);
      console.error(`   Error message: ${error.message}`);
      if (error.code === 'ECONNREFUSED') {
        console.error('   ⚠️  Cannot connect to MySQL. Make sure XAMPP MySQL is running!');
      } else if (error.code === 'ER_BAD_DB_ERROR') {
        console.error(`   ⚠️  Database "${this.config.database}" does not exist. Please create it in phpMyAdmin first!`);
      } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('   ⚠️  Access denied. Check your MySQL username and password in .env file!');
      }
      throw error;
    }
  }

  async insertOrUpdateOrder(orderData: any): Promise<Order | null> {
    try {
      // Debug: Log extraction results
      const customerName = this.extractCustomerName(orderData);
      const customerPhone = this.extractCustomerPhone(orderData);
      const customerEmail = this.extractCustomerEmail(orderData);
      const deliveryAddress = this.extractDeliveryAddress(orderData);
      
      console.log(chalk.blue('\n🔍 Data Extraction Results:'));
      console.log(chalk.gray(`   Customer Name: "${customerName}"`));
      console.log(chalk.gray(`   Customer Phone: "${customerPhone}"`));
      console.log(chalk.gray(`   Customer Email: "${customerEmail}"`));
      console.log(chalk.gray(`   Delivery Address: "${deliveryAddress}"`));
      
      // Debug: Show sample of orderData structure
      console.log(chalk.blue('\n🔍 OrderData Structure:'));
      console.log(chalk.gray(`   Keys: ${Object.keys(orderData).slice(0, 15).join(', ')}`));
      if (orderData.client) {
        console.log(chalk.gray(`   client exists with keys: ${Object.keys(orderData.client).join(', ')}`));
        if (orderData.client.first_name) console.log(chalk.gray(`   client.first_name: "${orderData.client.first_name}"`));
        if (orderData.client.last_name) console.log(chalk.gray(`   client.last_name: "${orderData.client.last_name}"`));
        if (orderData.client.name) console.log(chalk.gray(`   client.name: "${orderData.client.name}"`));
        if (orderData.client.phone) console.log(chalk.gray(`   client.phone: "${orderData.client.phone}"`));
      }
      if (orderData.customer) {
        console.log(chalk.gray(`   customer exists with keys: ${Object.keys(orderData.customer).join(', ')}`));
      }
      if (orderData.delivery) {
        console.log(chalk.gray(`   delivery exists with keys: ${Object.keys(orderData.delivery).join(', ')}`));
        if (orderData.delivery.address) {
          console.log(chalk.gray(`   delivery.address exists with keys: ${Object.keys(orderData.delivery.address).join(', ')}`));
        }
      }
      
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

      const connection = await this.pool.getConnection();
      
      const [result] = await connection.query(`
        INSERT INTO orders (
          gloriafood_order_id, store_id, customer_name, customer_phone,
          customer_email, delivery_address, total_price, currency,
          status, order_type, items, raw_data, created_at, updated_at, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          total_price = VALUES(total_price),
          updated_at = VALUES(updated_at),
          fetched_at = VALUES(fetched_at),
          raw_data = VALUES(raw_data)
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

      connection.release();
      
      const savedOrder = await this.getOrderByGloriaFoodId(order.gloriafood_order_id);
      if (savedOrder) {
        console.log(`✅ Order saved to MySQL: ID ${savedOrder.id}, GloriaFood ID: ${order.gloriafood_order_id}`);
      }
      return savedOrder;
    } catch (error: any) {
      console.error('❌ Error inserting order to MySQL:', error.message);
      console.error('   Full error:', error);
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.error('   ⚠️  Orders table does not exist. Check database setup.');
      }
      return null;
    }
  }

  async markOrderSentToDoorDash(gloriafoodOrderId: string, doordashOrderId?: string): Promise<void> {
    try {
      const connection = await this.pool.getConnection();
      await connection.query(
        `UPDATE orders
         SET sent_to_doordash = 1,
             doordash_order_id = COALESCE(?, doordash_order_id),
             doordash_sent_at = NOW(),
             updated_at = NOW()
         WHERE gloriafood_order_id = ?`,
        [doordashOrderId || null, gloriafoodOrderId]
      );
      connection.release();
    } catch (error) {
      console.error('Error updating sent_to_doordash in MySQL:', error);
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
    // Try root level client_address first (GloriaFood format)
    if (orderData.client_address && String(orderData.client_address).trim()) {
      return String(orderData.client_address).trim();
    }
    
    // Try client_address_parts (GloriaFood structured format)
    if (orderData.client_address_parts) {
      const parts = orderData.client_address_parts;
      const addressParts = [
        parts.street || parts.address_line_1 || parts.address,
        parts.more_address || parts.address_line_2 || parts.apt || parts.apartment,
        parts.city || parts.locality || parts.town,
        parts.state || parts.province || parts.region,
        parts.zip || parts.postal_code || parts.postcode,
        parts.country || parts.country_code
      ].filter(Boolean).map(s => String(s).trim());
      if (addressParts.length > 0) {
        return addressParts.join(', ');
      }
    }
    
    // Try delivery.address object (structured address)
    if (orderData.delivery?.address) {
      const addr = orderData.delivery.address;
      const addressParts = [
        addr.street || addr.address_line_1 || addr.address || addr.line1 || addr.line_1 || addr.street_address,
        addr.address_line_2 || addr.line2 || addr.line_2 || addr.apt || addr.apartment || addr.unit,
        addr.city || addr.locality || addr.town,
        addr.state || addr.province || addr.region || addr.state_province,
        addr.zip || addr.postal_code || addr.postcode || addr.zip_code || addr.postal,
        addr.country || addr.country_code
      ].filter(Boolean).map(s => String(s).trim());
      if (addressParts.length > 0) {
        return addressParts.join(', ');
      }
    }
    
    // Try delivery object with direct fields
    if (orderData.delivery) {
      const addr = orderData.delivery;
      if (addr.street || addr.city || addr.address || addr.address_line_1) {
        const addressParts = [
          addr.street || addr.address || addr.address_line_1 || addr.street_address,
          addr.address_line_2 || addr.line2 || addr.apt || addr.apartment,
          addr.city || addr.town || addr.locality,
          addr.state || addr.province || addr.region,
          addr.zip || addr.postal_code || addr.postcode || addr.zip_code,
          addr.country || addr.country_code
        ].filter(Boolean).map(s => String(s).trim());
        if (addressParts.length > 0) {
          return addressParts.join(', ');
        }
      }
      // Try full_address field
      if (addr.full_address && String(addr.full_address).trim()) return String(addr.full_address).trim();
      if (addr.formatted_address && String(addr.formatted_address).trim()) return String(addr.formatted_address).trim();
    }
    
    // Try root level delivery_address fields
    if (orderData.delivery_address && String(orderData.delivery_address).trim()) return String(orderData.delivery_address).trim();
    if (orderData.address && String(orderData.address).trim()) return String(orderData.address).trim();
    if (orderData.shipping_address && String(orderData.shipping_address).trim()) return String(orderData.shipping_address).trim();
    if (orderData.deliveryAddress && String(orderData.deliveryAddress).trim()) return String(orderData.deliveryAddress).trim();
    
    // Try nested in order object
    if (orderData.order?.delivery?.address) {
      const addr = orderData.order.delivery.address;
      const addressParts = [
        addr.street || addr.address_line_1 || addr.address || addr.line1,
        addr.city || addr.locality,
        addr.state || addr.province,
        addr.zip || addr.postal_code || addr.postcode,
        addr.country
      ].filter(Boolean).map(s => String(s).trim());
      if (addressParts.length > 0) {
        return addressParts.join(', ');
      }
    }
    if (orderData.order?.delivery?.full_address && String(orderData.order.delivery.full_address).trim()) {
      return String(orderData.order.delivery.full_address).trim();
    }
    if (orderData.order?.delivery_address && String(orderData.order.delivery_address).trim()) return String(orderData.order.delivery_address).trim();
    if (orderData.order?.address && String(orderData.order.address).trim()) return String(orderData.order.address).trim();
    
    return '';
  }

  async getOrderByGloriaFoodId(orderId: string): Promise<Order | null> {
    try {
      const connection = await this.pool.getConnection();
      const [rows] = await connection.query(
        'SELECT * FROM orders WHERE gloriafood_order_id = ?',
        [orderId]
      ) as [Order[], any];
      
      connection.release();
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('Error getting order:', error);
      return null;
    }
  }

  async getAllOrders(limit: number = 50): Promise<Order[]> {
    try {
      const connection = await this.pool.getConnection();
      const [rows] = await connection.query(
        'SELECT * FROM orders ORDER BY fetched_at DESC LIMIT ?',
        [limit]
      ) as [Order[], any];
      
      connection.release();
      return rows;
    } catch (error) {
      console.error('Error getting all orders:', error);
      return [];
    }
  }

  async getRecentOrders(minutes: number = 60): Promise<Order[]> {
    try {
      const connection = await this.pool.getConnection();
      const [rows] = await connection.query(
        `SELECT * FROM orders 
         WHERE fetched_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
         ORDER BY fetched_at DESC`,
        [minutes]
      ) as [Order[], any];
      
      connection.release();
      return rows;
    } catch (error) {
      console.error('Error getting recent orders:', error);
      return [];
    }
  }

  async getOrdersByStatus(status: string): Promise<Order[]> {
    try {
      const connection = await this.pool.getConnection();
      const [rows] = await connection.query(
        'SELECT * FROM orders WHERE status = ? ORDER BY fetched_at DESC',
        [status]
      ) as [Order[], any];
      
      connection.release();
      return rows;
    } catch (error) {
      console.error('Error getting orders by status:', error);
      return [];
    }
  }

  async getOrderCount(): Promise<number> {
    try {
      const connection = await this.pool.getConnection();
      const [rows] = await connection.query(
        'SELECT COUNT(*) as count FROM orders'
      ) as [{ count: number }[], any];
      
      connection.release();
      return rows[0]?.count || 0;
    } catch (error) {
      console.error('Error getting order count:', error);
      return 0;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

