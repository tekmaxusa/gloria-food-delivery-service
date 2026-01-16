import * as dotenv from 'dotenv';
import { OrderDatabasePostgreSQL, Order } from './database-postgresql';

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
  user_id?: number;
  store_id: string;
  merchant_name: string;
  api_key?: string;
  api_url?: string;
  master_key?: string;
  phone?: string;
  address?: string;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

// Database interface for abstraction
export interface IDatabase {
  insertOrUpdateOrder(orderData: any, userId?: number): Promise<Order | null> | Order | null;
  getOrderByGloriaFoodId(orderId: string, userId?: number): Promise<Order | null> | Order | null;
  getAllOrders(limit: number, userId?: number): Promise<Order[]> | Order[];
  getRecentOrders(minutes: number, userId?: number): Promise<Order[]> | Order[];
  getOrdersByStatus(status: string, userId?: number): Promise<Order[]> | Order[];
  getOrderCount(userId?: number): Promise<number> | number;
  // User authentication methods
  createUser(email: string, password: string, fullName: string): Promise<User | null> | User | null;
  getUserByEmail(email: string): Promise<User | null> | User | null;
  verifyPassword(email: string, password: string): Promise<boolean | User | null> | boolean | User | null;
  getAllUsers(userId?: number): Promise<User[]> | User[];
  deleteUser(email: string): Promise<boolean> | boolean;
  // Drivers methods
  getAllDrivers(): Promise<any[]> | any[];
  getDriverById(id: number): Promise<any | null> | any | null;
  createDriver(driverData: { name: string; phone?: string; email?: string; vehicle_type?: string; vehicle_plate?: string }): Promise<any | null> | any | null;
  deleteDriver(id: number): Promise<boolean> | boolean;
  // Reviews methods
  getAllReviews(): Promise<any[]> | any[];
  getReviewsByOrderId(orderId: number): Promise<any[]> | any[];
  // Statistics methods
  getDashboardStats(userId?: number): Promise<any> | any;
  // Merchant methods
  getAllMerchants(userId?: number): Promise<Merchant[]> | Merchant[];
  getMerchantByStoreId(storeId: string, userId?: number): Promise<Merchant | null> | Merchant | null;
  getMerchantByApiKey(apiKey: string): Promise<Merchant | null> | Merchant | null;
  insertOrUpdateMerchant(merchant: Partial<Merchant>): Promise<Merchant | null> | Merchant | null;
  deleteMerchant(storeId: string, userId?: number): Promise<boolean> | boolean;
  // Order deletion method
  deleteOrder(orderId: string): Promise<boolean> | boolean;
  close(): Promise<void> | void;
}

export class DatabaseFactory {
  static createDatabase(): IDatabase {
    // Only PostgreSQL is supported
    console.log('\n🔍 Database Factory:');
    console.log(`   DB_TYPE from env: "${process.env.DB_TYPE}"`);
    console.log(`   ✅ Using PostgreSQL database only\n`);
    
    return new OrderDatabasePostgreSQL({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gloriafood_orders',
      ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === '1',
    });
  }
}

export { Order, OrderDatabasePostgreSQL } from './database-postgresql';

