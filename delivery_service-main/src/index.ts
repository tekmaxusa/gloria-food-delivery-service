import * as dotenv from 'dotenv';
import { GloriaFoodClient, GloriaFoodOrder } from './gloriafood-client';
import { DatabaseFactory, IDatabase, Order, Merchant } from './database-factory';
import { MerchantManager } from './merchant-manager';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

interface AppConfig {
  databasePath: string;
  pollIntervalMs: number;
}

interface MerchantClient {
  merchant: Merchant;
  client: GloriaFoodClient;
}

class GloriaFoodOrderFetcher {
  private database: IDatabase;
  private merchantManager: MerchantManager;
  private merchantClients: Map<string, MerchantClient> = new Map();
  private config: AppConfig;
  private pollInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config: AppConfig) {
    this.config = config;
    this.database = DatabaseFactory.createDatabase();
    this.merchantManager = new MerchantManager(this.database);
  }

  async start(): Promise<void> {
    console.log(chalk.blue.bold('\n🚀 GloriaFood Order Fetcher Started\n'));
    
    // Initialize merchants
    await this.merchantManager.initialize();
    
    if (!this.merchantManager.hasMerchants()) {
      console.error(chalk.red('❌ No active merchants configured!'));
      console.error(chalk.yellow('Please configure merchants in .env file or database.'));
      process.exit(1);
    }

    // Create clients for each merchant
    const merchants = this.merchantManager.getAllMerchants();
    for (const merchant of merchants) {
      if (!merchant.api_key) {
        console.warn(chalk.yellow(`⚠️  Merchant "${merchant.merchant_name}" (${merchant.store_id}) has no API key, skipping`));
        continue;
      }

      const client = new GloriaFoodClient({
        apiKey: merchant.api_key,
        storeId: merchant.store_id,
        apiUrl: merchant.api_url,
        masterKey: merchant.master_key,
      });

      this.merchantClients.set(merchant.store_id, {
        merchant,
        client
      });
    }

    // Display configuration
    console.log(chalk.gray('Configuration:'));
    console.log(chalk.gray(`  Active Merchants: ${this.merchantClients.size}`));
    this.merchantClients.forEach((mc) => {
      console.log(chalk.gray(`    • ${mc.merchant.merchant_name} (${mc.merchant.store_id})`));
    });
    console.log(chalk.gray(`  Database: ${this.config.databasePath}`));
    console.log(chalk.gray(`  Poll Interval: ${this.config.pollIntervalMs / 1000}s\n`));

    // Initial fetch
    await this.fetchAndStoreOrders();

    // Start polling
    this.isRunning = true;
    this.pollInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.fetchAndStoreOrders();
      }
    }, this.config.pollIntervalMs);

    console.log(chalk.green('✅ Polling started. Press Ctrl+C to stop.\n'));
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    const closeResult = this.database.close();
    if (closeResult instanceof Promise) {
      await closeResult;
    }
    console.log(chalk.yellow('\n\n🛑 Stopped fetching orders. Goodbye!\n'));
  }

  async fetchAndStoreOrders(): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(chalk.cyan(`\n[${timestamp}] Fetching orders from ${this.merchantClients.size} merchant(s)...`));

    let totalNewCount = 0;
    let totalUpdatedCount = 0;
    let totalOrdersFound = 0;

    // Fetch orders from all merchants
    for (const [storeId, merchantClient] of this.merchantClients.entries()) {
      try {
        console.log(chalk.blue(`\n  📦 Fetching from: ${merchantClient.merchant.merchant_name} (${storeId})`));
        
        const orders = await merchantClient.client.fetchOrders(50);
        totalOrdersFound += orders.length;

        if (orders.length === 0) {
          console.log(chalk.gray(`    No new orders found.`));
          continue;
        }

        console.log(chalk.green(`    Found ${orders.length} order(s)`));

        // Store orders in database
        let newCount = 0;
        let updatedCount = 0;

        for (const order of orders) {
          const existing = await this.handleAsync(this.database.getOrderByGloriaFoodId(order.id?.toString() || ''));
          const saved = await this.handleAsync(this.database.insertOrUpdateOrder(order));

          if (saved) {
            if (existing) {
              updatedCount++;
            } else {
              newCount++;
              this.displayOrder(saved, true, merchantClient.merchant);
            }
          }
        }

        totalNewCount += newCount;
        totalUpdatedCount += updatedCount;

        if (newCount > 0 || updatedCount > 0) {
          console.log(chalk.green(`    ✓ Stored: ${newCount} new, ${updatedCount} updated`));
        }
      } catch (error: any) {
        console.error(chalk.red(`  ✗ Error fetching orders from ${merchantClient.merchant.merchant_name}: ${error.message}`));
        
        // Show helpful error message
        if (error.message.includes('401') || error.message.includes('403')) {
          console.error(chalk.yellow(`    ⚠ Check API credentials for merchant "${merchantClient.merchant.merchant_name}"`));
        } else if (error.message.includes('404') || error.message.includes('webhooks')) {
          console.error(chalk.yellow(`    ⚠ API endpoint not found for merchant "${merchantClient.merchant.merchant_name}"`));
          console.error(chalk.gray(`    💡 This merchant may only support webhooks. Use webhook mode instead.`));
        } else if (error.message.includes('timeout')) {
          console.error(chalk.yellow(`    ⚠ Request timeout for merchant "${merchantClient.merchant.merchant_name}"`));
        }
      }
    }

    if (totalOrdersFound === 0) {
      console.log(chalk.gray('\n  No new orders found from any merchant.'));
    } else if (totalNewCount > 0 || totalUpdatedCount > 0) {
      console.log(chalk.green(`\n  ✓ Total: ${totalNewCount} new, ${totalUpdatedCount} updated`));
    }

    this.displayStats();
  }

  private async handleAsync<T>(result: T | Promise<T>): Promise<T> {
    return result instanceof Promise ? await result : result;
  }

  displayOrder(order: Order, isNew: boolean = false, merchant?: Merchant): void {
    const prefix = isNew ? chalk.green('🆕 NEW ORDER') : chalk.blue('📦 ORDER');
    
    console.log(`\n${prefix} ${chalk.bold(`#${order.gloriafood_order_id}`)}`);
    console.log(chalk.gray('  ──────────────────────────────────────────'));
    if (merchant) {
      console.log(`  ${chalk.bold('Merchant:')} ${chalk.cyan(merchant.merchant_name)} (${merchant.store_id})`);
    } else if (order.store_id) {
      const merchantInfo = this.merchantManager.getMerchantByStoreId(order.store_id);
      if (merchantInfo) {
        console.log(`  ${chalk.bold('Merchant:')} ${chalk.cyan(merchantInfo.merchant_name)} (${merchantInfo.store_id})`);
      } else {
        console.log(`  ${chalk.bold('Store ID:')} ${order.store_id}`);
      }
    }
    console.log(`  ${chalk.bold('Customer:')} ${order.customer_name}`);
    
    if (order.customer_phone) {
      console.log(`  ${chalk.bold('Phone:')} ${order.customer_phone}`);
    }
    
    if (order.customer_email) {
      console.log(`  ${chalk.bold('Email:')} ${order.customer_email}`);
    }

    if (order.delivery_address) {
      console.log(`  ${chalk.bold('Delivery Address:')} ${order.delivery_address}`);
    }

    // Convert total_price to number (MySQL returns DECIMAL as string)
    const totalPrice = typeof order.total_price === 'string' 
      ? parseFloat(order.total_price) 
      : (order.total_price || 0);
    console.log(`  ${chalk.bold('Total:')} ${order.currency} ${totalPrice.toFixed(2)}`);
    console.log(`  ${chalk.bold('Status:')} ${this.formatStatus(order.status)}`);
    console.log(`  ${chalk.bold('Type:')} ${order.order_type}`);
    console.log(`  ${chalk.bold('Fetched:')} ${new Date(order.fetched_at).toLocaleString()}`);
    
    // Display items
    try {
      const items = JSON.parse(order.items);
      if (Array.isArray(items) && items.length > 0) {
        console.log(`  ${chalk.bold('Items:')}`);
        items.forEach((item: any, index: number) => {
          const name = item.name || item.product_name || item.title || 'Unknown Item';
          const quantity = item.quantity || 1;
          const price = item.price || item.unit_price || 0;
          console.log(`    ${index + 1}. ${name} x${quantity} - ${order.currency} ${price}`);
        });
      }
    } catch (e) {
      // Ignore parsing errors
    }
    
    console.log(chalk.gray('  ──────────────────────────────────────────'));
  }

  formatStatus(status: string): string {
    const statusColors: { [key: string]: chalk.Chalk } = {
      'accepted': chalk.green,
      'pending': chalk.yellow,
      'preparing': chalk.cyan,
      'ready': chalk.blue,
      'completed': chalk.green,
      'cancelled': chalk.red,
      'rejected': chalk.red,
    };

    const lowerStatus = status.toLowerCase();
    const colorizer = statusColors[lowerStatus] || chalk.white;
    return colorizer(status.toUpperCase());
  }

  async displayStats(): Promise<void> {
    const totalOrders = await this.handleAsync(this.database.getOrderCount());
    const recentOrders = await this.handleAsync(this.database.getRecentOrders(60));
    
    console.log(chalk.gray(`\n  📊 Total Orders: ${totalOrders} | Recent (1h): ${recentOrders.length}`));
  }

  async displayAllOrders(): Promise<void> {
    const orders = await this.handleAsync(this.database.getAllOrders(20));
    
    console.log(chalk.blue.bold('\n\n📋 Recent Orders in Database:\n'));
    
    if (orders.length === 0) {
      console.log(chalk.gray('  No orders found in database.'));
      return;
    }

    for (const order of orders) {
      const merchant = order.store_id 
        ? await this.handleAsync(this.database.getMerchantByStoreId(order.store_id))
        : null;
      this.displayOrder(order, false, merchant || undefined);
    }
  }
}

// Main execution
async function main() {
  console.log(chalk.blue.bold('\n🚀 GloriaFood Multi-Merchant Order Fetcher\n'));

  // Check for merchant configuration
  const merchantsJson = process.env.GLORIAFOOD_MERCHANTS;
  const apiKey = process.env.GLORIAFOOD_API_KEY;
  const storeId = process.env.GLORIAFOOD_STORE_ID;

  if (!merchantsJson && (!apiKey || !storeId)) {
    console.error(chalk.red.bold('\n❌ Error: Missing merchant configuration!\n'));
    console.error(chalk.yellow('Please configure merchants using one of these methods:'));
    console.error(chalk.gray('\n  Option 1: Multi-merchant (recommended)'));
    console.error(chalk.gray('  GLORIAFOOD_MERCHANTS=[{"store_id":"123","merchant_name":"Restaurant 1","api_key":"key1","api_url":"https://api.example.com"},{"store_id":"456","merchant_name":"Restaurant 2","api_key":"key2"}]'));
    console.error(chalk.gray('\n  Option 2: Single merchant (legacy)'));
    console.error(chalk.gray('  GLORIAFOOD_API_KEY=your_api_key'));
    console.error(chalk.gray('  GLORIAFOOD_STORE_ID=your_store_id'));
    console.error(chalk.gray('\n  Optional:'));
    console.error(chalk.gray('  GLORIAFOOD_API_URL=https://api.gloriafood.com'));
    console.error(chalk.gray('  GLORIAFOOD_MASTER_KEY=your_master_key'));
    console.error(chalk.gray('  DATABASE_PATH=./orders.db'));
    console.error(chalk.gray('  POLL_INTERVAL_MS=30000\n'));
    process.exit(1);
  }

  const config: AppConfig = {
    databasePath: process.env.DATABASE_PATH || './orders.db',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000', 10),
  };

  const fetcher = new GloriaFoodOrderFetcher(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await fetcher.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await fetcher.stop();
    process.exit(0);
  });

  // Start fetching
  await fetcher.start();
}

// Run the application
main().catch(error => {
  console.error(chalk.red.bold('\n❌ Fatal Error:'), error);
  process.exit(1);
});

