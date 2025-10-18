/**
 * Webhook Management CLI
 * Simple CLI to manage the enhanced webhook service
 */

import { Logger } from './utils/logger';
import { ConfigManager } from './utils/config';
import { DatabaseService } from './services/database-service';
import { GloriaFoodApiClient } from './services/gloria-food-api-client';
import { DoorDashApiClient } from './services/doordash-api-client';

class WebhookManager {
  private logger: Logger;
  private config: ConfigManager;
  private databaseService: DatabaseService;
  private gloriaFoodClient: GloriaFoodApiClient;
  private doorDashClient: DoorDashApiClient;

  constructor() {
    this.logger = new Logger('WebhookManager');
    this.config = ConfigManager.getInstance();
    this.databaseService = new DatabaseService();
    this.gloriaFoodClient = new GloriaFoodApiClient(this.config.getGloriaFoodConfig());
    this.doorDashClient = new DoorDashApiClient(this.config.getDoorDashConfig());
  }

  async initialize(): Promise<void> {
    try {
      await this.databaseService.initialize();
      this.logger.info('Webhook manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize webhook manager:', error);
      throw error;
    }
  }

  async testConnections(): Promise<void> {
    this.logger.info('Testing API connections...');
    
    try {
      // Test Gloria Food API
      const orders = await this.gloriaFoodClient.getOrders({ limit: 1 });
      this.logger.info('✅ Gloria Food API connection successful');
    } catch (error) {
      this.logger.error('❌ Gloria Food API connection failed:', error);
    }

    try {
      // Test DoorDash API
      await this.doorDashClient.testConnection();
      this.logger.info('✅ DoorDash API connection successful');
    } catch (error) {
      this.logger.error('❌ DoorDash API connection failed:', error);
    }
  }

  async getStatistics(): Promise<void> {
    try {
      const stats = await this.databaseService.getOrderStatistics();
      
      console.log('\n📊 Order Statistics:');
      console.log(`   Total Orders: ${stats.totalOrders}`);
      console.log(`   Pending Orders: ${stats.pendingOrders}`);
      console.log(`   Active Deliveries: ${stats.activeDeliveries}`);
      console.log(`   Completed Deliveries: ${stats.completedDeliveries}`);
      console.log(`   Total Revenue: $${stats.totalRevenue.toFixed(2)}`);
    } catch (error) {
      this.logger.error('Error getting statistics:', error);
    }
  }

  async getPendingOrders(): Promise<void> {
    try {
      const pendingOrders = await this.databaseService.getPendingOrders();
      
      console.log(`\n📋 Pending Orders (${pendingOrders.length}):`);
      if (pendingOrders.length === 0) {
        console.log('   No pending orders');
        return;
      }

      pendingOrders.forEach((order, index) => {
        console.log(`   ${index + 1}. Order #${order.order_number}`);
        console.log(`      Customer: ${order.customer_name}`);
        console.log(`      Total: $${order.order_total}`);
        console.log(`      Status: ${order.order_status}`);
        console.log(`      Created: ${new Date(order.created_at).toLocaleString()}`);
        console.log('');
      });
    } catch (error) {
      this.logger.error('Error getting pending orders:', error);
    }
  }

  async getActiveDeliveries(): Promise<void> {
    try {
      const activeDeliveries = await this.databaseService.getActiveDeliveries();
      
      console.log(`\n🚚 Active Deliveries (${activeDeliveries.length}):`);
      if (activeDeliveries.length === 0) {
        console.log('   No active deliveries');
        return;
      }

      activeDeliveries.forEach((delivery, index) => {
        console.log(`   ${index + 1}. Delivery #${delivery.external_delivery_id}`);
        console.log(`      DoorDash ID: ${delivery.doordash_delivery_id}`);
        console.log(`      Status: ${delivery.status}`);
        console.log(`      Driver: ${delivery.driver_name || 'Not assigned'}`);
        console.log(`      Tracking: ${delivery.tracking_url || 'Not available'}`);
        console.log(`      Created: ${new Date(delivery.created_at).toLocaleString()}`);
        console.log('');
      });
    } catch (error) {
      this.logger.error('Error getting active deliveries:', error);
    }
  }

  async processPendingOrders(): Promise<void> {
    try {
      const pendingOrders = await this.databaseService.getPendingOrders();
      
      if (pendingOrders.length === 0) {
        console.log('No pending orders to process');
        return;
      }

      console.log(`Processing ${pendingOrders.length} pending orders...`);
      
      let processedCount = 0;
      let errorCount = 0;

      for (const order of pendingOrders) {
        try {
          const gloriaFoodOrder = JSON.parse(order.gloria_food_data);
          
          // Create DoorDash delivery
          const restaurantConfig = this.config.getRestaurantConfig();
          const deliveryRequest = {
            external_delivery_id: order.order_number,
            pickup_address: {
              street_address: restaurantConfig.address.street_address,
              city: restaurantConfig.address.city,
              state: restaurantConfig.address.state,
              zip_code: restaurantConfig.address.zip_code,
              country: restaurantConfig.address.country
            },
            dropoff_address: {
              street_address: order.delivery_address,
              city: order.delivery_city,
              state: order.delivery_state || 'CA',
              zip_code: order.delivery_zip,
              country: order.delivery_country || 'US'
            },
            pickup_phone_number: restaurantConfig.phone,
            dropoff_phone_number: order.customer_phone || '',
            pickup_business_name: restaurantConfig.name,
            pickup_instructions: 'Please pick up the order from the restaurant',
            dropoff_instructions: 'Please deliver to the customer',
            order_value: order.order_total,
            items: [], // You might want to parse items from gloria_food_data
            estimated_pickup_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            estimated_delivery_time: new Date(Date.now() + 45 * 60 * 1000).toISOString()
          };

          const deliveryResponse = await this.doorDashClient.createDelivery(deliveryRequest);

          // Save delivery record
          const deliveryRecord = {
            order_id: order.id!,
            external_delivery_id: order.order_number,
            doordash_delivery_id: deliveryResponse.delivery_id,
            status: deliveryResponse.status,
            tracking_url: deliveryResponse.tracking_url,
            estimated_delivery_time: deliveryResponse.estimated_delivery_time,
            doordash_data: JSON.stringify(deliveryResponse),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          await this.databaseService.saveDelivery(deliveryRecord);
          
          console.log(`✅ Processed order #${order.order_number} -> Delivery #${deliveryResponse.delivery_id}`);
          processedCount++;
        } catch (error) {
          console.log(`❌ Failed to process order #${order.order_number}: ${error}`);
          errorCount++;
        }
      }

      console.log(`\n📊 Processing Complete:`);
      console.log(`   Processed: ${processedCount}`);
      console.log(`   Errors: ${errorCount}`);
      console.log(`   Total: ${pendingOrders.length}`);
    } catch (error) {
      this.logger.error('Error processing pending orders:', error);
    }
  }

  async getOrderStatus(orderId: number): Promise<void> {
    try {
      const order = await this.databaseService.getOrderByGloriaFoodId(orderId);
      
      if (!order) {
        console.log(`Order ${orderId} not found in database`);
        return;
      }

      console.log(`\n📋 Order #${order.order_number}:`);
      console.log(`   Gloria Food ID: ${order.gloria_food_order_id}`);
      console.log(`   Customer: ${order.customer_name}`);
      console.log(`   Status: ${order.order_status}`);
      console.log(`   Total: $${order.order_total}`);
      console.log(`   Created: ${new Date(order.created_at).toLocaleString()}`);
      console.log(`   Updated: ${new Date(order.updated_at).toLocaleString()}`);

      // Check for delivery
      const delivery = await this.databaseService.getDeliveryByExternalId(order.order_number);
      if (delivery) {
        console.log(`\n🚚 Delivery Information:`);
        console.log(`   DoorDash ID: ${delivery.doordash_delivery_id}`);
        console.log(`   Status: ${delivery.status}`);
        console.log(`   Driver: ${delivery.driver_name || 'Not assigned'}`);
        console.log(`   Tracking: ${delivery.tracking_url || 'Not available'}`);
      } else {
        console.log(`\n🚚 No delivery created yet`);
      }
    } catch (error) {
      this.logger.error('Error getting order status:', error);
    }
  }

  async getDeliveryStatus(deliveryId: string): Promise<void> {
    try {
      const delivery = await this.databaseService.getDeliveryByDoorDashId(deliveryId);
      
      if (!delivery) {
        console.log(`Delivery ${deliveryId} not found in database`);
        return;
      }

      console.log(`\n🚚 Delivery #${deliveryId}:`);
      console.log(`   External ID: ${delivery.external_delivery_id}`);
      console.log(`   Status: ${delivery.status}`);
      console.log(`   Driver: ${delivery.driver_name || 'Not assigned'}`);
      console.log(`   Driver Phone: ${delivery.driver_phone || 'Not available'}`);
      console.log(`   Tracking URL: ${delivery.tracking_url || 'Not available'}`);
      console.log(`   Estimated Delivery: ${delivery.estimated_delivery_time || 'Not set'}`);
      console.log(`   Actual Delivery: ${delivery.actual_delivery_time || 'Not delivered'}`);
      console.log(`   Created: ${new Date(delivery.created_at).toLocaleString()}`);
      console.log(`   Updated: ${new Date(delivery.updated_at).toLocaleString()}`);
    } catch (error) {
      this.logger.error('Error getting delivery status:', error);
    }
  }

  showHelp(): void {
    console.log('\n🔧 Webhook Manager Commands:');
    console.log('   test                    - Test API connections');
    console.log('   stats                  - Show order statistics');
    console.log('   pending                - Show pending orders');
    console.log('   active                 - Show active deliveries');
    console.log('   process                - Process all pending orders');
    console.log('   order <id>             - Get order status');
    console.log('   delivery <id>          - Get delivery status');
    console.log('   help                   - Show this help');
    console.log('\n🚀 Start Webhook Service:');
    console.log('   npm run enhanced-webhook');
    console.log('\n📝 Environment Variables Required:');
    console.log('   GLORIA_FOOD_API_URL, GLORIA_FOOD_API_KEY, GLORIA_FOOD_RESTAURANT_ID');
    console.log('   DOORDASH_CLIENT_ID, DOORDASH_CLIENT_SECRET, DOORDASH_DEVELOPER_ID');
    console.log('   RESTAURANT_NAME, RESTAURANT_ADDRESS, RESTAURANT_PHONE');
  }

  async runCommand(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'test':
          await this.testConnections();
          break;
        case 'stats':
          await this.getStatistics();
          break;
        case 'pending':
          await this.getPendingOrders();
          break;
        case 'active':
          await this.getActiveDeliveries();
          break;
        case 'process':
          await this.processPendingOrders();
          break;
        case 'order':
          if (args.length === 0) {
            console.log('Please provide order ID');
            return;
          }
          await this.getOrderStatus(parseInt(args[0]));
          break;
        case 'delivery':
          if (args.length === 0) {
            console.log('Please provide delivery ID');
            return;
          }
          await this.getDeliveryStatus(args[0]);
          break;
        case 'help':
          this.showHelp();
          break;
        default:
          console.log(`Unknown command: ${command}`);
          this.showHelp();
      }
    } catch (error) {
      this.logger.error(`Error running command ${command}:`, error);
    }
  }

  async close(): Promise<void> {
    await this.databaseService.close();
  }
}

// Main execution
async function main() {
  const command = process.argv[2] || 'help';
  const args = process.argv.slice(3);

  const manager = new WebhookManager();
  
  try {
    await manager.initialize();
    await manager.runCommand(command, args);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await manager.close();
  }
}

if (require.main === module) {
  main();
}
