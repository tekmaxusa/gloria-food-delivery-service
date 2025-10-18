#!/usr/bin/env node

/**
 * CLI Script for Gloria Food API Management
 * Provides command-line interface for testing and managing the API
 */

import { Command } from 'commander';
import { GloriaFoodApiClient } from './services/gloria-food-api-client';
import { GloriaFoodWebhookHandler } from './services/webhook-handler';
import { ConfigManager } from './utils/config';
import { Logger } from './utils/logger';
import { GloriaFoodOrder, OrderStatus, OrderFilters } from './types/gloria-food';

class GloriaFoodCLI {
  private apiClient: GloriaFoodApiClient;
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = new Logger('GloriaFoodCLI');
    
    this.apiClient = new GloriaFoodApiClient(
      this.config.getGloriaFoodConfig(),
      this.config.getRetryConfig(),
      this.config.getRateLimitConfig()
    );
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<void> {
    this.logger.info('Testing API connection...');
    
    try {
      const isConnected = await this.apiClient.testConnection();
      if (isConnected) {
        console.log('✅ API connection successful');
        
        const healthStatus = await this.apiClient.getHealthStatus();
        console.log('API Health Status:', healthStatus);
      } else {
        console.log('❌ API connection failed');
        process.exit(1);
      }
    } catch (error) {
      console.log('❌ Connection test failed:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * List orders with optional filters
   */
  async listOrders(options: {
    status?: string[];
    type?: string;
    limit?: number;
    page?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<void> {
    this.logger.info('Fetching orders...');
    
    try {
      const filters: OrderFilters = {
        status: options.status as OrderStatus[],
        orderType: options.type as 'delivery' | 'pickup',
        limit: options.limit,
        page: options.page,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo
      };

      const response = await this.apiClient.getOrders(filters);
      
      console.log(`\n📋 Found ${response.orders.length} orders (Page ${response.pagination.page}/${response.pagination.totalPages})`);
      console.log(`Total: ${response.pagination.total} orders\n`);
      
      if (response.orders.length > 0) {
        console.table(response.orders.map(order => ({
          ID: order.id,
          'Order #': order.orderNumber,
          Customer: order.customer.name,
          Type: order.orderType,
          Status: order.status,
          Total: `$${order.total.toFixed(2)}`,
          Created: new Date(order.createdAt).toLocaleString()
        })));
      }
      
    } catch (error) {
      console.log('❌ Failed to fetch orders:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * Get specific order details
   */
  async getOrder(orderId: number): Promise<void> {
    this.logger.info(`Fetching order ${orderId}...`);
    
    try {
      const order = await this.apiClient.getOrder(orderId);
      
      console.log(`\n📦 Order Details: ${order.orderNumber}\n`);
      console.log('Customer Information:');
      console.log(`  Name: ${order.customer.name}`);
      console.log(`  Email: ${order.customer.email || 'N/A'}`);
      console.log(`  Phone: ${order.customer.phone || 'N/A'}`);
      
      console.log('\nDelivery Information:');
      console.log(`  Address: ${order.delivery.address.street}, ${order.delivery.address.city}, ${order.delivery.address.zipCode}`);
      console.log(`  Instructions: ${order.delivery.deliveryInstructions || 'N/A'}`);
      console.log(`  Fee: $${order.delivery.deliveryFee.toFixed(2)}`);
      
      console.log('\nOrder Items:');
      order.items.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.name} x${item.quantity} - $${item.totalPrice.toFixed(2)}`);
        if (item.specialInstructions) {
          console.log(`     Note: ${item.specialInstructions}`);
        }
      });
      
      console.log('\nOrder Totals:');
      console.log(`  Subtotal: $${order.subtotal.toFixed(2)}`);
      console.log(`  Tax: $${order.tax.toFixed(2)}`);
      console.log(`  Delivery Fee: $${order.deliveryFee.toFixed(2)}`);
      if (order.tip) {
        console.log(`  Tip: $${order.tip.toFixed(2)}`);
      }
      console.log(`  Total: $${order.total.toFixed(2)}`);
      
      console.log('\nOrder Status:');
      console.log(`  Status: ${order.status}`);
      console.log(`  Type: ${order.orderType}`);
      console.log(`  Created: ${new Date(order.createdAt).toLocaleString()}`);
      console.log(`  Updated: ${new Date(order.updatedAt).toLocaleString()}`);
      
    } catch (error) {
      console.log('❌ Failed to fetch order:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: number, status: OrderStatus): Promise<void> {
    this.logger.info(`Updating order ${orderId} status to ${status}...`);
    
    try {
      const updatedOrder = await this.apiClient.updateOrderStatus(orderId, status);
      
      console.log(`✅ Order ${updatedOrder.orderNumber} status updated to ${updatedOrder.status}`);
      console.log(`Updated at: ${new Date(updatedOrder.updatedAt).toLocaleString()}`);
      
    } catch (error) {
      console.log('❌ Failed to update order status:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * Get delivery orders only
   */
  async getDeliveryOrders(options: {
    status?: string[];
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<void> {
    this.logger.info('Fetching delivery orders...');
    
    try {
      const filters = {
        status: options.status as OrderStatus[],
        limit: options.limit,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo
      };

      const orders = await this.apiClient.getDeliveryOrders(filters);
      
      console.log(`\n🚚 Found ${orders.length} delivery orders\n`);
      
      if (orders.length > 0) {
        console.table(orders.map(order => ({
          ID: order.id,
          'Order #': order.orderNumber,
          Customer: order.customer.name,
          Status: order.status,
          Address: `${order.delivery.address.street}, ${order.delivery.address.city}`,
          Total: `$${order.total.toFixed(2)}`,
          Created: new Date(order.createdAt).toLocaleString()
        })));
      }
      
    } catch (error) {
      console.log('❌ Failed to fetch delivery orders:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * Get pending delivery orders
   */
  async getPendingDeliveryOrders(): Promise<void> {
    this.logger.info('Fetching pending delivery orders...');
    
    try {
      const orders = await this.apiClient.getPendingDeliveryOrders();
      
      console.log(`\n⏳ Found ${orders.length} pending delivery orders\n`);
      
      if (orders.length > 0) {
        console.table(orders.map(order => ({
          ID: order.id,
          'Order #': order.orderNumber,
          Customer: order.customer.name,
          Phone: order.customer.phone || 'N/A',
          Status: order.status,
          Address: `${order.delivery.address.street}, ${order.delivery.address.city}`,
          Total: `$${order.total.toFixed(2)}`,
          Created: new Date(order.createdAt).toLocaleString()
        })));
      } else {
        console.log('No pending delivery orders found.');
      }
      
    } catch (error) {
      console.log('❌ Failed to fetch pending delivery orders:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * Get order statistics
   */
  async getStatistics(): Promise<void> {
    this.logger.info('Fetching order statistics...');
    
    try {
      const orders = await this.apiClient.getDeliveryOrders({ limit: 1000 });
      
      const stats = {
        totalOrders: orders.length,
        ordersByStatus: {} as Record<string, number>,
        totalRevenue: 0,
        averageOrderValue: 0
      };

      orders.forEach(order => {
        stats.ordersByStatus[order.status] = (stats.ordersByStatus[order.status] || 0) + 1;
        stats.totalRevenue += order.total;
      });

      stats.averageOrderValue = stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;

      console.log('\n📊 Order Statistics\n');
      console.log(`Total Orders: ${stats.totalOrders}`);
      console.log(`Total Revenue: $${stats.totalRevenue.toFixed(2)}`);
      console.log(`Average Order Value: $${stats.averageOrderValue.toFixed(2)}`);
      
      console.log('\nOrders by Status:');
      Object.entries(stats.ordersByStatus).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
      
    } catch (error) {
      console.log('❌ Failed to get statistics:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * Start webhook server
   */
  async startWebhookServer(port: number = 3000): Promise<void> {
    this.logger.info(`Starting webhook server on port ${port}...`);
    
    try {
      const webhookHandler = new GloriaFoodWebhookHandler(port);
      await webhookHandler.start();
      
      console.log(`🚀 Webhook server started on port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`Webhook endpoint: http://localhost:${port}/webhook/gloria-food`);
      console.log(`Test endpoint: http://localhost:${port}/webhook/test`);
      console.log('\nPress Ctrl+C to stop the server');
      
    } catch (error) {
      console.log('❌ Failed to start webhook server:', (error as Error).message);
      process.exit(1);
    }
  }

  /**
   * Test web scraping for orders
   */
  async testWebScraping(): Promise<void> {
    this.logger.info('Testing web scraping for orders...');
    
    try {
      const { TekMaxWebScraper } = await import('./services/web-scraper');
      const scraper = new TekMaxWebScraper();
      
      const hasAccess = await scraper.checkAccess();
      if (hasAccess) {
        console.log('✅ Web scraping access available');
        
        const orders = await scraper.getOrders();
        console.log(`📋 Found ${orders.length} orders via web scraping`);
        
        if (orders.length > 0) {
          console.log('📊 Order Statistics:');
          const stats = await scraper.getOrderStats();
          console.log(`   Total: ${stats.total}`);
          console.log(`   Pending: ${stats.pending}`);
          console.log(`   Completed: ${stats.completed}`);
        }
      } else {
        console.log('❌ Web scraping access not available');
      }
    } catch (error) {
      console.log('❌ Web scraping test failed:', (error as Error).message);
    }
  }

  /**
   * Start order polling service
   */
  async startPolling(intervalMinutes: number = 5): Promise<void> {
    this.logger.info(`Starting order polling every ${intervalMinutes} minutes...`);
    
    try {
      const { OrderPollingService } = await import('./services/order-polling-service');
      const pollingService = new OrderPollingService(intervalMinutes);
      
      await pollingService.startPolling();
      console.log(`✅ Order polling started (${intervalMinutes} minute intervals)`);
      console.log('💡 Use Ctrl+C to stop polling');
      
      // Keep the process running
      process.on('SIGINT', () => {
        console.log('\n🛑 Stopping order polling...');
        pollingService.stopPolling();
        process.exit(0);
      });
      
      // Keep alive
      setInterval(() => {
        const status = pollingService.getStatus();
        console.log(`📊 Polling Status: ${status.isPolling ? 'Active' : 'Stopped'}`);
      }, 60000); // Status every minute
      
    } catch (error) {
      console.log('❌ Failed to start polling:', (error as Error).message);
    }
  }

  /**
   * Test MySQL database connection
   */
  async testMySQL(): Promise<void> {
    this.logger.info('Testing MySQL database connection...');
    
    try {
      const { MySQLDatabaseService } = await import('./services/mysql-database-service');
      const dbService = new MySQLDatabaseService();
      
      const isConnected = await dbService.testConnection();
      if (isConnected) {
        console.log('✅ MySQL database connection successful');
        
        // Get database statistics
        const stats = await dbService.getOrderStatistics();
        console.log('📊 Database Statistics:');
        console.log(`   Total Orders: ${stats.total}`);
        console.log(`   Pending: ${stats.pending}`);
        console.log(`   Confirmed: ${stats.confirmed}`);
        console.log(`   Preparing: ${stats.preparing}`);
        console.log(`   Ready: ${stats.ready}`);
        console.log(`   Out for Delivery: ${stats.out_for_delivery}`);
        console.log(`   Delivered: ${stats.delivered}`);
        console.log(`   Cancelled: ${stats.cancelled}`);
        
        await dbService.close();
      } else {
        console.log('❌ MySQL database connection failed');
        console.log('💡 Make sure XAMPP MySQL is running and configured correctly');
      }
    } catch (error) {
      console.log('❌ MySQL test failed:', (error as Error).message);
      console.log('💡 Check your MySQL configuration in .env file');
    }
  }

  /**
   * Setup MySQL database (create tables)
   */
  async setupMySQL(): Promise<void> {
    this.logger.info('Setting up MySQL database...');
    
    try {
      const { MySQLDatabaseService } = await import('./services/mysql-database-service');
      const dbService = new MySQLDatabaseService();
      
      await dbService.initialize();
      console.log('✅ MySQL database setup completed');
      console.log('📋 Created tables: orders, order_items, webhook_logs, delivery_logs');
      
      await dbService.close();
    } catch (error) {
      console.log('❌ MySQL setup failed:', (error as Error).message);
      console.log('💡 Make sure XAMPP MySQL is running and accessible');
    }
  }

  /**
   * Run examples (removed - examples directory cleaned up)
   */
  async runExamples(): Promise<void> {
    this.logger.info('Examples have been cleaned up from the project');
    console.log('📝 Examples have been removed to clean up the project');
    console.log('💡 You can still test the API using: npm run cli test');
  }
}

// Create CLI program
const program = new Command();

program
  .name('gloria-food-cli')
  .description('CLI tool for managing Gloria Food API')
  .version('1.0.0');

// Test connection command
program
  .command('test')
  .description('Test API connection')
  .action(async () => {
    const cli = new GloriaFoodCLI();
    await cli.testConnection();
  });

// List orders command
program
  .command('list')
  .description('List orders with optional filters')
  .option('-s, --status <statuses>', 'Filter by status (comma-separated)', (value: string) => value.split(','))
  .option('-t, --type <type>', 'Filter by order type (delivery|pickup)')
  .option('-l, --limit <number>', 'Limit number of results', '20')
  .option('-p, --page <number>', 'Page number', '1')
  .option('--date-from <date>', 'Filter from date (YYYY-MM-DD)')
  .option('--date-to <date>', 'Filter to date (YYYY-MM-DD)')
  .action(async (options: any) => {
    const cli = new GloriaFoodCLI();
    await cli.listOrders({
      status: options.status,
      type: options.type,
      limit: parseInt(options.limit),
      page: parseInt(options.page),
      dateFrom: options.dateFrom,
      dateTo: options.dateTo
    });
  });

// Get order command
program
  .command('get <orderId>')
  .description('Get specific order details')
  .action(async (orderId: any) => {
    const cli = new GloriaFoodCLI();
    await cli.getOrder(parseInt(orderId));
  });

// Update order status command
program
  .command('update <orderId> <status>')
  .description('Update order status')
  .action(async (orderId: any, status: any) => {
    const cli = new GloriaFoodCLI();
    await cli.updateOrderStatus(parseInt(orderId), status as OrderStatus);
  });

// Get delivery orders command
program
  .command('delivery')
  .description('Get delivery orders only')
  .option('-s, --status <statuses>', 'Filter by status (comma-separated)', (value: string) => value.split(','))
  .option('-l, --limit <number>', 'Limit number of results', '20')
  .option('--date-from <date>', 'Filter from date (YYYY-MM-DD)')
  .option('--date-to <date>', 'Filter to date (YYYY-MM-DD)')
  .action(async (options: any) => {
    const cli = new GloriaFoodCLI();
    await cli.getDeliveryOrders({
      status: options.status,
      limit: parseInt(options.limit),
      dateFrom: options.dateFrom,
      dateTo: options.dateTo
    });
  });

// Get pending delivery orders command
program
  .command('pending')
  .description('Get pending delivery orders')
  .action(async () => {
    const cli = new GloriaFoodCLI();
    await cli.getPendingDeliveryOrders();
  });

// Get statistics command
program
  .command('stats')
  .description('Get order statistics')
  .action(async () => {
    const cli = new GloriaFoodCLI();
    await cli.getStatistics();
  });

// Start webhook server command
program
  .command('webhook')
  .description('Start webhook server')
  .option('-p, --port <number>', 'Port number', '3000')
  .action(async (options: any) => {
    const cli = new GloriaFoodCLI();
    await cli.startWebhookServer(parseInt(options.port));
  });

// Test web scraping command
program
  .command('scrape')
  .description('Test web scraping for orders')
  .action(async () => {
    const cli = new GloriaFoodCLI();
    await cli.testWebScraping();
  });

// Start polling command
program
  .command('poll')
  .description('Start order polling service')
  .option('-i, --interval <minutes>', 'Polling interval in minutes', '5')
  .action(async (options: any) => {
    const cli = new GloriaFoodCLI();
    await cli.startPolling(parseInt(options.interval));
  });

// Test MySQL database command
program
  .command('test-mysql')
  .description('Test MySQL database connection')
  .action(async () => {
    const cli = new GloriaFoodCLI();
    await cli.testMySQL();
  });

// Setup MySQL database command
program
  .command('setup-mysql')
  .description('Setup MySQL database (create tables)')
  .action(async () => {
    const cli = new GloriaFoodCLI();
    await cli.setupMySQL();
  });

// Run examples command
program
  .command('examples')
  .description('Run API usage examples')
  .action(async () => {
    const cli = new GloriaFoodCLI();
    await cli.runExamples();
  });

// Parse command line arguments
program.parse();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: any) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: any) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

export { GloriaFoodCLI };
