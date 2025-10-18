/**
 * Order Polling Service
 * Polls for new orders when real-time API is not available
 */

import { Logger } from '../utils/logger';
import { ConfigManager } from '../utils/config';
import { DatabaseService } from './database-service';
import { TekMaxWebScraper } from './web-scraper';
import { GloriaFoodOrder } from '../types/gloria-food';

export class OrderPollingService {
  private config: ConfigManager;
  private logger: Logger;
  private database: DatabaseService;
  private webScraper: TekMaxWebScraper;
  private pollingInterval: number;
  private isPolling: boolean = false;
  private pollingTimer?: NodeJS.Timeout;

  constructor(pollingIntervalMinutes: number = 5) {
    this.config = ConfigManager.getInstance();
    this.logger = new Logger('OrderPollingService');
    this.database = new DatabaseService();
    this.webScraper = new TekMaxWebScraper();
    this.pollingInterval = pollingIntervalMinutes * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Start polling for new orders
   */
  async startPolling(): Promise<void> {
    if (this.isPolling) {
      this.logger.warn('Polling is already running');
      return;
    }

    this.logger.info(`Starting order polling every ${this.pollingInterval / 60000} minutes`);
    this.isPolling = true;

    // Initial poll
    await this.pollForOrders();

    // Set up recurring polling
    this.pollingTimer = setInterval(async () => {
      await this.pollForOrders();
    }, this.pollingInterval);
  }

  /**
   * Stop polling for orders
   */
  stopPolling(): void {
    if (!this.isPolling) {
      this.logger.warn('Polling is not running');
      return;
    }

    this.logger.info('Stopping order polling');
    this.isPolling = false;

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  /**
   * Poll for new orders
   */
  private async pollForOrders(): Promise<void> {
    try {
      this.logger.info('Polling for new orders...');
      
      // Check if web scraper can access admin interface
      const hasAccess = await this.webScraper.checkAccess();
      
      if (!hasAccess) {
        this.logger.warn('Cannot access admin interface for polling');
        return;
      }

      // Get orders from web scraper
      const orders = await this.webScraper.getOrders();
      
      if (orders.length === 0) {
        this.logger.info('No new orders found');
        return;
      }

      // Check for new orders
      const newOrders = await this.filterNewOrders(orders);
      
      if (newOrders.length > 0) {
        this.logger.info(`Found ${newOrders.length} new orders`);
        
        // Save new orders to database
        for (const order of newOrders) {
          await this.database.saveOrder(order);
          this.logger.info(`Saved new order: ${order.orderNumber}`);
        }
        
        // Process new orders (trigger webhooks, etc.)
        await this.processNewOrders(newOrders);
      } else {
        this.logger.info('No new orders found');
      }
    } catch (error) {
      this.logger.error('Error during order polling:', error);
    }
  }

  /**
   * Filter out orders that already exist in database
   */
  private async filterNewOrders(orders: GloriaFoodOrder[]): Promise<GloriaFoodOrder[]> {
    const newOrders: GloriaFoodOrder[] = [];
    
    for (const order of orders) {
      try {
        const existingOrder = await this.database.getOrder(order.id);
        if (!existingOrder) {
          newOrders.push(order);
        }
      } catch (error) {
        // Order doesn't exist, it's new
        newOrders.push(order);
      }
    }
    
    return newOrders;
  }

  /**
   * Process new orders (trigger webhooks, notifications, etc.)
   */
  private async processNewOrders(orders: GloriaFoodOrder[]): Promise<void> {
    for (const order of orders) {
      try {
        // Log the new order
        this.logger.info(`Processing new order: ${order.orderNumber}`, {
          orderId: order.id,
          customer: order.customer.name,
          total: order.total,
          orderType: order.orderType
        });

        // TODO: Add webhook notifications here
        // TODO: Add DoorDash integration here
        // TODO: Add email notifications here
        
      } catch (error) {
        this.logger.error(`Failed to process order ${order.orderNumber}:`, error);
      }
    }
  }

  /**
   * Get polling status
   */
  getStatus(): { isPolling: boolean; interval: number; nextPoll?: Date } {
    return {
      isPolling: this.isPolling,
      interval: this.pollingInterval,
      nextPoll: this.isPolling ? new Date(Date.now() + this.pollingInterval) : undefined
    };
  }

  /**
   * Set polling interval
   */
  setPollingInterval(minutes: number): void {
    this.pollingInterval = minutes * 60 * 1000;
    this.logger.info(`Polling interval set to ${minutes} minutes`);
    
    // Restart polling with new interval if currently running
    if (this.isPolling) {
      this.stopPolling();
      this.startPolling();
    }
  }

  /**
   * Manual poll (trigger polling immediately)
   */
  async manualPoll(): Promise<void> {
    this.logger.info('Manual poll triggered');
    await this.pollForOrders();
  }
}
