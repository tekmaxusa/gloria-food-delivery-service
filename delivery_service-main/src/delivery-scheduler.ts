/**
 * Delivery Scheduler
 * Schedules DoorDash API calls based on delivery time
 */

export interface ScheduleResult {
  status: 'scheduled' | 'dispatched' | 'skipped';
  orderId?: string;
  scheduledTime?: Date;
  deliveryTime?: Date;
  reason?: string;
}

export interface DispatchPayload {
  orderData: any;
  trigger: 'scheduled' | 'immediate';
  scheduledTime?: Date;
  deliveryTime?: Date;
  metadata?: {
    source?: string;
    reason?: string;
  };
}

interface DeliverySchedulerConfig {
  bufferMinutes: number;
  onDispatch: (payload: DispatchPayload) => Promise<void>;
  logger?: any;
}

interface ScheduledJob {
  orderId: string;
  orderData: any;
  scheduledTime: Date;
  deliveryTime: Date;
  timeoutId: NodeJS.Timeout;
  isExecuted: boolean;
}

export class DeliveryScheduler {
  private config: DeliverySchedulerConfig;
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private logger: any;

  constructor(config: DeliverySchedulerConfig) {
    this.config = config;
    this.logger = config.logger || console;
  }

  /**
   * Schedule a DoorDash delivery call
   */
  async schedule(orderData: any, metadata?: { source?: string }): Promise<ScheduleResult> {
    const orderId = this.getOrderId(orderData);
    if (!orderId) {
      return {
        status: 'skipped',
        reason: 'missing-order-id',
      };
    }

    // Check if order type is delivery (DoorDash is for delivery only)
    const orderType = orderData.type || orderData.order_type || '';
    if (orderType.toLowerCase() !== 'delivery') {
      return {
        status: 'skipped',
        orderId,
        reason: 'not-delivery-order',
      };
    }

    // Get delivery time from order data
    const deliveryTime = this.getDeliveryTime(orderData);
    if (!deliveryTime) {
      // No delivery time, dispatch immediately
      await this.config.onDispatch({
        orderData,
        trigger: 'immediate',
        metadata,
      });
      return {
        status: 'dispatched',
        orderId,
        reason: 'no-delivery-time',
      };
    }

    // Calculate scheduled time (bufferMinutes before delivery)
    const scheduledTime = new Date(deliveryTime.getTime() - this.config.bufferMinutes * 60 * 1000);
    const now = new Date();

    // If scheduled time is in the past or very soon (less than 1 minute), dispatch immediately
    if (scheduledTime <= now || (scheduledTime.getTime() - now.getTime()) < 60000) {
      await this.config.onDispatch({
        orderData,
        trigger: 'immediate',
        deliveryTime,
        metadata: {
          ...metadata,
          reason: scheduledTime <= now ? 'scheduled-time-past' : 'scheduled-time-too-soon',
        },
      });
      return {
        status: 'dispatched',
        orderId,
        deliveryTime,
        reason: scheduledTime <= now ? 'scheduled-time-past' : 'scheduled-time-too-soon',
      };
    }

    // Cancel existing job if any
    this.cancelJob(orderId);

    // Schedule the job
    const delayMs = scheduledTime.getTime() - now.getTime();
    const timeoutId = setTimeout(async () => {
      await this.executeScheduledJob(orderId);
    }, delayMs);

    const job: ScheduledJob = {
      orderId,
      orderData,
      scheduledTime,
      deliveryTime,
      timeoutId,
      isExecuted: false,
    };

    this.scheduledJobs.set(orderId, job);

    this.logger?.log(`Scheduled DoorDash delivery for order ${orderId} at ${scheduledTime.toISOString()} (delivery: ${deliveryTime.toISOString()})`);

    return {
      status: 'scheduled',
      orderId,
      scheduledTime,
      deliveryTime,
    };
  }

  /**
   * Execute a scheduled job
   */
  private async executeScheduledJob(orderId: string): Promise<void> {
    const job = this.scheduledJobs.get(orderId);
    if (!job || job.isExecuted) {
      return;
    }

    job.isExecuted = true;

    try {
      await this.config.onDispatch({
        orderData: job.orderData,
        trigger: 'scheduled',
        scheduledTime: job.scheduledTime,
        deliveryTime: job.deliveryTime,
        metadata: {
          source: 'scheduler',
        },
      });
    } catch (error: any) {
      this.logger?.error(`Error executing scheduled job for order ${orderId}: ${error.message}`);
    } finally {
      this.scheduledJobs.delete(orderId);
    }
  }

  /**
   * Cancel a scheduled job
   */
  private cancelJob(orderId: string): void {
    const job = this.scheduledJobs.get(orderId);
    if (job && job.timeoutId) {
      clearTimeout(job.timeoutId);
      this.scheduledJobs.delete(orderId);
    }
  }

  /**
   * Clear a scheduled job (public method)
   */
  clear(orderId: string): void {
    this.cancelJob(orderId);
  }

  /**
   * Cancel a scheduled job with reason (public method)
   */
  cancel(orderId: string, reason?: string): void {
    this.cancelJob(orderId);
    if (reason) {
      this.logger?.log(`Cancelled scheduled delivery for order ${orderId}: ${reason}`);
    }
  }

  /**
   * Stop the scheduler and cancel all pending jobs
   */
  stop(): void {
    for (const [orderId, job] of this.scheduledJobs.entries()) {
      if (job.timeoutId) {
        clearTimeout(job.timeoutId);
      }
    }
    this.scheduledJobs.clear();
    this.logger?.log('Delivery scheduler stopped');
  }

  /**
   * Get order ID from order data
   */
  private getOrderId(orderData: any): string | null {
    if (!orderData) return null;

    const candidates = [
      orderData.orderNumber,
      orderData.order_number,
      orderData.id,
      orderData.order_id,
      orderData.external_delivery_id,
    ];

    for (const candidate of candidates) {
      if (candidate !== null && candidate !== undefined && candidate !== '') {
        return String(candidate);
      }
    }

    return null;
  }

  /**
   * Get delivery time from order data
   */
  private getDeliveryTime(orderData: any): Date | null {
    // Try various possible fields for delivery time
    const candidates = [
      orderData.delivery_time,
      orderData.deliveryTime,
      orderData.delivery_datetime,
      orderData.deliveryDateTime,
      orderData.scheduled_delivery_time,
      orderData.scheduledDeliveryTime,
      orderData.estimated_delivery_time,
      orderData.estimatedDeliveryTime,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      // If it's already a Date object
      if (candidate instanceof Date) {
        return candidate;
      }

      // If it's a string, try to parse it
      if (typeof candidate === 'string') {
        const parsed = new Date(candidate);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      // If it's a number (timestamp)
      if (typeof candidate === 'number') {
        const parsed = new Date(candidate);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    // Try to extract from delivery object
    if (orderData.delivery) {
      const deliveryTime = this.getDeliveryTime(orderData.delivery);
      if (deliveryTime) {
        return deliveryTime;
      }
    }

    return null;
  }
}

