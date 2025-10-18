/**
 * Delivery Service Integration
 * Integrates Gloria Food orders with DoorDash delivery service
 */

import { GloriaFoodApiClient } from './gloria-food-api-client';
import { DoorDashApiClient } from './doordash-api-client';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { 
  GloriaFoodOrder, 
  GloriaFoodConfig,
  OrderStatus 
} from '../types/gloria-food';
import { 
  DoorDashConfig,
  DoorDashDeliveryRequest,
  DoorDashDeliveryResponse,
  DoorDashDeliveryStatus,
  DoorDashAddress,
  DoorDashItem
} from '../types/doordash';

export interface DeliveryServiceConfig {
  gloriaFood: GloriaFoodConfig;
  doorDash: DoorDashConfig;
  restaurant: {
    name: string;
    address: DoorDashAddress;
    phone: string;
    businessHours: {
      open: string;
      close: string;
    };
  };
}

export interface DeliveryResult {
  success: boolean;
  deliveryId?: string;
  externalDeliveryId?: string;
  status?: DoorDashDeliveryStatus;
  trackingUrl?: string;
  estimatedDeliveryTime?: string;
  error?: string;
}

export class DeliveryService {
  private gloriaFoodClient: GloriaFoodApiClient;
  private doorDashClient: DoorDashApiClient;
  private config: DeliveryServiceConfig;
  private logger: Logger;

  constructor(config: DeliveryServiceConfig) {
    this.config = config;
    this.logger = new Logger('DeliveryService');
    
    this.gloriaFoodClient = new GloriaFoodApiClient(
      config.gloriaFood,
      { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 },
      { requestsPerMinute: 60, burstLimit: 10 }
    );
    
    this.doorDashClient = new DoorDashApiClient(
      config.doorDash,
      { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 },
      { requestsPerMinute: 60, burstLimit: 10 }
    );
  }

  /**
   * Initialize the delivery service
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Delivery Service...');
    
    try {
      // Test Gloria Food API connection
      const gloriaFoodConnected = await this.gloriaFoodClient.testConnection();
      if (!gloriaFoodConnected) {
        throw new Error('Failed to connect to Gloria Food API');
      }
      this.logger.info('✅ Gloria Food API connected');

      // Test DoorDash API connection
      const doorDashConnected = await this.doorDashClient.testConnection();
      if (!doorDashConnected) {
        throw new Error('Failed to connect to DoorDash API');
      }
      this.logger.info('✅ DoorDash API connected');

      this.logger.info('🚀 Delivery Service initialized successfully');
      
    } catch (error) {
      this.logger.error('❌ Delivery Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Process a Gloria Food order for delivery
   */
  async processOrderForDelivery(order: GloriaFoodOrder): Promise<DeliveryResult> {
    this.logger.info(`Processing order ${order.orderNumber} for delivery`);

    try {
      // Validate order for delivery
      if (!this.isValidForDelivery(order)) {
        return {
          success: false,
          error: 'Order is not valid for delivery'
        };
      }

      // Create DoorDash delivery request
      const deliveryRequest = this.createDoorDashDeliveryRequest(order);
      
      // Submit to DoorDash
      const delivery = await this.doorDashClient.createDelivery(deliveryRequest);
      
      // Update Gloria Food order status
      await this.gloriaFoodClient.updateOrderStatus(order.id, 'out_for_delivery');
      
      this.logger.info(`✅ Order ${order.orderNumber} processed for delivery`, {
        deliveryId: delivery.delivery_id,
        status: delivery.status,
        trackingUrl: delivery.tracking_url
      });

      return {
        success: true,
        deliveryId: delivery.delivery_id,
        externalDeliveryId: delivery.external_delivery_id,
        status: delivery.status,
        trackingUrl: delivery.tracking_url,
        estimatedDeliveryTime: delivery.estimated_delivery_time
      };

    } catch (error) {
      this.logger.error(`❌ Failed to process order ${order.orderNumber} for delivery:`, error);
      
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Process multiple orders for delivery
   */
  async processOrdersForDelivery(orders: GloriaFoodOrder[]): Promise<DeliveryResult[]> {
    this.logger.info(`Processing ${orders.length} orders for delivery`);
    
    const results: DeliveryResult[] = [];
    
    for (const order of orders) {
      try {
        const result = await this.processOrderForDelivery(order);
        results.push(result);
        
        // Add delay between requests to respect rate limits
        await this.sleep(1000);
        
      } catch (error) {
        this.logger.error(`Failed to process order ${order.orderNumber}:`, error);
        results.push({
          success: false,
          error: (error as Error).message
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    this.logger.info(`Delivery processing completed: ${successful} successful, ${failed} failed`);
    
    return results;
  }

  /**
   * Get delivery status for an order
   */
  async getDeliveryStatus(order: GloriaFoodOrder): Promise<DeliveryResult> {
    try {
      const delivery = await this.doorDashClient.getDeliveryByExternalId(order.orderNumber);
      
      return {
        success: true,
        deliveryId: delivery.delivery_id,
        externalDeliveryId: delivery.external_delivery_id,
        status: delivery.status,
        trackingUrl: delivery.tracking_url,
        estimatedDeliveryTime: delivery.estimated_delivery_time
      };

    } catch (error) {
      this.logger.error(`Failed to get delivery status for order ${order.orderNumber}:`, error);
      
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Cancel delivery for an order
   */
  async cancelDelivery(order: GloriaFoodOrder, reason?: string): Promise<DeliveryResult> {
    try {
      const delivery = await this.doorDashClient.getDeliveryByExternalId(order.orderNumber);
      const cancelledDelivery = await this.doorDashClient.cancelDelivery(delivery.delivery_id, reason);
      
      // Update Gloria Food order status
      await this.gloriaFoodClient.updateOrderStatus(order.id, 'cancelled');
      
      this.logger.info(`✅ Delivery cancelled for order ${order.orderNumber}`);
      
      return {
        success: true,
        deliveryId: cancelledDelivery.delivery_id,
        externalDeliveryId: cancelledDelivery.external_delivery_id,
        status: cancelledDelivery.status
      };

    } catch (error) {
      this.logger.error(`Failed to cancel delivery for order ${order.orderNumber}:`, error);
      
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Update delivery status based on DoorDash webhook
   */
  async updateDeliveryStatus(deliveryId: string, status: DoorDashDeliveryStatus): Promise<void> {
    try {
      const delivery = await this.doorDashClient.getDelivery(deliveryId);
      
      // Find corresponding Gloria Food order
      const order = await this.gloriaFoodClient.getOrder(parseInt(delivery.external_delivery_id));
      
      // Map DoorDash status to Gloria Food status
      const gloriaFoodStatus = this.mapDoorDashStatusToGloriaFood(status);
      
      if (gloriaFoodStatus) {
        await this.gloriaFoodClient.updateOrderStatus(order.id, gloriaFoodStatus);
        this.logger.info(`Updated order ${order.orderNumber} status to ${gloriaFoodStatus}`);
      }

    } catch (error) {
      this.logger.error(`Failed to update delivery status for ${deliveryId}:`, error);
    }
  }

  /**
   * Get active deliveries
   */
  async getActiveDeliveries(): Promise<DoorDashDeliveryResponse[]> {
    try {
      return await this.doorDashClient.getActiveDeliveries();
    } catch (error) {
      this.logger.error('Failed to get active deliveries:', error);
      throw error;
    }
  }

  /**
   * Validate if order is suitable for delivery
   */
  private isValidForDelivery(order: GloriaFoodOrder): boolean {
    // Check if it's a delivery order
    if (order.orderType !== 'delivery') {
      this.logger.warn(`Order ${order.orderNumber} is not a delivery order`);
      return false;
    }

    // Check if order has valid delivery address
    if (!order.delivery?.address) {
      this.logger.warn(`Order ${order.orderNumber} has no delivery address`);
      return false;
    }

    // Check if order is in a valid status
    const validStatuses: OrderStatus[] = ['pending', 'confirmed', 'preparing'];
    if (!validStatuses.includes(order.status)) {
      this.logger.warn(`Order ${order.orderNumber} status ${order.status} is not valid for delivery`);
      return false;
    }

    // Check if order has items
    if (!order.items || order.items.length === 0) {
      this.logger.warn(`Order ${order.orderNumber} has no items`);
      return false;
    }

    return true;
  }

  /**
   * Create DoorDash delivery request from Gloria Food order
   */
  private createDoorDashDeliveryRequest(order: GloriaFoodOrder): DoorDashDeliveryRequest {
    const deliveryRequest: DoorDashDeliveryRequest = {
      external_delivery_id: order.orderNumber,
      pickup_address: this.config.restaurant.address,
      dropoff_address: {
        street_address: order.delivery.address.street,
        city: order.delivery.address.city,
        state: order.delivery.address.state || '',
        zip_code: order.delivery.address.zipCode,
        country: order.delivery.address.country,
        lat: order.delivery.address.coordinates?.latitude,
        lng: order.delivery.address.coordinates?.longitude
      },
      pickup_phone_number: this.config.restaurant.phone,
      dropoff_phone_number: order.customer.phone || '',
      pickup_business_name: this.config.restaurant.name,
      pickup_instructions: 'Please pick up the order from the restaurant',
      dropoff_instructions: order.delivery.deliveryInstructions || '',
      order_value: order.total,
      tip: order.tip || 0,
      items: order.items.map(item => ({
        name: item.name,
        description: item.specialInstructions || '',
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.totalPrice
      })),
      estimated_pickup_time: this.calculateEstimatedPickupTime(order),
      estimated_delivery_time: order.delivery.estimatedDeliveryTime,
      contains_alcohol: this.containsAlcohol(order),
      requires_id: this.requiresId(order),
      signature_required: order.total > 50 // Require signature for orders over $50
    };

    return deliveryRequest;
  }

  /**
   * Calculate estimated pickup time
   */
  private calculateEstimatedPickupTime(order: GloriaFoodOrder): string {
    const now = new Date();
    const preparationTime = this.getPreparationTime(order);
    const pickupTime = new Date(now.getTime() + preparationTime * 60000);
    return pickupTime.toISOString();
  }

  /**
   * Get preparation time based on order complexity
   */
  private getPreparationTime(order: GloriaFoodOrder): number {
    // Base preparation time: 15 minutes
    let preparationTime = 15;
    
    // Add time based on number of items
    preparationTime += order.items.length * 2;
    
    // Add time for special instructions
    if (order.specialInstructions) {
      preparationTime += 5;
    }
    
    // Add time for high-value orders
    if (order.total > 50) {
      preparationTime += 10;
    }
    
    return Math.min(preparationTime, 60); // Cap at 60 minutes
  }

  /**
   * Check if order contains alcohol
   */
  private containsAlcohol(order: GloriaFoodOrder): boolean {
    return order.items.some(item => 
      item.name.toLowerCase().includes('alcohol') ||
      item.name.toLowerCase().includes('beer') ||
      item.name.toLowerCase().includes('wine') ||
      item.name.toLowerCase().includes('cocktail')
    );
  }

  /**
   * Check if order requires ID verification
   */
  private requiresId(order: GloriaFoodOrder): boolean {
    return this.containsAlcohol(order) || order.total > 100;
  }

  /**
   * Map DoorDash status to Gloria Food status
   */
  private mapDoorDashStatusToGloriaFood(doorDashStatus: DoorDashDeliveryStatus): OrderStatus | null {
    const statusMap: Record<DoorDashDeliveryStatus, OrderStatus> = {
      'pending': 'confirmed',
      'accepted': 'preparing',
      'picked_up': 'out_for_delivery',
      'delivered': 'delivered',
      'cancelled': 'cancelled',
      'failed': 'cancelled'
    };

    return statusMap[doorDashStatus] || null;
  }

  /**
   * Sleep utility
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get delivery statistics
   */
  async getDeliveryStatistics(): Promise<{
    totalDeliveries: number;
    activeDeliveries: number;
    completedDeliveries: number;
    cancelledDeliveries: number;
    averageDeliveryTime: number;
    successRate: number;
  }> {
    try {
      const deliveries = await this.doorDashClient.listDeliveries({ limit: 1000 });
      
      const stats = {
        totalDeliveries: deliveries.deliveries.length,
        activeDeliveries: 0,
        completedDeliveries: 0,
        cancelledDeliveries: 0,
        averageDeliveryTime: 0,
        successRate: 0
      };

      let totalDeliveryTime = 0;
      let completedCount = 0;

      deliveries.deliveries.forEach(delivery => {
        switch (delivery.status) {
          case 'pending':
          case 'accepted':
          case 'picked_up':
            stats.activeDeliveries++;
            break;
          case 'delivered':
            stats.completedDeliveries++;
            completedCount++;
            if (delivery.actual_delivery_time && delivery.actual_pickup_time) {
              const pickupTime = new Date(delivery.actual_pickup_time);
              const deliveryTime = new Date(delivery.actual_delivery_time);
              totalDeliveryTime += deliveryTime.getTime() - pickupTime.getTime();
            }
            break;
          case 'cancelled':
          case 'failed':
            stats.cancelledDeliveries++;
            break;
        }
      });

      stats.averageDeliveryTime = completedCount > 0 ? totalDeliveryTime / completedCount / 60000 : 0; // in minutes
      stats.successRate = stats.totalDeliveries > 0 ? (stats.completedDeliveries / stats.totalDeliveries) * 100 : 0;

      return stats;

    } catch (error) {
      this.logger.error('Failed to get delivery statistics:', error);
      throw error;
    }
  }
}
