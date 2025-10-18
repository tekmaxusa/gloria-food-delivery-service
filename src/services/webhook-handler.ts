/**
 * Webhook Handler for Gloria Food API
 * Handles real-time order updates via webhooks
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { GloriaFoodApiClient } from '../services/gloria-food-api-client';
import { ConfigManager } from '../utils/config';
import { Logger } from '../utils/logger';
import { WebhookPayload, GloriaFoodOrder, OrderStatus } from '../types/gloria-food';

export class GloriaFoodWebhookHandler {
  private app: express.Application;
  private apiClient: GloriaFoodApiClient;
  private config: ConfigManager;
  private logger: Logger;
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.config = ConfigManager.getInstance();
    this.logger = new Logger('GloriaFoodWebhookHandler');
    this.port = port;
    
    this.apiClient = new GloriaFoodApiClient(
      this.config.getGloriaFoodConfig(),
      this.config.getRetryConfig(),
      this.config.getRateLimitConfig()
    );

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      this.logger.info(`Incoming webhook: ${req.method} ${req.path}`, {
        headers: req.headers,
        body: req.body
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Root endpoint with service information
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        service: 'Gloria Food Webhook Handler',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: 'GET /health',
          webhook: 'POST /webhook/gloria-food',
          webhookDelivery: 'POST /webhook/gloria-food/delivery',
          test: 'POST /webhook/test'
        },
        message: 'Gloria Food API Webhook Handler is running successfully!'
      });
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'GloriaFood Webhook Handler'
      });
    });

    // Main webhook endpoint
    this.app.post('/webhook/gloria-food', this.handleWebhook.bind(this));
    
    // Alternative webhook endpoint with order type
    this.app.post('/webhook/gloria-food/:orderType', this.handleWebhookWithType.bind(this));
    
    // Test endpoint for webhook simulation
    this.app.post('/webhook/test', this.handleTestWebhook.bind(this));
    
    // Error handling middleware
    this.app.use(this.errorHandler.bind(this));
  }

  /**
   * Main webhook handler
   */
  private async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload: WebhookPayload = req.body;
      
      // Verify webhook signature if secret is configured
      if (this.config.getWebhookSecret()) {
        const isValid = this.verifyWebhookSignature(req, payload);
        if (!isValid) {
          this.logger.warn('Invalid webhook signature');
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }

      this.logger.info('Received webhook:', {
        event: payload.event,
        orderId: payload.order?.id,
        orderNumber: payload.order?.orderNumber,
        timestamp: payload.timestamp
      });

      // Process the webhook based on event type
      await this.processWebhookEvent(payload);

      res.status(200).json({ 
        success: true, 
        message: 'Webhook processed successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Webhook processing failed:', error);
      next(error);
    }
  }

  /**
   * Webhook handler with order type parameter
   */
  private async handleWebhookWithType(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderType = req.params.orderType;
      const payload: WebhookPayload = req.body;
      
      this.logger.info(`Received webhook for ${orderType} orders:`, {
        event: payload.event,
        orderId: payload.order?.id,
        orderNumber: payload.order?.orderNumber
      });

      // Only process if order type matches
      if (payload.order?.orderType === orderType) {
        await this.processWebhookEvent(payload);
        res.status(200).json({ 
          success: true, 
          message: `${orderType} webhook processed successfully`,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(200).json({ 
          success: true, 
          message: `Order type mismatch, webhook ignored`,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      this.logger.error('Webhook processing failed:', error);
      next(error);
    }
  }

  /**
   * Test webhook handler for development/testing
   */
  private async handleTestWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const testPayload: WebhookPayload = req.body;
      
      this.logger.info('Test webhook received:', testPayload);
      
      // Simulate processing
      await this.simulateWebhookProcessing(testPayload);
      
      res.status(200).json({ 
        success: true, 
        message: 'Test webhook processed successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Test webhook processing failed:', error);
      next(error);
    }
  }

  /**
   * Process webhook events based on event type
   */
  private async processWebhookEvent(payload: WebhookPayload): Promise<void> {
    const { event, order } = payload;

    if (!order) {
      this.logger.warn('Webhook payload missing order data');
      return;
    }

    switch (event) {
      case 'order.created':
        await this.handleOrderCreated(order);
        break;
        
      case 'order.updated':
        await this.handleOrderUpdated(order);
        break;
        
      case 'order.cancelled':
        await this.handleOrderCancelled(order);
        break;
        
      case 'order.delivered':
        await this.handleOrderDelivered(order);
        break;
        
      default:
        this.logger.warn(`Unknown webhook event type: ${event}`);
    }
  }

  /**
   * Handle order created event
   */
  private async handleOrderCreated(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`New order created: ${order.orderNumber}`, {
      orderId: order.id,
      customer: order.customer.name,
      orderType: order.orderType,
      total: order.total,
      status: order.status
    });

    // Only process delivery orders
    if (order.orderType === 'delivery') {
      await this.processNewDeliveryOrder(order);
    } else {
      this.logger.info(`Order ${order.orderNumber} is not a delivery order, skipping`);
    }
  }

  /**
   * Handle order updated event
   */
  private async handleOrderUpdated(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Order updated: ${order.orderNumber}`, {
      orderId: order.id,
      status: order.status,
      updatedAt: order.updatedAt
    });

    // Handle status changes for delivery orders
    if (order.orderType === 'delivery') {
      await this.handleDeliveryOrderStatusChange(order);
    }
  }

  /**
   * Handle order cancelled event
   */
  private async handleOrderCancelled(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Order cancelled: ${order.orderNumber}`, {
      orderId: order.id,
      customer: order.customer.name,
      total: order.total
    });

    if (order.orderType === 'delivery') {
      await this.handleDeliveryOrderCancellation(order);
    }
  }

  /**
   * Handle order delivered event
   */
  private async handleOrderDelivered(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Order delivered: ${order.orderNumber}`, {
      orderId: order.id,
      customer: order.customer.name,
      deliveryTime: new Date().toISOString()
    });

    if (order.orderType === 'delivery') {
      await this.handleDeliveryOrderCompletion(order);
    }
  }

  /**
   * Process new delivery order
   */
  private async processNewDeliveryOrder(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Processing new delivery order: ${order.orderNumber}`);
    
    try {
      // Log order details for delivery service integration
      const deliveryInfo = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        restaurantId: order.restaurantId,
        customer: {
          name: order.customer.name,
          phone: order.customer.phone,
          email: order.customer.email
        },
        deliveryAddress: order.delivery.address,
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

      this.logger.info('New delivery order ready for processing:', deliveryInfo);
      
      // Here you would integrate with DoorDash API or other delivery service
      // Example:
      // await this.doorDashClient.createDelivery(deliveryInfo);
      
      // Send notification to store owner
      await this.sendOrderNotification(order, 'new_order');
      
    } catch (error) {
      this.logger.error(`Failed to process new delivery order ${order.orderNumber}:`, error);
    }
  }

  /**
   * Handle delivery order status changes
   */
  private async handleDeliveryOrderStatusChange(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Delivery order status changed: ${order.orderNumber} -> ${order.status}`);
    
    try {
      // Handle different status changes
      switch (order.status) {
        case 'confirmed':
          await this.handleOrderConfirmed(order);
          break;
        case 'preparing':
          await this.handleOrderPreparing(order);
          break;
        case 'ready':
          await this.handleOrderReady(order);
          break;
        case 'out_for_delivery':
          await this.handleOrderOutForDelivery(order);
          break;
        default:
          this.logger.info(`Status ${order.status} for order ${order.orderNumber} - no specific action needed`);
      }
      
    } catch (error) {
      this.logger.error(`Failed to handle status change for order ${order.orderNumber}:`, error);
    }
  }

  /**
   * Handle order confirmed
   */
  private async handleOrderConfirmed(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Order confirmed: ${order.orderNumber}`);
    await this.sendOrderNotification(order, 'confirmed');
  }

  /**
   * Handle order preparing
   */
  private async handleOrderPreparing(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Order preparing: ${order.orderNumber}`);
    await this.sendOrderNotification(order, 'preparing');
  }

  /**
   * Handle order ready
   */
  private async handleOrderReady(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Order ready: ${order.orderNumber}`);
    await this.sendOrderNotification(order, 'ready');
  }

  /**
   * Handle order out for delivery
   */
  private async handleOrderOutForDelivery(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Order out for delivery: ${order.orderNumber}`);
    await this.sendOrderNotification(order, 'out_for_delivery');
  }

  /**
   * Handle delivery order cancellation
   */
  private async handleDeliveryOrderCancellation(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Delivery order cancelled: ${order.orderNumber}`);
    
    try {
      // Cancel delivery service if already assigned
      // Example:
      // await this.doorDashClient.cancelDelivery(order.id);
      
      await this.sendOrderNotification(order, 'cancelled');
      
    } catch (error) {
      this.logger.error(`Failed to handle cancellation for order ${order.orderNumber}:`, error);
    }
  }

  /**
   * Handle delivery order completion
   */
  private async handleDeliveryOrderCompletion(order: GloriaFoodOrder): Promise<void> {
    this.logger.info(`Delivery order completed: ${order.orderNumber}`);
    
    try {
      // Mark delivery as completed in delivery service
      // Example:
      // await this.doorDashClient.completeDelivery(order.id);
      
      await this.sendOrderNotification(order, 'delivered');
      
    } catch (error) {
      this.logger.error(`Failed to handle completion for order ${order.orderNumber}:`, error);
    }
  }

  /**
   * Send order notification (email, SMS, etc.)
   */
  private async sendOrderNotification(order: GloriaFoodOrder, eventType: string): Promise<void> {
    this.logger.info(`Sending ${eventType} notification for order ${order.orderNumber}`);
    
    try {
      // Here you would integrate with email service (SNS, SendGrid, etc.)
      const notification = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customer: order.customer.name,
        eventType,
        timestamp: new Date().toISOString(),
        orderDetails: {
          items: order.items,
          total: order.total,
          deliveryAddress: order.delivery.address
        }
      };
      
      this.logger.info('Order notification:', notification);
      
      // Example email integration:
      // await this.emailService.sendOrderUpdate(notification);
      
    } catch (error) {
      this.logger.error(`Failed to send notification for order ${order.orderNumber}:`, error);
    }
  }

  /**
   * Simulate webhook processing for testing
   */
  private async simulateWebhookProcessing(payload: WebhookPayload): Promise<void> {
    this.logger.info('Simulating webhook processing...');
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.logger.info('Webhook processing simulation completed');
  }

  /**
   * Verify webhook signature
   */
  private verifyWebhookSignature(req: Request, payload: WebhookPayload): boolean {
    const secret = this.config.getWebhookSecret();
    if (!secret) {
      return true; // No secret configured, skip verification
    }

    const signature = req.headers['x-gloria-signature'] as string;
    if (!signature) {
      this.logger.warn('Missing webhook signature');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      this.logger.warn('Invalid webhook signature');
    }

    return isValid;
  }

  /**
   * Error handling middleware
   */
  private errorHandler(error: Error, req: Request, res: Response, next: NextFunction): void {
    this.logger.error('Webhook error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start the webhook server
   */
  public async start(): Promise<void> {
    try {
      this.app.listen(this.port, () => {
        this.logger.info(`🚀 Gloria Food Webhook Handler started on port ${this.port}`);
        this.logger.info(`Health check: http://localhost:${this.port}/health`);
        this.logger.info(`Webhook endpoint: http://localhost:${this.port}/webhook/gloria-food`);
        this.logger.info(`Test endpoint: http://localhost:${this.port}/webhook/test`);
      });
    } catch (error) {
      this.logger.error('Failed to start webhook server:', error);
      throw error;
    }
  }

  /**
   * Stop the webhook server
   */
  public async stop(): Promise<void> {
    this.logger.info('Stopping Gloria Food Webhook Handler...');
    // Add graceful shutdown logic here
  }
}

// Export is already declared in the class definition above

// Run if executed directly
if (require.main === module) {
  const logger = new Logger('WebhookServer');
  
  try {
    logger.info('Starting Gloria Food Webhook Handler...');
    
    const webhookHandler = new GloriaFoodWebhookHandler(3000);
    webhookHandler.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await webhookHandler.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await webhookHandler.stop();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('Failed to start webhook handler:', error);
    process.exit(1);
  }
}
