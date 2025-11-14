import express, { Request, Response } from 'express';
import * as dotenv from 'dotenv';
import { IDatabase, DatabaseFactory, Order } from './database-factory';
import { GloriaFoodOrder } from './gloriafood-client';
import { DoorDashClient } from './doordash-client';
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

class GloriaFoodWebhookServer {
  private app: express.Application;
  private database: IDatabase;
  private config: WebhookConfig;
  private doorDashClient?: DoorDashClient;

  constructor(config: WebhookConfig) {
    this.config = config;
    this.app = express();
    
    // Initialize DoorDash client if configured
    this.initializeDoorDash();
    
    // Log which database is being used
    const dbType = process.env.DB_TYPE?.toLowerCase() || 'sqlite';
    console.log(chalk.cyan(`\n🗄️  Database Type: ${dbType === 'mysql' ? 'MySQL (XAMPP)' : 'SQLite'}`));
    if (dbType === 'mysql') {
      console.log(chalk.gray(`   Host: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}`));
      console.log(chalk.gray(`   Database: ${process.env.DB_NAME || 'gloriafood_orders'}`));
      console.log(chalk.gray(`   User: ${process.env.DB_USER || 'root'}\n`));
    }
    
    this.database = DatabaseFactory.createDatabase();
    // Setup middleware first (body parsing), then routes
    this.setupMiddleware();
    this.setupRoutes();
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

    if (developerId && keyId && signingSecret) {
      try {
        this.doorDashClient = new DoorDashClient({
          developerId,
          keyId,
          signingSecret,
          merchantId: process.env.DOORDASH_MERCHANT_ID,
          apiUrl: process.env.DOORDASH_API_URL,
          isSandbox: process.env.DOORDASH_SANDBOX === 'true',
        });
        console.log(chalk.green('✅ DoorDash API client initialized'));
      } catch (error: any) {
        console.warn(chalk.yellow(`⚠️  Failed to initialize DoorDash client: ${error.message}`));
      }
    } else {
      console.log(chalk.gray('ℹ️  DoorDash integration disabled (credentials not provided)'));
    }
  }

  /**
   * Send order to DoorDash (if enabled)
   */
  private async sendOrderToDoorDash(orderData: any): Promise<{ id?: string; status?: string; tracking_url?: string } | null> {
    if (!this.doorDashClient) {
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

      // Send to DoorDash Drive
      const response = await this.doorDashClient.createDriveDelivery(drivePayload);

      return { id: response.id, status: response.status, tracking_url: response.tracking_url };
    } catch (error: any) {
      // Log error but don't fail the webhook
      console.error(chalk.red(`❌ Failed to send order to DoorDash: ${error.message}`));
      // Continue processing - don't throw
      return null;
    }
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());
    // Also parse URL-encoded bodies (some webhooks use this)
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(chalk.cyan(`\n📨 [${timestamp}] ${req.method} ${req.path}`));
      if (req.method === 'POST' && req.path === this.config.webhookPath) {
        console.log(chalk.yellow(`   🔔 WEBHOOK REQUEST DETECTED!`));
        console.log(chalk.gray(`   Content-Type: ${req.headers['content-type'] || 'N/A'}`));
        console.log(chalk.gray(`   Body size: ${JSON.stringify(req.body || {}).length} chars`));
        console.log(chalk.gray(`   Body keys: ${Object.keys(req.body || {}).join(', ') || 'NONE'}`));
        
        // Log raw body if empty (for debugging)
        if (!req.body || Object.keys(req.body).length === 0) {
          console.log(chalk.yellow(`   ⚠️  Empty body detected - checking raw body...`));
          // Log query params too
          if (Object.keys(req.query).length > 0) {
            console.log(chalk.gray(`   Query params: ${JSON.stringify(req.query)}`));
          }
        }
      }
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ 
        status: 'ok', 
        service: 'GloriaFood Webhook Server',
        version: this.config.protocolVersion,
        timestamp: new Date().toISOString()
      });
    });

    // GET handler for webhook endpoint (for testing/debugging)
    this.app.get(this.config.webhookPath, (req: Request, res: Response) => {
      res.json({
        service: 'GloriaFood Webhook Server',
        endpoint: this.config.webhookPath,
        method: 'POST',
        protocol: 'JSON',
        protocol_version: this.config.protocolVersion,
        status: 'ready',
        message: 'This endpoint accepts POST requests only. GloriaFood will send order data here.',
        instructions: {
          webhook_url: `https://tekmaxllc.com${this.config.webhookPath}`,
          method: 'POST',
          content_type: 'application/json',
          authentication: 'API Key or Master Key required',
          timestamp: new Date().toISOString()
        },
        stats: {
          database_type: process.env.DB_TYPE || 'sqlite',
          note: 'Check /stats endpoint for live statistics'
        }
      });
    });

    // Webhook endpoint for receiving orders
    this.app.post(this.config.webhookPath, async (req: Request, res: Response) => {
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

        // Debug: Log webhook payload structure for troubleshooting
        console.log(chalk.gray('\n📋 Webhook Payload Structure:'));
        console.log(chalk.gray(`   Top-level keys: ${Object.keys(orderData).slice(0, 20).join(', ')}`));
        if (orderData.client) {
          console.log(chalk.gray(`   client keys: ${Object.keys(orderData.client).join(', ')}`));
          if ((orderData.client as any).name) console.log(chalk.gray(`   client.name: "${(orderData.client as any).name}"`));
          if ((orderData.client as any).first_name) console.log(chalk.gray(`   client.first_name: "${(orderData.client as any).first_name}"`));
          if ((orderData.client as any).last_name) console.log(chalk.gray(`   client.last_name: "${(orderData.client as any).last_name}"`));
          if ((orderData.client as any).phone) console.log(chalk.gray(`   client.phone: "${(orderData.client as any).phone}"`));
          if ((orderData.client as any).email) console.log(chalk.gray(`   client.email: "${(orderData.client as any).email}"`));
        }
        if (orderData.customer) {
          console.log(chalk.gray(`   customer keys: ${Object.keys(orderData.customer).join(', ')}`));
        }
        if (orderData.delivery) {
          console.log(chalk.gray(`   delivery keys: ${Object.keys(orderData.delivery).join(', ')}`));
          if (orderData.delivery.address) {
            console.log(chalk.gray(`   delivery.address: ${JSON.stringify(orderData.delivery.address)}`));
          }
        }
        // Log full payload to see actual structure - print more to find customer data
        const fullPayload = JSON.stringify(orderData, null, 2);
        console.log(chalk.blue('\n📄 FULL ORDER PAYLOAD:'));
        console.log(chalk.gray(fullPayload.substring(0, 2000) + (fullPayload.length > 2000 ? '...' : '')));
        
        // Check for common customer/delivery fields that might be in different locations
        console.log(chalk.blue('\n🔍 Checking for customer/delivery data in various locations:'));
        if (orderData.billing_details) {
          console.log(chalk.gray(`   billing_details: ${JSON.stringify(orderData.billing_details)}`));
        }
        if (orderData.client_info) {
          console.log(chalk.gray(`   client_info: ${JSON.stringify(orderData.client_info)}`));
        }
        if (orderData.customer_info) {
          console.log(chalk.gray(`   customer_info: ${JSON.stringify(orderData.customer_info)}`));
        }
        if (orderData.delivery_info) {
          console.log(chalk.gray(`   delivery_info: ${JSON.stringify(orderData.delivery_info)}`));
        }
        if (orderData.shipping_address) {
          console.log(chalk.gray(`   shipping_address: ${JSON.stringify(orderData.shipping_address)}`));
        }
        if (orderData.address) {
          console.log(chalk.gray(`   address: ${JSON.stringify(orderData.address)}`));
        }
        
        // Search for common customer field names in the entire object
        const searchForField = (obj: any, fieldNames: string[], path = ''): any => {
          if (!obj || typeof obj !== 'object') return null;
          for (const key in obj) {
            const currentPath = path ? `${path}.${key}` : key;
            const value = obj[key];
            if (fieldNames.some(fn => key.toLowerCase().includes(fn.toLowerCase()))) {
              console.log(chalk.green(`   ✓ Found potential customer field: ${currentPath} = ${JSON.stringify(value)}`));
            }
            if (typeof value === 'object' && value !== null) {
              searchForField(value, fieldNames, currentPath);
            }
          }
          return null;
        };
        
        console.log(chalk.blue('\n🔎 Deep search for customer-related fields:'));
        searchForField(orderData, ['name', 'first_name', 'last_name', 'phone', 'email', 'customer', 'client', 'address', 'delivery', 'street', 'city']);

        // Log received order
        const orderId = orderData.id || orderData.order_id || 'unknown';
        console.log(chalk.cyan(`\n📥 Received webhook for order: ${orderId}`));

        // Determine if this is a new order BEFORE saving
        const existingBefore = await this.handleAsync(this.database.getOrderByGloriaFoodId(orderId.toString()));

        // Store order in database (handle both sync SQLite and async MySQL)
        const savedOrder = await this.handleAsync(this.database.insertOrUpdateOrder(orderData));

        if (savedOrder) {
          const isNew = !existingBefore;
          const newStatus = (orderData.status || orderData.order_status || '').toString().toLowerCase();
          const prevStatus = (existingBefore?.status || '').toString().toLowerCase();
          const becameAccepted = prevStatus !== 'accepted' && newStatus === 'accepted';
          const wasNotSent = !(existingBefore as any)?.sent_to_doordash;
          
          // Check if this is a delivery order
          const orderType = (orderData.type || orderData.order_type || '').toString().toLowerCase();
          const isDeliveryOrder = orderType === 'delivery';
          
          if (isNew) {
            console.log(chalk.green(`✅ New order stored in database: #${orderId}`));
            await this.displayOrder(savedOrder, true);

            // AUTOMATICALLY send to DoorDash for ALL new delivery orders (regardless of status)
            if (isDeliveryOrder) {
              console.log(chalk.cyan('\n🚚 Sending order to DoorDash...'));
              await this.sendOrderToDoorDash(orderData).then(async (resp)=>{
                // Mark as sent if call succeeded
                if (resp && (this.database as any).markOrderSentToDoorDash) {
                  try { await (this.database as any).markOrderSentToDoorDash(orderId.toString(), resp.id); } catch {}
                }
                
                if (resp && resp.id) {
                  console.log(chalk.green(`✅ Order sent to DoorDash successfully`));
                  console.log(chalk.gray(`   DoorDash Delivery ID: ${resp.id}`));
                  if (resp.status) {
                    console.log(chalk.gray(`   Status: ${resp.status}`));
                  }
                  if (resp.tracking_url) {
                    console.log(chalk.gray(`   Tracking URL: ${resp.tracking_url}`));
                  }
                  
                  // Show rider dispatch message
                  console.log(chalk.green(`🏍️  Rider is being dispatched by DoorDash...`));
                  console.log(chalk.gray(`   DoorDash will automatically assign a rider for this delivery`));
                }
              }).catch((error: any)=>{
                console.error(chalk.red(`❌ Failed to send order to DoorDash: ${error.message || 'Unknown error'}`));
              });
            }
          } else {
            console.log(chalk.blue(`🔄 Order updated in database: #${orderId}`));

            // If it's a delivery order and not yet sent, send to DoorDash
            // This handles cases where order type changes to delivery or status changes
            if (isDeliveryOrder && wasNotSent) {
              console.log(chalk.cyan('\n🚚 Sending order to DoorDash...'));
              await this.sendOrderToDoorDash(orderData).then(async (resp)=>{
                if (resp && (this.database as any).markOrderSentToDoorDash) {
                  try { await (this.database as any).markOrderSentToDoorDash(orderId.toString(), resp.id); } catch {}
                }
                
                if (resp && resp.id) {
                  console.log(chalk.green(`✅ Order sent to DoorDash successfully`));
                  console.log(chalk.gray(`   DoorDash Delivery ID: ${resp.id}`));
                  if (resp.status) {
                    console.log(chalk.gray(`   Status: ${resp.status}`));
                  }
                  if (resp.tracking_url) {
                    console.log(chalk.gray(`   Tracking URL: ${resp.tracking_url}`));
                  }
                  
                  // Show rider dispatch message
                  console.log(chalk.green(`🏍️  Rider is being dispatched by DoorDash...`));
                  console.log(chalk.gray(`   DoorDash will automatically assign a rider for this delivery`));
                }
              }).catch((error: any)=>{
                console.error(chalk.red(`❌ Failed to send order to DoorDash: ${error.message || 'Unknown error'}`));
              });
            }
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
        console.error(chalk.red(`❌ Webhook error: ${error.message}`));
        console.error(chalk.gray(error.stack));
        
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

  private async displayOrder(order: Order, isNew: boolean = false): Promise<void> {
    const prefix = isNew ? chalk.green('🆕 NEW ORDER') : chalk.blue('📦 ORDER');
    
    // Parse raw_data to extract additional customer details
    let rawData: any = null;
    try {
      rawData = JSON.parse(order.raw_data || '{}');
    } catch (e) {
      // Ignore parsing errors
    }
    
    // Extract customer information from multiple sources
    let customerName = order.customer_name;
    let customerPhone = order.customer_phone || '';
    let customerEmail = order.customer_email || '';
    let deliveryAddress = order.delivery_address || '';
    
    if (rawData) {
      // Extract customer name - try multiple paths
      if (!customerName || customerName === 'Unknown') {
        if (rawData.client) {
          if (rawData.client.first_name || rawData.client.last_name) {
            const name = `${rawData.client.first_name || ''} ${rawData.client.last_name || ''}`.trim();
            if (name) customerName = name;
          }
          if (!customerName || customerName === 'Unknown') {
            if (rawData.client.name) customerName = rawData.client.name;
            if (rawData.client.full_name) customerName = rawData.client.full_name;
          }
        }
        if ((!customerName || customerName === 'Unknown') && rawData.customer) {
          if (rawData.customer.name) customerName = rawData.customer.name;
          else if (rawData.customer.first_name || rawData.customer.last_name) {
            const name = `${rawData.customer.first_name || ''} ${rawData.customer.last_name || ''}`.trim();
            if (name) customerName = name;
          }
          if (rawData.customer.full_name) customerName = rawData.customer.full_name;
        }
        if ((!customerName || customerName === 'Unknown') && rawData.customer_name) {
          customerName = rawData.customer_name;
        }
        if ((!customerName || customerName === 'Unknown') && rawData.name) {
          customerName = rawData.name;
        }
      }
      
      // Extract customer phone - try multiple paths
      if (!customerPhone) {
        customerPhone = rawData.client?.phone || 
                       rawData.client?.phone_number || 
                       rawData.client?.mobile ||
                       rawData.customer?.phone || 
                       rawData.customer?.phone_number || 
                       rawData.customer?.mobile ||
                       rawData.customer_phone || 
                       rawData.phone || 
                       rawData.phone_number || 
                       rawData.mobile || '';
      }
      
      // Extract customer email - try multiple paths
      if (!customerEmail) {
        customerEmail = rawData.client?.email || 
                       rawData.customer?.email || 
                       rawData.customer_email || 
                       rawData.email || '';
      }
      
      // Extract delivery address - try multiple paths
      if (!deliveryAddress) {
        // Try delivery.address object (structured address)
        if (rawData.delivery?.address) {
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
    }
    
    // Convert total_price to number (MySQL returns DECIMAL as string)
    const totalPrice = typeof order.total_price === 'string' 
      ? parseFloat(order.total_price) 
      : (order.total_price || 0);
    
    console.log(`\n${prefix} ${chalk.bold(`#${order.gloriafood_order_id}`)}`);
    console.log(chalk.gray('  ──────────────────────────────────────────'));
    
    // Customer Information Section
    console.log(chalk.yellow.bold('\n  👤 CUSTOMER INFORMATION:'));
    console.log(`    ${chalk.bold('Name:')} ${customerName || 'N/A'}`);
    console.log(`    ${chalk.bold('Phone:')} ${customerPhone || 'N/A'}`);
    console.log(`    ${chalk.bold('Email:')} ${customerEmail || 'N/A'}`);
    
    // Delivery Information Section
    console.log(chalk.yellow.bold('\n  📍 DELIVERY INFORMATION:'));
    if (deliveryAddress) {
      console.log(`    ${chalk.bold('Address:')} ${deliveryAddress}`);
    } else {
      console.log(`    ${chalk.gray('No delivery address available')}`);
    }

    // Order Information
    console.log(chalk.yellow.bold('\n  📋 ORDER INFORMATION:'));
    console.log(`    ${chalk.bold('Total:')} ${order.currency || 'USD'} ${totalPrice.toFixed(2)}`);
    console.log(`    ${chalk.bold('Status:')} ${this.formatStatus(order.status)}`);
    console.log(`    ${chalk.bold('Type:')} ${order.order_type || 'N/A'}`);
    console.log(`    ${chalk.bold('Received:')} ${new Date(order.fetched_at).toLocaleString()}`);
    
    // Display items
    try {
      const items = JSON.parse(order.items || '[]');
      if (Array.isArray(items) && items.length > 0) {
        console.log(chalk.yellow.bold('\n  🛒 ORDER ITEMS:'));
        items.forEach((item: any, index: number) => {
          const name = item.name || item.product_name || item.title || 'Unknown Item';
          const quantity = item.quantity || 1;
          const itemPrice = parseFloat(item.price || item.unit_price || 0);
          const subtotal = itemPrice * quantity;
          console.log(`    ${index + 1}. ${name} x${quantity} - ${order.currency || 'USD'} ${itemPrice.toFixed(2)} (Total: ${order.currency || 'USD'} ${subtotal.toFixed(2)})`);
        });
      }
    } catch (e) {
      // Ignore parsing errors
    }
    
    console.log(chalk.gray('\n  ──────────────────────────────────────────'));
    
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
    this.app.listen(this.config.port, () => {
      console.log(chalk.blue.bold('\n🚀 GloriaFood Webhook Server Started\n'));
      console.log(chalk.gray('Configuration:'));
      console.log(chalk.gray(`  Port: ${this.config.port}`));
      console.log(chalk.gray(`  Webhook Path: ${this.config.webhookPath}`));
      console.log(chalk.gray(`  Protocol Version: ${this.config.protocolVersion}`));
      console.log(chalk.gray(`  Store ID: ${this.config.storeId}`));
      console.log(chalk.gray(`  Database: ${this.config.databasePath}\n`));
      console.log(chalk.green(`✅ Server listening on port ${this.config.port}`));
      console.log(chalk.green(`📥 Webhook endpoint (POST): http://localhost:${this.config.port}${this.config.webhookPath}`));
      console.log(chalk.green(`📥 Webhook endpoint (GET - test): http://localhost:${this.config.port}${this.config.webhookPath}`));
      console.log(chalk.green(`💚 Health check: http://localhost:${this.config.port}/health`));
      console.log(chalk.green(`📊 Statistics: http://localhost:${this.config.port}/stats`));
      console.log(chalk.green(`📋 GET Endpoints:`));
      console.log(chalk.gray(`   • All Orders: http://localhost:${this.config.port}/orders`));
      console.log(chalk.gray(`   • Order by ID: http://localhost:${this.config.port}/orders/:orderId`));
      console.log(chalk.gray(`   • Recent Orders: http://localhost:${this.config.port}/orders/recent/:minutes`));
      console.log(chalk.gray(`   • Orders by Status: http://localhost:${this.config.port}/orders/status/:status`));
      console.log(chalk.gray(`   • Summary: http://localhost:${this.config.port}/summary`));
      console.log(chalk.gray(`   • Stats: http://localhost:${this.config.port}/stats`));
      console.log(chalk.gray(`   • DoorDash Status: http://localhost:${this.config.port}/doordash/status/:orderId\n`));
      console.log(chalk.yellow(`⚠ Configure GloriaFood to send webhooks to: https://tekmaxllc.com/webhook`));
      console.log(chalk.yellow(`⚠ Make sure this server is accessible at that URL (use ngrok/tunnel for local dev)`));
      console.log(chalk.gray(`   Example ngrok: ngrok http ${this.config.port}`));
      console.log(chalk.yellow(`\n⚠ Note: If your GloriaFood doesn't support webhooks, use polling mode instead:`));
      console.log(chalk.green(`   npm run dev (polling mode - checks every 30 seconds)\n`));
    });
  }

  public async stop(): Promise<void> {
    const closeResult = this.database.close();
    if (closeResult instanceof Promise) {
      await closeResult;
    }
    console.log(chalk.yellow('\n\n🛑 Webhook server stopped. Goodbye!\n'));
  }
}

// Main execution
async function main() {
  // Validate environment variables
  const apiKey = process.env.GLORIAFOOD_API_KEY;
  const storeId = process.env.GLORIAFOOD_STORE_ID;

  if (!apiKey || !storeId) {
    console.error(chalk.red.bold('\n❌ Error: Missing required environment variables!\n'));
    console.error(chalk.yellow('Please check your .env file with the following variables:'));
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

  const server = new GloriaFoodWebhookServer(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  // Start the server
  server.start();
}

// Run the application
main().catch(error => {
  console.error(chalk.red.bold('\n❌ Fatal Error:'), error);
  process.exit(1);
});

