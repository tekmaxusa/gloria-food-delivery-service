import * as dotenv from 'dotenv';
import { OrderDatabase } from './database';
import { OrderDatabaseMySQL } from './database-mysql';
import { Order } from './database';

// Load environment variables
dotenv.config();

// User interface for authentication
export interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

// Merchant interface for multi-merchant support
export interface Merchant {
  id: number;
  store_id: string;
  merchant_name: string;
  api_key?: string;
  api_url?: string;
  master_key?: string;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

// Database interface for abstraction
export interface IDatabase {
  insertOrUpdateOrder(orderData: any): Promise<Order | null> | Order | null;
  getOrderByGloriaFoodId(orderId: string): Promise<Order | null> | Order | null;
  getAllOrders(limit: number): Promise<Order[]> | Order[];
  getRecentOrders(minutes: number): Promise<Order[]> | Order[];
  getOrdersByStatus(status: string): Promise<Order[]> | Order[];
  getOrderCount(): Promise<number> | number;
  // User authentication methods
  createUser(email: string, password: string, fullName: string): Promise<User | null> | User | null;
 getUserByEmail(email: string): Promise<User | null> | User | null;
  verifyPassword(email: string, password: string): Promise<boolean | User | null> | boolean | User | null;
  // Drivers methods
  getAllDrivers(): Promise<any[]> | any[];
  getDriverById(id: number): Promise<any | null> | any | null;
  // Reviews methods
  getAllReviews(): Promise<any[]> | any[];
  getReviewsByOrderId(orderId: number): Promise<any[]> | any[];
  // Statistics methods
  getDashboardStats(): Promise<any> | any;
  // Merchant methods
  getAllMerchants(): Promise<Merchant[]> | Merchant[];
  getMerchantByStoreId(storeId: string): Promise<Merchant | null> | Merchant | null;
  insertOrUpdateMerchant(merchant: Partial<Merchant>): Promise<Merchant | null> | Merchant | null;
  deleteMerchant(storeId: string): Promise<boolean> | boolean;
  close(): Promise<void> | void;
}

export class DatabaseFactory {
  static createDatabase(): IDatabase {
    const dbType = process.env.DB_TYPE?.toLowerCase() || 'sqlite';
    
    // Debug: Log environment variables
    console.log('\n🔍 Database Factory Debug:');
    console.log(`   DB_TYPE from env: "${process.env.DB_TYPE}"`);
    console.log(`   DB_TYPE (processed): "${dbType}"`);
    console.log(`   DB_HOST: "${process.env.DB_HOST}"`);
    console.log(`   DB_NAME: "${process.env.DB_NAME}"`);
    
    // Check if MySQL config is provided (even if DB_TYPE is not set)
    const hasMySQLConfig = 
      process.env.DB_HOST || 
      process.env.DB_USER || 
      process.env.DB_NAME;
    
    if (dbType === 'mysql' || (hasMySQLConfig && dbType !== 'sqlite')) {
      // Use MySQL
      console.log('   ✅ Selecting MySQL database\n');
      return new OrderDatabaseMySQL({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'gloriafood_orders',
      });
    } else {
      // Use SQLite (default)
      console.log('   ⚠️  Selecting SQLite database (MySQL config not found)\n');
      const dbPath = process.env.DATABASE_PATH || './orders.db';
      return new OrderDatabase(dbPath);
    }
  }
}

export { Order, OrderDatabase, OrderDatabaseMySQL, Merchant, User };

