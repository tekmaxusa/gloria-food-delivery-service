import express, { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as crypto from 'crypto';
import { IDatabase, DatabaseFactory, Order, User } from './database-factory';
import { GloriaFoodOrder } from './gloriafood-client';
import { DoorDashClient } from './doordash-client';
import { DeliveryScheduler, ScheduleResult, DispatchPayload } from './delivery-scheduler';
import { EmailService, MerchantEmailContext } from './email-service';
import { MerchantManager } from './merchant-manager';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

interface WebhookConfig {
  port: number;
  webhookPath: string;
  apiKey?: string; // Optional for multi-merchant mode
  storeId?: string; // Optional for multi-merchant mode
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
  private acceptanceScheduler: Map<string, NodeJS.Timeout> = new Map(); // Track scheduled post-acceptance calls
  private emailService?: EmailService;
  private merchantManager: MerchantManager;
  private sessions: Map<string, { userId: number; email: string; expires: number }> = new Map();
  private doorDashSyncInterval?: NodeJS.Timeout;

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
      
      // Initialize merchant manager (will be initialized in start method)
      this.merchantManager = new MerchantManager(this.database);
      
      this.initializeDeliveryScheduler();
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to create database: ${error.message}`));
      console.error(chalk.yellow('⚠️  Server will continue but database operations will fail'));
      console.error(chalk.yellow('⚠️  Check your database configuration in environment variables'));
      // Don't throw - allow server to start for UI access
      // Create a dummy database interface that returns empty results
      const dummyDb: any = {
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
        verifyPassword: () => false,
        getAllDrivers: () => [],
        getDriverById: () => null,
        getAllReviews: () => [],
        getReviewsByOrderId: () => [],
        getDashboardStats: () => ({ orders: { total: 0 }, revenue: { total: 0 }, drivers: { total: 0 } }),
        getAllMerchants: () => [],
        getMerchantByStoreId: () => null,
        insertOrUpdateMerchant: () => null,
        deleteMerchant: () => false,
        close: () => {}
      };
      this.database = dummyDb as IDatabase;
      this.merchantManager = new MerchantManager(this.database);
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

    // Check if order was already sent to DoorDash
    const orderId = this.getOrderIdentifier(orderData);
    if (orderId) {
      try {
        const existingOrder = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId));
        if (existingOrder && (existingOrder as any).sent_to_doordash) {
          console.log(chalk.yellow(`⚠️  Order ${orderId} already sent to DoorDash, skipping duplicate`));
          // Return existing DoorDash info if available
          if ((existingOrder as any).doordash_order_id || (existingOrder as any).doordash_tracking_url) {
            return {
              id: (existingOrder as any).doordash_order_id,
              external_delivery_id: orderId,
              status: 'existing',
              tracking_url: (existingOrder as any).doordash_tracking_url
            };
          }
          return null;
        }
      } catch (error: any) {
        console.log(chalk.yellow(`⚠️  Could not check if order already sent: ${error.message}`));
        // Continue anyway
      }
    }

    try {
      // Get merchant address from database if available
      let merchantAddress: string | undefined = undefined;
      const storeId = orderData.store_id || orderData.restaurant_id;
      if (storeId) {
        try {
          const merchant = this.merchantManager.getMerchantByStoreId(storeId);
          if (merchant && (merchant as any).address) {
            merchantAddress = (merchant as any).address;
          }
        } catch (merchantError: any) {
          console.log(chalk.yellow(`   ⚠️  Could not get merchant address: ${merchantError.message}`));
        }
      }

      // Convert to DoorDash Drive delivery payload
      const drivePayload = this.doorDashClient.convertGloriaFoodToDrive(orderData, merchantAddress);
      console.log(chalk.blue(`🔍 DoorDash payload prepared, sending to API...`));

      // Send to DoorDash Drive
      const response = await this.doorDashClient.createDriveDelivery(drivePayload);
      console.log(chalk.blue(`🔍 DoorDash API response received`));
      console.log(chalk.blue(`🔍 Response ID: ${response.id || 'NONE'}`));
      console.log(chalk.blue(`🔍 Response tracking_url: ${response.tracking_url || 'NONE'}`));
      console.log(chalk.blue(`🔍 Response raw data keys: ${response.raw ? Object.keys(response.raw).join(', ') : 'NONE'}`));
      
      if (response.raw) {
        console.log(chalk.gray(`   Raw response (first 500 chars): ${JSON.stringify(response.raw).substring(0, 500)}`));
        
        // Save DoorDash response data to order's raw_data for accurate distance retrieval
        const orderId = this.getOrderIdentifier(orderData);
        if (orderId) {
          try {
            const existingOrder = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId));
            if (existingOrder && existingOrder.raw_data) {
              let rawData: any = {};
              try {
                rawData = typeof existingOrder.raw_data === 'string' 
                  ? JSON.parse(existingOrder.raw_data) 
                  : existingOrder.raw_data;
              } catch (e) {
                // If parsing fails, use empty object
              }
              
              // Add DoorDash response data to raw_data
              rawData.doordash_data = response.raw;
              rawData.doordash_response = {
                id: response.id,
                external_delivery_id: response.external_delivery_id,
                status: response.status,
                tracking_url: response.tracking_url
              };
              
              // Update order with enriched raw_data
              // Ensure merchant_name is preserved from original orderData
              await this.handleAsync(this.database.insertOrUpdateOrder({
                ...orderData,
                raw_data: rawData,
                merchant_name: orderData.merchant_name // Preserve merchant_name if it was set earlier
              }));
              console.log(chalk.green(`✅ Saved DoorDash response data to order ${orderId} for accurate distance`));
            }
          } catch (error: any) {
            console.log(chalk.yellow(`⚠️  Could not save DoorDash response to order: ${error.message}`));
          }
        }
      }

      return { 
        id: response.id, 
        external_delivery_id: response.external_delivery_id,
        status: response.status, 
        tracking_url: response.tracking_url
      };
    } catch (error: any) {
      // Handle duplicate delivery ID error (409)
      if (error.message && error.message.includes('409') && error.message.includes('duplicate_delivery_id')) {
        console.log(chalk.yellow(`⚠️  Order ${orderId || 'unknown'} already exists in DoorDash (duplicate delivery ID)`));
        // Try to get existing order info from database
        if (orderId) {
          try {
            const existingOrder = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId));
            if (existingOrder && (existingOrder as any).doordash_order_id) {
              return {
                id: (existingOrder as any).doordash_order_id,
                external_delivery_id: orderId,
                status: 'existing',
                tracking_url: (existingOrder as any).doordash_tracking_url
              };
            }
          } catch (dbError) {
            // Ignore database errors
          }
        }
        return null;
      }
      
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
    // Cancel post-acceptance schedule since DoorDash has been called
    this.cancelPostAcceptanceSchedule(orderId);
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

  /**
   * Schedule DoorDash call 20-25 minutes after order acceptance
   */
  private async schedulePostAcceptanceDoorDash(orderId: string, orderData: any): Promise<void> {
    // Cancel any existing schedule for this order
    this.cancelPostAcceptanceSchedule(orderId);

    // Check if order was already sent to DoorDash
    try {
      const existingOrder = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId));
      if (existingOrder && (existingOrder as any).sent_to_doordash) {
        console.log(chalk.yellow(`⚠️  Order ${orderId} already sent to DoorDash, skipping post-acceptance schedule`));
        return;
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️  Could not check if order already sent: ${error.message}`));
    }

    // Random delay between 20-25 minutes (1200-1500 seconds)
    const minMinutes = 20;
    const maxMinutes = 25;
    const delayMinutes = minMinutes + Math.random() * (maxMinutes - minMinutes);
    const delayMs = delayMinutes * 60 * 1000;

    console.log(chalk.cyan(`⏰ Scheduling DoorDash call for order #${orderId} in ${delayMinutes.toFixed(1)} minutes (${Math.round(delayMs / 1000)} seconds)`));

    const timeoutId = setTimeout(async () => {
      try {
        // Check again if order was already sent to DoorDash
        const order = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId));
        if (!order) {
          console.log(chalk.yellow(`⚠️  Order #${orderId} not found, skipping DoorDash call`));
          return;
        }

        if ((order as any).sent_to_doordash) {
          console.log(chalk.yellow(`⚠️  Order #${orderId} already sent to DoorDash, skipping post-acceptance call`));
          return;
        }

        // Check if order is still accepted
        const status = (order.status || '').toString().toUpperCase();
        if (status !== 'ACCEPTED') {
          console.log(chalk.yellow(`⚠️  Order #${orderId} status changed to ${status}, skipping post-acceptance call`));
          return;
        }

        console.log(chalk.green(`🚚 Post-acceptance timer triggered - calling DoorDash for order #${orderId}...`));
        
        // Prepare order data from database order
        let orderDataForDoorDash = orderData;
        if (order.raw_data) {
          try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            orderDataForDoorDash = { ...rawData, ...order };
          } catch (e) {
            orderDataForDoorDash = { ...order };
          }
        }

        // Send to DoorDash
        await this.dispatchDoorDash(orderDataForDoorDash, {
          trigger: 'scheduled',
          source: 'post-acceptance',
          reason: '20-25-minutes-after-acceptance'
        });
      } catch (error: any) {
        console.error(chalk.red(`❌ Error in post-acceptance DoorDash call for order #${orderId}: ${error.message}`));
      } finally {
        this.acceptanceScheduler.delete(orderId);
      }
    }, delayMs);

    this.acceptanceScheduler.set(orderId, timeoutId);
  }

  /**
   * Cancel post-acceptance schedule for an order
   */
  private cancelPostAcceptanceSchedule(orderId: string): void {
    const timeoutId = this.acceptanceScheduler.get(orderId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.acceptanceScheduler.delete(orderId);
      console.log(chalk.gray(`   Cancelled post-acceptance schedule for order #${orderId}`));
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

  /**
   * Start periodic sync of DoorDash status for pending orders
   * This helps catch cancellations even if webhook wasn't received
   */
  private startDoorDashStatusSync(): void {
    if (!this.doorDashClient) {
      return;
    }

    // Sync every 2 minutes - balanced between responsiveness and performance
    this.doorDashSyncInterval = setInterval(async () => {
      try {
        await this.syncDoorDashStatuses();
      } catch (error: any) {
        console.error(chalk.red('Error in DoorDash status sync:'), error.message);
      }
    }, 2 * 60 * 1000); // 2 minutes

    // Run initial sync after 30 seconds
    setTimeout(() => {
      this.syncDoorDashStatuses().catch(err => {
        console.error(chalk.red('Error in initial DoorDash status sync:'), err.message);
      });
    }, 30000);
  }

  /**
   * Sync DoorDash status for orders that are pending but sent to DoorDash
   */
  private async syncDoorDashStatuses(): Promise<void> {
    if (!this.doorDashClient) {
      return;
    }

    try {
      // Use efficient query to get only pending DoorDash orders
      // This is much faster than fetching all orders and filtering
      let ordersToCheck = await this.handleAsync(
        (this.database as any).getPendingDoorDashOrders?.(100) || 
        Promise.resolve([])
      );

      // Fallback to old method if new method doesn't exist
      if (ordersToCheck.length === 0 && !(this.database as any).getPendingDoorDashOrders) {
        const allOrders = await this.handleAsync(this.database.getAllOrders(200));
        const filtered = allOrders.filter(order => {
          const status = (order.status || '').toUpperCase();
          const isNotFinal = !['CANCELLED', 'CANCELED', 'DELIVERED', 'COMPLETED'].includes(status);
          const hasDoorDashId = (order as any).doordash_order_id || 
                                (order as any).sent_to_doordash || 
                                (order as any).doordash_tracking_url;
          return isNotFinal && hasDoorDashId;
        });
        ordersToCheck = filtered.slice(0, 100);
      }

      // Also check ALL pending orders that might have been sent to DoorDash but not marked
      // This catches orders that have tracking URLs but weren't properly marked
      if (ordersToCheck.length < 50) {
        const allPendingOrders = await this.handleAsync(this.database.getAllOrders(200));
        const additionalOrders = allPendingOrders.filter(order => {
          const status = (order.status || '').toUpperCase();
          const isPending = ['PENDING', 'ACCEPTED', 'CONFIRMED'].includes(status);
          // Check if order has any indication it was sent to DoorDash
          const hasTrackingUrl = (order as any).doordash_tracking_url;
          const hasRawDataTracking = order.raw_data && (
            order.raw_data.includes('doordash') || 
            order.raw_data.includes('tracking') ||
            order.raw_data.includes('delivery')
          );
          return isPending && (hasTrackingUrl || hasRawDataTracking);
        });
        
        // Add orders that aren't already in the list
        const existingIds = new Set(ordersToCheck.map((o: any) => o.gloriafood_order_id));
        const newOrders = additionalOrders.filter((o: any) => !existingIds.has(o.gloriafood_order_id));
        ordersToCheck.push(...newOrders.slice(0, 50 - ordersToCheck.length));
      }

      if (ordersToCheck.length === 0) {
        return;
      }

      console.log(chalk.blue(`🔄 Syncing DoorDash status for ${ordersToCheck.length} order(s)...`));
      let updateCount = 0;

      for (const order of ordersToCheck) {
        try {
          const doorDashId = (order as any).doordash_order_id;
          const trackingUrl = (order as any).doordash_tracking_url;
          const externalDeliveryId = order.gloriafood_order_id; // Use GloriaFood order ID as external_delivery_id
          
          // Try to extract DoorDash ID from tracking URL if available
          let extractedDoorDashId = null;
          if (trackingUrl && trackingUrl.includes('doordash')) {
            // Try to extract delivery ID from tracking URL
            const urlMatch = trackingUrl.match(/deliveries\/([^\/\?]+)/i) || trackingUrl.match(/delivery\/([^\/\?]+)/i);
            if (urlMatch && urlMatch[1]) {
              extractedDoorDashId = urlMatch[1];
            }
          }
          
          // Try to get status by doordash_order_id first, then by extracted ID, then by external_delivery_id
          let ddStatus = null;
          let statusError = null;
          let triedIds = [];

          // Try 1: Use doordash_order_id if available
          if (doorDashId) {
            triedIds.push(`doordash_order_id: ${doorDashId}`);
            try {
              ddStatus = await this.doorDashClient.getOrderStatus(doorDashId);
            } catch (error: any) {
              statusError = error;
            }
          }
          
          // Try 2: Use extracted ID from tracking URL if available and first try failed
          if (!ddStatus && extractedDoorDashId && extractedDoorDashId !== doorDashId) {
            triedIds.push(`extracted from URL: ${extractedDoorDashId}`);
            try {
              ddStatus = await this.doorDashClient.getOrderStatus(extractedDoorDashId);
            } catch (error: any) {
              statusError = error;
            }
          }
          
          // Try 3: Use external_delivery_id (GloriaFood order ID) if previous tries failed
          if (!ddStatus && externalDeliveryId) {
            triedIds.push(`external_delivery_id: ${externalDeliveryId}`);
            try {
              ddStatus = await this.doorDashClient.getOrderStatus(externalDeliveryId);
            } catch (error: any) {
              statusError = error;
            }
          }

          // If all tries failed, log and continue
          if (!ddStatus) {
            if (statusError && (statusError.message?.includes('404') || statusError.message?.includes('not found'))) {
              // 404 is expected for orders not in DoorDash - skip silently
              continue;
            } else if (statusError) {
              console.log(chalk.gray(`  ⚠️  Order #${order.gloriafood_order_id}: Could not get DoorDash status (tried: ${triedIds.join(', ')}): ${statusError.message}`));
            }
            continue;
          }

          if (!ddStatus || !ddStatus.status) {
            continue;
          }

          const normalizedStatus = (ddStatus.status || '').toLowerCase();
          
          // Log the status we got from DoorDash for debugging
          console.log(chalk.gray(`  📊 Order #${order.gloriafood_order_id}: DoorDash status = "${ddStatus.status}" (normalized: "${normalizedStatus}")`));

          // Update order status if DoorDash shows cancelled
          // Check for various cancelled status variations
          if (normalizedStatus === 'cancelled' || 
              normalizedStatus === 'canceled' || 
              normalizedStatus === 'cancellation' ||
              normalizedStatus.includes('cancel')) {
            if ((this.database as any).updateOrderStatus) {
              const updated = await this.handleAsync(
                (this.database as any).updateOrderStatus(order.gloriafood_order_id, 'CANCELLED')
              );
              if (updated) {
                updateCount++;
                console.log(chalk.yellow(`  ⚠️  Updated order #${order.gloriafood_order_id} to CANCELLED (DoorDash status: "${ddStatus.status}")`));
              } else {
                console.log(chalk.red(`  ❌ Failed to update order #${order.gloriafood_order_id} to CANCELLED - updateOrderStatus returned false`));
                // Try to check if order exists and what its current status is
                const currentOrder = await this.handleAsync(this.database.getOrderByGloriaFoodId(order.gloriafood_order_id));
                if (currentOrder) {
                  console.log(chalk.gray(`    Current order status: ${currentOrder.status}`));
                } else {
                  console.log(chalk.red(`    Order not found in database!`));
                }
              }
            } else {
              console.log(chalk.red(`  ❌ updateOrderStatus method not available for order #${order.gloriafood_order_id}`));
            }
          } else if (normalizedStatus === 'delivered' || normalizedStatus === 'completed') {
            if ((this.database as any).updateOrderStatus) {
              const updated = await this.handleAsync(
                (this.database as any).updateOrderStatus(order.gloriafood_order_id, 'DELIVERED')
              );
              if (updated) {
                updateCount++;
                console.log(chalk.green(`  ✅ Updated order #${order.gloriafood_order_id} to DELIVERED`));
              } else {
                console.log(chalk.red(`  ❌ Failed to update order #${order.gloriafood_order_id} to DELIVERED`));
              }
            } else {
              console.log(chalk.red(`  ❌ updateOrderStatus method not available for order #${order.gloriafood_order_id}`));
            }
          }
        } catch (error: any) {
          // Handle 404 errors silently (order doesn't exist in DoorDash yet - this is normal)
          if (error.message?.includes('404') || error.message?.includes('not found')) {
            // Only log at debug level - this is expected for orders that haven't been created in DoorDash yet
            // Skip logging to reduce noise
            continue;
          }
          // Log other errors (network issues, auth problems, etc.)
          console.log(chalk.gray(`  ⚠️  Could not sync order #${order.gloriafood_order_id}: ${error.message}`));
        }
      }

      // Only log sync summary if there were updates or errors
      if (updateCount > 0) {
        console.log(chalk.blue(`🔄 DoorDash sync completed: ${updateCount} order(s) updated`));
      }
    } catch (error: any) {
      console.error(chalk.red('Error syncing DoorDash statuses:'), error.message);
    }
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
      // Add cache-busting for app.js to force browser refresh
      this.app.use(express.static(resolvedPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('app.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        }
      }));
      
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
      // Add cache-busting for app.js to force browser refresh
      this.app.use(express.static(publicPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('app.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        }
      }));
    } else {
      console.log(chalk.yellow('⚠️  Public directory not found, dashboard may not be available'));
    }
    
    // Parse JSON bodies
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
    // Handle favicon requests to prevent 404 errors
    this.app.get('/favicon.ico', (req: Request, res: Response) => {
      res.status(204).end(); // No content, but successful
    });
    
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

    // Test webhook endpoint - helps verify webhook URL is accessible
    this.app.get(this.config.webhookPath, (req: Request, res: Response) => {
      console.log(chalk.cyan(`\n🔵 Webhook test GET request received`));
      console.log(chalk.gray(`   URL: ${req.url}`));
      console.log(chalk.gray(`   Query params: ${JSON.stringify(req.query)}`));
      
      res.status(200).json({ 
        success: true,
        message: 'Webhook endpoint is active and accessible',
        method: 'GET',
        note: 'GloriaFood should send POST requests to this endpoint',
        endpoint: this.config.webhookPath,
        timestamp: new Date().toISOString(),
        instructions: {
          step1: 'Copy the webhook URL from the Integrations page',
          step2: 'Go to GloriaFood Admin Dashboard → Settings → Integrations',
          step3: 'Paste the webhook URL in the webhook configuration',
          step4: 'Save and test with a new order'
        }
      });
    });

    // GET handler for webhook endpoint (for testing/debugging)
    this.app.get(this.config.webhookPath, async (req: Request, res: Response) => {
      console.log(chalk.cyan(`\n🔵 Webhook test GET request received`));
      
      // Get webhook URL
      const protocol = req.protocol || 'https';
      const host = req.get('host') || 'your-app.onrender.com';
      const webhookUrl = `${protocol}://${host}${this.config.webhookPath}`;
      
      // Get merchants count for info
      let merchantsInfo = 'N/A';
      try {
        const merchants = await this.database.getAllMerchants();
        const activeMerchants = merchants.filter(m => m.is_active !== false);
        merchantsInfo = `${activeMerchants.length} active merchant(s) configured`;
      } catch (e) {
        merchantsInfo = 'Could not load merchants';
      }
      
      res.json({
        success: true,
        service: 'GloriaFood Webhook Server',
        endpoint: this.config.webhookPath,
        method: 'POST (for actual orders)',
        protocol: 'JSON',
        protocol_version: this.config.protocolVersion,
        status: 'ready',
        webhook_url: webhookUrl,
        message: 'Webhook endpoint is active and accessible. GloriaFood should send POST requests here with order data.',
        merchants: merchantsInfo,
        instructions: {
          step1: 'Copy the webhook URL above',
          step2: 'Go to GloriaFood Admin Dashboard → Settings → Integrations/Webhooks',
          step3: 'Paste the webhook URL in the webhook configuration field',
          step4: 'Make sure you have added a merchant in the Integrations page with the correct Store ID',
          step5: 'Save and test with a new order',
          step6: 'Check server logs to see if orders are being received'
        },
        troubleshooting: {
          no_orders: 'If orders are not received:',
          check1: '1. Verify webhook URL is correctly configured in GloriaFood',
          check2: '2. Verify Store ID in Integration matches the Store ID from GloriaFood',
          check3: '3. Check server logs when placing a test order',
          check4: '4. Make sure merchant is set to "Active" in Integrations page'
        },
        timestamp: new Date().toISOString()
      });
    });

    // Webhook endpoint for receiving orders
    this.app.post(this.config.webhookPath, async (req: Request, res: Response) => {
      console.log(chalk.cyan('\n🔵 WEBHOOK ENDPOINT CALLED'));
      try {
        // Extract merchant_id from query params (for multi-merchant support)
        const merchantIdFromQuery = req.query.merchant_id ? parseInt(req.query.merchant_id as string) : null;
        
        // Extract order data from request first (needed to identify merchant)
        // Try body first, then query params, then raw body
        let orderData = this.extractOrderData(req.body);
        
        // If body is empty, try query params
        if (!orderData && Object.keys(req.query).length > 0) {
          console.log(chalk.yellow('   ⚠️  Body is empty, trying query params...'));
          orderData = this.extractOrderData(req.query);
        }
        
        if (!orderData) {
          console.warn(chalk.yellow('⚠ Invalid webhook payload - no order data found'));
          console.log(chalk.gray('   Request body keys:'), Object.keys(req.body || {}));
          console.log(chalk.gray('   Request query keys:'), Object.keys(req.query || {}));
          console.log(chalk.gray('   Content-Type:'), req.headers['content-type'] || 'N/A');
          console.log(chalk.gray('   Raw body (first 500 chars):'), JSON.stringify(req.body || {}).substring(0, 500));
          
          // Still return 200 to prevent retries, but log the issue
          return res.status(200).json({ 
            success: false, 
            error: 'Invalid payload - no order data found',
            received: {
              hasBody: !!req.body,
              bodyKeys: Object.keys(req.body || {}),
              hasQuery: Object.keys(req.query || {}).length > 0,
              queryKeys: Object.keys(req.query || {}),
              contentType: req.headers['content-type'] || 'N/A'
            }
          });
        }

        // Try to find merchant by merchant_id from query params first (new multi-merchant approach)
        let merchant = null;
        const client = await (this.database as any).pool?.connect();
        
        if (merchantIdFromQuery && client) {
          try {
            const merchantResult = await client.query(
              `SELECT * FROM merchants WHERE id = $1 AND is_active = TRUE`,
              [merchantIdFromQuery]
            );
            
            if (merchantResult.rows.length > 0) {
              merchant = merchantResult.rows[0];
              
              // Decrypt credentials if encrypted
              if (merchant.credentials_encrypted) {
                const { EncryptionService } = await import('./encryption-service');
                const decrypted = EncryptionService.decryptCredentials({
                  apiKey: merchant.api_key,
                  apiUrl: merchant.api_url,
                  masterKey: merchant.master_key,
                  webhookSecret: merchant.webhook_secret
                });
                merchant = { ...merchant, ...decrypted };
              }
              
              console.log(chalk.green(`   ✅ Found merchant by merchant_id: ${merchant.merchant_name} (ID: ${merchant.id})`));
              
              // Verify webhook secret if provided
              const webhookSecret = req.headers['x-webhook-secret'] || req.headers['webhook-secret'] || req.query?.webhook_secret;
              if (merchant.webhook_secret && webhookSecret) {
                if (merchant.webhook_secret !== webhookSecret) {
                  console.log(chalk.red(`   ❌ Webhook secret verification failed`));
                  client.release();
                  return res.status(401).json({ 
                    success: false, 
                    error: 'Invalid webhook secret' 
                  });
                }
                console.log(chalk.green(`   ✅ Webhook secret verified`));
              }
              
              // Update last_webhook_received timestamp
              await client.query(`
                UPDATE merchants 
                SET last_webhook_received = CURRENT_TIMESTAMP,
                    integration_status = CASE 
                      WHEN integration_status = 'error' THEN 'connected'
                      ELSE integration_status
                    END
                WHERE id = $1
              `, [merchantIdFromQuery]);
            }
            client.release();
          } catch (merchantError: any) {
            if (client) client.release();
            console.log(chalk.yellow(`   ⚠️  Could not lookup merchant by ID: ${merchantError.message}`));
          }
        }

        // Fallback: Extract API key from request for merchant identification
        if (!merchant) {
          const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
          const providedKey = authHeader?.toString().replace('Bearer ', '').trim() ||
                            req.body?.api_key ||
                            req.query?.token;

          if (providedKey) {
            try {
              merchant = await this.handleAsync(this.database.getMerchantByApiKey(providedKey));
              
              // Decrypt credentials if encrypted
              if (merchant && (merchant as any).credentials_encrypted) {
                const { EncryptionService } = await import('./encryption-service');
                const decrypted = EncryptionService.decryptCredentials({
                  apiKey: merchant.api_key,
                  apiUrl: merchant.api_url,
                  masterKey: merchant.master_key,
                  webhookSecret: (merchant as any).webhook_secret
                });
                merchant = { ...merchant, ...decrypted };
              }
            } catch (dbError: any) {
              console.log(chalk.yellow(`   ⚠️  Could not lookup merchant by API key (database error): ${dbError.message}`));
              // Continue - we'll try store_id lookup
            }
          }
        }
        
        // Fallback: Try to find merchant by store_id (for backward compatibility)
        // Now uses location lookup which is async
        if (!merchant) {
          try {
            const user = getCurrentUser(req);
            merchant = await this.merchantManager.findMerchantForOrder(orderData, user?.userId);
            
            // Decrypt credentials if encrypted
            if (merchant && (merchant as any).credentials_encrypted) {
              const { EncryptionService } = await import('./encryption-service');
              const decrypted = EncryptionService.decryptCredentials({
                apiKey: merchant.api_key,
                apiUrl: merchant.api_url,
                masterKey: merchant.master_key,
                webhookSecret: (merchant as any).webhook_secret
              });
              merchant = { ...merchant, ...decrypted };
            }
          } catch (error: any) {
            console.log(chalk.yellow(`   ⚠️  Could not lookup merchant by store_id: ${error.message}`));
            // Continue without merchant
          }
        }

        // Validate authentication - check merchant-specific API key or global keys
        if (merchant) {
          // Check merchant-specific API key first
          let isValid = false;
          if (merchant.api_key && providedKey) {
            isValid = providedKey === merchant.api_key;
          }
          
          // Also check master key (global) or global API key
          if (!isValid) {
            isValid = 
              providedKey === this.config.apiKey ||
              providedKey === this.config.masterKey ||
              req.headers['x-master-key'] === this.config.masterKey ||
              req.headers['master-key'] === this.config.masterKey ||
              req.body?.api_key === merchant.api_key ||
              req.body?.api_key === this.config.apiKey ||
              req.body?.master_key === this.config.masterKey ||
              req.query?.token === merchant.api_key ||
              req.query?.token === this.config.apiKey;
          }

          // Log authentication status (but don't block - some webhooks don't send auth)
          if (!isValid && (merchant.api_key || this.config.masterKey || this.config.apiKey)) {
            console.log(chalk.yellow(`   ⚠️  Authentication check failed for merchant ${merchant.merchant_name}, but processing order anyway`));
          } else if (isValid) {
            console.log(chalk.green(`   ✅ Authentication validated for merchant ${merchant.merchant_name}`));
          }
        } else if (this.config.masterKey || this.config.apiKey) {
          // Fallback to global authentication if merchant not found
          const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
          const providedKey = authHeader?.toString().replace('Bearer ', '').trim();
          
          const isValid = 
            providedKey === this.config.apiKey ||
            providedKey === this.config.masterKey ||
            req.headers['x-master-key'] === this.config.masterKey ||
            req.headers['master-key'] === this.config.masterKey ||
            req.body?.api_key === this.config.apiKey ||
            req.body?.master_key === this.config.masterKey ||
            req.query?.token === this.config.apiKey;

          if (!isValid) {
            console.log(chalk.yellow(`   ⚠️  Global authentication check failed, but processing order anyway`));
          }
        }

        // Log received order
        const orderId = orderData.id || orderData.order_id || 'unknown';
        const receivedStoreId = this.merchantManager.extractStoreIdFromOrder(orderData) || 'NOT FOUND';
        
        console.log(chalk.green(`\n✅ Order data extracted successfully from GloriaFood: #${orderId}`));
        console.log(chalk.green(`   ✅ Connected to GloriaFood - Order received!`));
        console.log(chalk.cyan(`   📦 Store ID from order: ${receivedStoreId}`));
        console.log(chalk.gray(`   📋 Order data keys: ${Object.keys(orderData).join(', ')}`));
        
        if (merchant) {
          console.log(chalk.cyan(`   🏪 Merchant: ${merchant.merchant_name} (${merchant.store_id || 'no store_id'})`));
          // Add merchant name to orderData
          orderData.merchant_name = merchant.merchant_name;
        } else {
          console.log(chalk.yellow(`   ⚠️  Merchant not found for store_id: ${receivedStoreId}`));
          console.log(chalk.gray(`   💡 Checking if store_id matches any location in database...`));
          
          // Try to find location directly to help debug
          try {
            const location = await this.merchantManager.findLocationForOrder(orderData);
            if (location) {
              console.log(chalk.green(`   ✅ Found location: ${location.location_name} (store_id: ${location.store_id})`));
            } else {
              console.log(chalk.red(`   ❌ No location found with store_id: ${receivedStoreId}`));
              console.log(chalk.gray(`   💡 Make sure the Store ID in your Integration matches exactly: ${receivedStoreId}`));
            }
          } catch (locError: any) {
            console.log(chalk.yellow(`   ⚠️  Could not check location: ${locError.message}`));
          }
          
          console.log(chalk.gray(`   💡 Add this merchant to Integrations page with Store ID: ${receivedStoreId}`));
        }

        // Determine if this is a new order BEFORE saving
        // Get user_id from merchant if available
        const orderUserId = merchant?.user_id || undefined;
        
        // Try to get existing order (but don't fail if database is unavailable)
        let existingBefore = null;
        try {
          existingBefore = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId.toString(), orderUserId));
        } catch (dbError: any) {
          console.log(chalk.yellow(`   ⚠️  Could not check existing order (database error): ${dbError.message}`));
          // Continue processing - we'll treat it as a new order
        }
        
        // Store order in database (handle both sync SQLite and async MySQL)
        console.log(chalk.blue(`💾 Saving order to database...`));
        let savedOrder = null;
        try {
          savedOrder = await this.handleAsync(this.database.insertOrUpdateOrder(orderData, orderUserId));
          console.log(chalk.blue(`💾 Database save result: ${savedOrder ? 'SUCCESS' : 'FAILED'}`));
        } catch (dbError: any) {
          console.error(chalk.red(`❌ Database error while saving order: ${dbError.message}`));
          console.log(chalk.yellow(`   ⚠️  Order received but could not be saved to database`));
          // Continue - we'll still return 200 to prevent retries
          savedOrder = null;
        }

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

          // Handle order acceptance - schedule DoorDash call 20-25 minutes after acceptance
          if (statusChanged && newStatus === 'accepted' && prevStatus !== 'accepted' && isDeliveryOrder) {
            console.log(chalk.cyan(`📦 Order #${orderIdStr} accepted - scheduling DoorDash call in 20-25 minutes...`));
            await this.schedulePostAcceptanceDoorDash(orderIdStr, orderData);
          }

          if (isCancelled) {
            this.deliveryScheduler?.cancel(orderIdStr, 'order-cancelled');
            this.cancelPostAcceptanceSchedule(orderIdStr);
          } else if (!isDeliveryOrder) {
            this.deliveryScheduler?.cancel(orderIdStr, 'non-delivery');
            this.cancelPostAcceptanceSchedule(orderIdStr);
          } else if (isNew || wasNotSent) {
            // Don't schedule immediately if order is already accepted - let post-acceptance scheduler handle it
            if (newStatus !== 'accepted') {
              await this.scheduleDoorDashDelivery(orderData, isNew ? 'new-order' : 'update-order');
            }
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
        const user = getCurrentUser(req);
        const limit = parseInt(req.query.limit as string) || 50;
        const status = req.query.status as string | undefined;
        const storeId = req.query.store_id as string | undefined;
        
        let orders;
        if (status) {
          orders = await this.handleAsync(this.database.getOrdersByStatus(status, user?.userId));
        } else {
          orders = await this.handleAsync(this.database.getAllOrders(limit, user?.userId));
        }
        
        // If user is logged in, also include orders with user_id = NULL that match user's merchants
        // This handles backward compatibility for orders saved before user_id was set
        if (user?.userId && orders.length < limit) {
          try {
            const userMerchants = await this.handleAsync(this.database.getAllMerchants(user.userId));
            const userStoreIds = userMerchants.map(m => m.store_id).filter(Boolean);
            
            if (userStoreIds.length > 0) {
              // Get orders with NULL user_id that match user's merchants
              // Only fetch if we need more orders to reach the limit
              const remainingLimit = limit - orders.length;
              const nullUserOrders = await this.handleAsync(
                this.database.getAllOrders(remainingLimit * 3, undefined) // Get more to account for filtering
              );
              
              // Filter to only orders matching user's store_ids and not already in orders list
              const existingOrderIds = new Set(orders.map(o => o.gloriafood_order_id));
              const matchingNullOrders = nullUserOrders
                .filter(order => {
                  const orderAny = order as any;
                  const hasNullUserId = orderAny.user_id === null || orderAny.user_id === undefined;
                  return hasNullUserId &&
                         order.store_id && 
                         userStoreIds.includes(order.store_id) &&
                         !existingOrderIds.has(order.gloriafood_order_id);
                })
                .slice(0, remainingLimit);
              
              // Merge and sort by fetched_at DESC, then limit
              if (matchingNullOrders.length > 0) {
                orders = [...orders, ...matchingNullOrders]
                  .sort((a, b) => {
                    const aTime = new Date(a.fetched_at || a.created_at || 0).getTime();
                    const bTime = new Date(b.fetched_at || b.created_at || 0).getTime();
                    return bTime - aTime;
                  })
                  .slice(0, limit);
              }
            }
          } catch (merchantError: any) {
            console.error('Error getting user merchants for order lookup:', merchantError);
            // Continue with orders we already have
          }
        }
        
        // Filter by store_id if provided
        if (storeId) {
          orders = orders.filter(order => order.store_id === storeId);
        }
        
        // Enrich orders with merchant information
        // Prioritize saved merchant_name in order (for persistence), only use merchants table if order doesn't have a valid name
        const enrichedOrders = orders.map(order => {
          // Check if order has a valid saved merchant_name (not a fallback)
          const hasValidSavedName = order.merchant_name && 
                                    order.merchant_name !== order.store_id && 
                                    !order.merchant_name.startsWith('Merchant ') &&
                                    order.merchant_name !== 'Unknown Merchant' &&
                                    order.merchant_name.trim() !== '';
          
          // If order has a valid saved merchant_name, use it (persists across commits/restarts)
          if (hasValidSavedName) {
            return order;
          }
          
          // Otherwise, get from merchants table
          const merchant = order.store_id 
            ? this.merchantManager.getMerchantByStoreId(order.store_id)
            : null;
          
          // Use merchant_name from merchants table if available, otherwise use fallback
          const merchantName = merchant?.merchant_name && 
                              merchant.merchant_name !== order.store_id &&
                              !merchant.merchant_name.startsWith('Merchant ')
            ? merchant.merchant_name 
            : (order.store_id ? `Merchant ${order.store_id}` : 'Unknown Merchant');
          
          return {
            ...order,
            merchant_name: merchantName
          };
        });
        
        res.json({ 
          success: true, 
          count: enrichedOrders.length, 
          limit: limit,
          orders: enrichedOrders
        });
      } catch (error: any) {
        console.error('Error getting orders:', error);
        const limit = parseInt((req.query.limit as string) || '50', 10);
        // Return empty array instead of error to prevent UI issues
        res.status(200).json({ 
          success: true, 
          count: 0, 
          limit: limit,
          orders: [],
          error: error.message 
        });
      }
    });

    // Helper function to get current user from session
    const getCurrentUser = (req: Request): { userId: number; email: string } | null => {
      const sessionId = req.headers['x-session-id'] as string;
      if (!sessionId) return null;
      
      const session = this.sessions.get(sessionId);
      if (!session || session.expires < Date.now()) {
        this.sessions.delete(sessionId);
        return null;
      }
      
      return { userId: session.userId, email: session.email };
    };

    // Merchant management endpoints
    this.app.get('/merchants', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          console.log(chalk.yellow('⚠️  /merchants: No user session found'));
          console.log(chalk.gray(`   Headers: ${JSON.stringify(req.headers)}`));
          return res.status(401).json({ success: false, error: 'Not authenticated. Please login first.' });
        }
        
        // Get merchants for current user only
        const merchants = await this.handleAsync(this.database.getAllMerchants(user.userId));
        res.json({ 
          success: true, 
          count: merchants.length, 
          merchants 
        });
      } catch (error: any) {
        console.error(chalk.red(`❌ Error in /merchants: ${error.message}`));
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/merchants/:storeId', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const merchant = await this.handleAsync(this.database.getMerchantByStoreId(req.params.storeId, user.userId));
        if (!merchant) {
          return res.status(404).json({ success: false, error: 'Merchant not found' });
        }
        res.json({ success: true, merchant });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/merchants', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const { store_id, merchant_name, api_key, api_url, master_key, is_active } = req.body;
        
        // Require merchant name and store_id
        if (!merchant_name || !store_id) {
          return res.status(400).json({ 
            success: false, 
            error: 'merchant_name and store_id are required' 
          });
        }

        // Create/update merchant
        const merchant = await this.handleAsync(this.database.insertOrUpdateMerchant({
          user_id: user.userId,
          store_id,
          merchant_name,
          api_key,
          api_url,
          master_key,
          is_active: is_active !== false
        }));

        if (merchant) {
          // Reload merchants in manager
          await this.merchantManager.reload();
          res.json({ success: true, merchant });
        } else {
          res.status(500).json({ success: false, error: 'Failed to create merchant' });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Generate API key for merchant
    this.app.post('/merchants/:storeId/generate-api-key', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const storeId = req.params.storeId;
        const merchant = await this.handleAsync(this.database.getMerchantByStoreId(storeId, user.userId));
        
        if (!merchant) {
          return res.status(404).json({ success: false, error: 'Merchant not found' });
        }

        // Generate a secure API key
        const crypto = require('crypto');
        const apiKey = `gf_${crypto.randomBytes(32).toString('hex')}`;

        // Update merchant with new API key
        const updated = await this.handleAsync(this.database.insertOrUpdateMerchant({
          user_id: user.userId,
          store_id: storeId,
          merchant_name: merchant.merchant_name,
          api_key: apiKey,
          api_url: merchant.api_url,
          master_key: merchant.master_key,
          is_active: merchant.is_active
        }));

        if (updated) {
          await this.merchantManager.reload();
          res.json({ success: true, api_key: apiKey, merchant: updated });
        } else {
          res.status(500).json({ success: false, error: 'Failed to generate API key' });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get webhook URL endpoint
    this.app.get('/api/webhook-url', async (req: Request, res: Response) => {
      try {
        const webhookUrl = process.env.WEBHOOK_URL || 
                          `${req.protocol}://${req.get('host')}${this.config.webhookPath}`;
        res.json({ 
          success: true, 
          webhook_url: webhookUrl,
          webhook_path: this.config.webhookPath
        });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ============================================
    // GLORIAFOOD INTEGRATION ENDPOINTS
    // ============================================

    // Connect merchant to GloriaFood
    this.app.post('/api/integrations/gloriafood/connect', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        const { merchant_id, api_key, api_url, master_key, store_id, webhook_secret } = req.body;

        if (!merchant_id) {
          return res.status(400).json({ success: false, error: 'merchant_id is required' });
        }

        // Get merchant
        const client = await (this.database as any).pool?.connect();
        if (!client) {
          return res.status(500).json({ success: false, error: 'Database connection failed' });
        }

        try {
          const merchantResult = await client.query(
            `SELECT * FROM merchants WHERE id = $1 AND user_id = $2`,
            [merchant_id, user.userId]
          );

          if (merchantResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Merchant not found' });
          }

          const merchant = merchantResult.rows[0];

          // Import encryption service
          const { EncryptionService } = await import('./encryption-service');

          // Encrypt credentials
          const encryptedCredentials = EncryptionService.encryptCredentials({
            apiKey: api_key,
            apiUrl: api_url,
            masterKey: master_key,
            webhookSecret: webhook_secret
          });

          // Generate webhook URL for this merchant
          const webhookUrl = process.env.WEBHOOK_URL || 
                            `${req.protocol}://${req.get('host')}${this.config.webhookPath}?merchant_id=${merchant_id}`;

          // Generate webhook secret if not provided
          const finalWebhookSecret = webhook_secret || crypto.randomBytes(32).toString('hex');

          // Update merchant with encrypted credentials
          const updateResult = await client.query(`
            UPDATE merchants 
            SET 
              api_key = $1,
              api_url = $2,
              master_key = $3,
              webhook_secret = $4,
              webhook_url = $5,
              integration_status = 'testing',
              credentials_encrypted = TRUE,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 AND user_id = $7
            RETURNING *
          `, [
            encryptedCredentials.apiKey || merchant.api_key,
            encryptedCredentials.apiUrl || merchant.api_url,
            encryptedCredentials.masterKey || merchant.master_key,
            encryptedCredentials.webhookSecret || finalWebhookSecret,
            webhookUrl,
            merchant_id,
            user.userId
          ]);

          const updatedMerchant = updateResult.rows[0];

          // Test connection if credentials provided
          let testResult = null;
          if (api_key && (api_url || store_id)) {
            try {
              const { GloriaFoodClient } = await import('./gloriafood-client');
              const gfClient = new GloriaFoodClient({
                apiKey: api_key,
                storeId: store_id || merchant.store_id || '',
                apiUrl: api_url,
                masterKey: master_key
              });

              // Try to fetch orders to test connection
              await gfClient.fetchOrders(1);
              
              // Update status to connected
              await client.query(`
                UPDATE merchants 
                SET integration_status = 'connected',
                    integration_error = NULL
                WHERE id = $1
              `, [merchant_id]);

              testResult = { success: true, message: 'Connection test successful' };
            } catch (testError: any) {
              // Update status to error
              await client.query(`
                UPDATE merchants 
                SET integration_status = 'error',
                    integration_error = $1
                WHERE id = $2
              `, [testError.message, merchant_id]);

              testResult = { success: false, error: testError.message };
            }
          }

          await this.merchantManager.reload();

          res.json({
            success: true,
            merchant: {
              ...updatedMerchant,
              webhook_url: webhookUrl,
              // Don't return encrypted credentials
              api_key: undefined,
              master_key: undefined,
              webhook_secret: undefined
            },
            test_result: testResult,
            instructions: {
              webhook_url: webhookUrl,
              steps: [
                '1. Log in to your GloriaFood dashboard',
                '2. Go to Settings → Integrations',
                '3. Click "Add Integration" → "Custom Integration"',
                '4. Enter the Webhook URL provided above',
                '5. Enter the Master Key (if required by GloriaFood)',
                '6. Select order types and statuses to receive',
                '7. Save the integration'
              ]
            }
          });
        } finally {
          client.release();
        }
      } catch (error: any) {
        console.error(chalk.red('Error connecting GloriaFood integration:'), error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test GloriaFood connection
    this.app.post('/api/integrations/gloriafood/test', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        const { merchant_id } = req.body;

        if (!merchant_id) {
          return res.status(400).json({ success: false, error: 'merchant_id is required' });
        }

        const client = await (this.database as any).pool?.connect();
        if (!client) {
          return res.status(500).json({ success: false, error: 'Database connection failed' });
        }

        try {
          const merchantResult = await client.query(
            `SELECT * FROM merchants WHERE id = $1 AND user_id = $2`,
            [merchant_id, user.userId]
          );

          if (merchantResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Merchant not found' });
          }

          const merchant = merchantResult.rows[0];

          if (!merchant.api_key) {
            return res.status(400).json({ success: false, error: 'Merchant not connected to GloriaFood' });
          }

          // Decrypt credentials
          const { EncryptionService } = await import('./encryption-service');
          const credentials = merchant.credentials_encrypted 
            ? EncryptionService.decryptCredentials({
                apiKey: merchant.api_key,
                apiUrl: merchant.api_url,
                masterKey: merchant.master_key
              })
            : {
                apiKey: merchant.api_key,
                apiUrl: merchant.api_url,
                masterKey: merchant.master_key
              };

          // Test connection
          const { GloriaFoodClient } = await import('./gloriafood-client');
          const gfClient = new GloriaFoodClient({
            apiKey: credentials.apiKey || '',
            storeId: merchant.store_id || '',
            apiUrl: credentials.apiUrl,
            masterKey: credentials.masterKey
          });

          // Try to fetch orders
          const orders = await gfClient.fetchOrders(1);
          
          // Update status
          await client.query(`
            UPDATE merchants 
            SET integration_status = 'connected',
                integration_error = NULL
            WHERE id = $1
          `, [merchant_id]);

          res.json({
            success: true,
            message: 'Connection test successful',
            orders_found: orders.length,
            merchant_status: 'connected'
          });
        } catch (testError: any) {
          // Update status to error
          await client.query(`
            UPDATE merchants 
            SET integration_status = 'error',
                integration_error = $1
            WHERE id = $2
          `, [testError.message, merchant_id]);

          res.status(400).json({
            success: false,
            error: testError.message,
            merchant_status: 'error'
          });
        } finally {
          client.release();
        }
      } catch (error: any) {
        console.error(chalk.red('Error testing GloriaFood connection:'), error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get integration status
    this.app.get('/api/integrations/gloriafood/:merchantId', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        const merchantId = parseInt(req.params.merchantId);
        if (isNaN(merchantId)) {
          return res.status(400).json({ success: false, error: 'Invalid merchant ID' });
        }

        const merchant = await this.handleAsync(this.database.getAllMerchants(user.userId))
          .then(merchants => merchants.find(m => m.id === merchantId));

        if (!merchant) {
          return res.status(404).json({ success: false, error: 'Merchant not found' });
        }

        // Get webhook URL
        const webhookUrl = process.env.WEBHOOK_URL || 
                          `${req.protocol}://${req.get('host')}${this.config.webhookPath}?merchant_id=${merchantId}`;

        res.json({
          success: true,
          integration: {
            merchant_id: merchant.id,
            merchant_name: merchant.merchant_name,
            integration_status: merchant.integration_status || 'disconnected',
            webhook_url: webhookUrl,
            last_webhook_received: merchant.last_webhook_received,
            integration_error: merchant.integration_error,
            has_credentials: !!(merchant.api_key || merchant.master_key),
            // Don't return actual credentials
            credentials_configured: {
              api_key: !!merchant.api_key,
              api_url: !!merchant.api_url,
              master_key: !!merchant.master_key,
              webhook_secret: !!merchant.webhook_secret
            }
          }
        });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update integration
    this.app.put('/api/integrations/gloriafood/:merchantId', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        const merchantId = parseInt(req.params.merchantId);
        if (isNaN(merchantId)) {
          return res.status(400).json({ success: false, error: 'Invalid merchant ID' });
        }

        const { api_key, api_url, master_key, webhook_secret } = req.body;

        const client = await (this.database as any).pool?.connect();
        if (!client) {
          return res.status(500).json({ success: false, error: 'Database connection failed' });
        }

        try {
          // Verify merchant belongs to user
          const merchantResult = await client.query(
            `SELECT * FROM merchants WHERE id = $1 AND user_id = $2`,
            [merchantId, user.userId]
          );

          if (merchantResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Merchant not found' });
          }

          const merchant = merchantResult.rows[0];
          const { EncryptionService } = await import('./encryption-service');

          // Build update query dynamically
          const updates: string[] = [];
          const values: any[] = [];
          let paramIndex = 1;

          if (api_key !== undefined) {
            const encrypted = EncryptionService.encrypt(api_key);
            updates.push(`api_key = $${paramIndex++}`);
            values.push(encrypted);
          }
          if (api_url !== undefined) {
            const encrypted = api_url ? EncryptionService.encrypt(api_url) : null;
            updates.push(`api_url = $${paramIndex++}`);
            values.push(encrypted);
          }
          if (master_key !== undefined) {
            const encrypted = master_key ? EncryptionService.encrypt(master_key) : null;
            updates.push(`master_key = $${paramIndex++}`);
            values.push(encrypted);
          }
          if (webhook_secret !== undefined) {
            const encrypted = webhook_secret ? EncryptionService.encrypt(webhook_secret) : null;
            updates.push(`webhook_secret = $${paramIndex++}`);
            values.push(encrypted);
          }

          if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
          }

          updates.push(`credentials_encrypted = TRUE`);
          updates.push(`updated_at = CURRENT_TIMESTAMP`);

          values.push(merchantId, user.userId);

          const updateQuery = `
            UPDATE merchants 
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
            RETURNING *
          `;

          const updateResult = await client.query(updateQuery, values);

          await this.merchantManager.reload();

          res.json({
            success: true,
            merchant: {
              ...updateResult.rows[0],
              // Don't return encrypted credentials
              api_key: undefined,
              master_key: undefined,
              webhook_secret: undefined
            }
          });
        } finally {
          client.release();
        }
      } catch (error: any) {
        console.error(chalk.red('Error updating GloriaFood integration:'), error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Disconnect integration
    this.app.delete('/api/integrations/gloriafood/:merchantId', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }

        const merchantId = parseInt(req.params.merchantId);
        if (isNaN(merchantId)) {
          return res.status(400).json({ success: false, error: 'Invalid merchant ID' });
        }

        const client = await (this.database as any).pool?.connect();
        if (!client) {
          return res.status(500).json({ success: false, error: 'Database connection failed' });
        }

        try {
          // Verify merchant belongs to user
          const merchantResult = await client.query(
            `SELECT * FROM merchants WHERE id = $1 AND user_id = $2`,
            [merchantId, user.userId]
          );

          if (merchantResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Merchant not found' });
          }

          // Clear integration data (but keep merchant)
          await client.query(`
            UPDATE merchants 
            SET 
              api_key = NULL,
              api_url = NULL,
              master_key = NULL,
              webhook_secret = NULL,
              webhook_url = NULL,
              integration_status = 'disconnected',
              integration_error = NULL,
              credentials_encrypted = FALSE,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND user_id = $2
          `, [merchantId, user.userId]);

          await this.merchantManager.reload();

          res.json({
            success: true,
            message: 'GloriaFood integration disconnected successfully'
          });
        } finally {
          client.release();
        }
      } catch (error: any) {
        console.error(chalk.red('Error disconnecting GloriaFood integration:'), error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.put('/merchants/:identifier', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const { merchant_name, api_key, api_url, master_key, is_active, phone, address, store_id } = req.body;
        const identifier = req.params.identifier;

        // Ensure merchant_name is provided and not empty
        if (merchant_name !== undefined && (!merchant_name || merchant_name.trim() === '')) {
          return res.status(400).json({ success: false, error: 'merchant_name cannot be empty' });
        }

        // Try to find merchant by store_id first (for backward compatibility), then by id
        let existingMerchant = null;
        const merchantId = parseInt(identifier);
        if (!isNaN(merchantId)) {
          // Try by ID - query directly
          const client = await (this.database as any).pool?.connect();
          if (client) {
            try {
              const result = await client.query(
                `SELECT * FROM merchants WHERE id = $1 AND user_id = $2`,
                [merchantId, user.userId]
              );
              if (result.rows.length > 0) {
                const merchantRow = result.rows[0];
                // Get locations for this merchant
                const locationsQuery = `SELECT * FROM locations WHERE merchant_id = $1 AND is_active = TRUE ORDER BY location_name LIMIT 1`;
                const locationsResult = await client.query(locationsQuery, [merchantRow.id]);
                const firstLocation = locationsResult.rows.length > 0 ? locationsResult.rows[0] : null;
                
                existingMerchant = {
                  id: merchantRow.id,
                  user_id: merchantRow.user_id || undefined,
                  merchant_name: merchantRow.merchant_name,
                  api_key: merchantRow.api_key,
                  api_url: merchantRow.api_url,
                  master_key: merchantRow.master_key,
                  is_active: merchantRow.is_active === true,
                  store_id: firstLocation?.store_id || merchantRow.store_id || undefined,
                  address: firstLocation?.address || merchantRow.address || undefined,
                  phone: firstLocation?.phone || merchantRow.phone || undefined,
                  created_at: merchantRow.created_at,
                  updated_at: merchantRow.updated_at
                };
              }
              client.release();
            } catch (e) {
              if (client) client.release();
            }
          }
        }
        
        if (!existingMerchant) {
          // Try by store_id (backward compatibility)
          existingMerchant = await this.handleAsync(this.database.getMerchantByStoreId(identifier, user.userId));
        }

        if (!existingMerchant) {
          return res.status(404).json({ success: false, error: 'Merchant not found' });
        }

        const merchant = await this.handleAsync(this.database.insertOrUpdateMerchant({
          id: existingMerchant.id,
          user_id: user.userId,
          store_id: store_id || existingMerchant.store_id, // Use provided store_id or keep existing
          merchant_name: merchant_name ? merchant_name.trim() : existingMerchant.merchant_name,
          api_key: api_key !== undefined ? api_key : existingMerchant.api_key,
          api_url: api_url !== undefined ? api_url : existingMerchant.api_url,
          master_key: master_key !== undefined ? master_key : existingMerchant.master_key,
          is_active: is_active !== undefined ? is_active : existingMerchant.is_active,
          phone: phone !== undefined ? phone : (existingMerchant as any).phone,
          address: address !== undefined ? address : (existingMerchant as any).address
        } as any));

        if (merchant) {
          // Reload merchants in manager to reflect changes
          await this.merchantManager.reload();
          console.log(`Merchant ${merchant.id} (${merchant.store_id || 'no store_id'}) updated: merchant_name = ${merchant.merchant_name}`);
          
          // If merchant_name was updated and we have a store_id, update existing orders with fallback merchant names
          if (merchant_name !== undefined && merchant.merchant_name && merchant.store_id) {
            try {
              const updatedCount = await this.handleAsync(
                (this.database as any).updateOrdersMerchantName(merchant.store_id, merchant.merchant_name)
              );
              if (updatedCount > 0) {
                console.log(`  ✅ Updated ${updatedCount} existing order(s) with new merchant name "${merchant.merchant_name}"`);
              }
            } catch (error: any) {
              // Don't fail the request if order update fails
              console.log(`  ⚠️  Could not update existing orders: ${error.message}`);
            }
          }
          
          res.json({ success: true, merchant });
        } else {
          res.status(500).json({ success: false, error: 'Failed to update merchant' });
        }
      } catch (error: any) {
        console.error('Error updating merchant:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.delete('/merchants/:identifier', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const identifier = req.params.identifier;
        const id = parseInt(identifier, 10);
        const db = this.database as any;
        const deleted = !isNaN(id) && typeof db.deleteMerchantById === 'function'
          ? await this.handleAsync(db.deleteMerchantById(id, user.userId))
          : await this.handleAsync(this.database.deleteMerchant(identifier, user.userId));
        
        if (deleted) {
          // Reload merchants in manager
          await this.merchantManager.reload();
          res.json({ success: true, message: 'Merchant deleted successfully' });
        } else {
          res.status(404).json({ success: false, error: 'Merchant not found' });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Location management endpoints
    // Get all locations for a merchant
    this.app.get('/merchants/:merchantId/locations', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          console.log(chalk.yellow(`⚠️  /merchants/${req.params.merchantId}/locations: No user session found`));
          return res.status(401).json({ success: false, error: 'Not authenticated. Please login first.' });
        }
        
        const merchantId = parseInt(req.params.merchantId);
        if (isNaN(merchantId)) {
          return res.status(400).json({ success: false, error: 'Invalid merchant ID' });
        }

        const db = this.database as any;
        if (typeof db.getAllLocations === 'function') {
          try {
            const locations = await this.handleAsync(db.getAllLocations(merchantId, user.userId));
            res.json({ success: true, locations: locations || [] });
          } catch (dbError: any) {
            console.error(chalk.red(`❌ Database error in /merchants/${merchantId}/locations: ${dbError.message}`));
            console.error(chalk.red(`   Stack: ${dbError.stack}`));
            // Return empty array instead of error to prevent UI issues
            res.json({ success: true, locations: [], error: dbError.message });
          }
        } else {
          console.error(chalk.red(`❌ getAllLocations function not available in database`));
          res.status(500).json({ success: false, error: 'Location management not available' });
        }
      } catch (error: any) {
        console.error(chalk.red(`❌ Error in /merchants/${req.params.merchantId}/locations: ${error.message}`));
        console.error(chalk.red(`   Stack: ${error.stack}`));
        res.status(500).json({ success: false, error: error.message || 'Unknown error occurred' });
      }
    });

    // Create a new location
    this.app.post('/merchants/:merchantId/locations', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const merchantId = parseInt(req.params.merchantId);
        if (isNaN(merchantId)) {
          return res.status(400).json({ success: false, error: 'Invalid merchant ID' });
        }

        const { location_name, store_id, address, phone, latitude, longitude, is_active } = req.body;
        
        if (!location_name || !store_id) {
          return res.status(400).json({ 
            success: false, 
            error: 'location_name and store_id are required' 
          });
        }

        const db = this.database as any;
        if (typeof db.insertOrUpdateLocation === 'function') {
          try {
            const location = await this.handleAsync(db.insertOrUpdateLocation({
              merchant_id: merchantId,
              location_name,
              store_id,
              address,
              phone,
              latitude,
              longitude,
              is_active: is_active !== false
            }, user.userId));

            if (location) {
              res.json({ success: true, location });
            } else {
              console.error(chalk.red(`❌ Failed to create location for merchant ${merchantId}`));
              res.status(500).json({ success: false, error: 'Failed to create location. Check server logs for details.' });
            }
          } catch (dbError: any) {
            console.error(chalk.red(`❌ Database error creating location: ${dbError.message}`));
            console.error(chalk.red(`   Stack: ${dbError.stack}`));
            const msg = dbError?.message || 'Database error';
            const status = msg.includes('already exists') ? 409
                        : msg.includes('Merchant not found') ? 404
                        : msg.includes('store_id is required') ? 400
                        : msg.includes('location_name is required') ? 400
                        : 500;
            res.status(status).json({ success: false, error: msg });
          }
        } else {
          console.error(chalk.red(`❌ insertOrUpdateLocation function not available in database`));
          res.status(500).json({ success: false, error: 'Location management not available' });
        }
      } catch (error: any) {
        console.error(chalk.red(`❌ Error in POST /merchants/${req.params.merchantId}/locations: ${error.message}`));
        console.error(chalk.red(`   Stack: ${error.stack}`));
        const msg = error?.message || 'Unknown error';
        const status = msg.includes('already exists') ? 409
                    : msg.includes('Merchant not found') ? 404
                    : 500;
        res.status(status).json({ success: false, error: msg });
      }
    });

    // Update a location
    this.app.put('/locations/:locationId', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const locationId = parseInt(req.params.locationId);
        if (isNaN(locationId)) {
          return res.status(400).json({ success: false, error: 'Invalid location ID' });
        }

        const { location_name, store_id, address, phone, latitude, longitude, is_active } = req.body;

        const db = this.database as any;
        if (typeof db.getLocationById === 'function' && typeof db.insertOrUpdateLocation === 'function') {
          // Get existing location to preserve merchant_id
          const existing = await this.handleAsync(db.getLocationById(locationId, user.userId));
          if (!existing) {
            return res.status(404).json({ success: false, error: 'Location not found' });
          }

          const location = await this.handleAsync(db.insertOrUpdateLocation({
            id: locationId,
            merchant_id: existing.merchant_id,
            location_name: location_name || existing.location_name,
            store_id: store_id || existing.store_id,
            address: address !== undefined ? address : existing.address,
            phone: phone !== undefined ? phone : existing.phone,
            latitude: latitude !== undefined ? latitude : existing.latitude,
            longitude: longitude !== undefined ? longitude : existing.longitude,
            is_active: is_active !== undefined ? is_active : existing.is_active
          }, user.userId));

          if (location) {
            res.json({ success: true, location });
          } else {
            res.status(500).json({ success: false, error: 'Failed to update location' });
          }
        } else {
          res.status(500).json({ success: false, error: 'Location management not available' });
        }
      } catch (error: any) {
        const msg = error?.message || '';
        const status = msg.includes('already exists') ? 409
                    : msg.includes('Merchant not found') ? 404
                    : 500;
        res.status(status).json({ success: false, error: msg });
      }
    });

    // Delete a location
    this.app.delete('/locations/:locationId', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        if (!user) {
          return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const locationId = parseInt(req.params.locationId);
        if (isNaN(locationId)) {
          return res.status(400).json({ success: false, error: 'Invalid location ID' });
        }

        const db = this.database as any;
        if (typeof db.deleteLocation === 'function') {
          const deleted = await this.handleAsync(db.deleteLocation(locationId, user.userId));
          
          if (deleted) {
            res.json({ success: true, message: 'Location deleted successfully' });
          } else {
            res.status(404).json({ success: false, error: 'Location not found' });
          }
        } else {
          res.status(500).json({ success: false, error: 'Location management not available' });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get order by ID endpoint
    this.app.get('/orders/:orderId', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        let order = await this.handleAsync(this.database.getOrderByGloriaFoodId(req.params.orderId, user?.userId));
        
        // If order not found and user is logged in, try to find order with NULL user_id that matches user's merchants
        if (!order && user?.userId) {
          try {
            // Try without user_id filter first
            const nullUserOrder = await this.handleAsync(this.database.getOrderByGloriaFoodId(req.params.orderId, undefined));
            
            if (nullUserOrder && (nullUserOrder as any).user_id === null && nullUserOrder.store_id) {
              // Check if this order's store_id matches one of the user's merchants
              const userMerchants = await this.handleAsync(this.database.getAllMerchants(user.userId));
              const userStoreIds = userMerchants.map(m => m.store_id).filter((id): id is string => !!id);
              
              if (userStoreIds.includes(nullUserOrder.store_id)) {
                order = nullUserOrder;
              }
            }
          } catch (merchantError: any) {
            console.error('Error checking user merchants for order lookup:', merchantError);
            // Continue - we'll return 404 if order not found
          }
        }
        
        if (!order) {
          return res.status(404).json({ success: false, error: 'Order not found' });
        }
        res.json({ success: true, order });
      } catch (error: any) {
        console.error('Error getting order:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update order endpoint (for ready for pickup, etc.)
    this.app.put('/orders/:orderId', async (req: Request, res: Response) => {
      try {
        const orderId = req.params.orderId;
        const { ready_for_pickup } = req.body;
        const user = getCurrentUser(req);
        
        // Get order with user filtering
        let order = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId, user?.userId));
        
        // If order not found and user is logged in, try to find order with NULL user_id that matches user's merchants
        if (!order && user?.userId) {
          try {
            const nullUserOrder = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId, undefined));
            
            if (nullUserOrder && (nullUserOrder as any).user_id === null && nullUserOrder.store_id) {
              const userMerchants = await this.handleAsync(this.database.getAllMerchants(user.userId));
              const userStoreIds = userMerchants.map(m => m.store_id).filter((id): id is string => !!id);
              
              if (userStoreIds.includes(nullUserOrder.store_id)) {
                order = nullUserOrder;
              }
            }
          } catch (merchantError: any) {
            console.error('Error checking user merchants for order lookup:', merchantError);
          }
        }
        
        if (!order) {
          return res.status(404).json({ success: false, error: 'Order not found' });
        }

        // If ready_for_pickup is being set to true, handle DoorDash assignment
        if (ready_for_pickup === true && this.doorDashClient) {
          // Try to get DoorDash delivery ID from multiple sources
          let doorDashId = (order as any).doordash_order_id;
          let rawData: any = {};
          
          // Parse raw_data if available
          if (order.raw_data) {
            try {
              rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
              // Check for delivery_id in doordash_data (this is the actual DoorDash delivery ID)
              if (!doorDashId && rawData.doordash_data) {
                const doordashData = typeof rawData.doordash_data === 'string' ? JSON.parse(rawData.doordash_data) : rawData.doordash_data;
                doorDashId = doordashData.delivery_id || doordashData.id || doordashData.deliveryId;
              }
              // Fallback to other fields
              if (!doorDashId) {
                doorDashId = rawData.doordash_order_id || rawData.doordashOrderId || rawData.delivery_id;
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
          
          // Extract from tracking URL if still not found
          if (!doorDashId && (order as any).doordash_tracking_url) {
            const trackingUrl = (order as any).doordash_tracking_url;
            const urlMatch = trackingUrl.match(/deliveries\/([^\/\?]+)/i) || trackingUrl.match(/delivery\/([^\/\?]+)/i);
            if (urlMatch && urlMatch[1]) {
              doorDashId = urlMatch[1];
            }
          }
          
          if (doorDashId) {
            // Order already has DoorDash delivery - notify DoorDash that it's ready for pickup
            // Cancel post-acceptance schedule since DoorDash was already called
            this.cancelPostAcceptanceSchedule(orderId);
            
            try {
              await this.doorDashClient.notifyReadyForPickup(doorDashId);
              console.log(chalk.green(`✅ Notified DoorDash rider that order #${orderId} is ready for pickup (delivery ID: ${doorDashId})`));
            } catch (ddError: any) {
              // Check if it's a 404 (delivery not found) - this is expected if delivery hasn't been created yet
              if (ddError.message && (ddError.message.includes('404') || ddError.message.includes('unknown_delivery_id'))) {
                console.log(chalk.yellow(`⚠️  Order #${orderId} not found in DoorDash (delivery may not be created yet). Will assign driver now.`));
                // If delivery not found, treat as if no DoorDash ID and assign driver
                doorDashId = null;
              } else {
                console.log(chalk.yellow(`⚠️  Could not notify DoorDash for order #${orderId}: ${ddError.message}`));
              }
            }
          }
          
          // If no DoorDash delivery ID exists, send order to DoorDash immediately to assign driver
          if (!doorDashId) {
            // Cancel any scheduled delivery since we're sending immediately
            this.deliveryScheduler?.cancel(orderId, 'ready-for-pickup-manual-assign');
            // DON'T cancel post-acceptance schedule - let it run but it will be bypassed
            // The automatic 20-25 minute schedule will check if sent_to_doordash is true and skip if it is
            // This way the automatic schedule is still there but will be bypassed if DoorDash was already called
            
            console.log(chalk.blue(`🚚 Order #${orderId} marked as ready - assigning DoorDash driver immediately...`));
            console.log(chalk.gray(`   Note: Automatic 20-25 minute schedule will still run but will be bypassed if DoorDash call succeeds`));
            
            try {
              // Prepare order data for DoorDash
              const orderDataForDoorDash = {
                ...order,
                raw_data: rawData
              };
              
              // Send to DoorDash immediately
              const doorDashResult = await this.sendOrderToDoorDash(orderDataForDoorDash);
              
              if (doorDashResult && doorDashResult.id) {
                // Get merchant name before updating
                const storeId = order.store_id;
                let merchantName = order.merchant_name;
                if (storeId && !merchantName) {
                  const merchant = this.merchantManager.getMerchantByStoreId(storeId);
                  if (merchant && merchant.merchant_name) {
                    merchantName = merchant.merchant_name;
                  }
                }

                // Update order with DoorDash info
                await this.handleAsync(this.database.insertOrUpdateOrder({
                  ...order,
                  merchant_name: merchantName,
                  doordash_order_id: doorDashResult.id,
                  sent_to_doordash: true
                }));
                
                console.log(chalk.green(`✅ Order #${orderId} sent to DoorDash. Driver will be automatically assigned.`));
                console.log(chalk.gray(`   DoorDash Delivery ID: ${doorDashResult.id}`));
                if (doorDashResult.tracking_url) {
                  console.log(chalk.gray(`   Tracking URL: ${doorDashResult.tracking_url}`));
                }
                // Automatic 20-25 minute schedule will still run but will check sent_to_doordash and skip
              } else {
                console.log(chalk.yellow(`⚠️  Failed to send order #${orderId} to DoorDash. Order may not be a delivery type or DoorDash may be unavailable.`));
                // If DoorDash call failed, keep the automatic schedule active so it can try again
              }
            } catch (assignError: any) {
              console.error(chalk.red(`❌ Error assigning DoorDash driver for order #${orderId}: ${assignError.message}`));
              // If DoorDash call failed, keep the automatic schedule active so it can try again
            }
          }
        }

        // Update order in database - only update ready_for_pickup field, don't recreate the order
        // Use a direct UPDATE query to avoid recreating the order
        try {
          const db = this.database as any;
          if (db.pool) {
            // PostgreSQL - use pool directly
            const client = await db.pool.connect();
            try {
              await client.query(
                `UPDATE orders SET ready_for_pickup = $1, updated_at = NOW() WHERE gloriafood_order_id = $2`,
                [ready_for_pickup ? new Date().toISOString() : null, orderId]
              );
              client.release();
            } catch (dbError: any) {
              client.release();
              throw dbError;
            }
          } else if (db.updateOrderReadyForPickup) {
            // Use database method if available
            await this.handleAsync(db.updateOrderReadyForPickup(orderId, ready_for_pickup ? new Date().toISOString() : null));
          } else {
            // Fallback: use direct UPDATE query to avoid creating duplicates
            const client = await db.pool.connect();
            try {
              await client.query(
                `UPDATE orders SET ready_for_pickup = $1, updated_at = NOW() WHERE gloriafood_order_id = $2`,
                [ready_for_pickup ? new Date().toISOString() : null, orderId]
              );
              client.release();
            } catch (dbError: any) {
              client.release();
              throw dbError;
            }
          }
          
          // Fetch updated order (with user filtering)
          const updated = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId, user?.userId));
          if (updated) {
            res.json({ success: true, order: updated });
          } else {
            res.status(500).json({ success: false, error: 'Failed to fetch updated order' });
          }
        } catch (dbError: any) {
          console.error('Database update error:', dbError);
          throw dbError;
        }
      } catch (error: any) {
        console.error('Error updating order:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete order endpoint
    this.app.delete('/orders/:orderId', async (req: Request, res: Response) => {
      try {
        const orderId = req.params.orderId;
        const deleted = await this.handleAsync(this.database.deleteOrder(orderId));
        
        if (deleted) {
          res.json({ success: true, message: 'Order deleted successfully' });
        } else {
          res.status(404).json({ success: false, error: 'Order not found' });
        }
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });


    // Get recent orders endpoint
    this.app.get('/orders/recent/:minutes?', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        const minutes = parseInt(req.params.minutes || '60', 10);
        const orders = await this.handleAsync(this.database.getRecentOrders(minutes, user?.userId));
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
        const { email, password, fullName } = req.body;
        
        if (!email || !password || !fullName) {
          return res.status(400).json({ success: false, error: 'Email, password, and full name are required' });
        }
        
        const user = await this.handleAsync(this.database.createUser(email, password, fullName));
        
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
        
        // verifyPassword can return boolean or User
        if (!userResult || userResult === true || typeof userResult === 'boolean') {
          return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
        
        const user = userResult as User;
        
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
        },
        sessionId: sessionId
      });
    });

    // Dashboard stats endpoint
    // Manual DoorDash sync endpoint - trigger sync immediately
    this.app.post('/api/sync/doordash', async (req: Request, res: Response) => {
      try {
        console.log(chalk.cyan('\n🔄 Manual DoorDash sync triggered'));
        await this.syncDoorDashStatuses();
        res.json({ 
          success: true, 
          message: 'DoorDash sync completed' 
        });
      } catch (error: any) {
        console.error(chalk.red('Error in manual DoorDash sync:'), error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    // Sync specific order by GloriaFood order ID
    this.app.post('/api/sync/doordash/:orderId', async (req: Request, res: Response) => {
      try {
        const orderId = req.params.orderId;
        console.log(chalk.cyan(`\n🔄 Manual DoorDash sync for order #${orderId}`));
        
        const order = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId));
        if (!order) {
          return res.status(404).json({ 
            success: false, 
            error: 'Order not found' 
          });
        }

        // Check if order has DoorDash indicators
        const hasDoorDash = (order as any).doordash_order_id || 
                           (order as any).sent_to_doordash || 
                           (order as any).doordash_tracking_url;
        
        if (!hasDoorDash) {
          return res.status(400).json({ 
            success: false, 
            error: 'Order does not appear to be sent to DoorDash' 
          });
        }

        // Manually sync this order
        const doorDashId = (order as any).doordash_order_id;
        const trackingUrl = (order as any).doordash_tracking_url;
        const externalDeliveryId = order.gloriafood_order_id;

        let ddStatus = null;
        let triedIds = [];

        // Try multiple methods to get status
        if (doorDashId) {
          triedIds.push(`doordash_order_id: ${doorDashId}`);
          try {
            ddStatus = await this.doorDashClient!.getOrderStatus(doorDashId);
          } catch (error: any) {
            console.log(chalk.gray(`  ⚠️  Failed with doordash_order_id: ${error.message}`));
          }
        }

        if (!ddStatus && trackingUrl && trackingUrl.includes('doordash')) {
          const urlMatch = trackingUrl.match(/deliveries\/([^\/\?]+)/i) || trackingUrl.match(/delivery\/([^\/\?]+)/i);
          if (urlMatch && urlMatch[1]) {
            triedIds.push(`extracted from URL: ${urlMatch[1]}`);
            try {
              ddStatus = await this.doorDashClient!.getOrderStatus(urlMatch[1]);
            } catch (error: any) {
              console.log(chalk.gray(`  ⚠️  Failed with extracted ID: ${error.message}`));
            }
          }
        }

        if (!ddStatus && externalDeliveryId) {
          triedIds.push(`external_delivery_id: ${externalDeliveryId}`);
          try {
            ddStatus = await this.doorDashClient!.getOrderStatus(externalDeliveryId);
          } catch (error: any) {
            console.log(chalk.gray(`  ⚠️  Failed with external_delivery_id: ${error.message}`));
          }
        }

        if (!ddStatus) {
          return res.status(404).json({ 
            success: false, 
            error: `Could not find order in DoorDash (tried: ${triedIds.join(', ')})` 
          });
        }

        const normalizedStatus = (ddStatus.status || '').toLowerCase();
        let newStatus = order.status;

        if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled') {
          newStatus = 'CANCELLED';
        } else if (normalizedStatus === 'delivered' || normalizedStatus === 'completed') {
          newStatus = 'DELIVERED';
        }

        if (newStatus !== order.status && (this.database as any).updateOrderStatus) {
          const oldStatus = order.status;
          const updated = await this.handleAsync(
            (this.database as any).updateOrderStatus(order.gloriafood_order_id, newStatus)
          );
          if (updated) {
            console.log(chalk.green(`  ✅ Updated order #${order.gloriafood_order_id} status: ${oldStatus} → ${newStatus}`));
            
            // Check if status changed to ACCEPTED and schedule post-acceptance DoorDash call
            if (newStatus.toUpperCase() === 'ACCEPTED' && oldStatus?.toUpperCase() !== 'ACCEPTED') {
              const orderType = (order.order_type || '').toString().toLowerCase();
              if (orderType === 'delivery') {
                // Get full order data for DoorDash
                let orderData = order;
                if (order.raw_data) {
                  try {
                    const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
                    orderData = { ...rawData, ...order };
                  } catch (e) {
                    // Use order as-is
                  }
                }
                await this.schedulePostAcceptanceDoorDash(order.gloriafood_order_id, orderData);
              }
            }
            
            return res.json({ 
              success: true, 
              message: `Order status updated to ${newStatus}`,
              oldStatus: oldStatus,
              newStatus: newStatus,
              doordashStatus: ddStatus.status
            });
          } else {
            return res.status(500).json({ 
              success: false, 
              error: 'Failed to update order status' 
            });
          }
        } else {
          return res.json({ 
            success: true, 
            message: 'Order status is already up to date',
            status: order.status,
            doordashStatus: ddStatus.status
          });
        }
      } catch (error: any) {
        console.error(chalk.red('Error syncing specific order:'), error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    });

    this.app.get('/api/dashboard/stats', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        const stats = await this.handleAsync(this.database.getDashboardStats(user?.userId));
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
        const user = getCurrentUser(req);
        const status = req.params.status;
        const orders = await this.handleAsync(this.database.getOrdersByStatus(status, user?.userId));
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
        const user = getCurrentUser(req);
        const totalOrders = await this.handleAsync(this.database.getOrderCount(user?.userId));
        const recentOrders = await this.handleAsync(this.database.getRecentOrders(60, user?.userId));
        const recentOrders24h = await this.handleAsync(this.database.getRecentOrders(1440, user?.userId));
        
        // Get orders by status
        const allOrders = await this.handleAsync(this.database.getAllOrders(1000, user?.userId));
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

    // DoorDash webhook endpoint for status updates
    this.app.post('/webhook/doordash', async (req: Request, res: Response) => {
      try {
        if (!this.doorDashClient) {
          return res.status(400).json({ 
            error: 'DoorDash not configured',
            message: 'DoorDash credentials not provided'
          });
        }

        const webhookData = req.body;
        const eventType = webhookData.event_type || webhookData.type || webhookData.event;
        const deliveryId = webhookData.delivery_id || webhookData.id || webhookData.deliveryId;
        const externalDeliveryId = webhookData.external_delivery_id || webhookData.externalDeliveryId;
        const status = webhookData.status || webhookData.delivery_status || webhookData.state;

        console.log(chalk.cyan(`\n📥 Received DoorDash webhook: ${eventType}`));
        console.log(chalk.gray(`  Delivery ID: ${deliveryId}`));
        console.log(chalk.gray(`  External ID: ${externalDeliveryId}`));
        console.log(chalk.gray(`  Status: ${status}`));

        if (!deliveryId && !externalDeliveryId) {
          console.log(chalk.yellow('⚠️  No delivery ID found in webhook'));
          return res.status(400).json({ 
            success: false,
            error: 'Missing delivery_id or external_delivery_id' 
          });
        }

        // Find order by DoorDash ID or external delivery ID
        let order = null;
        if (deliveryId) {
          order = await this.handleAsync((this.database as any).getOrderByDoorDashId?.(deliveryId));
        }
        
        if (!order && externalDeliveryId) {
          // Try to find by external delivery ID (GloriaFood order ID)
          order = await this.handleAsync(this.database.getOrderByGloriaFoodId(externalDeliveryId));
        }

        if (!order) {
          console.log(chalk.yellow(`⚠️  Order not found for DoorDash delivery: ${deliveryId || externalDeliveryId}`));
          // Still return 200 to prevent DoorDash from retrying
          return res.status(200).json({ 
            success: false,
            message: 'Order not found',
            delivery_id: deliveryId || externalDeliveryId
          });
        }

        // Update order status based on DoorDash status
        let newStatus = order.status;
        const normalizedStatus = (status || '').toLowerCase();

        if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled') {
          newStatus = 'CANCELLED';
          console.log(chalk.red(`  ❌ DoorDash cancelled delivery for order #${order.gloriafood_order_id}`));
        } else if (normalizedStatus === 'delivered' || normalizedStatus === 'completed') {
          newStatus = 'DELIVERED';
          console.log(chalk.green(`  ✅ DoorDash delivered order #${order.gloriafood_order_id}`));
        } else if (normalizedStatus === 'accepted' || normalizedStatus === 'assigned') {
          newStatus = 'ACCEPTED';
          console.log(chalk.blue(`  📦 DoorDash accepted order #${order.gloriafood_order_id}`));
        } else if (normalizedStatus === 'picked_up' || normalizedStatus === 'pickedup') {
          newStatus = 'PICKED UP';
          console.log(chalk.cyan(`  🚗 DoorDash picked up order #${order.gloriafood_order_id}`));
        }

        // Update order status in database if changed
        if (newStatus !== order.status && (this.database as any).updateOrderStatus) {
          const updated = await this.handleAsync((this.database as any).updateOrderStatus(order.gloriafood_order_id, newStatus));
          if (updated) {
            console.log(chalk.green(`  ✅ Updated order #${order.gloriafood_order_id} status: ${order.status} → ${newStatus}`));
          }
        }

        res.status(200).json({ 
          success: true, 
          message: 'DoorDash webhook processed',
          order_id: order.gloriafood_order_id,
          status: newStatus
        });
      } catch (error: any) {
        console.error(chalk.red('❌ Error processing DoorDash webhook:'), error.message);
        // Still return 200 to prevent DoorDash from retrying
        res.status(200).json({ 
          success: false, 
          error: error.message 
        });
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
        const user = getCurrentUser(req);
        const totalOrders = await this.handleAsync(this.database.getOrderCount(user?.userId));
        const recent1h = await this.handleAsync(this.database.getRecentOrders(60, user?.userId));
        const recent24h = await this.handleAsync(this.database.getRecentOrders(1440, user?.userId));
        const allOrders = await this.handleAsync(this.database.getAllOrders(1000, user?.userId));
        
        // Calculate totals by status
        const statusCounts: { [key: string]: number } = {};
        let totalRevenue = 0;
        
        allOrders.forEach(order => {
          statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
          // Exclude cancelled orders from revenue calculation
          const status = (order.status || '').toUpperCase();
          if (status !== 'CANCELLED' && status !== 'CANCELED') {
            // Convert total_price to number (MySQL returns DECIMAL as string)
            const orderPrice = typeof order.total_price === 'string' 
              ? parseFloat(order.total_price) 
              : (order.total_price || 0);
            totalRevenue += orderPrice;
          }
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
        const { email, password, full_name } = req.body;
        
        if (!email || !password || !full_name) {
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
            [email, hashedPassword, full_name]
          );
          
          const sessionToken = this.createSession(rows.insertId, email);
          res.json({ success: true, token: sessionToken, user: { id: rows.insertId, email, full_name } });
        } else {
          // SQLite - use a simple approach
          res.status(500).json({ success: false, error: 'User registration not supported with SQLite. Please use MySQL.' });
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
            token: sessionToken, 
            user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } 
          });
        } else {
          res.status(500).json({ success: false, error: 'Login not supported with SQLite. Please use MySQL.' });
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

    // Get all users endpoint - only show users who share merchants with current user
    this.app.get('/api/auth/users', async (req: Request, res: Response) => {
      try {
        const user = getCurrentUser(req);
        // Only return users who share at least one merchant with the current user
        const users = await this.handleAsync(this.database.getAllUsers(user?.userId));
        res.json({ success: true, users });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete user endpoint
    this.app.delete('/api/auth/users/:email', async (req: Request, res: Response) => {
      try {
        const email = req.params.email;
        
        if (!email) {
          return res.status(400).json({ success: false, error: 'Email is required' });
        }

        // Check if user exists
        const user = await this.handleAsync(this.database.getUserByEmail(email));
        if (!user) {
          return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Delete user from database
        const deleted = await this.handleAsync(this.database.deleteUser(email));
        
        if (deleted) {
          // Also delete any active sessions for this user
          for (const [token, session] of this.sessions.entries()) {
            if (session.email === email) {
              this.sessions.delete(token);
            }
          }
          
          console.log(chalk.green(`✅ User deleted: ${email}`));
          res.json({ success: true, message: 'User deleted successfully' });
        } else {
          res.status(500).json({ success: false, error: 'Failed to delete user' });
        }
      } catch (error: any) {
        console.error(chalk.red('Error deleting user:'), error);
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
        
        if (!name) {
          return res.status(400).json({ success: false, error: 'Driver name is required' });
        }
        
        const driver = await this.handleAsync(this.database.createDriver({
          name,
          phone,
          email,
          vehicle_type,
          vehicle_plate
        }));
        
        if (driver) {
          res.json({ success: true, driver });
        } else {
          res.status(500).json({ success: false, error: 'Failed to create driver' });
        }
      } catch (error: any) {
        console.error('Error creating driver:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to create driver' });
      }
    });

    this.app.delete('/api/drivers/:id', async (req: Request, res: Response) => {
      try {
        const driverId = parseInt(req.params.id);
        if (isNaN(driverId)) {
          return res.status(400).json({ success: false, error: 'Invalid driver ID' });
        }
        
        const deleted = await this.handleAsync(this.database.deleteDriver(driverId));
        
        if (deleted) {
          res.json({ success: true, message: 'Driver deleted successfully' });
        } else {
          res.status(404).json({ success: false, error: 'Driver not found' });
        }
      } catch (error: any) {
        console.error('Error deleting driver:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to delete driver' });
      }
    });

    // Assign driver to order (sends to DoorDash which automatically assigns driver)
    this.app.post('/api/orders/:orderId/assign-driver', async (req: Request, res: Response) => {
      try {
        const orderId = req.params.orderId;
        if (!orderId) {
          return res.status(400).json({ success: false, error: 'Order ID is required' });
        }
        
        // Get order from database
        const order = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId));
        if (!order) {
          return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        // Check if order is already sent to DoorDash
        let rawData: any = {};
        try {
          if (order.raw_data) {
            rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
          }
        } catch (e) {
          // Ignore parsing errors
        }
        
        const doordashOrderId = (order as any).doordash_order_id || rawData.doordash_order_id || rawData.doordashOrderId;
        
        if (doordashOrderId) {
          // Order already sent to DoorDash, driver is automatically assigned
          return res.json({ 
            success: true, 
            message: 'Order already sent to DoorDash. Driver will be automatically assigned.',
            doordash_order_id: doordashOrderId
          });
        }
        
        // Send order to DoorDash (this will automatically assign a driver)
        const doorDashResult = await this.sendOrderToDoorDash({
          ...order,
          raw_data: rawData
        });
        
        if (doorDashResult && doorDashResult.id) {
          // Get merchant name before updating
          const storeId = order.store_id;
          let merchantName = order.merchant_name;
          if (storeId && !merchantName) {
            const merchant = this.merchantManager.getMerchantByStoreId(storeId);
            if (merchant && merchant.merchant_name) {
              merchantName = merchant.merchant_name;
            }
          }

          // Update order with DoorDash info
          const updatedOrder = await this.handleAsync(this.database.insertOrUpdateOrder({
            ...order,
            merchant_name: merchantName,
            doordash_order_id: doorDashResult.id,
            sent_to_doordash: true
          }));
          
          res.json({ 
            success: true, 
            message: 'Order sent to DoorDash. Driver will be automatically assigned.',
            doordash_order_id: doorDashResult.id,
            tracking_url: doorDashResult.tracking_url
          });
        } else {
          res.status(500).json({ success: false, error: 'Failed to send order to DoorDash' });
        }
      } catch (error: any) {
        console.error('Error assigning driver:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to assign driver' });
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

    // Settings API endpoints
    // Get settings
    this.app.get('/api/settings', async (req: Request, res: Response) => {
      try {
        const db = this.database as any;
        if (db.pool) {
          const client = await db.pool.connect();
          try {
            const result = await client.query('SELECT * FROM settings ORDER BY key');
            const settings: any = {};
            result.rows.forEach((row: any) => {
              try {
                settings[row.key] = JSON.parse(row.value);
              } catch {
                settings[row.key] = row.value;
              }
            });
            client.release();
            res.json({ success: true, settings });
          } catch (error: any) {
            // If settings table doesn't exist, create it and return empty settings
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
              try {
                await client.query(`
                  CREATE TABLE IF NOT EXISTS settings (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(255) UNIQUE NOT NULL,
                    value TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                  )
                `);
                await client.query('CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)');
                client.release();
                return res.json({ success: true, settings: {} });
              } catch (createError: any) {
                client.release();
                // If creation fails, still return empty settings
                return res.json({ success: true, settings: {} });
              }
            }
            client.release();
            throw error;
          }
        } else {
          res.json({ success: true, settings: {} });
        }
      } catch (error: any) {
        // If settings table doesn't exist, return empty settings instead of error
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return res.json({ success: true, settings: {} });
        }
        console.error('Error fetching settings:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Save settings
    this.app.post('/api/settings', async (req: Request, res: Response) => {
      try {
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') {
          return res.status(400).json({ success: false, error: 'Invalid settings data' });
        }

        const db = this.database as any;
        if (db.pool) {
          const client = await db.pool.connect();
          try {
            // First, ensure settings table exists
            await client.query(`
              CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                key VARCHAR(255) UNIQUE NOT NULL,
                value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              )
            `);
            await client.query('CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)');

            for (const [key, value] of Object.entries(settings)) {
              const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
              await client.query(
                `INSERT INTO settings (key, value, updated_at) 
                 VALUES ($1, $2, NOW()) 
                 ON CONFLICT (key) 
                 DO UPDATE SET value = $2, updated_at = NOW()`,
                [key, valueStr]
              );
            }
            client.release();
            res.json({ success: true, message: 'Settings saved successfully' });
          } catch (error: any) {
            client.release();
            throw error;
          }
        } else {
          res.json({ success: true, message: 'Settings saved (localStorage only)' });
        }
      } catch (error: any) {
        console.error('Error saving settings:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get specific setting
    this.app.get('/api/settings/:key', async (req: Request, res: Response) => {
      try {
        const { key } = req.params;
        const db = this.database as any;
        if (db.pool) {
          const client = await db.pool.connect();
          try {
            const result = await client.query('SELECT value FROM settings WHERE key = $1', [key]);
            client.release();
            if (result.rows.length > 0) {
              try {
                const value = JSON.parse(result.rows[0].value);
                res.json({ success: true, value });
              } catch {
                res.json({ success: true, value: result.rows[0].value });
              }
            } else {
              res.json({ success: true, value: null });
            }
          } catch (error: any) {
            // If settings table doesn't exist, create it and return null
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
              try {
                await client.query(`
                  CREATE TABLE IF NOT EXISTS settings (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(255) UNIQUE NOT NULL,
                    value TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                  )
                `);
                await client.query('CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)');
                client.release();
                return res.json({ success: true, value: null });
              } catch (createError: any) {
                client.release();
                return res.json({ success: true, value: null });
              }
            }
            client.release();
            throw error;
          }
        } else {
          res.json({ success: true, value: null });
        }
      } catch (error: any) {
        // If settings table doesn't exist, return null instead of error
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return res.json({ success: true, value: null });
        }
        console.error('Error fetching setting:', error);
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

  public async start(): Promise<void> {
    // Initialize merchants
    await this.merchantManager.initialize();
    try {
      // Bind to 0.0.0.0 to allow external connections (required for Render)
      // Start periodic DoorDash status sync (every 2 minutes)
      if (this.doorDashClient) {
        this.startDoorDashStatusSync();
      }

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
  const merchantsJson = process.env.GLORIAFOOD_MERCHANTS;
  
  console.log(chalk.gray(`   GLORIAFOOD_API_KEY: ${apiKey ? '✅ SET' : '❌ NOT SET (optional if using GLORIAFOOD_MERCHANTS)'}`));
  console.log(chalk.gray(`   GLORIAFOOD_STORE_ID: ${storeId ? '✅ SET' : '❌ NOT SET (optional if using GLORIAFOOD_MERCHANTS)'}`));
  console.log(chalk.gray(`   GLORIAFOOD_MERCHANTS: ${merchantsJson ? '✅ SET (multi-merchant mode)' : '❌ NOT SET'}`));
  console.log(chalk.gray(`   PORT: ${process.env.PORT || 'NOT SET (will use 3000)'}`));

  // Note: Merchants are now optional - users can add them through the UI
  // Only require merchants if AUTO_LOAD_MERCHANTS=true is set
  const autoLoadMerchants = process.env.AUTO_LOAD_MERCHANTS === 'true';
  
  if (autoLoadMerchants && !merchantsJson && (!apiKey || !storeId)) {
    console.error(chalk.red.bold('\n❌ Error: AUTO_LOAD_MERCHANTS=true but missing merchant configuration!\n'));
    console.error(chalk.yellow('Please configure merchants using one of these methods:'));
    console.error(chalk.gray('\n  Option 1: Multi-merchant (recommended)'));
    console.error(chalk.gray('  GLORIAFOOD_MERCHANTS=[{"store_id":"123","merchant_name":"Restaurant 1","api_key":"key1","api_url":"https://api.example.com"},{"store_id":"456","merchant_name":"Restaurant 2","api_key":"key2"}]'));
    console.error(chalk.gray('\n  Option 2: Single merchant (legacy)'));
    console.error(chalk.gray('  GLORIAFOOD_API_KEY=your_api_key'));
    console.error(chalk.gray('  GLORIAFOOD_STORE_ID=your_store_id'));
    console.error(chalk.gray('\n  Or set AUTO_LOAD_MERCHANTS=false to add merchants through UI'));
    console.error(chalk.gray('\n  Optional:'));
    console.error(chalk.gray('  WEBHOOK_PORT=3000'));
    console.error(chalk.gray('  WEBHOOK_PATH=/webhook'));
    console.error(chalk.gray('  DATABASE_PATH=./orders.db'));
    console.error(chalk.gray('\n  For MySQL/XAMPP:'));
    console.error(chalk.gray('  DB_TYPE=mysql'));
    console.error(chalk.gray('  DB_HOST=localhost'));
    console.error(chalk.gray('  DB_PORT=3306'));
    console.error(chalk.gray('  DB_USER=root'));
    console.error(chalk.gray('  DB_PASSWORD= (leave empty if no password)'));
    console.error(chalk.gray('  DB_NAME=gloriafood_orders\n'));
    process.exit(1);
  } else if (!autoLoadMerchants) {
    console.log(chalk.cyan('ℹ️  AUTO_LOAD_MERCHANTS is not set or false'));
    console.log(chalk.cyan('   Merchants will be loaded from database only'));
    console.log(chalk.cyan('   Add merchants through the Integrations page in the UI\n'));
  }
  
  console.log(chalk.green('✅ Environment variables check passed\n'));

  // Support both PORT (standard for hosting services) and WEBHOOK_PORT
  const port = parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3000', 10);
  
  const config: WebhookConfig = {
    port,
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    apiKey: apiKey || undefined, // Optional for multi-merchant mode
    storeId: storeId || undefined, // Optional for multi-merchant mode
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
  await server.start();
}

// Run the application
console.log(chalk.blue('🔵 Main function called, starting application...'));
main().catch(error => {
  console.error(chalk.red.bold('\n❌❌❌ FATAL ERROR ❌❌❌'));
  console.error(chalk.red(`Error: ${error.message}`));
  console.error(chalk.red(`Stack: ${error.stack}`));
  process.exit(1);
});

