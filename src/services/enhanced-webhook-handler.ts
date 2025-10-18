/**
 * Enhanced Webhook Handler
 * Automatically processes Gloria Food orders and creates DoorDash deliveries
 */

import express, { Request, Response } from 'express';
import { Logger } from '../utils/logger';
import { ConfigManager } from '../utils/config';
import { GloriaFoodApiClient } from './gloria-food-api-client';
import { DoorDashApiClient } from './doordash-api-client';
import { DatabaseService } from './database-service';
import { GloriaFoodOrder, OrderStatus } from '../types/gloria-food';
import { DoorDashDeliveryRequest, DoorDashDeliveryResponse } from '../types/doordash';
import { DeliveryRecord } from '../types/database';

export class EnhancedWebhookHandler {
  private app: express.Application;
  private logger: Logger;
  private config: ConfigManager;
  private gloriaFoodClient: GloriaFoodApiClient;
  private doorDashClient: DoorDashApiClient;
  private databaseService: DatabaseService;
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;
    this.logger = new Logger('EnhancedWebhookHandler');
    this.config = new ConfigManager();
    this.gloriaFoodClient = new GloriaFoodApiClient(this.config.getGloriaFoodConfig());
    this.doorDashClient = new DoorDashApiClient(this.config.getDoorDashConfig());
    this.databaseService = new DatabaseService();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, { 
        body: req.body,
        query: req.query,
        headers: req.headers 
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Gloria Food webhook endpoint
    this.app.post('/webhook/gloria-food', this.handleGloriaFoodWebhook.bind(this));
    
    // DoorDash webhook endpoint
    this.app.post('/webhook/doordash', this.handleDoorDashWebhook.bind(this));
    
    // Health check endpoint
    this.app.get('/health', this.handleHealthCheck.bind(this));
    
    // Manual order processing endpoint
    this.app.post('/process-order/:orderId', this.handleManualOrderProcessing.bind(this));
    
    // Get order status endpoint
    this.app.get('/order/:orderId/status', this.handleGetOrderStatus.bind(this));
    
    // Get delivery status endpoint
    this.app.get('/delivery/:deliveryId/status', this.handleGetDeliveryStatus.bind(this));
    
    // Statistics endpoint
    this.app.get('/statistics', this.handleGetStatistics.bind(this));
    
    // Process all pending orders endpoint
    this.app.post('/process-pending', this.handleProcessPendingOrders.bind(this));
  }

  /**
   * Handle Gloria Food webhook events
   */
  private async handleGloriaFoodWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhookData = req.body;
      this.logger.info('Received Gloria Food webhook', webhookData);

      // Log webhook event
      const webhookLogId = await this.databaseService.logWebhookEvent(
        'gloria_food_webhook',
        webhookData,
        webhookData.order_id
      );

      try {
        // Process the webhook based on event type
        await this.processGloriaFoodWebhook(webhookData);
        
        // Mark webhook as processed
        await this.databaseService.markWebhookProcessed(webhookLogId);
        
        res.status(200).json({ 
          success: true, 
          message: 'Webhook processed successfully',
          webhookLogId 
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Error processing Gloria Food webhook:', error);
        
        // Mark webhook as processed with error
        await this.databaseService.markWebhookProcessed(webhookLogId, errorMessage);
        
        res.status(500).json({ 
          success: false, 
          message: 'Error processing webhook',
          error: errorMessage 
        });
      }
    } catch (error) {
      this.logger.error('Error handling Gloria Food webhook:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  /**
   * Handle DoorDash webhook events
   */
  private async handleDoorDashWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhookData = req.body;
      this.logger.info('Received DoorDash webhook', webhookData);

      // Log webhook event
      const webhookLogId = await this.databaseService.logWebhookEvent(
        'doordash_webhook',
        webhookData,
        undefined,
        webhookData.delivery_id
      );

      try {
        // Process DoorDash webhook
        await this.processDoorDashWebhook(webhookData);
        
        // Mark webhook as processed
        await this.databaseService.markWebhookProcessed(webhookLogId);
        
        res.status(200).json({ 
          success: true, 
          message: 'Webhook processed successfully',
          webhookLogId 
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Error processing DoorDash webhook:', error);
        
        // Mark webhook as processed with error
        await this.databaseService.markWebhookProcessed(webhookLogId, errorMessage);
        
        res.status(500).json({ 
          success: false, 
          message: 'Error processing webhook',
          error: errorMessage 
        });
      }
    } catch (error) {
      this.logger.error('Error handling DoorDash webhook:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error' 
      });
    }
  }

  /**
   * Process Gloria Food webhook data
   */
  private async processGloriaFoodWebhook(webhookData: any): Promise<void> {
    const eventType = webhookData.event_type || webhookData.type;
    const orderId = webhookData.order_id || webhookData.id;

    this.logger.info(`Processing Gloria Food webhook: ${eventType} for order ${orderId}`);

    switch (eventType) {
      case 'order.created':
      case 'order.confirmed':
      case 'order.ready_for_delivery':
        await this.handleNewOrder(orderId);
        break;
      
      case 'order.cancelled':
        await this.handleOrderCancellation(orderId);
        break;
      
      case 'order.status_changed':
        await this.handleOrderStatusChange(orderId, webhookData.new_status);
        break;
      
      default:
        this.logger.warn(`Unknown webhook event type: ${eventType}`);
    }
  }

  /**
   * Handle new order from Gloria Food
   */
  private async handleNewOrder(orderId: number): Promise<void> {
    try {
      this.logger.info(`Processing new order: ${orderId}`);

      // Check if order already exists in database
      const existingOrder = await this.databaseService.getOrderByGloriaFoodId(orderId);
      if (existingOrder) {
        this.logger.info(`Order ${orderId} already exists in database`);
        return;
      }

      // Fetch order details from Gloria Food API
      const order = await this.gloriaFoodClient.getOrder(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found in Gloria Food API`);
      }

      // Save order to database
      await this.databaseService.saveOrder(order);

      // Check if this is a delivery order
      if (order.orderType === 'delivery' && this.shouldCreateDelivery(order)) {
        await this.createDoorDashDelivery(order);
      }

      this.logger.info(`Successfully processed new order: ${orderId}`);
    } catch (error) {
      this.logger.error(`Error processing new order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Handle order cancellation
   */
  private async handleOrderCancellation(orderId: number): Promise<void> {
    try {
      this.logger.info(`Handling order cancellation: ${orderId}`);

      // Update order status in database
      await this.databaseService.updateOrderStatus(orderId, 'cancelled');

      // Cancel DoorDash delivery if exists
      const order = await this.databaseService.getOrderByGloriaFoodId(orderId);
      if (order) {
        const delivery = await this.databaseService.getDeliveryByExternalId(order.order_number);
        if (delivery && delivery.doordash_delivery_id) {
          await this.doorDashClient.cancelDelivery(delivery.doordash_delivery_id);
          await this.databaseService.updateDeliveryStatus(delivery.doordash_delivery_id, 'cancelled');
        }
      }

      this.logger.info(`Successfully handled order cancellation: ${orderId}`);
    } catch (error) {
      this.logger.error(`Error handling order cancellation ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Handle order status change
   */
  private async handleOrderStatusChange(orderId: number, newStatus: string): Promise<void> {
    try {
      this.logger.info(`Handling order status change: ${orderId} -> ${newStatus}`);

      // Update order status in database
      await this.databaseService.updateOrderStatus(orderId, newStatus);

      // If order is ready for delivery, create DoorDash delivery
      if (newStatus === 'ready_for_delivery') {
        const order = await this.databaseService.getOrderByGloriaFoodId(orderId);
        if (order && order.order_type === 'delivery') {
          const delivery = await this.databaseService.getDeliveryByExternalId(order.order_number);
          if (!delivery) {
            // Fetch fresh order data and create delivery
            const freshOrder = await this.gloriaFoodClient.getOrder(orderId);
            if (freshOrder) {
              await this.createDoorDashDelivery(freshOrder);
            }
          }
        }
      }

      this.logger.info(`Successfully handled order status change: ${orderId}`);
    } catch (error) {
      this.logger.error(`Error handling order status change ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Create DoorDash delivery for Gloria Food order
   */
  private async createDoorDashDelivery(order: GloriaFoodOrder): Promise<void> {
    try {
      this.logger.info(`Creating DoorDash delivery for order: ${order.orderNumber}`);

      // Check if delivery already exists
      const existingDelivery = await this.databaseService.getDeliveryByExternalId(order.orderNumber);
      if (existingDelivery) {
        this.logger.info(`Delivery already exists for order: ${order.orderNumber}`);
        return;
      }

      // Prepare DoorDash delivery request
      const deliveryRequest: DoorDashDeliveryRequest = {
        external_delivery_id: order.orderNumber,
        pickup_address: this.config.getRestaurantConfig(),
        dropoff_address: {
          street_address: order.delivery.address.street,
          city: order.delivery.address.city,
          state: order.delivery.address.state || 'CA',
          zip_code: order.delivery.address.zipCode,
          country: order.delivery.address.country || 'US'
        },
        pickup_phone_number: this.config.getRestaurantConfig().phone,
        dropoff_phone_number: order.customer.phone || '',
        pickup_business_name: this.config.getRestaurantConfig().name,
        dropoff_business_name: order.customer.name,
        pickup_instructions: 'Please pick up the order from the restaurant',
        dropoff_instructions: order.delivery.instructions || 'Please deliver to the customer',
        order_value: order.total,
        items: order.items.map(item => ({
          name: item.name,
          description: item.description || '',
          quantity: item.quantity,
          price: item.price
        })),
        pickup_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes from now
        dropoff_time: new Date(Date.now() + 45 * 60 * 1000).toISOString() // 45 minutes from now
      };

      // Create DoorDash delivery
      const deliveryResponse = await this.doorDashClient.createDelivery(deliveryRequest);

      // Save delivery record to database
      const deliveryRecord: DeliveryRecord = {
        order_id: 0, // Will be updated after we get the order ID
        external_delivery_id: order.orderNumber,
        doordash_delivery_id: deliveryResponse.id,
        status: deliveryResponse.status,
        tracking_url: deliveryResponse.tracking_url,
        estimated_delivery_time: deliveryResponse.estimated_delivery_time,
        doordash_data: JSON.stringify(deliveryResponse),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Get order record to link delivery
      const orderRecord = await this.databaseService.getOrderByGloriaFoodId(order.id);
      if (orderRecord) {
        deliveryRecord.order_id = orderRecord.id!;
        await this.databaseService.saveDelivery(deliveryRecord);
      }

      this.logger.info(`Successfully created DoorDash delivery: ${deliveryResponse.id} for order: ${order.orderNumber}`);
    } catch (error) {
      this.logger.error(`Error creating DoorDash delivery for order ${order.orderNumber}:`, error);
      throw error;
    }
  }

  /**
   * Process DoorDash webhook data
   */
  private async processDoorDashWebhook(webhookData: any): Promise<void> {
    const eventType = webhookData.event_type || webhookData.type;
    const deliveryId = webhookData.delivery_id || webhookData.id;

    this.logger.info(`Processing DoorDash webhook: ${eventType} for delivery ${deliveryId}`);

    switch (eventType) {
      case 'delivery.status_changed':
        await this.handleDeliveryStatusChange(deliveryId, webhookData.new_status, webhookData);
        break;
      
      case 'delivery.driver_assigned':
        await this.handleDriverAssignment(deliveryId, webhookData.driver_info);
        break;
      
      case 'delivery.completed':
        await this.handleDeliveryCompleted(deliveryId, webhookData);
        break;
      
      default:
        this.logger.warn(`Unknown DoorDash webhook event type: ${eventType}`);
    }
  }

  /**
   * Handle delivery status change
   */
  private async handleDeliveryStatusChange(deliveryId: string, newStatus: string, driverInfo?: any): Promise<void> {
    try {
      this.logger.info(`Handling delivery status change: ${deliveryId} -> ${newStatus}`);

      // Update delivery status in database
      await this.databaseService.updateDeliveryStatus(deliveryId, newStatus, driverInfo);

      // Update corresponding Gloria Food order status
      const delivery = await this.databaseService.getDeliveryByDoorDashId(deliveryId);
      if (delivery) {
        const order = await this.databaseService.getOrderByGloriaFoodId(delivery.order_id);
        if (order) {
          let gloriaFoodStatus: string;
          switch (newStatus) {
            case 'accepted':
              gloriaFoodStatus = 'confirmed';
              break;
            case 'picked_up':
              gloriaFoodStatus = 'out_for_delivery';
              break;
            case 'delivered':
              gloriaFoodStatus = 'delivered';
              break;
            case 'cancelled':
              gloriaFoodStatus = 'cancelled';
              break;
            default:
              gloriaFoodStatus = order.order_status;
          }

          if (gloriaFoodStatus !== order.order_status) {
            await this.databaseService.updateOrderStatus(order.gloria_food_order_id, gloriaFoodStatus);
            
            // Optionally update Gloria Food API
            try {
              await this.gloriaFoodClient.updateOrderStatus(order.gloria_food_order_id, gloriaFoodStatus as OrderStatus);
            } catch (error) {
              this.logger.warn(`Failed to update Gloria Food order status: ${error}`);
            }
          }
        }
      }

      this.logger.info(`Successfully handled delivery status change: ${deliveryId}`);
    } catch (error) {
      this.logger.error(`Error handling delivery status change ${deliveryId}:`, error);
      throw error;
    }
  }

  /**
   * Handle driver assignment
   */
  private async handleDriverAssignment(deliveryId: string, driverInfo: any): Promise<void> {
    try {
      this.logger.info(`Handling driver assignment: ${deliveryId}`, driverInfo);

      await this.databaseService.updateDeliveryStatus(deliveryId, 'accepted', driverInfo);
      
      this.logger.info(`Successfully handled driver assignment: ${deliveryId}`);
    } catch (error) {
      this.logger.error(`Error handling driver assignment ${deliveryId}:`, error);
      throw error;
    }
  }

  /**
   * Handle delivery completion
   */
  private async handleDeliveryCompleted(deliveryId: string, completionData: any): Promise<void> {
    try {
      this.logger.info(`Handling delivery completion: ${deliveryId}`, completionData);

      await this.databaseService.updateDeliveryStatus(deliveryId, 'delivered', {
        actual_delivery_time: completionData.completed_at || new Date().toISOString()
      });

      this.logger.info(`Successfully handled delivery completion: ${deliveryId}`);
    } catch (error) {
      this.logger.error(`Error handling delivery completion ${deliveryId}:`, error);
      throw error;
    }
  }

  /**
   * Check if order should create a delivery
   */
  private shouldCreateDelivery(order: GloriaFoodOrder): boolean {
    // Only create delivery for delivery orders that are confirmed or ready
    return order.orderType === 'delivery' && 
           ['confirmed', 'ready_for_delivery'].includes(order.status);
  }

  /**
   * Handle manual order processing
   */
  private async handleManualOrderProcessing(req: Request, res: Response): Promise<void> {
    try {
      const orderId = parseInt(req.params.orderId);
      
      if (isNaN(orderId)) {
        res.status(400).json({ success: false, message: 'Invalid order ID' });
        return;
      }

      await this.handleNewOrder(orderId);
      
      res.status(200).json({ 
        success: true, 
        message: `Order ${orderId} processed successfully` 
      });
    } catch (error) {
      this.logger.error('Error in manual order processing:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error processing order',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle get order status
   */
  private async handleGetOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const orderId = parseInt(req.params.orderId);
      
      if (isNaN(orderId)) {
        res.status(400).json({ success: false, message: 'Invalid order ID' });
        return;
      }

      const order = await this.databaseService.getOrderByGloriaFoodId(orderId);
      
      if (!order) {
        res.status(404).json({ success: false, message: 'Order not found' });
        return;
      }

      res.status(200).json({ 
        success: true, 
        order: {
          id: order.gloria_food_order_id,
          orderNumber: order.order_number,
          status: order.order_status,
          customerName: order.customer_name,
          total: order.order_total,
          createdAt: order.created_at,
          updatedAt: order.updated_at
        }
      });
    } catch (error) {
      this.logger.error('Error getting order status:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error getting order status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle get delivery status
   */
  private async handleGetDeliveryStatus(req: Request, res: Response): Promise<void> {
    try {
      const deliveryId = req.params.deliveryId;
      
      const delivery = await this.databaseService.getDeliveryByDoorDashId(deliveryId);
      
      if (!delivery) {
        res.status(404).json({ success: false, message: 'Delivery not found' });
        return;
      }

      res.status(200).json({ 
        success: true, 
        delivery: {
          id: delivery.doordash_delivery_id,
          externalId: delivery.external_delivery_id,
          status: delivery.status,
          driverName: delivery.driver_name,
          driverPhone: delivery.driver_phone,
          trackingUrl: delivery.tracking_url,
          estimatedDeliveryTime: delivery.estimated_delivery_time,
          actualDeliveryTime: delivery.actual_delivery_time,
          createdAt: delivery.created_at,
          updatedAt: delivery.updated_at
        }
      });
    } catch (error) {
      this.logger.error('Error getting delivery status:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error getting delivery status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle get statistics
   */
  private async handleGetStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.databaseService.getOrderStatistics();
      
      res.status(200).json({ 
        success: true, 
        statistics: stats
      });
    } catch (error) {
      this.logger.error('Error getting statistics:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error getting statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle process pending orders
   */
  private async handleProcessPendingOrders(req: Request, res: Response): Promise<void> {
    try {
      const pendingOrders = await this.databaseService.getPendingOrders();
      let processedCount = 0;
      let errorCount = 0;

      for (const order of pendingOrders) {
        try {
          const gloriaFoodOrder = JSON.parse(order.gloria_food_data) as GloriaFoodOrder;
          await this.createDoorDashDelivery(gloriaFoodOrder);
          processedCount++;
        } catch (error) {
          this.logger.error(`Error processing pending order ${order.order_number}:`, error);
          errorCount++;
        }
      }

      res.status(200).json({ 
        success: true, 
        message: `Processed ${processedCount} orders, ${errorCount} errors`,
        processed: processedCount,
        errors: errorCount,
        total: pendingOrders.length
      });
    } catch (error) {
      this.logger.error('Error processing pending orders:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error processing pending orders',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Handle health check
   */
  private async handleHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      // Test database connection
      await this.databaseService.getOrderStatistics();
      
      res.status(200).json({ 
        success: true, 
        message: 'Service is healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    } catch (error) {
      this.logger.error('Health check failed:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Service is unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Start the webhook server
   */
  async start(): Promise<void> {
    try {
      // Initialize database
      await this.databaseService.initialize();
      
      // Start server
      this.app.listen(this.port, () => {
        this.logger.info(`Enhanced webhook handler started on port ${this.port}`);
        this.logger.info('Available endpoints:');
        this.logger.info(`  POST /webhook/gloria-food - Gloria Food webhook endpoint`);
        this.logger.info(`  POST /webhook/doordash - DoorDash webhook endpoint`);
        this.logger.info(`  GET  /health - Health check`);
        this.logger.info(`  POST /process-order/:orderId - Manual order processing`);
        this.logger.info(`  GET  /order/:orderId/status - Get order status`);
        this.logger.info(`  GET  /delivery/:deliveryId/status - Get delivery status`);
        this.logger.info(`  GET  /statistics - Get order statistics`);
        this.logger.info(`  POST /process-pending - Process all pending orders`);
      });
    } catch (error) {
      this.logger.error('Failed to start webhook handler:', error);
      throw error;
    }
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<void> {
    try {
      await this.databaseService.close();
      this.logger.info('Enhanced webhook handler stopped');
    } catch (error) {
      this.logger.error('Error stopping webhook handler:', error);
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const port = parseInt(process.env.WEBHOOK_PORT || '3000');
  const handler = new EnhancedWebhookHandler(port);
  
  handler.start().catch((error) => {
    console.error('Failed to start webhook handler:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down webhook handler...');
    await handler.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down webhook handler...');
    await handler.stop();
    process.exit(0);
  });
}
