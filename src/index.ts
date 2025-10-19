/**
 * Main script to fetch and process delivery orders from Gloria Food API
 */

import { GloriaFoodApiClient } from './services/gloria-food-api-client';
import { ConfigManager } from './utils/config';
import { Logger } from './utils/logger';
import { GloriaFoodOrder, OrderStatus } from './types/gloria-food';

class DeliveryOrderProcessor {
  private apiClient: GloriaFoodApiClient;
  private config: ConfigManager;
  private logger: Logger;

  constructor() {
    this.config = ConfigManager.getInstance();
    this.logger = new Logger('DeliveryOrderProcessor');
    
    // Validate configuration
    if (!this.config.validateConfig()) {
      throw new Error('Invalid configuration. Please check your environment variables.');
    }

    this.apiClient = new GloriaFoodApiClient(
      this.config.getGloriaFoodConfig(),
      this.config.getRetryConfig(),
      this.config.getRateLimitConfig()
    );
  }

  /**
   * Initialize the processor and test API connection
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Delivery Order Processor...');
    
    try {
      const isConnected = await this.apiClient.testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to Gloria Food API');
      }
      
      this.logger.info('Successfully connected to Gloria Food API');
      
      const healthStatus = await this.apiClient.getHealthStatus();
      this.logger.info('API Health Status:', healthStatus);
      
    } catch (error) {
      this.logger.error('Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Fetch all pending delivery orders
   */
  async fetchPendingDeliveryOrders(): Promise<GloriaFoodOrder[]> {
    this.logger.info('Fetching pending delivery orders...');
    
    try {
      const orders = await this.apiClient.getPendingDeliveryOrders();
      this.logger.info(`Found ${orders.length} pending delivery orders`);
      
      return orders;
    } catch (error) {
      this.logger.error('Failed to fetch pending delivery orders:', error);
      throw error;
    }
  }

  /**
   * Fetch all delivery orders with optional filters
   */
  async fetchDeliveryOrders(filters?: {
    status?: OrderStatus[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Promise<GloriaFoodOrder[]> {
    this.logger.info('Fetching delivery orders with filters:', filters);
    
    try {
      const orders = await this.apiClient.getDeliveryOrders(filters);
      this.logger.info(`Found ${orders.length} delivery orders`);
      
      return orders;
    } catch (error) {
      this.logger.error('Failed to fetch delivery orders:', error);
      throw error;
    }
  }

  /**
   * Process a single delivery order
   */
  async processDeliveryOrder(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Processing delivery order ${order.orderNumber}`, {
      orderId: order.id,
      customerName: order.customer.name,
      total: order.total,
      status: order.status
    });

    try {
      // Log order details
      this.logOrderDetails(order);

      // Here you would integrate with DoorDash API or other delivery service
      // For now, we'll just log the order details
      await this.logOrderForDelivery(order);

      // Update order status if needed
      if (order.status === 'pending') {
        await this.apiClient.updateOrderStatus(order.id, 'confirmed');
        this.logger.info(`Updated order ${order.orderNumber} status to confirmed`);
      }

    } catch (error) {
      this.logger.error(`Failed to process order ${order.orderNumber}:`, error);
      throw error;
    }
  }

  /**
   * Process multiple delivery orders
   */
  async processDeliveryOrders(orders: GloriaFoodOrder[]): Promise<void> {
    this.logger.info(`Processing ${orders.length} delivery orders...`);
    
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };

    for (const order of orders) {
      try {
        await this.processDeliveryOrder(order);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Order ${order.orderNumber}: ${error}`);
        this.logger.error(`Failed to process order ${order.orderNumber}:`, error);
      }
    }

    this.logger.info('Order processing completed:', results);
  }

  /**
   * Log detailed order information
   */
  private logOrderDetails(order: GloriaFoodOrder): void {
    this.logger.info('Order Details:', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customer: {
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone
      },
      delivery: {
        address: order.delivery.address,
        instructions: order.delivery.deliveryInstructions,
        fee: order.delivery.deliveryFee
      },
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice
      })),
      totals: {
        subtotal: order.subtotal,
        tax: order.tax,
        deliveryFee: order.deliveryFee,
        tip: order.tip,
        total: order.total
      },
      payment: order.payment,
      status: order.status,
      createdAt: order.createdAt
    });
  }

  /**
   * Log order information formatted for delivery service integration
   */
  private async logOrderForDelivery(order: GloriaFoodOrder): Promise<void> {
    const deliveryInfo = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      restaurantId: order.restaurantId,
      customer: {
        name: order.customer.name,
        phone: order.customer.phone,
        email: order.customer.email
      },
      deliveryAddress: {
        street: order.delivery.address.street,
        city: order.delivery.address.city,
        state: order.delivery.address.state,
        zipCode: order.delivery.address.zipCode,
        country: order.delivery.address.country,
        coordinates: order.delivery.address.coordinates
      },
      items: order.items,
      totals: {
        subtotal: order.subtotal,
        tax: order.tax,
        deliveryFee: order.deliveryFee,
        tip: order.tip,
        total: order.total
      },
      specialInstructions: order.specialInstructions,
      deliveryInstructions: order.delivery.deliveryInstructions,
      estimatedDeliveryTime: order.delivery.estimatedDeliveryTime,
      createdAt: order.createdAt
    };

    this.logger.info('Order ready for delivery service integration:', deliveryInfo);
    
    // Here you would send this data to DoorDash API or other delivery service
    // Example:
    // await this.doorDashClient.createDelivery(deliveryInfo);
  }

  /**
   * Get order statistics
   */
  async getOrderStatistics(): Promise<{
    totalOrders: number;
    ordersByStatus: Record<string, number>;
    totalRevenue: number;
    averageOrderValue: number;
  }> {
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
        // Count by status
        stats.ordersByStatus[order.status] = (stats.ordersByStatus[order.status] || 0) + 1;
        
        // Calculate revenue
        stats.totalRevenue += order.total;
      });

      stats.averageOrderValue = stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;

      this.logger.info('Order statistics:', stats);
      return stats;

    } catch (error) {
      this.logger.error('Failed to get order statistics:', error);
      throw error;
    }
  }

  /**
   * Run the main processing loop
   */
  async run(): Promise<void> {
    this.logger.info('Starting delivery order processing...');
    
    try {
      await this.initialize();
      
      // Fetch and process pending orders
      const pendingOrders = await this.fetchPendingDeliveryOrders();
      if (pendingOrders.length > 0) {
        await this.processDeliveryOrders(pendingOrders);
      } else {
        this.logger.info('No pending delivery orders found');
      }

      // Get statistics
      const stats = await this.getOrderStatistics();
      this.logger.info('Processing completed. Final statistics:', stats);

    } catch (error) {
      this.logger.error('Processing failed:', error);
      throw error;
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const logger = new Logger('Main');
  
  try {
    logger.info('Starting Gloria Food Delivery Service...');
    
    const processor = new DeliveryOrderProcessor();
    await processor.run();
    
    logger.info('Gloria Food Delivery Service completed successfully');
    process.exit(0);
    
  } catch (error) {
    logger.error('Gloria Food Delivery Service failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  const logger = new Logger('Main');
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  const logger = new Logger('Main');
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { DeliveryOrderProcessor };
