import * as dotenv from 'dotenv';
import { OrderDatabase } from './database';
import { OrderDatabaseMySQL } from './database-mysql';
import { Order } from './database';

// Load environment variables
dotenv.config();

// Database interface for abstraction
export interface IDatabase {
  insertOrUpdateOrder(orderData: any): Promise<Order | null> | Order | null;
  getOrderByGloriaFoodId(orderId: string): Promise<Order | null> | Order | null;
  getAllOrders(limit: number): Promise<Order[]> | Order[];
  getRecentOrders(minutes: number): Promise<Order[]> | Order[];
  getOrdersByStatus(status: string): Promise<Order[]> | Order[];
  getOrderCount(): Promise<number> | number;
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

export { Order, OrderDatabase, OrderDatabaseMySQL };

