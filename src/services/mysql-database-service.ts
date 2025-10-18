/**
 * MySQL Database Service
 * Replaces SQLite with MySQL/MariaDB for better performance and scalability
 */

import mysql from 'mysql2/promise';
import { Logger } from '../utils/logger';
import { ConfigManager } from '../utils/config';
import { GloriaFoodOrder } from '../types/gloria-food';

export class MySQLDatabaseService {
  private connection: mysql.Connection | null = null;
  private config: ConfigManager;
  private logger: Logger;
  private dbConfig: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };

  constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = new Logger('MySQLDatabaseService');
    
    // MySQL configuration
    this.dbConfig = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'sueshero_delivery'
    };
  }

  /**
   * Initialize database connection
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing MySQL database connection...');
      
      // Create connection
      this.connection = await mysql.createConnection({
        host: this.dbConfig.host,
        port: this.dbConfig.port,
        user: this.dbConfig.user,
        password: this.dbConfig.password,
        database: this.dbConfig.database
      });

      this.logger.info('MySQL database connected successfully');
      
      // Create tables if they don't exist
      await this.createTables();
      
    } catch (error) {
      this.logger.error('Failed to initialize MySQL database:', error);
      
      // Try to create database if it doesn't exist
      if (error instanceof Error && error.message.includes('Unknown database')) {
        await this.createDatabase();
        await this.initialize();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create database if it doesn't exist
   */
  private async createDatabase(): Promise<void> {
    try {
      this.logger.info(`Creating database: ${this.dbConfig.database}`);
      
      const tempConnection = await mysql.createConnection({
        host: this.dbConfig.host,
        port: this.dbConfig.port,
        user: this.dbConfig.user,
        password: this.dbConfig.password
      });

      await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${this.dbConfig.database}\``);
      await tempConnection.end();
      
      this.logger.info('Database created successfully');
    } catch (error) {
      this.logger.error('Failed to create database:', error);
      throw error;
    }
  }

  /**
   * Create necessary tables
   */
  private async createTables(): Promise<void> {
    if (!this.connection) {
      throw new Error('Database connection not initialized');
    }

    try {
      this.logger.info('Creating database tables...');

      // Create orders table
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS orders (
          id INT PRIMARY KEY AUTO_INCREMENT,
          order_id VARCHAR(255) UNIQUE NOT NULL,
          order_number VARCHAR(255) NOT NULL,
          restaurant_id INT DEFAULT 840639,
          customer_id INT DEFAULT 0,
          customer_name VARCHAR(255) NOT NULL,
          customer_phone VARCHAR(50),
          customer_email VARCHAR(255),
          customer_address TEXT,
          order_type ENUM('delivery', 'pickup') DEFAULT 'delivery',
          status ENUM('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'refunded') DEFAULT 'pending',
          subtotal DECIMAL(10,2) DEFAULT 0,
          tax DECIMAL(10,2) DEFAULT 0,
          delivery_fee DECIMAL(10,2) DEFAULT 0,
          tip DECIMAL(10,2) DEFAULT 0,
          total DECIMAL(10,2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'USD',
          order_time DATETIME NOT NULL,
          delivery_time DATETIME,
          delivery_instructions TEXT,
          notes TEXT,
          special_instructions TEXT,
          items JSON,
          payment_method ENUM('cash', 'card', 'online') DEFAULT 'cash',
          payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_order_id (order_id),
          INDEX idx_status (status),
          INDEX idx_order_time (order_time),
          INDEX idx_customer_name (customer_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Create order_items table
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS order_items (
          id INT PRIMARY KEY AUTO_INCREMENT,
          order_id VARCHAR(255) NOT NULL,
          item_name VARCHAR(255) NOT NULL,
          item_price DECIMAL(10,2) NOT NULL,
          quantity INT NOT NULL DEFAULT 1,
          total_price DECIMAL(10,2) NOT NULL,
          category VARCHAR(100),
          modifiers JSON,
          special_instructions TEXT,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
          INDEX idx_order_id (order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Create webhook_logs table
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS webhook_logs (
          id INT PRIMARY KEY AUTO_INCREMENT,
          webhook_type VARCHAR(100) NOT NULL,
          order_id VARCHAR(255),
          payload JSON,
          status ENUM('success', 'failed', 'pending') DEFAULT 'pending',
          response TEXT,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_webhook_type (webhook_type),
          INDEX idx_order_id (order_id),
          INDEX idx_status (status),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Create delivery_logs table
      await this.connection.execute(`
        CREATE TABLE IF NOT EXISTS delivery_logs (
          id INT PRIMARY KEY AUTO_INCREMENT,
          order_id VARCHAR(255) NOT NULL,
          driver_name VARCHAR(255),
          driver_phone VARCHAR(50),
          status ENUM('assigned', 'picked_up', 'delivered', 'failed') DEFAULT 'assigned',
          pickup_time DATETIME,
          delivery_time DATETIME,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_order_id (order_id),
          INDEX idx_status (status),
          INDEX idx_driver_name (driver_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      this.logger.info('Database tables created successfully');
    } catch (error) {
      this.logger.error('Failed to create tables:', error);
      throw error;
    }
  }

  /**
   * Save order to database
   */
  async saveOrder(order: GloriaFoodOrder): Promise<void> {
    if (!this.connection) {
      throw new Error('Database connection not initialized');
    }

    try {
      // Insert order
      await this.connection.execute(`
        INSERT INTO orders (
          order_id, order_number, customer_name, customer_phone, customer_email,
          customer_address, order_type, status, total, currency, order_time,
          delivery_time, notes, items, payment_method, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          updated_at = CURRENT_TIMESTAMP
      `, [
        order.id.toString(),
        order.orderNumber,
        order.customer.name,
        order.customer.phone,
        order.customer.email,
        order.customer.address ? JSON.stringify(order.customer.address) : null,
        order.orderType,
        order.status,
        order.total,
        'USD', // Default currency
        new Date(order.createdAt),
        order.delivery?.estimatedDeliveryTime ? new Date(order.delivery.estimatedDeliveryTime) : null,
        order.notes,
        JSON.stringify(order.items),
        order.payment.method,
        order.payment.status
      ]);

      // Insert order items
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          await this.connection.execute(`
            INSERT INTO order_items (order_id, item_name, item_price, quantity, total_price, category, modifiers, special_instructions, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              quantity = VALUES(quantity),
              total_price = VALUES(total_price)
          `, [
            order.id.toString(),
            item.name,
            item.price,
            item.quantity,
            item.totalPrice,
            item.category || null,
            item.modifiers ? JSON.stringify(item.modifiers) : null,
            item.specialInstructions || null,
            ''
          ]);
        }
      }

      this.logger.info(`Order saved: ${order.orderNumber}`);
    } catch (error) {
      this.logger.error('Failed to save order:', error);
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<GloriaFoodOrder | null> {
    if (!this.connection) {
      throw new Error('Database connection not initialized');
    }

    try {
      const [rows] = await this.connection.execute(`
        SELECT * FROM orders WHERE order_id = ?
      `, [orderId]);

      const orders = rows as any[];
      if (orders.length === 0) {
        return null;
      }

      const order = orders[0];
      
      // Get order items
      const [itemRows] = await this.connection.execute(`
        SELECT * FROM order_items WHERE order_id = ?
      `, [orderId]);

      const items = (itemRows as any[]).map(item => ({
        id: item.id,
        name: item.item_name,
        price: parseFloat(item.item_price),
        quantity: item.quantity,
        totalPrice: parseFloat(item.total_price),
        category: item.category,
        modifiers: item.modifiers ? JSON.parse(item.modifiers) : undefined,
        specialInstructions: item.special_instructions
      }));

      return {
        id: parseInt(order.order_id),
        orderNumber: order.order_number,
        restaurantId: order.restaurant_id || 840639,
        customer: {
          id: order.customer_id || 0,
          name: order.customer_name,
          phone: order.customer_phone,
          email: order.customer_email,
          address: order.customer_address ? JSON.parse(order.customer_address) : undefined
        },
        items: items,
        subtotal: parseFloat(order.subtotal || order.total),
        tax: parseFloat(order.tax || '0'),
        deliveryFee: parseFloat(order.delivery_fee || '0'),
        tip: parseFloat(order.tip || '0'),
        total: parseFloat(order.total),
        payment: {
          method: order.payment_method as 'cash' | 'card' | 'online',
          amount: parseFloat(order.total),
          status: order.payment_status as 'pending' | 'completed' | 'failed'
        },
        delivery: {
          address: order.customer_address ? JSON.parse(order.customer_address) : undefined,
          estimatedDeliveryTime: order.delivery_time ? order.delivery_time.toISOString() : undefined,
          deliveryFee: parseFloat(order.delivery_fee || '0'),
          deliveryInstructions: order.delivery_instructions,
          contactPhone: order.customer_phone
        },
        status: order.status as any,
        orderType: order.order_type as 'delivery' | 'pickup',
        createdAt: order.order_time.toISOString(),
        updatedAt: order.updated_at.toISOString(),
        notes: order.notes,
        specialInstructions: order.special_instructions
      };
    } catch (error) {
      this.logger.error('Failed to get order:', error);
      throw error;
    }
  }

  /**
   * Get all orders with pagination
   */
  async getAllOrders(page: number = 1, limit: number = 20): Promise<GloriaFoodOrder[]> {
    if (!this.connection) {
      throw new Error('Database connection not initialized');
    }

    try {
      const offset = (page - 1) * limit;
      
      const [rows] = await this.connection.execute(`
        SELECT * FROM orders 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      const orders = rows as any[];
      const result: GloriaFoodOrder[] = [];

      for (const order of orders) {
        const fullOrder = await this.getOrder(order.order_id);
        if (fullOrder) {
          result.push(fullOrder);
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to get all orders:', error);
      throw error;
    }
  }

  /**
   * Get orders by status
   */
  async getOrdersByStatus(status: string): Promise<GloriaFoodOrder[]> {
    if (!this.connection) {
      throw new Error('Database connection not initialized');
    }

    try {
      const [rows] = await this.connection.execute(`
        SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC
      `, [status]);

      const orders = rows as any[];
      const result: GloriaFoodOrder[] = [];

      for (const order of orders) {
        const fullOrder = await this.getOrder(order.order_id);
        if (fullOrder) {
          result.push(fullOrder);
        }
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to get orders by status:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Database connection not initialized');
    }

    try {
      await this.connection.execute(`
        UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?
      `, [status, orderId]);

      this.logger.info(`Order status updated: ${orderId} -> ${status}`);
    } catch (error) {
      this.logger.error('Failed to update order status:', error);
      throw error;
    }
  }

  /**
   * Get order statistics
   */
  async getOrderStatistics(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    preparing: number;
    ready: number;
    out_for_delivery: number;
    delivered: number;
    cancelled: number;
  }> {
    if (!this.connection) {
      throw new Error('Database connection not initialized');
    }

    try {
      const [rows] = await this.connection.execute(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
          SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing,
          SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
          SUM(CASE WHEN status = 'out_for_delivery' THEN 1 ELSE 0 END) as out_for_delivery,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM orders
      `);

      const stats = (rows as any[])[0];
      return {
        total: parseInt(stats.total),
        pending: parseInt(stats.pending),
        confirmed: parseInt(stats.confirmed),
        preparing: parseInt(stats.preparing),
        ready: parseInt(stats.ready),
        out_for_delivery: parseInt(stats.out_for_delivery),
        delivered: parseInt(stats.delivered),
        cancelled: parseInt(stats.cancelled)
      };
    } catch (error) {
      this.logger.error('Failed to get order statistics:', error);
      throw error;
    }
  }

  /**
   * Log webhook event
   */
  async logWebhook(webhookType: string, orderId: string, payload: any, status: string, response?: string, error?: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Database connection not initialized');
    }

    try {
      await this.connection.execute(`
        INSERT INTO webhook_logs (webhook_type, order_id, payload, status, response, error_message)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        webhookType,
        orderId,
        JSON.stringify(payload),
        status,
        response || null,
        error || null
      ]);
    } catch (error) {
      this.logger.error('Failed to log webhook:', error);
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
      this.logger.info('MySQL database connection closed');
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.connection) {
        await this.initialize();
      }
      
      const [rows] = await this.connection!.execute('SELECT 1 as test');
      return true;
    } catch (error) {
      this.logger.error('Database connection test failed:', error);
      return false;
    }
  }
}
