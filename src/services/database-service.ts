/**
 * Database Service
 * Handles SQLite database operations for orders and deliveries
 */

import sqlite3 from 'sqlite3';
import { Logger } from '../utils/logger';
import { OrderRecord, DeliveryRecord, WebhookLogRecord } from '../types/database';
import { GloriaFoodOrder } from '../types/gloria-food';
import { DoorDashDeliveryResponse } from '../types/doordash';

export class DatabaseService {
  private db: sqlite3.Database;
  private logger: Logger;
  private isInitialized = false;

  constructor(databasePath: string = 'delivery_service.db') {
    this.logger = new Logger('DatabaseService');
    this.db = new sqlite3.Database(databasePath);
  }

  /**
   * Initialize database tables
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.logger.info('Initializing database...');

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Create orders table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gloria_food_order_id INTEGER UNIQUE NOT NULL,
            order_number TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_email TEXT,
            customer_phone TEXT,
            delivery_address TEXT NOT NULL,
            delivery_city TEXT NOT NULL,
            delivery_state TEXT,
            delivery_zip TEXT NOT NULL,
            delivery_country TEXT NOT NULL,
            order_total REAL NOT NULL,
            order_status TEXT NOT NULL,
            order_type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            gloria_food_data TEXT NOT NULL
          )
        `);

        // Create deliveries table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS deliveries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            doordash_delivery_id TEXT UNIQUE,
            external_delivery_id TEXT NOT NULL,
            status TEXT NOT NULL,
            driver_name TEXT,
            driver_phone TEXT,
            tracking_url TEXT,
            estimated_delivery_time TEXT,
            actual_delivery_time TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            doordash_data TEXT,
            FOREIGN KEY (order_id) REFERENCES orders (id)
          )
        `);

        // Create webhook_logs table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS webhook_logs (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            response_time INTEGER,
            retry_attempts INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create indexes for better performance
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_gloria_food_id ON orders(gloria_food_order_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON deliveries(order_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_deliveries_doordash_id ON deliveries(doordash_delivery_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs(source)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at)`);

        this.logger.info('Database initialized successfully');
        this.isInitialized = true;
        resolve();
      });
    });
  }

  /**
   * Save Gloria Food order to database
   */
  async saveOrder(order: GloriaFoodOrder): Promise<number> {
    this.logger.info(`Saving order ${order.orderNumber} to database`);

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO orders (
          gloria_food_order_id, order_number, customer_name, customer_email, customer_phone,
          delivery_address, delivery_city, delivery_state, delivery_zip, delivery_country,
          order_total, order_status, order_type, gloria_food_data, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const params = [
        order.id,
        order.orderNumber,
        order.customer.name,
        order.customer.email || null,
        order.customer.phone || null,
        order.delivery.address.street,
        order.delivery.address.city,
        order.delivery.address.state || null,
        order.delivery.address.zipCode,
        order.delivery.address.country,
        order.total,
        order.status,
        order.orderType,
        JSON.stringify(order)
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  /**
   * Get order by Gloria Food order ID
   */
  async getOrderByGloriaFoodId(gloriaFoodOrderId: number): Promise<OrderRecord | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM orders WHERE gloria_food_order_id = ?';
      
      this.db.get(sql, [gloriaFoodOrderId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as OrderRecord || null);
        }
      });
    });
  }

  /**
   * Update order status
   */
  async updateOrderStatus(gloriaFoodOrderId: number, status: string): Promise<void> {
    this.logger.info(`Updating order ${gloriaFoodOrderId} status to ${status}`);

    return new Promise((resolve, reject) => {
      const sql = 'UPDATE orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE gloria_food_order_id = ?';
      
      this.db.run(sql, [status, gloriaFoodOrderId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Save delivery record
   */
  async saveDelivery(delivery: DeliveryRecord): Promise<number> {
    this.logger.info(`Saving delivery ${delivery.external_delivery_id} to database`);

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO deliveries (
          order_id, doordash_delivery_id, external_delivery_id, status,
          driver_name, driver_phone, tracking_url, estimated_delivery_time,
          actual_delivery_time, doordash_data, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      const params = [
        delivery.order_id,
        delivery.doordash_delivery_id || null,
        delivery.external_delivery_id,
        delivery.status,
        delivery.driver_name || null,
        delivery.driver_phone || null,
        delivery.tracking_url || null,
        delivery.estimated_delivery_time || null,
        delivery.actual_delivery_time || null,
        delivery.doordash_data || null
      ];

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(doordashDeliveryId: string, status: string, driverInfo?: any): Promise<void> {
    this.logger.info(`Updating delivery ${doordashDeliveryId} status to ${status}`);

    return new Promise((resolve, reject) => {
      let sql = 'UPDATE deliveries SET status = ?, updated_at = CURRENT_TIMESTAMP';
      const params: any[] = [status];

      if (driverInfo) {
        sql += ', driver_name = ?, driver_phone = ?, tracking_url = ?';
        params.push(driverInfo.driver_name || null);
        params.push(driverInfo.driver_phone || null);
        params.push(driverInfo.tracking_url || null);
      }

      sql += ' WHERE doordash_delivery_id = ?';
      params.push(doordashDeliveryId);

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get delivery by DoorDash delivery ID
   */
  async getDeliveryByDoorDashId(doordashDeliveryId: string): Promise<DeliveryRecord | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM deliveries WHERE doordash_delivery_id = ?';
      
      this.db.get(sql, [doordashDeliveryId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as DeliveryRecord || null);
        }
      });
    });
  }

  /**
   * Get delivery by external delivery ID
   */
  async getDeliveryByExternalId(externalDeliveryId: string): Promise<DeliveryRecord | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM deliveries WHERE external_delivery_id = ?';
      
      this.db.get(sql, [externalDeliveryId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as DeliveryRecord || null);
        }
      });
    });
  }

  /**
   * Log webhook event
   */
  async logWebhookEvent(
    source: string,
    payload: any,
    status?: string,
    errorMessage?: string,
    eventType?: string
  ): Promise<string> {
    const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO webhook_logs (
          id, source, event_type, payload, status, error_message, 
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const now = new Date().toISOString();
      stmt.run(
        webhookId,
        source,
        eventType || 'unknown',
        JSON.stringify(payload),
        status || 'pending',
        errorMessage || null,
        now,
        now,
        (err: any) => {
          if (err) {
            this.logger.error('Error logging webhook event:', err);
            reject(err);
          } else {
            this.logger.debug(`Webhook event logged: ${webhookId}`);
            resolve(webhookId);
          }
        }
      );
      stmt.finalize();
    });
  }

  /**
   * Mark webhook as processed
   */
  async markWebhookProcessed(webhookId: number, errorMessage?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE webhook_logs SET processed = TRUE, error_message = ? WHERE id = ?';
      
      this.db.run(sql, [errorMessage || null, webhookId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get pending orders (not yet processed for delivery)
   */
  async getPendingOrders(): Promise<OrderRecord[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT o.* FROM orders o
        LEFT JOIN deliveries d ON o.id = d.order_id
        WHERE o.order_type = 'delivery' 
        AND o.order_status IN ('pending', 'confirmed', 'preparing')
        AND d.id IS NULL
        ORDER BY o.created_at ASC
      `;
      
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as OrderRecord[]);
        }
      });
    });
  }

  /**
   * Get active deliveries
   */
  async getActiveDeliveries(): Promise<(OrderRecord & DeliveryRecord)[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT o.*, d.* FROM orders o
        INNER JOIN deliveries d ON o.id = d.order_id
        WHERE d.status IN ('pending', 'accepted', 'picked_up')
        ORDER BY d.created_at ASC
      `;
      
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as (OrderRecord & DeliveryRecord)[]);
        }
      });
    });
  }

  /**
   * Get order statistics
   */
  async getOrderStatistics(): Promise<{
    totalOrders: number;
    pendingOrders: number;
    activeDeliveries: number;
    completedDeliveries: number;
    totalRevenue: number;
  }> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as totalOrders,
          SUM(CASE WHEN order_status IN ('pending', 'confirmed', 'preparing') THEN 1 ELSE 0 END) as pendingOrders,
          SUM(CASE WHEN d.status IN ('pending', 'accepted', 'picked_up') THEN 1 ELSE 0 END) as activeDeliveries,
          SUM(CASE WHEN d.status = 'delivered' THEN 1 ELSE 0 END) as completedDeliveries,
          SUM(order_total) as totalRevenue
        FROM orders o
        LEFT JOIN deliveries d ON o.id = d.order_id
        WHERE o.order_type = 'delivery'
      `;
      
      this.db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          const stats = row as any;
          resolve({
            totalOrders: stats.totalOrders || 0,
            pendingOrders: stats.pendingOrders || 0,
            activeDeliveries: stats.activeDeliveries || 0,
            completedDeliveries: stats.completedDeliveries || 0,
            totalRevenue: stats.totalRevenue || 0
          });
        }
      });
    });
  }

  /**
   * Update webhook log status
   */
  async updateWebhookLogStatus(
    webhookId: string,
    status: string,
    errorMessage?: string,
    responseTime?: number,
    retryAttempts?: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        UPDATE webhook_logs 
        SET status = ?, error_message = ?, response_time = ?, retry_attempts = ?, updated_at = ?
        WHERE id = ?
      `);
      
      stmt.run(
        status,
        errorMessage || null,
        responseTime || null,
        retryAttempts || 0,
        new Date().toISOString(),
        webhookId,
        (err: any) => {
          if (err) {
            this.logger.error('Error updating webhook log status:', err);
            reject(err);
          } else {
            this.logger.debug(`Webhook log updated: ${webhookId}`);
            resolve();
          }
        }
      );
      stmt.finalize();
    });
  }

  /**
   * Get webhook logs with filtering
   */
  async getWebhookLogs(
    limit: number = 50,
    offset: number = 0,
    status?: string,
    source?: string
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM webhook_logs WHERE 1=1';
      const params: any[] = [];
      
      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }
      
      if (source) {
        query += ' AND source = ?';
        params.push(source);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      this.db.all(query, params, (err, rows) => {
        if (err) {
          this.logger.error('Error getting webhook logs:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get webhook log by ID
   */
  async getWebhookLogById(webhookId: string): Promise<any | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM webhook_logs WHERE id = ?',
        [webhookId],
        (err, row) => {
          if (err) {
            this.logger.error('Error getting webhook log by ID:', err);
            reject(err);
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          this.logger.error('Error closing database:', err);
        } else {
          this.logger.info('Database connection closed');
        }
        resolve();
      });
    });
  }
}
