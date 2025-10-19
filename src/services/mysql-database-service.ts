/**
 * MySQL Database Service for Sue's Hero
 * Connects to XAMPP MySQL database
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
      this.logger.info('Connecting to XAMPP MySQL database...', {
        host: this.dbConfig.host,
        port: this.dbConfig.port,
        database: this.dbConfig.database,
        user: this.dbConfig.user
      });

      this.connection = await mysql.createConnection(this.dbConfig);
      
      // Test the connection
      await this.connection.ping();
      
      this.logger.info('Successfully connected to XAMPP MySQL database');
      
      // Check if tables exist
      await this.checkTables();
      
    } catch (error) {
      this.logger.error('Failed to connect to XAMPP MySQL database:', error);
      throw error;
    }
  }

  /**
   * Check if required tables exist
   */
  private async checkTables(): Promise<void> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      const [tables] = await this.connection.execute(
        "SHOW TABLES LIKE 'orders'"
      );
      
      if (Array.isArray(tables) && tables.length > 0) {
        this.logger.info('Orders table found in XAMPP database');
      } else {
        this.logger.warn('Orders table not found. You may need to create tables in XAMPP');
      }

      const [deliveryTables] = await this.connection.execute(
        "SHOW TABLES LIKE 'deliveries'"
      );
      
      if (Array.isArray(deliveryTables) && deliveryTables.length > 0) {
        this.logger.info('Deliveries table found in XAMPP database');
      } else {
        this.logger.warn('Deliveries table not found. You may need to create tables in XAMPP');
      }

    } catch (error) {
      this.logger.error('Error checking tables:', error);
    }
  }

  /**
   * Save order to XAMPP database
   */
  async saveOrder(order: GloriaFoodOrder): Promise<void> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      const query = `
        INSERT INTO orders (
          order_id, order_number, customer_name, customer_email, 
          customer_phone, customer_address, order_type, status,
          total, order_time, delivery_time, delivery_instructions,
          items, payment_method, payment_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          updated_at = VALUES(updated_at)
      `;

      const values = [
        order.id.toString(),
        order.orderNumber,
        order.customer.name,
        order.customer.email || null,
        order.customer.phone || null,
        order.delivery ? `${order.delivery.address.street}, ${order.delivery.address.city}, ${order.delivery.address.state} ${order.delivery.address.zipCode}` : null,
        order.orderType,
        order.status,
        order.total,
        new Date(order.createdAt),
        order.delivery ? new Date(order.delivery.estimatedDeliveryTime || order.createdAt) : null,
        order.delivery ? order.delivery.deliveryInstructions : null,
        JSON.stringify(order.items),
        order.payment.method,
        order.payment.status || 'pending',
        new Date(order.createdAt),
        new Date(order.updatedAt)
      ];

      await this.connection.execute(query, values);
      
      this.logger.info(`Order ${order.orderNumber} saved to XAMPP database`);
      
    } catch (error) {
      this.logger.error('Error saving order to XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Get order by Gloria Food ID
   */
  async getOrderByGloriaFoodId(orderId: number): Promise<any | null> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM orders WHERE order_id = ?',
        [orderId.toString()]
      );

      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      
    } catch (error) {
      this.logger.error('Error getting order from XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Get all orders
   */
  async getAllOrders(): Promise<any[]> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM orders ORDER BY created_at DESC'
      );

      return Array.isArray(rows) ? rows : [];
      
    } catch (error) {
      this.logger.error('Error getting orders from XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: number, status: string): Promise<void> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      await this.connection.execute(
        'UPDATE orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
        [status, orderId.toString()]
      );
      
      this.logger.info(`Order ${orderId} status updated to ${status} in XAMPP database`);
      
    } catch (error) {
      this.logger.error('Error updating order status in XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Get order statistics
   */
  async getOrderStatistics(): Promise<any> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      const [totalRows] = await this.connection.execute(
        'SELECT COUNT(*) as total FROM orders'
      );
      
      const [statusRows] = await this.connection.execute(
        'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
      );
      
      const [revenueRows] = await this.connection.execute(
        'SELECT SUM(total) as total_revenue FROM orders'
      );

      const total = Array.isArray(totalRows) && totalRows.length > 0 ? (totalRows[0] as any).total : 0;
      const totalRevenue = Array.isArray(revenueRows) && revenueRows.length > 0 ? (revenueRows[0] as any).total_revenue : 0;
      
      const ordersByStatus: Record<string, number> = {};
      if (Array.isArray(statusRows)) {
        statusRows.forEach((row: any) => {
          ordersByStatus[row.status] = row.count;
        });
      }

      return {
        totalOrders: total,
        ordersByStatus,
        totalRevenue: totalRevenue || 0,
        averageOrderValue: total > 0 ? totalRevenue / total : 0
      };
      
    } catch (error) {
      this.logger.error('Error getting statistics from XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Save delivery record
   */
  async saveDelivery(delivery: any): Promise<void> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      const query = `
        INSERT INTO deliveries (
          external_delivery_id, doordash_delivery_id, order_id, status,
          pickup_address, dropoff_address, pickup_time, dropoff_time,
          driver_name, driver_phone, tracking_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          driver_name = VALUES(driver_name),
          driver_phone = VALUES(driver_phone),
          tracking_url = VALUES(tracking_url),
          updated_at = VALUES(updated_at)
      `;

      const values = [
        delivery.external_delivery_id,
        delivery.doordash_delivery_id,
        delivery.order_id,
        delivery.status,
        delivery.pickup_address,
        delivery.dropoff_address,
        delivery.pickup_time,
        delivery.dropoff_time,
        delivery.driver_name,
        delivery.driver_phone,
        delivery.tracking_url,
        delivery.created_at,
        delivery.updated_at
      ];

      await this.connection.execute(query, values);
      this.logger.info(`Delivery ${delivery.external_delivery_id} saved to XAMPP database`);
      
    } catch (error) {
      this.logger.error('Error saving delivery to XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Get delivery by external ID
   */
  async getDeliveryByExternalId(externalId: string): Promise<any | null> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM deliveries WHERE external_delivery_id = ?',
        [externalId]
      );

      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      
    } catch (error) {
      this.logger.error('Error getting delivery by external ID from XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Get delivery by DoorDash ID
   */
  async getDeliveryByDoorDashId(doorDashId: string): Promise<any | null> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM deliveries WHERE doordash_delivery_id = ?',
        [doorDashId]
      );

      return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      
    } catch (error) {
      this.logger.error('Error getting delivery by DoorDash ID from XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(deliveryId: string, status: string, driverInfo?: any): Promise<void> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      let query = 'UPDATE deliveries SET status = ?, updated_at = NOW()';
      const values: any[] = [status];

      if (driverInfo) {
        query += ', driver_name = ?, driver_phone = ?';
        values.push(driverInfo.name || null, driverInfo.phone || null);
      }

      query += ' WHERE doordash_delivery_id = ?';
      values.push(deliveryId);

      await this.connection.execute(query, values);
      this.logger.info(`Delivery ${deliveryId} status updated to ${status} in XAMPP database`);
      
    } catch (error) {
      this.logger.error('Error updating delivery status in XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Get all deliveries
   */
  async getAllDeliveries(): Promise<any[]> {
    if (!this.connection) throw new Error('Database not connected');

    try {
      const [rows] = await this.connection.execute(
        'SELECT * FROM deliveries ORDER BY created_at DESC'
      );

      return Array.isArray(rows) ? rows : [];
      
    } catch (error) {
      this.logger.error('Error getting deliveries from XAMPP database:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.logger.info('XAMPP MySQL database connection closed');
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch (error) {
      this.logger.error('XAMPP MySQL connection test failed:', error);
      return false;
    }
  }
}

export default MySQLDatabaseService;
