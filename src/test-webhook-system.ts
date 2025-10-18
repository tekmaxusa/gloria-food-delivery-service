/**
 * Webhook System Test Script
 * Demonstrates the complete webhook flow
 */

import { Logger } from './utils/logger';
import { ConfigManager } from './utils/config';
import { DatabaseService } from './services/database-service';
import { GloriaFoodApiClient } from './services/gloria-food-api-client';
import { DoorDashApiClient } from './services/doordash-api-client';
import { GloriaFoodOrder } from './types/gloria-food';

class WebhookSystemTest {
  private logger: Logger;
  private config: ConfigManager;
  private databaseService: DatabaseService;
  private gloriaFoodClient: GloriaFoodApiClient;
  private doorDashClient: DoorDashApiClient;

  constructor() {
    this.logger = new Logger('WebhookSystemTest');
    this.config = ConfigManager.getInstance();
    this.databaseService = new DatabaseService();
    this.gloriaFoodClient = new GloriaFoodApiClient(this.config.getGloriaFoodConfig());
    this.doorDashClient = new DoorDashApiClient(this.config.getDoorDashConfig());
  }

  async initialize(): Promise<void> {
    try {
      await this.databaseService.initialize();
      this.logger.info('Webhook system test initialized');
    } catch (error) {
      this.logger.error('Failed to initialize:', error);
      throw error;
    }
  }

  async testCompleteFlow(): Promise<void> {
    console.log('\n🧪 Testing Complete Webhook Flow...\n');

    try {
      // Step 1: Simulate Gloria Food webhook for new order
      console.log('1️⃣ Simulating Gloria Food webhook for new order...');
      const mockOrder = this.createMockOrder();
      await this.simulateGloriaFoodWebhook(mockOrder);
      console.log('✅ Order saved to database');

      // Step 2: Check if order was saved
      console.log('\n2️⃣ Checking saved order...');
      const savedOrder = await this.databaseService.getOrderByGloriaFoodId(mockOrder.id);
      if (savedOrder) {
        console.log(`✅ Order found: #${savedOrder.order_number}`);
      } else {
        console.log('❌ Order not found in database');
        return;
      }

      // Step 3: Simulate creating DoorDash delivery
      console.log('\n3️⃣ Simulating DoorDash delivery creation...');
      try {
        const deliveryRequest = this.createDeliveryRequest(mockOrder);
        const deliveryResponse = await this.doorDashClient.createDelivery(deliveryRequest);
        console.log(`✅ DoorDash delivery created: ${deliveryResponse.delivery_id}`);

        // Step 4: Save delivery to database
        console.log('\n4️⃣ Saving delivery to database...');
        const deliveryRecord = {
          order_id: savedOrder.id!,
          external_delivery_id: mockOrder.orderNumber,
          doordash_delivery_id: deliveryResponse.delivery_id,
          status: deliveryResponse.status,
          tracking_url: deliveryResponse.tracking_url,
          estimated_delivery_time: deliveryResponse.estimated_delivery_time,
          doordash_data: JSON.stringify(deliveryResponse),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await this.databaseService.saveDelivery(deliveryRecord);
        console.log('✅ Delivery saved to database');

        // Step 5: Simulate DoorDash status updates
        console.log('\n5️⃣ Simulating DoorDash status updates...');
        await this.simulateDoorDashStatusUpdates(deliveryResponse.delivery_id);

        // Step 6: Show final statistics
        console.log('\n6️⃣ Final Statistics:');
        await this.showStatistics();

      } catch (error) {
        console.log(`❌ DoorDash delivery creation failed: ${error}`);
        console.log('This is expected if DoorDash credentials are not configured');
      }

    } catch (error) {
      this.logger.error('Test flow failed:', error);
    }
  }

  private createMockOrder(): GloriaFoodOrder {
    return {
      id: Math.floor(Math.random() * 10000),
      orderNumber: `TEST-${Date.now()}`,
      restaurantId: 1,
      customer: {
        id: 1,
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890'
      },
      items: [
        {
          id: 1,
          name: 'Test Burger',
          quantity: 1,
          price: 12.99,
          totalPrice: 12.99,
          specialInstructions: 'A delicious test burger'
        }
      ],
      subtotal: 12.99,
      tax: 1.30,
      deliveryFee: 2.99,
      tip: 2.00,
      total: 19.28,
      payment: {
        method: 'card',
        amount: 19.28,
        status: 'completed',
        transactionId: 'txn_test_123'
      },
      delivery: {
        address: {
          street: '123 Test Street',
          city: 'Test City',
          state: 'CA',
          zipCode: '12345',
          country: 'US'
        },
        estimatedDeliveryTime: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
        deliveryFee: 2.99,
        deliveryInstructions: 'Please ring the doorbell'
      },
      status: 'confirmed',
      orderType: 'delivery',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private async simulateGloriaFoodWebhook(order: GloriaFoodOrder): Promise<void> {
    // Simulate webhook payload
    const webhookPayload = {
      event_type: 'order.created',
      order_id: order.id,
      order: order
    };

    // Log webhook event
    await this.databaseService.logWebhookEvent(
      'gloria_food_webhook',
      webhookPayload,
      order.id
    );

    // Save order to database
    await this.databaseService.saveOrder(order);
  }

  private createDeliveryRequest(order: GloriaFoodOrder): any {
    const restaurantConfig = this.config.getRestaurantConfig();
    
    return {
      external_delivery_id: order.orderNumber,
      pickup_address: {
        street_address: restaurantConfig.address.street_address,
        city: restaurantConfig.address.city,
        state: restaurantConfig.address.state,
        zip_code: restaurantConfig.address.zip_code,
        country: restaurantConfig.address.country
      },
      dropoff_address: {
        street_address: order.delivery.address.street,
        city: order.delivery.address.city,
        state: order.delivery.address.state || 'CA',
        zip_code: order.delivery.address.zipCode,
        country: order.delivery.address.country || 'US'
      },
      pickup_phone_number: restaurantConfig.phone,
      dropoff_phone_number: order.customer.phone || '',
      pickup_business_name: restaurantConfig.name,
      pickup_instructions: 'Please pick up the order from the restaurant',
      dropoff_instructions: order.delivery.deliveryInstructions || 'Please deliver to the customer',
      order_value: order.total,
      items: order.items.map(item => ({
        name: item.name,
        description: item.specialInstructions || '',
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.totalPrice
      })),
      estimated_pickup_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      estimated_delivery_time: new Date(Date.now() + 45 * 60 * 1000).toISOString()
    };
  }

  private async simulateDoorDashStatusUpdates(deliveryId: string): Promise<void> {
    const statuses = ['accepted', 'picked_up', 'delivered'];
    
    for (const status of statuses) {
      console.log(`   📱 Simulating status: ${status}`);
      
      // Simulate webhook payload
      const webhookPayload = {
        event_type: 'delivery.status_changed',
        delivery_id: deliveryId,
        new_status: status,
        timestamp: new Date().toISOString()
      };

      // Log webhook event
      await this.databaseService.logWebhookEvent(
        'doordash_webhook',
        webhookPayload,
        undefined,
        deliveryId
      );

      // Update delivery status
      await this.databaseService.updateDeliveryStatus(deliveryId, status);

      // Update corresponding order status
      const delivery = await this.databaseService.getDeliveryByDoorDashId(deliveryId);
      if (delivery) {
        const order = await this.databaseService.getOrderByGloriaFoodId(delivery.order_id);
        if (order) {
          let gloriaFoodStatus: string;
          switch (status) {
            case 'accepted':
              gloriaFoodStatus = 'confirmed';
              break;
            case 'picked_up':
              gloriaFoodStatus = 'out_for_delivery';
              break;
            case 'delivered':
              gloriaFoodStatus = 'delivered';
              break;
            default:
              gloriaFoodStatus = order.order_status;
          }

          await this.databaseService.updateOrderStatus(order.gloria_food_order_id, gloriaFoodStatus);
        }
      }

      // Small delay to simulate real-time updates
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async showStatistics(): Promise<void> {
    const stats = await this.databaseService.getOrderStatistics();
    
    console.log(`   📊 Total Orders: ${stats.totalOrders}`);
    console.log(`   📊 Pending Orders: ${stats.pendingOrders}`);
    console.log(`   📊 Active Deliveries: ${stats.activeDeliveries}`);
    console.log(`   📊 Completed Deliveries: ${stats.completedDeliveries}`);
    console.log(`   📊 Total Revenue: $${stats.totalRevenue.toFixed(2)}`);
  }

  async cleanup(): Promise<void> {
    await this.databaseService.close();
  }
}

// Main execution
async function main() {
  const test = new WebhookSystemTest();
  
  try {
    await test.initialize();
    await test.testCompleteFlow();
    
    console.log('\n🎉 Webhook System Test Completed!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Configure your actual API credentials in .env');
    console.log('   2. Start the webhook service: npm run enhanced-webhook');
    console.log('   3. Configure webhooks in Gloria Food and DoorDash dashboards');
    console.log('   4. Monitor orders using: npm run webhook-manager stats');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await test.cleanup();
  }
}

if (require.main === module) {
  main();
}
