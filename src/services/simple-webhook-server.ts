/**
 * Simple Webhook Server for Sue's Hero
 * Runs on localhost:3000
 */

import express, { Request, Response } from 'express';
import { Logger } from '../utils/logger';
import { ConfigManager } from '../utils/config';
import { GloriaFoodApiClient } from './gloria-food-api-client';
import { MySQLDatabaseService } from './mysql-database-service';
import { DoorDashApiClient } from './doordash-api-client';
import { GloriaFoodOrder } from '../types/gloria-food';
import { DoorDashDeliveryRequest } from '../types/doordash';

export class SimpleWebhookServer {
  private app: express.Application;
  private logger: Logger;
  private config: ConfigManager;
  private gloriaFoodClient: GloriaFoodApiClient;
  private databaseService: MySQLDatabaseService;
  private doorDashClient: DoorDashApiClient | null = null;
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;
    this.logger = new Logger('SimpleWebhookServer');
    this.config = ConfigManager.getInstance();
    this.gloriaFoodClient = new GloriaFoodApiClient(
      this.config.getGloriaFoodConfig(),
      this.config.getRetryConfig(),
      this.config.getRateLimitConfig()
    );
    this.databaseService = new MySQLDatabaseService();
    
    // Initialize DoorDash client if credentials are available
    this.initializeDoorDashClient();

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Initialize DoorDash client if credentials are available
   */
  private initializeDoorDashClient(): void {
    try {
      const doorDashConfig = this.config.getDoorDashConfig();
      this.doorDashClient = new DoorDashApiClient(
        doorDashConfig,
        this.config.getRetryConfig(),
        this.config.getRateLimitConfig()
      );
      this.logger.info('DoorDash client initialized successfully');
    } catch (error) {
      this.logger.warn('DoorDash client not initialized - credentials missing or invalid:', error);
      this.doorDashClient = null;
    }
  }

  /**
   * Create DoorDash delivery for a Gloria Food order
   */
  private async createDoorDashDelivery(order: GloriaFoodOrder): Promise<void> {
    if (!this.doorDashClient) {
      this.logger.warn('DoorDash client not available - skipping delivery creation');
      return;
    }

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
        pickup_address: {
          street_address: "123 Main Street", // Sue's Hero address - update this
          city: "Your City",
          state: "Your State", 
          zip_code: "12345",
          country: "US"
        },
        dropoff_address: {
          street_address: order.delivery.address.street,
          city: order.delivery.address.city,
          state: order.delivery.address.state || 'CA',
          zip_code: order.delivery.address.zipCode,
          country: order.delivery.address.country || 'US'
        },
        pickup_phone_number: "+1234567890", // Sue's Hero phone - update this
        dropoff_phone_number: order.customer.phone || '',
        pickup_business_name: "Sue's Hero",
        pickup_instructions: 'Please pick up the order from Sue\'s Hero restaurant',
        dropoff_instructions: order.delivery.deliveryInstructions || 'Please deliver to the customer',
        order_value: order.total,
        items: order.items.map(item => ({
          name: item.name,
          description: '',
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.price * item.quantity
        })),
        estimated_pickup_time: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
        estimated_delivery_time: new Date(Date.now() + 45 * 60 * 1000).toISOString() // 45 minutes from now
      };

      // Create delivery via DoorDash API
      const deliveryResponse = await this.doorDashClient.createDelivery(deliveryRequest);
      
      // Save delivery record to database
      await this.databaseService.saveDelivery({
        external_delivery_id: order.orderNumber,
        doordash_delivery_id: deliveryResponse.delivery_id,
        order_id: order.id,
        status: deliveryResponse.status,
        pickup_address: JSON.stringify(deliveryRequest.pickup_address),
        dropoff_address: JSON.stringify(deliveryRequest.dropoff_address),
        pickup_time: deliveryRequest.estimated_pickup_time,
        dropoff_time: deliveryRequest.estimated_delivery_time,
        driver_name: null,
        driver_phone: null,
        tracking_url: deliveryResponse.tracking_url,
        created_at: new Date(),
        updated_at: new Date()
      });

      this.logger.info(`DoorDash delivery created successfully: ${deliveryResponse.delivery_id}`);
      
    } catch (error) {
      this.logger.error(`Failed to create DoorDash delivery for order ${order.orderNumber}:`, error);
      throw error;
    }
  }

  /**
   * Handle delivery status change from DoorDash
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
            this.logger.info(`Updated Gloria Food order ${order.order_number} status to ${gloriaFoodStatus}`);
          }
        }
      }

      this.logger.info(`Successfully handled delivery status change: ${deliveryId}`);
    } catch (error) {
      this.logger.error(`Error handling delivery status change ${deliveryId}:`, error);
      throw error;
    }
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

    // Logging middleware
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        service: "Sue's Hero Delivery Service",
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: 'GET /health',
          webhook: 'POST /webhook/gloria-food',
          orders: 'GET /orders',
          menu: 'GET /menu',
          stats: 'GET /stats'
        },
        message: "Sue's Hero Delivery Service is running on localhost!"
      });
    });

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: "Sue's Hero Webhook Server",
        uptime: process.uptime()
      });
    });

    // Gloria Food webhook endpoint - GET (for browser viewing)
    this.app.get('/webhook/gloria-food', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: "Sue's Hero Gloria Food Webhook Endpoint",
        description: "This endpoint receives webhook notifications from Gloria Food",
        method: "POST",
        usage: "Send POST requests to this endpoint with order data",
        timestamp: new Date().toISOString(),
        endpoints: {
          webhook: "POST /webhook/gloria-food",
          orders: "GET /orders",
          menu: "GET /menu",
          stats: "GET /stats",
          health: "GET /health"
        }
      });
    });

    // Gloria Food webhook endpoint - POST (for receiving webhooks)
    this.app.post('/webhook/gloria-food', async (req: Request, res: Response) => {
      try {
        this.logger.info('Received Gloria Food webhook', req.body);
        
        // Process the webhook data
        const webhookData = req.body;
        
        // Save to database if needed
        if (webhookData.order) {
          const order: GloriaFoodOrder = webhookData.order;
          
          // Save order to database
          await this.databaseService.saveOrder(order);
          this.logger.info(`Order ${order.orderNumber} saved to database`);

          // If it's a delivery order, create DoorDash delivery
          if (order.orderType === 'delivery') {
            try {
              await this.createDoorDashDelivery(order);
              this.logger.info(`DoorDash delivery created for order ${order.orderNumber}`);
            } catch (deliveryError) {
              this.logger.error(`Failed to create DoorDash delivery for order ${order.orderNumber}:`, deliveryError);
              // Don't fail the webhook if delivery creation fails
            }
          }
        }

        res.status(200).json({ 
          success: true, 
          message: 'Webhook processed successfully',
          timestamp: new Date().toISOString(),
          doorDashEnabled: this.doorDashClient !== null
        });
      } catch (error) {
        this.logger.error('Error processing webhook:', error);
        res.status(500).json({ 
          success: false, 
          message: 'Error processing webhook',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get orders endpoint (from XAMPP database)
    this.app.get('/orders', async (req: Request, res: Response) => {
      try {
        const orders = await this.databaseService.getAllOrders();
        res.json({
          success: true,
          data: {
            orders: orders,
            total: orders.length,
            source: 'XAMPP MySQL Database'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching orders from XAMPP database:', error);
        res.status(500).json({
          success: false,
          message: 'Error fetching orders from XAMPP database',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get menu endpoint
    this.app.get('/menu', async (req: Request, res: Response) => {
      try {
        const menu = await this.gloriaFoodClient.getMenu();
        res.json({
          success: true,
          data: menu,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching menu:', error);
        res.status(500).json({
          success: false,
          message: 'Error fetching menu',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Statistics endpoint
    this.app.get('/stats', async (req: Request, res: Response) => {
      try {
        const stats = await this.databaseService.getOrderStatistics();
        
        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString(),
          source: 'XAMPP MySQL Database'
        });
      } catch (error) {
        this.logger.error('Error fetching stats from XAMPP database:', error);
        res.status(500).json({
          success: false,
          message: 'Error fetching statistics from XAMPP database',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // DoorDash webhook endpoint
    this.app.post('/webhook/doordash', async (req: Request, res: Response) => {
      try {
        this.logger.info('Received DoorDash webhook', req.body);

        const webhookData = req.body;
        const eventType = webhookData.event_type;

        switch (eventType) {
          case 'delivery.accepted':
            await this.handleDeliveryStatusChange(webhookData.delivery_id, 'accepted', webhookData.driver_info);
            break;
          case 'delivery.picked_up':
            await this.handleDeliveryStatusChange(webhookData.delivery_id, 'picked_up', webhookData.driver_info);
            break;
          case 'delivery.delivered':
            await this.handleDeliveryStatusChange(webhookData.delivery_id, 'delivered', webhookData.driver_info);
            break;
          case 'delivery.cancelled':
            await this.handleDeliveryStatusChange(webhookData.delivery_id, 'cancelled', webhookData.driver_info);
            break;
          default:
            this.logger.warn(`Unknown DoorDash webhook event type: ${eventType}`);
        }

        res.status(200).json({
          success: true,
          message: 'DoorDash webhook processed successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error processing DoorDash webhook:', error);
        res.status(500).json({
          success: false,
          message: 'Error processing DoorDash webhook',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get deliveries endpoint
    this.app.get('/deliveries', async (req: Request, res: Response) => {
      try {
        const deliveries = await this.databaseService.getAllDeliveries();
        res.json({
          success: true,
          data: {
            deliveries: deliveries,
            total: deliveries.length,
            source: 'XAMPP MySQL Database'
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching deliveries from XAMPP database:', error);
        res.status(500).json({
          success: false,
          message: 'Error fetching deliveries from XAMPP database',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Test endpoint
    this.app.post('/test', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'Test endpoint working',
        receivedData: req.body,
        timestamp: new Date().toISOString()
      });
    });
  }

  async start(): Promise<void> {
    try {
      // Initialize database
      await this.databaseService.initialize();
      this.logger.info('Database initialized');

      // Test API connection
      const isConnected = await this.gloriaFoodClient.testConnection();
      if (isConnected) {
        this.logger.info('Successfully connected to Sue\'s Hero API');
      } else {
        this.logger.warn('Failed to connect to Sue\'s Hero API');
      }

      // Start server
      this.app.listen(this.port, () => {
        this.logger.info(`🚀 Sue's Hero Delivery Service running on http://localhost:${this.port}`);
        this.logger.info(`📡 Webhook endpoint: http://localhost:${this.port}/webhook/gloria-food`);
        this.logger.info(`📊 Orders endpoint: http://localhost:${this.port}/orders`);
        this.logger.info(`🍕 Menu endpoint: http://localhost:${this.port}/menu`);
        this.logger.info(`📈 Stats endpoint: http://localhost:${this.port}/stats`);
        this.logger.info(`❤️ Health check: http://localhost:${this.port}/health`);
      });

    } catch (error) {
      this.logger.error('Failed to start server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping Sue\'s Hero Delivery Service...');
    // Add cleanup logic here if needed
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new SimpleWebhookServer(3000);
  
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down Sue\'s Hero Delivery Service...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down Sue\'s Hero Delivery Service...');
    await server.stop();
    process.exit(0);
  });
}

export default SimpleWebhookServer;
