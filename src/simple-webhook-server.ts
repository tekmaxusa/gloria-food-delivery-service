/**
 * Simple Webhook Server for Sue's Hero
 * Runs on localhost:3000
 */

import express, { Request, Response } from 'express';
import { Logger } from '../utils/logger';
import { ConfigManager } from '../utils/config';
import { GloriaFoodApiClient } from './gloria-food-api-client';
import { DatabaseService } from './database-service';

export class SimpleWebhookServer {
  private app: express.Application;
  private logger: Logger;
  private config: ConfigManager;
  private gloriaFoodClient: GloriaFoodApiClient;
  private databaseService: DatabaseService;
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

    // Gloria Food webhook endpoint
    this.app.post('/webhook/gloria-food', async (req: Request, res: Response) => {
      try {
        this.logger.info('Received Gloria Food webhook', req.body);
        
        // Process the webhook data
        const webhookData = req.body;
        
        // Save to database if needed
        if (webhookData.order) {
          await this.databaseService.saveOrder(webhookData.order);
          this.logger.info(`Order ${webhookData.order.orderNumber} saved to database`);
        }

        res.status(200).json({ 
          success: true, 
          message: 'Webhook processed successfully',
          timestamp: new Date().toISOString()
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

    // Get orders endpoint
    this.app.get('/orders', async (req: Request, res: Response) => {
      try {
        const orders = await this.gloriaFoodClient.getOrders();
        res.json({
          success: true,
          data: orders,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching orders:', error);
        res.status(500).json({
          success: false,
          message: 'Error fetching orders',
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
        const orders = await this.gloriaFoodClient.getOrders();
        const stats = {
          totalOrders: orders.orders.length,
          ordersByStatus: {} as Record<string, number>,
          totalRevenue: 0,
          averageOrderValue: 0
        };

        orders.orders.forEach(order => {
          stats.ordersByStatus[order.status] = (stats.ordersByStatus[order.status] || 0) + 1;
          stats.totalRevenue += order.total;
        });

        stats.averageOrderValue = stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;

        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error('Error fetching stats:', error);
        res.status(500).json({
          success: false,
          message: 'Error fetching statistics',
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
