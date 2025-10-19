/**
 * Gloria Food API Client
 * Handles authentication, rate limiting, and API communication
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { 
  GloriaFoodConfig, 
  GloriaFoodOrder, 
  OrdersListResponse, 
  OrderFilters, 
  GloriaFoodApiResponse,
  ApiError,
  RetryConfig,
  RateLimitConfig,
  MenuResponse
} from '../types/gloria-food';
import { Logger } from '../utils/logger';

export class GloriaFoodApiClient {
  private client: AxiosInstance;
  private config: GloriaFoodConfig;
  private logger: Logger;
  private retryConfig: RetryConfig;
  private rateLimitConfig: RateLimitConfig;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;

  constructor(config: GloriaFoodConfig, retryConfig?: RetryConfig, rateLimitConfig?: RateLimitConfig) {
    this.config = config;
    this.logger = new Logger('GloriaFoodApiClient');
    this.retryConfig = retryConfig || {
      maxAttempts: 3,
      delayMs: 1000,
      backoffMultiplier: 2
    };
    this.rateLimitConfig = rateLimitConfig || {
      requestsPerMinute: 60,
      burstLimit: 10
    };

    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GloriaFood-Delivery-Service/1.0.0'
      },
      params: {
        'api_key': config.apiKey
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        this.logger.info(`Making request to ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        this.logger.info(`Response received: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        this.logger.error('Response interceptor error:', error.response?.data || error.message);
        return Promise.reject(this.handleApiError(error));
      }
    );
  }

  private handleApiError(error: any): ApiError {
    if (error.response) {
      return {
        code: error.response.status.toString(),
        message: error.response.data?.message || error.response.statusText,
        details: error.response.data
      };
    } else if (error.request) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network request failed',
        details: error.message
      };
    } else {
      return {
        code: 'UNKNOWN_ERROR',
        message: error.message,
        details: error
      };
    }
  }

  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: ApiError;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as ApiError;
        
        if (attempt === this.retryConfig.maxAttempts) {
          this.logger.error(`Operation failed after ${attempt} attempts:`, lastError);
          throw lastError;
        }

        // Don't retry on client errors (4xx)
        if (lastError.code.startsWith('4')) {
          throw lastError;
        }

        const delay = this.retryConfig.delayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
        this.logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
        
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async processRequestQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          this.logger.error('Request in queue failed:', error);
        }
      }
      
      // Rate limiting: wait between requests
      await this.sleep(60000 / this.rateLimitConfig.requestsPerMinute);
    }

    this.isProcessingQueue = false;
  }

  private queueRequest<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processRequestQueue();
    });
  }

  /**
   * Get all orders with optional filtering
   * Supports multiple methods: REST API, Web Scraping, Polling
   */
  async getOrders(filters?: OrderFilters): Promise<OrdersListResponse> {
    try {
      // Method 1: Try REST API first
      try {
        return await this.getOrdersFromAPI(filters);
      } catch (apiError) {
        this.logger.warn('REST API not available, trying alternative methods:', apiError);
      }

      // Method 2: Try web scraping
      try {
        const { TekMaxWebScraper } = await import('./web-scraper');
        const scraper = new TekMaxWebScraper();
        const orders = await scraper.getOrders();
        
        return {
          orders: orders,
          pagination: {
            page: filters?.page || 1,
            limit: filters?.limit || 20,
            total: orders.length,
            totalPages: Math.ceil(orders.length / (filters?.limit || 20))
          }
        };
      } catch (scrapingError) {
        this.logger.warn('Web scraping not available:', scrapingError);
      }

      // Method 3: Return empty result
      this.logger.info('No order fetching method available - returning empty result');
      return {
        orders: [],
        pagination: {
          page: filters?.page || 1,
          limit: filters?.limit || 20,
          total: 0,
          totalPages: 0
        }
      };
    } catch (error) {
      this.logger.error('Failed to fetch orders:', error);
      throw error;
    }
  }

  /**
   * Get orders from REST API (when available)
   */
  private async getOrdersFromAPI(filters?: OrderFilters): Promise<OrdersListResponse> {
    const params = new URLSearchParams();
    
    if (filters) {
      if (filters.status) {
        filters.status.forEach(status => params.append('status', status));
      }
      if (filters.orderType) {
        params.append('orderType', filters.orderType);
      }
      if (filters.dateFrom) {
        params.append('dateFrom', filters.dateFrom);
      }
      if (filters.dateTo) {
        params.append('dateTo', filters.dateTo);
      }
      if (filters.page) {
        params.append('page', filters.page.toString());
      }
      if (filters.limit) {
        params.append('limit', filters.limit.toString());
      }
    }

    const operation = async () => {
      const response: AxiosResponse<GloriaFoodApiResponse<OrdersListResponse>> = 
        await this.client.get(`/restaurants/${this.config.restaurantId}/orders?${params.toString()}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to fetch orders');
      }
      
      return response.data.data;
    };

    return this.queueRequest(() => this.executeWithRetry(operation));
  }

  /**
   * Get a specific order by ID
   */
  async getOrder(orderId: number): Promise<GloriaFoodOrder> {
    try {
      // For now, throw error since TekMax Food API doesn't have order endpoint yet
      this.logger.info('Individual order endpoint not available in TekMax Food API yet');
      throw new Error('Order endpoint not available in TekMax Food API yet');
    } catch (error) {
      this.logger.error('Failed to fetch order:', error);
      throw error;
    }
  }

  /**
   * Get orders by status
   */
  async getOrdersByStatus(status: string[]): Promise<GloriaFoodOrder[]> {
    const filters: OrderFilters = {
      status: status as any,
      limit: 100
    };
    
    const response = await this.getOrders(filters);
    return response.orders;
  }

  /**
   * Get delivery orders only
   */
  async getDeliveryOrders(filters?: Partial<OrderFilters>): Promise<GloriaFoodOrder[]> {
    const deliveryFilters: OrderFilters = {
      orderType: 'delivery',
      ...filters
    };
    
    const response = await this.getOrders(deliveryFilters);
    return response.orders;
  }

  /**
   * Get pending delivery orders
   */
  async getPendingDeliveryOrders(): Promise<GloriaFoodOrder[]> {
    return this.getOrdersByStatus(['pending', 'confirmed', 'preparing']);
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: number, status: string): Promise<GloriaFoodOrder> {
    try {
      // For now, throw error since TekMax Food API doesn't have order update endpoint yet
      this.logger.info('Order update endpoint not available in TekMax Food API yet');
      throw new Error('Order update endpoint not available in TekMax Food API yet');
    } catch (error) {
      this.logger.error('Failed to update order status:', error);
      throw error;
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get(`/admin/restaurant?acid=${this.config.restaurantId}`);
      return response.status === 200;
    } catch (error) {
      this.logger.error('API connection test failed:', error);
      return false;
    }
  }

  /**
   * Get API health status
   */
  async getHealthStatus(): Promise<{ status: string; timestamp: string; version?: string }> {
    try {
      // For TekMax Food, we'll use the restaurant endpoint as health check
      const response = await this.client.get(`/admin/restaurant?acid=${this.config.restaurantId}`);
      return {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: 'TekMax Food API'
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get restaurant menu using company UID
   */
  async getMenu(): Promise<MenuResponse> {
    try {
      if (!this.config.companyUid) {
        throw new Error('Company UID is required to fetch menu');
      }

      const operation = async () => {
        const response: AxiosResponse<MenuResponse> = 
          await this.client.get(`/menu?company_uid=${this.config.companyUid}`);
        
        return response.data;
      };

      return this.queueRequest(() => this.executeWithRetry(operation));
    } catch (error) {
      this.logger.error('Failed to fetch menu:', error);
      throw error;
    }
  }

  /**
   * Get menu for a specific restaurant using company UID
   */
  async getRestaurantMenu(restaurantId?: string): Promise<MenuResponse> {
    try {
      if (!this.config.companyUid) {
        throw new Error('Company UID is required to fetch menu');
      }

      const operation = async () => {
        const params = new URLSearchParams();
        params.append('company_uid', this.config.companyUid!);
        
        if (restaurantId) {
          params.append('restaurant_id', restaurantId);
        }

        const response: AxiosResponse<MenuResponse> = 
          await this.client.get(`/menu?${params.toString()}`);
        
        return response.data;
      };

      return this.queueRequest(() => this.executeWithRetry(operation));
    } catch (error) {
      this.logger.error('Failed to fetch restaurant menu:', error);
      throw error;
    }
  }
}
