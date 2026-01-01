import express, { Request, Response } from 'express';
import { DatabaseFactory, IDatabase } from './database-factory';
import chalk from 'chalk';
import * as dotenv from 'dotenv';

dotenv.config();

class GloriaFoodWebhookServer {
  private app: express.Application;
  private database: IDatabase;
  private port: number;

  constructor(database?: IDatabase, port: number = 3000) {
    this.app = express();
    this.database = database || DatabaseFactory.createDatabase();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Log all incoming requests
    this.app.use((req, res, next) => {
      console.log(chalk.gray(`[${new Date().toISOString()}] ${req.method} ${req.path}`));
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/', async (req: Request, res: Response) => {
      try {
        const totalOrders = await this.handleAsync(this.database.getOrderCount());
        res.json({ 
          status: 'ok', 
          service: 'GloriaFood Webhook Server',
          totalOrders,
          endpoints: {
            webhook: '/webhook',
            orders: '/orders',
            health: '/health'
          }
        });
      } catch (error: any) {
        res.status(500).json({ 
          status: 'error', 
          error: error.message 
        });
      }
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({ status: 'ok', service: 'GloriaFood Webhook Server' });
    });

    // Webhook endpoint for receiving orders from GloriaFood
    this.app.post('/webhook', async (req: Request, res: Response) => {
      try {
        const orderData = req.body;
        
        console.log(chalk.cyan('\n📥 Received webhook from GloriaFood'));
        console.log(chalk.gray(`  Method: ${req.method}`));
        console.log(chalk.gray(`  Headers:`, JSON.stringify(req.headers, null, 2)));
        console.log(chalk.gray(`  Body:`, JSON.stringify(orderData, null, 2)));

        // Store order in database
        const savedOrder = await this.handleAsync(this.database.insertOrUpdateOrder(orderData));

        if (savedOrder) {
          console.log(chalk.green(`  ✅ Order saved: #${savedOrder.gloriafood_order_id}`));
          await this.displayOrder(savedOrder, true);
        } else {
          console.log(chalk.yellow(`  ⚠️  Order received but could not be saved`));
        }

        // Respond to GloriaFood with success
        res.status(200).json({ 
          success: true, 
          message: 'Order received',
          order_id: savedOrder?.gloriafood_order_id 
        });
      } catch (error: any) {
        console.error(chalk.red('  ❌ Error processing webhook:'), error.message);
        console.error(chalk.red('  Stack:'), error.stack);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Also accept GET requests (some webhook configurations test with GET)
    this.app.get('/webhook', (req: Request, res: Response) => {
      console.log(chalk.yellow('\n⚠️  Received GET request on /webhook (usually webhooks use POST)'));
      console.log(chalk.gray(`  Query:`, JSON.stringify(req.query)));
      res.status(200).json({ 
        message: 'Webhook endpoint is active. Send POST requests with order data.',
        method: 'POST',
        endpoint: '/webhook'
      });
    });

    // Get all orders endpoint
    this.app.get('/orders', async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const orders = await this.handleAsync(this.database.getAllOrders(limit));
        res.status(200).json({ 
          success: true,
          count: orders.length,
          orders 
        });
      } catch (error: any) {
        res.status(500).json({ 
          success: false,
          error: error.message 
        });
      }
    });

    // Get order by ID
    this.app.get('/orders/:orderId', async (req: Request, res: Response) => {
      try {
        const order = await this.handleAsync(this.database.getOrderByGloriaFoodId(req.params.orderId));
        if (!order) {
          return res.status(404).json({ 
            success: false,
            error: 'Order not found' 
          });
        }
        res.status(200).json({ 
          success: true,
          order 
        });
      } catch (error: any) {
        res.status(500).json({ 
          success: false,
          error: error.message 
        });
      }
    });
  }

  private async displayOrder(order: any, isNew: boolean = false): Promise<void> {
    const prefix = isNew ? chalk.green('🆕 NEW ORDER') : chalk.blue('📦 ORDER');
    
    console.log(`\n${prefix} ${chalk.bold(`#${order.gloriafood_order_id || order.id}`)}`);
    console.log(chalk.gray('  ──────────────────────────────────────────'));
    
    if (order.customer_name) {
      console.log(`  ${chalk.bold('Customer:')} ${order.customer_name}`);
    }
    if (order.customer_phone) {
      console.log(`  ${chalk.bold('Phone:')} ${order.customer_phone}`);
    }
    if (order.customer_email) {
      console.log(`  ${chalk.bold('Email:')} ${order.customer_email}`);
    }
    if (order.delivery_address) {
      console.log(`  ${chalk.bold('Address:')} ${order.delivery_address}`);
    }
    if (order.total_price) {
      console.log(`  ${chalk.bold('Total:')} ${order.currency || 'USD'} ${order.total_price}`);
    }
    if (order.status) {
      console.log(`  ${chalk.bold('Status:')} ${order.status}`);
    }
    
    const stats = await this.handleAsync(this.database.getOrderCount());
    console.log(chalk.gray('  ──────────────────────────────────────────'));
    console.log(chalk.gray(`  📊 Total Orders in DB: ${stats}`));
  }

  // Helper method to handle both sync and async database methods
  private async handleAsync<T>(result: T | Promise<T>): Promise<T> {
    if (result instanceof Promise) {
      return await result;
    }
    return result;
  }

  start(): void {
    this.app.listen(this.port, () => {
      console.log(chalk.blue.bold('\n🌐 GloriaFood Webhook Server Started\n'));
      console.log(chalk.green(`  ✅ Server listening on http://localhost:${this.port}`));
      console.log(chalk.gray(`  📍 Webhook endpoint: http://localhost:${this.port}/webhook`));
      console.log(chalk.gray(`  🔍 Health check: http://localhost:${this.port}/health`));
      console.log(chalk.gray(`  📋 Orders API: http://localhost:${this.port}/orders\n`));
      
      console.log(chalk.yellow('ℹ️  To receive orders from GloriaFood:'));
      console.log(chalk.gray(`     1. Configure your GloriaFood webhook endpoint to: http://your-public-ip:${this.port}/webhook`));
      console.log(chalk.gray(`     2. Or use ngrok/cloudflare tunnel for local development`));
      console.log(chalk.gray(`     3. Your configured endpoint: ${process.env.WEBHOOK_URL || 'https://tekmaxllc.com/webhook'}\n`));
    });
  }

  getApp(): express.Application {
    return this.app;
  }
}

export { GloriaFoodWebhookServer };

