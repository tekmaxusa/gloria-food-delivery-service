import express, { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
import { IDatabase, DatabaseFactory, Order } from './database-factory';
import { GloriaFoodOrder } from './gloriafood-client';
import { DoorDashClient } from './doordash-client';
import { DeliveryScheduler, ScheduleResult, DispatchPayload } from './delivery-scheduler';
import { EmailService, MerchantEmailContext } from './email-service';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

interface WebhookConfig {
  port: number;
  webhookPath: string;
  apiKey: string;
  storeId: string;
  masterKey?: string;
  protocolVersion: string;
  databasePath: string;
}

interface DispatchContext {
  trigger: 'scheduled' | 'immediate';
  source?: string;
  reason?: string;
  scheduledTime?: Date;
  deliveryTime?: Date;
}

class GloriaFoodWebhookServer {
  private app: express.Application;
  private database: IDatabase;
  private config: WebhookConfig;
  private doorDashClient?: DoorDashClient;
  private deliveryScheduler?: DeliveryScheduler;
  private emailService?: EmailService;
  private sessions: Map<string, { userId: number; email: string; expires: number }> = new Map();

  constructor(config: WebhookConfig) {
    console.log(chalk.blue.bold('\n🔵 Starting GloriaFood Webhook Server...'));
    console.log(chalk.gray(`   Config port: ${config.port}`));
    console.log(chalk.gray(`   Config webhookPath: ${config.webhookPath}`));
    
    this.config = config;
    this.app = express();
    
    // Initialize DoorDash client if configured
    console.log(chalk.blue('🔵 Initializing DoorDash client...'));
    this.initializeDoorDash();
    this.initializeEmailService();
    
    // Log which database is being used
    const dbType = process.env.DB_TYPE?.toLowerCase() || 'sqlite';
    console.log(chalk.cyan(`\n🗄️  Database Type: ${dbType === 'mysql' ? 'MySQL (XAMPP)' : 'SQLite'}`));
    if (dbType === 'mysql') {
      console.log(chalk.gray(`   Host: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}`));
      console.log(chalk.gray(`   Database: ${process.env.DB_NAME || 'gloriafood_orders'}`));
      console.log(chalk.gray(`   User: ${process.env.DB_USER || 'root'}\n`));
    }
    
    console.log(chalk.blue('🔵 Creating database connection...'));
    try {
      this.database = DatabaseFactory.createDatabase();
      console.log(chalk.green('✅ Database connection created'));
      this.initializeDeliveryScheduler();
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to create database: ${error.message}`));
      console.error(chalk.yellow('⚠️  Server will continue but database operations will fail'));
      console.error(chalk.yellow('⚠️  Check your database configuration in environment variables'));
      // Don't throw - allow server to start for UI access
      // Create a dummy database interface that returns empty results
      this.database = {
        insertOrUpdateOrder: () => { 
          console.error(chalk.red('⚠️  Database not initialized - cannot save order')); 
          return null; 
        },
        getOrderByGloriaFoodId: () => null,
        getAllOrders: () => [],
        getRecentOrders: () => [],
        getOrdersByStatus: () => [],
        getOrderCount: () => 0,
        createUser: () => null,
        getUserByEmail: () => null,
        verifyPassword: () => null,
        getAllDrivers: () => [],
        getDriverById: () => null,
        getAllReviews: () => [],
        getReviewsByOrderId: () => [],
        getDashboardStats: () => ({
          orders: { total: 0, completed: 0, active: 0, cancelled: 0, recent_24h: 0 },
          revenue: { total: 0 },
          drivers: { total: 0, active: 0 }
        }),
        close: () => {}
      } as IDatabase;
    }
    
    // Setup middleware first (body parsing), then routes
    console.log(chalk.blue('🔵 Setting up middleware...'));
    this.setupMiddleware();
    console.log(chalk.green('✅ Middleware setup complete'));
    
    console.log(chalk.blue('🔵 Setting up routes...'));
    this.setupRoutes();
    console.log(chalk.green('✅ Routes setup complete'));
    console.log(chalk.green('✅ Server initialization complete\n'));
  }

  // Helper function to handle both sync and async database results
  private async handleAsync<T>(result: T | Promise<T>): Promise<T> {
    return result instanceof Promise ? await result : result;
  }

  /**
   * Initialize DoorDash client if credentials are provided
   */
  private initializeDoorDash(): void {
    const developerId = process.env.DOORDASH_DEVELOPER_ID;
    const keyId = process.env.DOORDASH_KEY_ID;
    const signingSecret = process.env.DOORDASH_SIGNING_SECRET;
    const merchantId = process.env.DOORDASH_MERCHANT_ID;
    const sandbox = process.env.DOORDASH_SANDBOX;

    // Debug: Log what we found (without showing actual secrets)
    console.log(chalk.blue('\n🔍 DoorDash Credentials Check:'));
    console.log(chalk.gray(`   DOORDASH_DEVELOPER_ID: ${developerId ? '✅ SET (' + developerId.substring(0, 4) + '...)' : '❌ NOT SET'}`));
    console.log(chalk.gray(`   DOORDASH_KEY_ID: ${keyId ? '✅ SET (' + keyId.substring(0, 4) + '...)' : '❌ NOT SET'}`));
    console.log(chalk.gray(`   DOORDASH_SIGNING_SECRET: ${signingSecret ? '✅ SET (' + signingSecret.substring(0, 4) + '...)' : '❌ NOT SET'}`));
    console.log(chalk.gray(`   DOORDASH_MERCHANT_ID: ${merchantId ? '✅ SET' : '⚠️  NOT SET (optional)'}`));
    console.log(chalk.gray(`   DOORDASH_SANDBOX: ${sandbox || 'NOT SET'}`));

    if (developerId && keyId && signingSecret) {
      try {
        this.doorDashClient = new DoorDashClient({
          developerId,
          keyId,
          signingSecret,
          merchantId: merchantId,
          apiUrl: process.env.DOORDASH_API_URL,
          isSandbox: sandbox === 'true',
        });
        console.log(chalk.green('✅ DoorDash API client initialized successfully'));
        console.log(chalk.gray(`   Mode: ${sandbox === 'true' ? 'SANDBOX' : 'PRODUCTION'}`));
      } catch (error: any) {
        console.warn(chalk.yellow(`⚠️  Failed to initialize DoorDash client: ${error.message}`));
        console.warn(chalk.yellow(`   Error stack: ${error.stack}`));
      }
    } else {
      console.log(chalk.yellow('⚠️  DoorDash integration disabled (missing required credentials)'));
      console.log(chalk.gray('   Required: DOORDASH_DEVELOPER_ID, DOORDASH_KEY_ID, DOORDASH_SIGNING_SECRET'));
    }
  }

  /**
   * Initialize merchant email notifications
   */
  private initializeEmailService(): void {
    try {
      this.emailService = new EmailService();
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to initialize email service: ${error.message}`));
    }
  }

  /**
   * Initialize scheduler that triggers DoorDash calls before delivery time
   */
  private initializeDeliveryScheduler(): void {
    if (!this.doorDashClient) {
      console.log(chalk.yellow('⚠️  DoorDash scheduler disabled (client not initialized)'));
      return;
    }

    const bufferEnv = process.env.DOORDASH_DELIVERY_BUFFER_MINUTES;
    const parsedBuffer = bufferEnv ? parseInt(bufferEnv, 10) : NaN;
    const bufferMinutes = Number.isFinite(parsedBuffer) ? parsedBuffer : 30;

    this.deliveryScheduler = new DeliveryScheduler({
      bufferMinutes,
      onDispatch: async (payload: DispatchPayload) => {
        await this.dispatchDoorDash(payload.orderData, {
          trigger: payload.trigger,
          source: payload.metadata?.source,
          reason: payload.metadata?.reason,
          scheduledTime: payload.scheduledTime,
          deliveryTime: payload.deliveryTime || undefined,
        });
      },
      logger: console,
    });

    this.restorePendingSchedules().catch((error: any) => {
      console.error(chalk.red(`⚠️  Failed to restore pending DoorDash schedules: ${error.message}`));
    });
  }

  /**
   * Send order to DoorDash (if enabled)
   */
  private async sendOrderToDoorDash(orderData: any): Promise<{ id?: string; external_delivery_id?: string; status?: string; tracking_url?: string } | null> {
    if (!this.doorDashClient) {
      console.log(chalk.yellow('⚠️  DoorDash client not initialized'));
      return null; // DoorDash not configured
    }

    // Check if order type is delivery (DoorDash is for delivery only)
    const orderType = orderData.type || orderData.order_type || '';
    if (orderType.toLowerCase() !== 'delivery') {
      console.log(chalk.gray('ℹ️  Skipping DoorDash - order type is not delivery'));
      return null;
    }

    try {
      // Convert to DoorDash Drive delivery payload
      const drivePayload = this.doorDashClient.convertGloriaFoodToDrive(orderData);
      console.log(chalk.blue(`🔍 DoorDash payload prepared, sending to API...`));

      // Send to DoorDash Drive
      const response = await this.doorDashClient.createDriveDelivery(drivePayload);
      console.log(chalk.blue(`🔍 DoorDash API response received`));
      console.log(chalk.blue(`🔍 Response ID: ${response.id || 'NONE'}`));
      console.log(chalk.blue(`🔍 Response tracking_url: ${response.tracking_url || 'NONE'}`));
      console.log(chalk.blue(`🔍 Response raw data keys: ${response.raw ? Object.keys(response.raw).join(', ') : 'NONE'}`));
      
      if (response.raw) {
        console.log(chalk.gray(`   Raw response (first 500 chars): ${JSON.stringify(response.raw).substring(0, 500)}`));
      }

      return { 
        id: response.id, 
        external_delivery_id: response.external_delivery_id,
        status: response.status, 
        tracking_url: response.tracking_url 
      };
    } catch (error: any) {
      // Log error but don't fail the webhook
      console.error(chalk.red(`❌ Failed to send order to DoorDash: ${error.message}`));
      console.error(chalk.red(`   Error details: ${error.stack || 'No stack trace'}`));
      // Continue processing - don't throw
      return null;
    }
  }

  private async dispatchDoorDash(orderData: any, context: DispatchContext): Promise<void> {
    const orderId = this.getOrderIdentifier(orderData) || 'unknown';
    const parts = [
      `trigger=${context.trigger}`,
      context.source ? `source=${context.source}` : null,
      context.reason ? `reason=${context.reason}` : null,
    ].filter(Boolean).join(' | ');

    console.log(chalk.cyan(`\n🚚 Dispatching order ${orderId} to DoorDash (${parts || 'no-context'})`));
    if (context.deliveryTime) {
      console.log(chalk.gray(`   Delivery time: ${context.deliveryTime.toISOString()}`));
    }
    if (context.scheduledTime) {
      console.log(chalk.gray(`   Scheduled send: ${context.scheduledTime.toISOString()}`));
    }

    try {
      const response = await this.sendOrderToDoorDash(orderData);
      if (!response) {
        console.log(chalk.yellow(`⚠️  DoorDash dispatch skipped or failed for order ${orderId}`));
        return;
      }
      await this.handleDoorDashDispatchSuccess(orderId, response);
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to dispatch order ${orderId} to DoorDash: ${error.message}`));
    }
  }

  private async notifyMerchant(orderData: any, context: MerchantEmailContext): Promise<void> {
    if (!this.emailService) {
      console.log(chalk.yellow('⚠️  Email service not initialized'));
      return;
    }
    
    if (!this.emailService.isEnabled()) {
      console.log(chalk.yellow('⚠️  Email service is disabled'));
      return;
    }
    
    try {
      await this.emailService.sendOrderUpdate(orderData, context);
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to send merchant notification: ${error.message}`));
      if (error.stack) {
        console.error(chalk.gray(`   Stack: ${error.stack}`));
      }
    }
  }

  private async handleDoorDashDispatchSuccess(
    orderId: string,
    resp: { id?: string; external_delivery_id?: string; status?: string; tracking_url?: string }
  ): Promise<void> {
    if (!resp || !resp.id) {
      console.log(chalk.yellow(`⚠️  DoorDash response missing delivery ID for order ${orderId}`));
      return;
    }

    console.log(chalk.green(`✅ Order ${orderId} sent to DoorDash successfully`));
    console.log(chalk.gray(`   DoorDash Delivery ID: ${resp.id}`));

    if (resp.external_delivery_id) {
      console.log(chalk.gray(`   External Delivery ID: ${resp.external_delivery_id}`));
    }
    if (resp.status) {
      console.log(chalk.gray(`   Status: ${resp.status}`));
    }

    let trackingUrl = resp.tracking_url;
    console.log(chalk.blue(`🔍 Initial tracking URL: ${trackingUrl || 'NOT IN RESPONSE'}`));

    if (!trackingUrl && resp.id && this.doorDashClient) {
      console.log(chalk.yellow('   ⏳ Tracking URL not in response, fetching from DoorDash API...'));
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const statusResp = await this.doorDashClient.getOrderStatus(resp.id);
        trackingUrl = statusResp.tracking_url;
        console.log(chalk.blue(`🔍 Status API response tracking_url: ${trackingUrl || 'NONE'}`));
      } catch (error: any) {
        console.log(chalk.yellow(`   ⚠️  First tracking fetch failed: ${error.message}`));
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          const retryResp = await this.doorDashClient.getOrderStatus(resp.id);
          trackingUrl = retryResp.tracking_url;
          console.log(chalk.blue(`🔍 Retry tracking_url: ${trackingUrl || 'NONE'}`));
        } catch (error2: any) {
          console.log(chalk.yellow(`   ⚠️  Retry tracking fetch failed: ${error2.message}`));
        }
      }
    }

    if (trackingUrl) {
      console.log(chalk.cyan(`   Tracking URL: ${trackingUrl}`));
    } else {
      console.log(chalk.yellow('   ⚠️  Tracking URL not available yet (may be generated later by DoorDash)'));
    }

    if ((this.database as any).markOrderSentToDoorDash) {
      try {
        await this.handleAsync((this.database as any).markOrderSentToDoorDash(orderId, resp.id, trackingUrl));
      } catch {
        // Ignore database errors for marking as sent
      }
    }

    this.deliveryScheduler?.clear(orderId);
  }

  private async scheduleDoorDashDelivery(orderData: any, source: string): Promise<void> {
    const orderId = this.getOrderIdentifier(orderData);

    if (!orderId) {
      console.log(chalk.yellow('⚠️  Cannot schedule DoorDash dispatch without order ID, dispatching immediately'));
      await this.dispatchDoorDash(orderData, { trigger: 'immediate', source, reason: 'missing-order-id' });
      return;
    }

    if (!this.deliveryScheduler) {
      console.log(chalk.yellow('⚠️  Delivery scheduler not initialized, dispatching immediately'));
      await this.dispatchDoorDash(orderData, { trigger: 'immediate', source, reason: 'scheduler-disabled' });
      return;
    }

    try {
      const result = await this.deliveryScheduler.schedule(orderData, { source });
      this.logScheduleResult(result);
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to schedule DoorDash delivery for order ${orderId}: ${error.message}`));
      await this.dispatchDoorDash(orderData, { trigger: 'immediate', source, reason: 'scheduler-error' });
    }
  }

  private logScheduleResult(result?: ScheduleResult): void {
    if (!result) {
      return;
    }

    const orderId = result.orderId || 'unknown';
    switch (result.status) {
      case 'scheduled':
        console.log(
          chalk.cyan(
            `🕒 DoorDash call scheduled for order ${orderId} at ${result.scheduledTime?.toISOString()} (delivery: ${result.deliveryTime?.toISOString()})`
          )
        );
        break;
      case 'dispatched':
        console.log(
          chalk.green(
            `⚡ DoorDash call executed immediately for order ${orderId}${result.reason ? ` (${result.reason})` : ''}`
          )
        );
        break;
      case 'skipped':
        console.log(
          chalk.yellow(
            `⚠️  DoorDash scheduling skipped for order ${orderId}${result.reason ? ` (${result.reason})` : ''}`
          )
        );
        break;
    }
  }

  private getOrderIdentifier(orderData: any): string | null {
    if (!orderData) {
      return null;
    }

    const candidates = [
      orderData.id,
      orderData.order_id,
      orderData.orderId,
      orderData.order_number,
      orderData.orderNumber,
      orderData.external_delivery_id,
    ];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue;
      const value = String(candidate).trim();
      if (value) {
        return value;
      }
    }
    return null;
  }

  private isCancelledStatus(status: string): boolean {
    const normalized = (status || '').toLowerCase();
    return ['cancelled', 'canceled', 'rejected', 'voided'].includes(normalized);
  }

  private async restorePendingSchedules(): Promise<void> {
    if (!this.deliveryScheduler) {
      return;
    }

    try {
      const limitEnv = process.env.SCHEDULER_RESTORE_LIMIT;
      const parsedLimit = limitEnv ? parseInt(limitEnv, 10) : NaN;
      const limit = Number.isFinite(parsedLimit) ? parsedLimit : 500;

      const orders = await this.handleAsync(this.database.getAllOrders(limit));
      let scheduledCount = 0;

      for (const order of orders) {
        if (!order || (order as any).sent_to_doordash) {
          continue;
        }
        if ((order.order_type || '').toLowerCase() !== 'delivery') {
          continue;
        }
        if (!order.raw_data) {
          continue;
        }
        try {
          const rawData = JSON.parse(order.raw_data);
          const result = await this.deliveryScheduler.schedule(rawData, { source: 'restore' });
          this.logScheduleResult(result);
          if (result.status === 'scheduled') {
            scheduledCount++;
          }
        } catch (error: any) {
          console.error(chalk.yellow(`⚠️  Failed to restore order ${order.gloriafood_order_id}: ${error.message}`));
        }
      }

      console.log(chalk.cyan(`🔁 Restored ${scheduledCount} pending DoorDash schedule(s)`));
    } catch (error: any) {
      console.error(chalk.red(`⚠️  Unable to restore pending schedules: ${error.message}`));
    }
  }

  private setupMiddleware(): void {
    // Serve static files from public directory (for dashboard)
    // Try dist/public first (production), then public (development)
    const publicPath = path.join(__dirname, '..', 'public');
    const distPublicPath = path.join(__dirname, 'public');
    const fs = require('fs');
    
    // Debug: Log what we're checking
    console.log(chalk.blue('🔵 Checking for public directory...'));
    console.log(chalk.gray(`   dist/public: ${distPublicPath} (exists: ${fs.existsSync(distPublicPath)})`));
    console.log(chalk.gray(`   public: ${publicPath} (exists: ${fs.existsSync(publicPath)})`));
    console.log(chalk.gray(`   __dirname: ${__dirname}`));
    
    if (fs.existsSync(distPublicPath)) {
      console.log(chalk.blue('🔵 Serving static files from: dist/public'));
      const resolvedPath = path.resolve(distPublicPath);
      console.log(chalk.gray(`   Resolved path: ${resolvedPath}`));
      this.app.use(express.static(resolvedPath));
      
      // Also check if index.html exists
      const indexPath = path.join(distPublicPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        console.log(chalk.green(`   ✅ index.html found at: ${indexPath}`));
      } else {
        console.log(chalk.yellow(`   ⚠️  index.html not found at: ${indexPath}`));
      }
    } else if (fs.existsSync(publicPath)) {
      console.log(chalk.blue('🔵 Serving static files from: public'));
      const resolvedPath = path.resolve(publicPath);
      console.log(chalk.gray(`   Resolved path: ${resolvedPath}`));
      this.app.use(express.static(resolvedPath));
    } else {
      console.log(chalk.yellow('⚠️  Public directory not found, dashboard may not be available'));
    }
    
    // Parse JSON bodies
    // CORS support for Render and other hosting platforms
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-session-id');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
    
    this.app.use(express.json());
    // Also parse URL-encoded bodies (some webhooks use this)
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging - minimal
    this.app.use((req, res, next) => {
      if (req.method === 'POST' && req.path === this.config.webhookPath) {
        const timestamp = new Date().toISOString();
        console.log(chalk.cyan(`\n📨 [${timestamp}] POST ${req.path}`));
        console.log(chalk.yellow(`   🔔 WEBHOOK REQUEST DETECTED FROM GLORIAFOOD!`));
        console.log(chalk.green(`   ✅ Connected to GloriaFood - Webhook received!`));
        console.log(chalk.gray(`   Content-Type: ${req.headers['content-type'] || 'N/A'}`));
        console.log(chalk.gray(`   Body size: ${JSON.stringify(req.body || {}).length} chars`));
        console.log(chalk.gray(`   Body keys: ${Object.keys(req.body || {}).join(', ')}`));
      }
      next();
    });
  }

  private setupRoutes(): void {
    // Root endpoint - serve dashboard HTML if available, otherwise return JSON
    // Note: This route takes precedence over static middleware, so we manually serve the file
    this.app.get('/', (req: Request, res: Response) => {
      console.log(chalk.blue(`📥 Root endpoint accessed at ${new Date().toISOString()}`));
      
      // Try to serve index.html from public directory
      const fs = require('fs');
      const distPublicPath = path.join(__dirname, 'public', 'index.html');
      const publicPath = path.join(__dirname, '..', 'public', 'index.html');
      
      // Debug: Log paths being checked
      console.log(chalk.gray(`   Checking dist/public: ${distPublicPath}`));
      console.log(chalk.gray(`   Checking public: ${publicPath}`));
      console.log(chalk.gray(`   __dirname: ${__dirname}`));
      
      // Try absolute paths
      const distPublicPathAbs = path.resolve(distPublicPath);
      const publicPathAbs = path.resolve(publicPath);
      
      if (fs.existsSync(distPublicPathAbs)) {
        console.log(chalk.green(`   ✅ Found index.html at: ${distPublicPathAbs}`));
        return res.sendFile(distPublicPathAbs);
      } else if (fs.existsSync(publicPathAbs)) {
        console.log(chalk.green(`   ✅ Found index.html at: ${publicPathAbs}`));
        return res.sendFile(publicPathAbs);
      } else if (fs.existsSync(distPublicPath)) {
        console.log(chalk.green(`   ✅ Found index.html at: ${distPublicPath}`));
        return res.sendFile(path.resolve(distPublicPath));
      } else if (fs.existsSync(publicPath)) {
        console.log(chalk.green(`   ✅ Found index.html at: ${publicPath}`));
        return res.sendFile(path.resolve(publicPath));
      } else {
        console.log(chalk.yellow(`   ⚠️  index.html not found, serving JSON fallback`));
        console.log(chalk.yellow(`   Tried paths:`));
        console.log(chalk.yellow(`     - ${distPublicPathAbs}`));
        console.log(chalk.yellow(`     - ${publicPathAbs}`));
        console.log(chalk.yellow(`     - ${distPublicPath}`));
        console.log(chalk.yellow(`     - ${publicPath}`));
        // Fallback to JSON response if HTML not found
        res.json({ 
          status: 'ok', 
          service: 'GloriaFood Webhook Server',
          version: this.config.protocolVersion,
          endpoints: {
            health: '/health',
            webhook: this.config.webhookPath,
            orders: '/orders',
            stats: '/stats'
          },
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          note: 'Dashboard UI not found. Check if public folder was copied to dist/public during build.',
          debug: {
            __dirname,
            checkedPaths: [distPublicPathAbs, publicPathAbs, distPublicPath, publicPath]
          }
        });
      }
    });
    
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      console.log(chalk.blue(`💚 Health check requested at ${new Date().toISOString()}`));
      res.json({ 
        status: 'ok', 
        service: 'GloriaFood Webhook Server',
        version: this.config.protocolVersion,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: this.config.port
      });
    });

    // GET handler for webhook endpoint (for testing/debugging)
    this.app.get(this.config.webhookPath, (req: Request, res: Response) => {
      console.log(chalk.blue(`\n📥 GET request to webhook endpoint (test)`));
      res.json({
        service: 'GloriaFood Webhook Server',
        endpoint: this.config.webhookPath,
        method: 'POST',
        protocol: 'JSON',
        protocol_version: this.config.protocolVersion,
        status: 'ready',
        message: 'This endpoint accepts POST requests only. GloriaFood will send order data here.',
        instructions: {
          webhook_url: `${process.env.RENDER_EXTERNAL_URL || 'https://your-app.onrender.com'}${this.config.webhookPath}`,
          method: 'POST',
          content_type: 'application/json',
          authentication: 'Optional - API Key or Master Key',
          timestamp: new Date().toISOString()
        },
        test: {
          note: 'To test, send POST request with order data',
          example: {
            id: '12345',
            customer_name: 'Test Customer',
            total_price: 25.50,
            status: 'ACCEPTED'
          }
        },
        stats: {
          database_type: process.env.DB_TYPE || 'sqlite',
          database_connected: !!this.database,
          note: 'Check /stats endpoint for live statistics'
        }
      });
    });
    
    // Test endpoint to verify server is working
    this.app.post('/test-webhook', async (req: Request, res: Response) => {
      console.log(chalk.cyan('\n🧪 TEST WEBHOOK ENDPOINT CALLED'));
      console.log(chalk.gray('   Body:'), JSON.stringify(req.body, null, 2));
      
      try {
        const testOrder = {
          id: 'TEST-' + Date.now(),
          customer_name: 'Test Customer',
          customer_phone: '+1234567890',
          total_price: 25.50,
          currency: 'USD',
          status: 'ACCEPTED',
          order_type: 'delivery',
          delivery_address: '123 Test St'
        };
        
        const saved = await this.handleAsync(this.database.insertOrUpdateOrder(testOrder));
        
        res.json({
          success: true,
          message: 'Test webhook received and processed',
          order: saved,
          received: req.body,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error(chalk.red('Test webhook error:'), error);
        res.status(500).json({
          success: false,
          error: error.message,
          received: req.body
        });
      }
    });

    // Webhook endpoint for receiving orders
    this.app.post(this.config.webhookPath, async (req: Request, res: Response) => {
      const timestamp = new Date().toISOString();
      console.log(chalk.cyan('\n🔵 ========================================'));
      console.log(chalk.cyan(`🔵 WEBHOOK ENDPOINT CALLED - ${timestamp}`));
      console.log(chalk.cyan('🔵 ========================================'));
      console.log(chalk.gray(`   Method: ${req.method}`));
      console.log(chalk.gray(`   Path: ${req.path}`));
      console.log(chalk.gray(`   Content-Type: ${req.headers['content-type'] || 'N/A'}`));
      console.log(chalk.gray(`   Has Body: ${!!req.body}`));
      console.log(chalk.gray(`   Body Type: ${typeof req.body}`));
      console.log(chalk.gray(`   Body Keys: ${req.body ? Object.keys(req.body).join(', ') : 'N/A'}`));
      console.log(chalk.gray(`   Query Params: ${Object.keys(req.query).length > 0 ? Object.keys(req.query).join(', ') : 'None'}`));
      
      try {
        // Validate authentication if master key is provided
        // Note: Some webhook providers may not send authentication, so we make it optional
        if (this.config.masterKey || this.config.apiKey) {
          const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
          const providedKey = authHeader?.toString().replace('Bearer ', '').trim();
          
          // Check multiple possible auth methods
          const isValid = 
            providedKey === this.config.apiKey ||
            providedKey === this.config.masterKey ||
            req.headers['x-master-key'] === this.config.masterKey ||
            req.headers['master-key'] === this.config.masterKey ||
            req.body?.api_key === this.config.apiKey ||
            req.body?.master_key === this.config.masterKey ||
            req.query?.token === this.config.apiKey;

          // If authentication is expected but not provided, log warning but don't block
          if (!isValid && (this.config.masterKey || this.config.apiKey)) {
            // Silent authentication check - still process the order
          }
        }

        // Extract order data from request
        // Try body first, then query params, then raw body
        let orderData = this.extractOrderData(req.body);
        
        // If body is empty, try query params
        if (!orderData && Object.keys(req.query).length > 0) {
          console.log(chalk.yellow('   ⚠️  Body is empty, trying query params...'));
          orderData = this.extractOrderData(req.query);
        }
        
        if (!orderData) {
          console.warn(chalk.yellow('\n⚠️  ========================================'));
          console.warn(chalk.yellow('⚠️  INVALID WEBHOOK PAYLOAD - NO ORDER DATA FOUND'));
          console.warn(chalk.yellow('⚠️  ========================================'));
          console.log(chalk.gray('   Request body keys:'), Object.keys(req.body || {}));
          console.log(chalk.gray('   Request query keys:'), Object.keys(req.query || {}));
          console.log(chalk.gray('   Content-Type:'), req.headers['content-type'] || 'N/A');
          console.log(chalk.gray('   Raw body (first 1000 chars):'));
          console.log(chalk.gray('   ' + JSON.stringify(req.body || {}, null, 2).substring(0, 1000)));
          console.log(chalk.yellow('\n   💡 This might be a test webhook or different format'));
          console.log(chalk.yellow('   💡 Check GloriaFood webhook configuration'));
          console.log(chalk.yellow('   💡 Expected format: { id, customer_name, total_price, ... }'));
          
          // Still return 200 to prevent retries, but log the issue
          return res.status(200).json({ 
            success: false, 
            error: 'Invalid payload - no order data found',
            message: 'Webhook received but no order data detected. Check payload format.',
            received: {
              hasBody: !!req.body,
              bodyKeys: Object.keys(req.body || {}),
              hasQuery: Object.keys(req.query || {}).length > 0,
              queryKeys: Object.keys(req.query || {}),
              contentType: req.headers['content-type'] || 'N/A',
              bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 200) : 'No body'
            },
            expectedFormat: {
              example: {
                id: '12345',
                customer_name: 'John Doe',
                total_price: 25.50,
                status: 'ACCEPTED'
              }
            }
          });
        }

        // Log received order
        const orderId = orderData.id || orderData.order_id || 'unknown';
        console.log(chalk.green(`\n✅ Order data extracted successfully from GloriaFood: #${orderId}`));
        console.log(chalk.green(`   ✅ Connected to GloriaFood - Order received!`));

        // Determine if this is a new order BEFORE saving
        const existingBefore = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId.toString()));

        // Store order in database (handle both sync SQLite and async MySQL)
        console.log(chalk.blue(`💾 Saving order to database...`));
        const savedOrder = await this.handleAsync(this.database.insertOrUpdateOrder(orderData));
        console.log(chalk.blue(`💾 Database save result: ${savedOrder ? 'SUCCESS' : 'FAILED'}`));

        if (savedOrder) {
          const isNew = !existingBefore;
          const newStatus = (orderData.status || orderData.order_status || '').toString().toLowerCase();
          const prevStatus = (existingBefore?.status || '').toString().toLowerCase();
          const isCancelled = this.isCancelledStatus(newStatus);
          const statusChanged = newStatus !== prevStatus;
          const wasNotSent = !(existingBefore as any)?.sent_to_doordash;
          
          // Check if this is a delivery order
          const orderType = (orderData.type || orderData.order_type || '').toString().toLowerCase();
          const isDeliveryOrder = orderType === 'delivery';
          
          if (isNew) {
            await this.displayOrder(savedOrder, true, orderData);
          } else {
            console.log(chalk.blue(`🔄 Order updated in database: #${orderId}`));
            await this.displayOrder(savedOrder, false, orderData);
          }

          const orderIdStr = orderId.toString();
          const currentStatusLabel = newStatus || orderData.status || 'pending';
          const previousStatusLabel = prevStatus || existingBefore?.status || 'unknown';

          if (this.emailService?.isEnabled()) {
            if (isNew) {
              await this.notifyMerchant(orderData, {
                event: 'new-order',
                currentStatus: currentStatusLabel,
              });
            } else if (statusChanged) {
              await this.notifyMerchant(orderData, {
                event: isCancelled ? 'cancelled' : 'status-update',
                previousStatus: previousStatusLabel,
                currentStatus: currentStatusLabel,
              });
            }
          }

          if (isCancelled) {
            this.deliveryScheduler?.cancel(orderIdStr, 'order-cancelled');
          } else if (!isDeliveryOrder) {
            this.deliveryScheduler?.cancel(orderIdStr, 'non-delivery');
          } else if (isNew || wasNotSent) {
            await this.scheduleDoorDashDelivery(orderData, isNew ? 'new-order' : 'update-order');
          } else {
            this.deliveryScheduler?.cancel(orderIdStr, 'already-sent');
          }
        } else {
          console.error(chalk.red(`❌ Failed to store order: #${orderId}`));
          return res.status(500).json({ error: 'Failed to store order' });
        }

        // Respond with success (GloriaFood expects 200 status)
        res.status(200).json({ 
          success: true, 
          message: 'Order received and processed',
          order_id: orderId
        });

      } catch (error: any) {
        console.error(chalk.red.bold(`\n❌❌❌ WEBHOOK ERROR ❌❌❌`));
        console.error(chalk.red(`Error message: ${error.message}`));
        console.error(chalk.red(`Error stack: ${error.stack}`));
        console.error(chalk.yellow(`Request body keys: ${Object.keys(req.body || {}).join(', ')}`));
        console.error(chalk.yellow(`Request path: ${req.path}`));
        console.error(chalk.yellow(`Request method: ${req.method}`));
        
        // Still return 200 to prevent GloriaFood from retrying
        // (unless you want retries, then use 5xx status)
        res.status(200).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Get all orders endpoint with filters
    this.app.get('/orders', async (req: Request, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const status = req.query.status as string | undefined;
        const storeId = req.query.store_id as string | undefined;
        
        let orders;
        if (status) {
          orders = await this.handleAsync(this.database.getOrdersByStatus(status));
        } else {
          orders = await this.handleAsync(this.database.getAllOrders(limit));
        }
        
        // Filter by store_id if provided
        if (storeId) {
          orders = orders.filter(order => order.store_id === storeId);
        }
        
        res.json({ 
          success: true, 
          count: orders.length, 
          limit: limit,
          orders 
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get order by ID endpoint
    this.app.get('/orders/:orderId', async (req: Request, res: Response) => {
      try {
        const order = await this.handleAsync(this.database.getOrderByGloriaFoodId(req.params.orderId));
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        res.json({ success: true, order });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });


    // Get recent orders endpoint
    this.app.get('/orders/recent/:minutes?', async (req: Request, res: Response) => {
      try {
        const minutes = parseInt(req.params.minutes || '60', 10);
        const orders = await this.handleAsync(this.database.getRecentOrders(minutes));
        res.json({ 
          success: true, 
          count: orders.length, 
          minutes,
          orders 
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Authentication endpoints
    this.app.post('/api/auth/signup', async (req: Request, res: Response) => {
      try {
        const { email, password, fullName, full_name } = req.body;
        const name = fullName || full_name;
        
        if (!email || !password || !name) {
          return res.status(400).json({ success: false, error: 'Email, password, and full name are required' });
        }
        
        const user = await this.handleAsync(this.database.createUser(email, password, name));
        
        if (!user) {
          return res.status(500).json({ success: false, error: 'Failed to create user' });
        }
        
        // Create session
        const sessionId = crypto.randomBytes(32).toString('hex');
        this.sessions.set(sessionId, {
          userId: user.id,
          email: user.email,
          expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
        });
        
        res.json({ 
          success: true, 
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role
          },
          sessionId
        });
      } catch (error: any) {
        console.error('Signup error:', error);
        res.status(400).json({ success: false, error: error.message || 'Failed to create account' });
      }
    });

    this.app.post('/api/auth/login', async (req: Request, res: Response) => {
      try {
        const { email, password } = req.body;
        
        if (!email || !password) {
          return res.status(400).json({ success: false, error: 'Email and password are required' });
        }
        
        const userResult = await this.handleAsync(this.database.verifyPassword(email, password));
        
        // verifyPassword can return boolean | User | null
        if (!userResult || typeof userResult === 'boolean') {
          return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
        
        // At this point, userResult is User
        const user = userResult as any;
        
        // Create session
        const sessionId = crypto.randomBytes(32).toString('hex');
        this.sessions.set(sessionId, {
          userId: user.id,
          email: user.email,
          expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
        });
        
        res.json({ 
          success: true, 
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role
          },
          sessionId
        });
      } catch (error: any) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Failed to login' });
      }
    });

    this.app.post('/api/auth/logout', (req: Request, res: Response) => {
      const sessionId = req.headers['x-session-id'] as string;
      if (sessionId) {
        this.sessions.delete(sessionId);
      }
      res.json({ success: true });
    });

    this.app.get('/api/auth/me', (req: Request, res: Response) => {
      const sessionId = req.headers['x-session-id'] as string;
      if (!sessionId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }
      
      const session = this.sessions.get(sessionId);
      if (!session || session.expires < Date.now()) {
        this.sessions.delete(sessionId);
        return res.status(401).json({ success: false, error: 'Session expired' });
      }
      
      res.json({ 
        success: true, 
        user: {
          id: session.userId,
          email: session.email
        }
      });
    });

    // Dashboard stats endpoint
    this.app.get('/api/dashboard/stats', async (req: Request, res: Response) => {
      try {
        const stats = await this.handleAsync(this.database.getDashboardStats());
        res.json({ success: true, stats });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Drivers endpoint
    this.app.get('/api/drivers', async (req: Request, res: Response) => {
      try {
        const drivers = await this.handleAsync(this.database.getAllDrivers());
        res.json({ success: true, drivers });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Reviews endpoint
    this.app.get('/api/reviews', async (req: Request, res: Response) => {
      try {
        const reviews = await this.handleAsync(this.database.getAllReviews());
        res.json({ success: true, reviews });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get orders by status
    this.app.get('/orders/status/:status', async (req: Request, res: Response) => {
      try {
        const status = req.params.status;
        const orders = await this.handleAsync(this.database.getOrdersByStatus(status));
        res.json({ 
          success: true, 
          count: orders.length, 
          status,
          orders 
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Statistics endpoint
    this.app.get('/stats', async (req: Request, res: Response) => {
      try {
        const totalOrders = await this.handleAsync(this.database.getOrderCount());
        const recentOrders = await this.handleAsync(this.database.getRecentOrders(60));
        const recentOrders24h = await this.handleAsync(this.database.getRecentOrders(1440));
        
        // Get orders by status
        const allOrders = await this.handleAsync(this.database.getAllOrders(1000));
        const statusCounts: { [key: string]: number } = {};
        allOrders.forEach((order: Order) => {
          statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
        });
        
        res.json({
          success: true,
          total_orders: totalOrders,
          recent_orders_1h: recentOrders.length,
          recent_orders_24h: recentOrders24h.length,
          status_breakdown: statusCounts,
          database_type: process.env.DB_TYPE || 'sqlite',
          database_name: process.env.DB_NAME || 'SQLite',
          server_time: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get DoorDash delivery status
    this.app.get('/doordash/status/:orderId', async (req: Request, res: Response) => {
      try {
        if (!this.doorDashClient) {
          return res.status(400).json({ 
            error: 'DoorDash not configured',
            message: 'DoorDash credentials not provided in .env file'
          });
        }

        const orderId = req.params.orderId;
        
        // Try to get DoorDash ID from database
        let doorDashId: string = orderId; // Default to order ID
        try {
          const order = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId));
          if (order && (order as any).doordash_order_id) {
            doorDashId = (order as any).doordash_order_id;
          }
        } catch (e) {
          // Use orderId as fallback
          doorDashId = orderId;
        }

        // Ensure doorDashId is not empty
        if (!doorDashId || doorDashId.trim() === '') {
          return res.status(400).json({ 
            error: 'Invalid order ID',
            message: 'Order ID cannot be empty'
          });
        }

        // Get status from DoorDash
        const response = await this.doorDashClient.getOrderStatus(doorDashId);
        
        res.json({
          success: true,
          gloriafood_order_id: orderId,
          doordash_delivery_id: response.id,
          external_delivery_id: response.external_delivery_id,
          status: response.status,
          tracking_url: response.tracking_url,
          raw: response.raw
        });
      } catch (error: any) {
        res.status(500).json({ 
          error: error.message,
          success: false
        });
      }
    });

    // Get orders summary
    this.app.get('/summary', async (req: Request, res: Response) => {
      try {
        const totalOrders = await this.handleAsync(this.database.getOrderCount());
        const recent1h = await this.handleAsync(this.database.getRecentOrders(60));
        const recent24h = await this.handleAsync(this.database.getRecentOrders(1440));
        const allOrders = await this.handleAsync(this.database.getAllOrders(1000));
        
        // Calculate totals by status
        const statusCounts: { [key: string]: number } = {};
        let totalRevenue = 0;
        
        allOrders.forEach(order => {
          statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
          // Convert total_price to number (MySQL returns DECIMAL as string)
          const orderPrice = typeof order.total_price === 'string' 
            ? parseFloat(order.total_price) 
            : (order.total_price || 0);
          totalRevenue += orderPrice;
        });
        
        res.json({
          success: true,
          summary: {
            total_orders: totalOrders,
            recent_1h: recent1h.length,
            recent_24h: recent24h.length,
            total_revenue: totalRevenue,
            status_counts: statusCounts
          },
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Authentication endpoints
    this.app.post('/api/auth/signup', async (req: Request, res: Response) => {
      try {
        const { email, password, full_name, fullName } = req.body;
        const name = full_name || fullName;
        
        if (!email || !password || !name) {
          return res.status(400).json({ success: false, error: 'Email, password, and full name are required' });
        }

        // Hash password
        const hashedPassword = this.hashPassword(password);
        
        // Insert user into database
        const db = this.database as any;
        if (db.query) {
          // MySQL database
          const [rows]: any = await db.query(
            'INSERT INTO users (email, password, full_name) VALUES (?, ?, ?)',
            [email, hashedPassword, name]
          );
          
          const sessionToken = this.createSession(rows.insertId, email);
          res.json({ success: true, sessionId: sessionToken, token: sessionToken, user: { id: rows.insertId, email, full_name: name } });
        } else {
          // SQLite - use database method
          const user = await this.handleAsync(this.database.createUser(email, password, name));
          if (!user) {
            return res.status(500).json({ success: false, error: 'Failed to create user' });
          }
          
          const sessionToken = this.createSession(user.id, email);
          res.json({ success: true, sessionId: sessionToken, token: sessionToken, user });
        }
      } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY' || error.message.includes('UNIQUE')) {
          res.status(400).json({ success: false, error: 'Email already exists' });
        } else {
          res.status(500).json({ success: false, error: error.message });
        }
      }
    });

    this.app.post('/api/auth/login', async (req: Request, res: Response) => {
      try {
        const { email, password } = req.body;
        
        if (!email || !password) {
          return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        const db = this.database as any;
        if (db.query) {
          // MySQL database
          const [rows]: any = await db.query(
            'SELECT id, email, password, full_name, role FROM users WHERE email = ?',
            [email]
          );
          
          if (rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
          }
          
          const user = rows[0];
          if (!this.verifyPassword(password, user.password)) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
          }
          
          const sessionToken = this.createSession(user.id, user.email);
          res.json({ 
            success: true, 
            sessionId: sessionToken,
            token: sessionToken, 
            user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } 
          });
        } else {
          // SQLite - use database method
          const dbUserResult = await this.handleAsync(this.database.verifyPassword(email, password));
          
          // verifyPassword can return boolean | User | null
          if (!dbUserResult || typeof dbUserResult === 'boolean') {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
          }
          
          // At this point, dbUserResult is User
          const dbUser = dbUserResult as any;
          
          const sessionToken = this.createSession(dbUser.id, dbUser.email);
          res.json({ 
            success: true, 
            sessionId: sessionToken,
            token: sessionToken, 
            user: { id: dbUser.id, email: dbUser.email, full_name: dbUser.full_name, role: dbUser.role } 
          });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/auth/logout', (req: Request, res: Response) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        this.sessions.delete(token);
      }
      res.json({ success: true });
    });

    this.app.get('/api/auth/me', async (req: Request, res: Response) => {
      try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const session = this.sessions.get(token);
        if (!session || session.expires < Date.now()) {
          this.sessions.delete(token);
          return res.status(401).json({ success: false, error: 'Session expired' });
        }
        
        const db = this.database as any;
        if (db.query) {
          const [rows]: any = await db.query(
            'SELECT id, email, full_name, role FROM users WHERE id = ?',
            [session.userId]
          );
          
          if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
          }
          
          res.json({ success: true, user: rows[0] });
        } else {
          res.status(500).json({ success: false, error: 'Not supported with SQLite' });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Drivers endpoints
    this.app.get('/api/drivers', async (req: Request, res: Response) => {
      try {
        const db = this.database as any;
        if (db.query) {
          const [rows]: any = await db.query('SELECT * FROM drivers ORDER BY created_at DESC');
          res.json({ success: true, drivers: rows });
        } else {
          res.json({ success: true, drivers: [] });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/drivers', async (req: Request, res: Response) => {
      try {
        const { name, phone, email, vehicle_type, vehicle_plate } = req.body;
        const db = this.database as any;
        if (db.query) {
          const [result]: any = await db.query(
            'INSERT INTO drivers (name, phone, email, vehicle_type, vehicle_plate, status) VALUES (?, ?, ?, ?, ?, ?)',
            [name, phone, email, vehicle_type, vehicle_plate, 'active']
          );
          res.json({ success: true, driver: { id: result.insertId, ...req.body } });
        } else {
          res.status(500).json({ success: false, error: 'Not supported with SQLite' });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Reviews endpoints
    this.app.get('/api/reviews', async (req: Request, res: Response) => {
      try {
        const db = this.database as any;
        if (db.query) {
          const [rows]: any = await db.query(
            'SELECT r.*, o.gloriafood_order_id, d.name as driver_name FROM reviews r LEFT JOIN orders o ON r.order_id = o.id LEFT JOIN drivers d ON r.driver_id = d.id ORDER BY r.created_at DESC'
          );
          res.json({ success: true, reviews: rows });
        } else {
          res.json({ success: true, reviews: [] });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/reviews', async (req: Request, res: Response) => {
      try {
        const { order_id, driver_id, customer_name, rating, comment } = req.body;
        const db = this.database as any;
        if (db.query) {
          const [result]: any = await db.query(
            'INSERT INTO reviews (order_id, driver_id, customer_name, rating, comment) VALUES (?, ?, ?, ?, ?)',
            [order_id, driver_id, customer_name, rating, comment]
          );
          res.json({ success: true, review: { id: result.insertId, ...req.body } });
        } else {
          res.status(500).json({ success: false, error: 'Not supported with SQLite' });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  private verifyPassword(password: string, hashedPassword: string): boolean {
    return this.hashPassword(password) === hashedPassword;
  }

  private createSession(userId: number, email: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, {
      userId,
      email,
      expires: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    });
    return token;
  }

  private extractOrderData(body: any): GloriaFoodOrder | null {
    // Handle null/undefined body
    if (!body) {
      return null;
    }
    
    // Handle different possible webhook payload structures
    if (body.order) {
      return body.order;
    }
    if (body.data && body.data.order) {
      return body.data.order;
    }
    if (body.id || body.order_id) {
      return body;
    }
    if (Array.isArray(body) && body.length > 0) {
      return body[0];
    }
    if (body.orders && Array.isArray(body.orders) && body.orders.length > 0) {
      return body.orders[0];
    }
    return null;
  }

  private async displayOrder(order: Order, isNew: boolean = false, originalOrderData?: any): Promise<void> {
    const prefix = isNew ? chalk.green('🆕 NEW ORDER') : chalk.blue('📦 ORDER');
    
    // Use original order data if provided (more complete), otherwise parse from raw_data
    let rawData: any = originalOrderData || null;
    if (!rawData) {
      try {
        rawData = JSON.parse(order.raw_data || '{}');
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    // Extract customer information from multiple sources
    // Always prioritize rawData (originalOrderData) over database values when available
    let customerName = '';
    let customerPhone = '';
    let customerEmail = '';
    let deliveryAddress = '';
    
    if (rawData) {
      // Extract customer name - try root-level client_* fields FIRST (GloriaFood format)
      // Try root-level client_* fields (most common in GloriaFood)
      if (rawData.client_first_name || rawData.client_last_name) {
        customerName = `${rawData.client_first_name || ''} ${rawData.client_last_name || ''}`.trim();
      }
      if (!customerName && rawData.client_name) {
        customerName = String(rawData.client_name).trim();
      }
      // Try nested client object
      if (!customerName && rawData.client) {
        if (rawData.client.first_name || rawData.client.last_name) {
          customerName = `${rawData.client.first_name || ''} ${rawData.client.last_name || ''}`.trim();
        }
        if (!customerName) {
          if (rawData.client.name) customerName = rawData.client.name;
          if (!customerName && rawData.client.full_name) customerName = rawData.client.full_name;
        }
      }
      if (!customerName && rawData.customer) {
        if (rawData.customer.name) {
          customerName = rawData.customer.name;
        } else if (rawData.customer.first_name || rawData.customer.last_name) {
          customerName = `${rawData.customer.first_name || ''} ${rawData.customer.last_name || ''}`.trim();
        }
        if (!customerName && rawData.customer.full_name) customerName = rawData.customer.full_name;
      }
      if (!customerName && rawData.customer_name) {
        customerName = rawData.customer_name;
      }
      if (!customerName && rawData.name) {
        customerName = rawData.name;
      }
      
      // Extract customer phone - try root-level client_* fields FIRST
      customerPhone = rawData.client_phone || 
                     rawData.client_phone_number || 
                     rawData.client?.phone || 
                     rawData.client?.phone_number || 
                     rawData.client?.mobile ||
                     rawData.customer?.phone || 
                     rawData.customer?.phone_number || 
                     rawData.customer?.mobile ||
                     rawData.customer_phone || 
                     rawData.phone || 
                     rawData.phone_number || 
                     rawData.mobile || '';
      
      // Extract customer email - try root-level client_* fields FIRST
      customerEmail = rawData.client_email || 
                     rawData.client?.email || 
                     rawData.customer?.email || 
                     rawData.customer_email || 
                     rawData.email || '';
      
      // Extract delivery address - try root-level client_address FIRST
      // Try root-level client_address (GloriaFood format)
      if (rawData.client_address) {
        deliveryAddress = String(rawData.client_address).trim();
      }
      // Try client_address_parts (structured address)
      if (!deliveryAddress && rawData.client_address_parts) {
        const parts = rawData.client_address_parts;
        const addressParts = [
          parts.street || parts.address || parts.address_line_1,
          parts.more_address || parts.address_line_2,
          parts.city || parts.locality,
          parts.state || parts.province || parts.region,
          parts.zip || parts.postal_code || parts.postcode,
          parts.country
        ].filter(Boolean);
        if (addressParts.length > 0) {
          deliveryAddress = addressParts.join(', ');
        }
      }
      // Try delivery.address object (structured address)
      if (!deliveryAddress && rawData.delivery?.address) {
        const addr = rawData.delivery.address;
        const addressParts = [
          addr.street || addr.address_line_1 || addr.address || addr.line1 || addr.line_1,
          addr.address_line_2 || addr.line2 || addr.line_2,
          addr.city || addr.locality,
          addr.state || addr.province || addr.region,
          addr.zip || addr.postal_code || addr.postcode,
          addr.country
        ].filter(Boolean);
        if (addressParts.length > 0) {
          deliveryAddress = addressParts.join(', ');
        }
      }
      // Try delivery object with direct fields
      if (!deliveryAddress && (rawData.delivery?.street || rawData.delivery?.city)) {
        const addr = rawData.delivery;
        const addressParts = [
          addr.street || addr.address || addr.address_line_1,
          addr.city,
          addr.state || addr.province,
          addr.zip || addr.postal_code,
          addr.country
        ].filter(Boolean);
        if (addressParts.length > 0) {
          deliveryAddress = addressParts.join(', ');
        }
      }
      // Try root level fields
      if (!deliveryAddress && rawData.delivery_address) {
        deliveryAddress = rawData.delivery_address;
      }
      if (!deliveryAddress && rawData.address) {
        deliveryAddress = rawData.address;
      }
      if (!deliveryAddress && rawData.shipping_address) {
        deliveryAddress = rawData.shipping_address;
      }
    }
    
    // Fallback to database values if rawData extraction failed
    if (!customerName) customerName = order.customer_name || 'Unknown';
    if (!customerPhone) customerPhone = order.customer_phone || '';
    if (!customerEmail) customerEmail = order.customer_email || '';
    if (!deliveryAddress) deliveryAddress = order.delivery_address || '';
    
    // Convert total_price to number (MySQL returns DECIMAL as string)
    const totalPrice = typeof order.total_price === 'string' 
      ? parseFloat(order.total_price) 
      : (order.total_price || 0);
    
    // Extract additional delivery info from rawData
    let deliveryZone = '';
    let coordinates = '';
    if (rawData) {
      // Try root-level delivery_zone_name first (GloriaFood format)
      deliveryZone = rawData.delivery_zone_name || 
                     rawData.delivery_zone || 
                     rawData.delivery?.zone || 
                     rawData.zone || '';
      // Try root-level latitude/longitude first (GloriaFood format)
      if (rawData.latitude && rawData.longitude) {
        coordinates = `${rawData.latitude}, ${rawData.longitude}`;
      } else if (rawData.lat && rawData.lng) {
        coordinates = `${rawData.lat}, ${rawData.lng}`;
      } else if (rawData.delivery?.coordinates) {
        const coords = rawData.delivery.coordinates;
        if (coords.lat && coords.lng) {
          coordinates = `${coords.lat}, ${coords.lng}`;
        }
      }
    }
    
    console.log(`\n${prefix} ${chalk.bold(`#${order.gloriafood_order_id}`)}`);
    console.log(chalk.gray('  ════════════════════════════════════════════════════════════'));
    
    // Order Information Section
    console.log(chalk.yellow.bold('\n  📋 ORDER INFORMATION:'));
    console.log(`    ${chalk.bold('Order ID:')} ${order.gloriafood_order_id}`);
    console.log(`    ${chalk.bold('Internal ID:')} ${order.id || 'N/A'}`);
    console.log(`    ${chalk.bold('Store ID:')} ${order.store_id || 'N/A'}`);
    console.log(`    ${chalk.bold('Status:')} ${this.formatStatus(order.status)}`);
    console.log(`    ${chalk.bold('Type:')} ${order.order_type || 'N/A'}`);
    console.log(`    ${chalk.bold('Total:')} ${order.currency || 'USD'} ${totalPrice.toFixed(2)}`);
    
    // Customer Information Section
    console.log(chalk.yellow.bold('\n  👤 CUSTOMER INFORMATION:'));
    console.log(`    ${chalk.bold('Name:')} ${customerName || 'Unknown'}`);
    console.log(`    ${chalk.bold('Phone:')} ${customerPhone || 'N/A'}`);
    console.log(`    ${chalk.bold('Email:')} ${customerEmail || 'N/A'}`);
    
    // Delivery Information Section
    console.log(chalk.yellow.bold('\n  📍 DELIVERY INFORMATION:'));
    if (deliveryZone) {
      console.log(`    ${chalk.bold('Delivery Zone:')} ${deliveryZone}`);
    }
    if (coordinates) {
      console.log(`    ${chalk.bold('Coordinates:')} ${coordinates}`);
    }
    if (deliveryAddress) {
      console.log(`    ${chalk.bold('Address:')} ${deliveryAddress}`);
    } else {
      console.log(`    ${chalk.gray('No delivery address available')}`);
    }
    
    // DoorDash Information (if sent)
    if ((order as any).doordash_order_id || (order as any).sent_to_doordash) {
      console.log(chalk.yellow.bold('\n  🚚 DOORDASH INFORMATION:'));
      if ((order as any).doordash_order_id) {
        console.log(`    ${chalk.bold('DoorDash Delivery ID:')} ${(order as any).doordash_order_id}`);
      }
      if ((order as any).doordash_sent_at) {
        console.log(`    ${chalk.bold('Sent to DoorDash:')} ${new Date((order as any).doordash_sent_at).toLocaleString()}`);
      }
      // Try to get tracking URL from database or fetch it
      if ((order as any).doordash_order_id && this.doorDashClient) {
        try {
          const ddStatus = await this.doorDashClient.getOrderStatus((order as any).doordash_order_id);
          if (ddStatus.tracking_url) {
            console.log(`    ${chalk.bold('Tracking URL:')} ${chalk.blue(ddStatus.tracking_url)}`);
          }
          if (ddStatus.status) {
            console.log(`    ${chalk.bold('Delivery Status:')} ${ddStatus.status}`);
          }
        } catch (e) {
          // Ignore errors fetching DoorDash status
        }
      }
    }
    
    // Display items with detailed breakdown
    try {
      const items = JSON.parse(order.items || '[]');
      if (Array.isArray(items) && items.length > 0) {
        console.log(chalk.yellow.bold('\n  🛒 ORDER ITEMS:'));
        let itemsTotal = 0;
        items.forEach((item: any, index: number) => {
          const name = item.name || item.product_name || item.title || item.item_name || 'Unknown Item';
          const quantity = item.quantity || 1;
          const itemPrice = parseFloat(item.price || item.unit_price || item.total_price || 0);
          const subtotal = quantity * itemPrice;
          itemsTotal += subtotal;
          
          const currency = order.currency || 'USD';
          console.log(`    ${index + 1}. ${name} x${quantity} - ${currency} ${itemPrice.toFixed(2)} (Total: ${currency} ${subtotal.toFixed(2)})`);
          
          // Show variations/options
          if (item.variations || item.options) {
            const variations = item.variations || item.options || [];
            variations.forEach((opt: any) => {
              const optName = opt.name || opt.title || opt.option_name || '';
              if (optName) {
                console.log(`       ${chalk.gray(`  - ${optName}`)}`);
              }
            });
          }
          
          // Show item notes
          if (item.note || item.special_instructions || item.comment) {
            const note = item.note || item.special_instructions || item.comment;
            console.log(`       ${chalk.gray(`  Note: ${note}`)}`);
          }
        });
        
        // Show subtotal, delivery fee, and total
        const deliveryFee = totalPrice - itemsTotal;
        if (deliveryFee > 0 && Math.abs(deliveryFee) > 0.01) {
          console.log(`\n    ${chalk.bold('Subtotal:')} ${order.currency || 'USD'} ${itemsTotal.toFixed(2)}`);
          console.log(`    ${chalk.bold('Delivery Fee:')} ${order.currency || 'USD'} ${deliveryFee.toFixed(2)}`);
        }
        console.log(`    ${chalk.bold('Total:')} ${order.currency || 'USD'} ${totalPrice.toFixed(2)}`);
      } else {
        console.log(chalk.yellow.bold('\n  🛒 ORDER ITEMS:'));
        console.log(`    ${chalk.gray('No items data available')}`);
      }
    } catch (e) {
      console.log(chalk.yellow.bold('\n  🛒 ORDER ITEMS:'));
      console.log(`    ${chalk.gray('Error parsing items data')}`);
    }
    
    // Timestamps Section
    console.log(chalk.yellow.bold('\n  ⏰ TIMESTAMPS:'));
    console.log(`    ${chalk.bold('Created:')} ${new Date(order.created_at).toLocaleString()}`);
    console.log(`    ${chalk.bold('Updated:')} ${new Date(order.updated_at).toLocaleString()}`);
    console.log(`    ${chalk.bold('Received:')} ${new Date(order.fetched_at).toLocaleString()}`);
    
    console.log(chalk.gray('\n  ════════════════════════════════════════════════════════════'));
    
    // Display statistics
    const totalOrders = await this.handleAsync(this.database.getOrderCount());
    const recentOrders = await this.handleAsync(this.database.getRecentOrders(60));
    console.log(chalk.gray(`\n  📊 Total Orders: ${totalOrders} | Recent (1h): ${recentOrders.length}`));
  }

  private formatStatus(status: string): string {
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

  public start(): void {
    try {
      // Bind to 0.0.0.0 to allow external connections (required for Render)
      const server = this.app.listen(this.config.port, '0.0.0.0', () => {
        console.log(chalk.blue.bold('\n🚀 GloriaFood Webhook Server Started\n'));
        console.log(chalk.gray('Configuration:'));
        console.log(chalk.gray(`  Port: ${this.config.port}`));
        console.log(chalk.gray(`  Webhook Path: ${this.config.webhookPath}`));
        console.log(chalk.gray(`  Protocol Version: ${this.config.protocolVersion}`));
        console.log(chalk.gray(`  Store ID: ${this.config.storeId}`));
        console.log(chalk.gray(`  Database: ${this.config.databasePath}\n`));
        console.log(chalk.green(`✅ Server listening on 0.0.0.0:${this.config.port}`));
        console.log(chalk.green(`✅ Server is accessible from external connections`));
      
      // Show actual URLs based on environment
      if (process.env.RENDER) {
        const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://your-app.onrender.com';
        console.log(chalk.green(`📥 Webhook endpoint (POST): ${renderUrl}${this.config.webhookPath}`));
        console.log(chalk.green(`📥 Webhook endpoint (GET - test): ${renderUrl}${this.config.webhookPath}`));
        console.log(chalk.green(`💚 Health check: ${renderUrl}/health`));
        console.log(chalk.green(`📊 Statistics: ${renderUrl}/stats`));
      } else {
        console.log(chalk.green(`📥 Webhook endpoint (POST): http://localhost:${this.config.port}${this.config.webhookPath}`));
        console.log(chalk.green(`📥 Webhook endpoint (GET - test): http://localhost:${this.config.port}${this.config.webhookPath}`));
        console.log(chalk.green(`💚 Health check: http://localhost:${this.config.port}/health`));
        console.log(chalk.green(`📊 Statistics: http://localhost:${this.config.port}/stats`));
      }
      console.log(chalk.green(`📋 GET Endpoints:`));
      if (process.env.RENDER) {
        const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://your-app.onrender.com';
        console.log(chalk.gray(`   • All Orders: ${renderUrl}/orders`));
        console.log(chalk.gray(`   • Order by ID: ${renderUrl}/orders/:orderId`));
        console.log(chalk.gray(`   • Recent Orders: ${renderUrl}/orders/recent/:minutes`));
        console.log(chalk.gray(`   • Orders by Status: ${renderUrl}/orders/status/:status`));
        console.log(chalk.gray(`   • Summary: ${renderUrl}/summary`));
        console.log(chalk.gray(`   • Stats: ${renderUrl}/stats`));
        console.log(chalk.gray(`   • DoorDash Status: ${renderUrl}/doordash/status/:orderId\n`));
        console.log(chalk.yellow(`⚠ Configure GloriaFood webhook URL to:`));
        console.log(chalk.green(`   ${renderUrl}/webhook`));
      } else {
        console.log(chalk.gray(`   • All Orders: http://localhost:${this.config.port}/orders`));
        console.log(chalk.gray(`   • Order by ID: http://localhost:${this.config.port}/orders/:orderId`));
        console.log(chalk.gray(`   • Recent Orders: http://localhost:${this.config.port}/orders/recent/:minutes`));
        console.log(chalk.gray(`   • Orders by Status: http://localhost:${this.config.port}/orders/status/:status`));
        console.log(chalk.gray(`   • Summary: http://localhost:${this.config.port}/summary`));
        console.log(chalk.gray(`   • Stats: http://localhost:${this.config.port}/stats`));
        console.log(chalk.gray(`   • DoorDash Status: http://localhost:${this.config.port}/doordash/status/:orderId\n`));
        console.log(chalk.yellow(`⚠ Configure GloriaFood to send webhooks to your public URL`));
        console.log(chalk.yellow(`⚠ For local dev, use tunnel (cloudflared/ngrok):`));
        console.log(chalk.gray(`   npx -y cloudflared tunnel --url http://localhost:${this.config.port}`));
        console.log(chalk.gray(`   Then use the provided URL + /webhook`));
      }
      console.log(chalk.yellow(`\n⚠ Note: If your GloriaFood doesn't support webhooks, use polling mode instead:`));
      console.log(chalk.green(`   npm run dev (polling mode - checks every 30 seconds)\n`));
      });
      
      // Handle server errors
      server.on('error', (error: any) => {
        console.error(chalk.red.bold('\n❌ Server Error:'));
        console.error(chalk.red(`   ${error.message}`));
        if (error.code === 'EADDRINUSE') {
          console.error(chalk.yellow(`   Port ${this.config.port} is already in use`));
        }
      });
    } catch (error: any) {
      console.error(chalk.red.bold('\n❌ Failed to start server:'));
      console.error(chalk.red(`   ${error.message}`));
      console.error(chalk.red(`   Stack: ${error.stack}`));
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    this.deliveryScheduler?.stop();
    const closeResult = this.database.close();
    if (closeResult instanceof Promise) {
      await closeResult;
    }
    console.log(chalk.yellow('\n\n🛑 Webhook server stopped. Goodbye!\n'));
  }
}

// Main execution
async function main() {
  console.log(chalk.blue.bold('\n🚀 ========================================'));
  console.log(chalk.blue.bold('🚀 GLORIAFOOD WEBHOOK SERVER STARTING'));
  console.log(chalk.blue.bold('🚀 ========================================\n'));
  console.log(chalk.gray(`   Node version: ${process.version}`));
  console.log(chalk.gray(`   Platform: ${process.platform}`));
  console.log(chalk.gray(`   Working directory: ${process.cwd()}\n`));
  
  // Validate environment variables
  console.log(chalk.blue('🔵 Checking environment variables...'));
  const apiKey = process.env.GLORIAFOOD_API_KEY;
  const storeId = process.env.GLORIAFOOD_STORE_ID;
  
  console.log(chalk.gray(`   GLORIAFOOD_API_KEY: ${apiKey ? '✅ SET' : '❌ NOT SET'}`));
  console.log(chalk.gray(`   GLORIAFOOD_STORE_ID: ${storeId ? '✅ SET' : '❌ NOT SET'}`));
  console.log(chalk.gray(`   PORT: ${process.env.PORT || 'NOT SET (will use 3000)'}`));

  if (!apiKey || !storeId) {
    console.error(chalk.red.bold('\n❌ Error: Missing required environment variables!\n'));
    console.error(chalk.yellow('Please add these environment variables in Render Dashboard:'));
    console.error(chalk.gray('  GLORIAFOOD_API_KEY=your_api_key'));
    console.error(chalk.gray('  GLORIAFOOD_STORE_ID=your_store_id'));
    console.error(chalk.gray('  WEBHOOK_PORT=3000 (optional)'));
    console.error(chalk.gray('  WEBHOOK_PATH=/webhook (optional)'));
    console.error(chalk.gray('  DATABASE_PATH=./orders.db (optional)'));
    console.error(chalk.gray('\n  For MySQL/XAMPP:'));
    console.error(chalk.gray('  DB_TYPE=mysql'));
    console.error(chalk.gray('  DB_HOST=localhost'));
    console.error(chalk.gray('  DB_PORT=3306'));
    console.error(chalk.gray('  DB_USER=root'));
    console.error(chalk.gray('  DB_PASSWORD= (leave empty if no password)'));
    console.error(chalk.gray('  DB_NAME=gloriafood_orders\n'));
    process.exit(1);
  }
  
  console.log(chalk.green('✅ Environment variables check passed\n'));

  // Support both PORT (standard for hosting services) and WEBHOOK_PORT
  const port = parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3000', 10);
  
  const config: WebhookConfig = {
    port,
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    apiKey,
    storeId,
    masterKey: process.env.GLORIAFOOD_MASTER_KEY,
    protocolVersion: process.env.GLORIAFOOD_PROTOCOL_VERSION || 'v2',
    databasePath: process.env.DATABASE_PATH || './orders.db',
  };

  console.log(chalk.blue('🔵 Creating server instance...'));
  const server = new GloriaFoodWebhookServer(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n⚠️  SIGINT received, shutting down gracefully...'));
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n⚠️  SIGTERM received, shutting down gracefully...'));
    await server.stop();
    process.exit(0);
  });

  // Start the server
  console.log(chalk.blue('🔵 Starting server...\n'));
  server.start();
}

// Run the application
console.log(chalk.blue('🔵 Main function called, starting application...'));
main().catch(error => {
  console.error(chalk.red.bold('\n❌❌❌ FATAL ERROR ❌❌❌'));
  console.error(chalk.red(`Error: ${error.message}`));
  console.error(chalk.red(`Stack: ${error.stack}`));
  process.exit(1);
});

