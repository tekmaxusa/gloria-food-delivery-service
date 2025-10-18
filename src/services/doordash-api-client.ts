/**
 * DoorDash API Client
 * Handles authentication, delivery creation, and status updates
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { 
  DoorDashConfig, 
  DoorDashCredentials,
  DoorDashDeliveryRequest,
  DoorDashDeliveryResponse,
  DoorDashDeliveryUpdate,
  DoorDashDeliveryListResponse,
  DoorDashDeliveryFilters,
  DoorDashApiResponse,
  DoorDashError,
  DoorDashAuthResponse,
  DoorDashRetryConfig,
  DoorDashRateLimitConfig
} from '../types/doordash';
import { Logger } from '../utils/logger';

export class DoorDashApiClient {
  private client: AxiosInstance;
  private config: DoorDashConfig;
  private logger: Logger;
  private credentials: DoorDashCredentials | null = null;
  private retryConfig: DoorDashRetryConfig;
  private rateLimitConfig: DoorDashRateLimitConfig;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;

  constructor(config: DoorDashConfig, retryConfig?: DoorDashRetryConfig, rateLimitConfig?: DoorDashRateLimitConfig) {
    this.config = config;
    this.logger = new Logger('DoorDashApiClient');
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
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for authentication and logging
    this.client.interceptors.request.use(
      async (config) => {
        // Add authentication token if available
        if (this.credentials && this.credentials.accessToken) {
          config.headers.Authorization = `Bearer ${this.credentials.accessToken}`;
        }

        this.logger.info(`Making DoorDash request to ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('DoorDash request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        this.logger.info(`DoorDash response received: ${response.status} ${response.statusText}`);
        return response;
      },
      async (error) => {
        this.logger.error('DoorDash response interceptor error:', error.response?.data || error.message);
        
        // Handle authentication errors
        if (error.response?.status === 401 && this.credentials) {
          this.logger.warn('Authentication failed, attempting to refresh token...');
          try {
            await this.refreshAccessToken();
            // Retry the original request
            return this.client.request(error.config);
          } catch (refreshError) {
            this.logger.error('Failed to refresh token:', refreshError);
          }
        }

        return Promise.reject(this.handleApiError(error));
      }
    );
  }

  private handleApiError(error: any): DoorDashError {
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
    let lastError: DoorDashError;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as DoorDashError;
        
        if (attempt === this.retryConfig.maxAttempts) {
          this.logger.error(`DoorDash operation failed after ${attempt} attempts:`, lastError);
          throw lastError;
        }

        // Don't retry on client errors (4xx) except 401
        if (lastError.code.startsWith('4') && lastError.code !== '401') {
          throw lastError;
        }

        const delay = this.retryConfig.delayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
        this.logger.warn(`DoorDash attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
        
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
          this.logger.error('DoorDash request in queue failed:', error);
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
   * Authenticate with DoorDash API
   */
  async authenticate(): Promise<DoorDashCredentials> {
    this.logger.info('Authenticating with DoorDash API...');
    
    try {
      const response: AxiosResponse<DoorDashAuthResponse> = await this.client.post('/oauth/token', {
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        developer_id: this.config.developerId
      });

      this.credentials = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: Date.now() + (response.data.expires_in * 1000)
      };

      this.logger.info('DoorDash authentication successful');
      return this.credentials;

    } catch (error) {
      this.logger.error('DoorDash authentication failed:', error);
      throw this.handleApiError(error);
    }
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<void> {
    if (!this.credentials?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response: AxiosResponse<DoorDashAuthResponse> = await this.client.post('/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: this.credentials.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret
      });

      this.credentials = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: Date.now() + (response.data.expires_in * 1000)
      };

      this.logger.info('DoorDash token refreshed successfully');

    } catch (error) {
      this.logger.error('DoorDash token refresh failed:', error);
      this.credentials = null;
      throw error;
    }
  }

  /**
   * Ensure authentication is valid
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.credentials || Date.now() >= this.credentials.expiresAt - 60000) {
      await this.authenticate();
    }
  }

  /**
   * Create a delivery request
   */
  async createDelivery(deliveryRequest: DoorDashDeliveryRequest): Promise<DoorDashDeliveryResponse> {
    this.logger.info(`Creating DoorDash delivery for order ${deliveryRequest.external_delivery_id}`);
    
    await this.ensureAuthenticated();

    const operation = async () => {
      const response: AxiosResponse<DoorDashApiResponse<DoorDashDeliveryResponse>> = 
        await this.client.post('/deliveries', deliveryRequest);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to create delivery');
      }
      
      this.logger.info(`DoorDash delivery created: ${response.data.data.delivery_id}`);
      return response.data.data;
    };

    return this.queueRequest(() => this.executeWithRetry(operation));
  }

  /**
   * Get delivery details
   */
  async getDelivery(deliveryId: string): Promise<DoorDashDeliveryResponse> {
    this.logger.info(`Fetching DoorDash delivery ${deliveryId}`);
    
    await this.ensureAuthenticated();

    const operation = async () => {
      const response: AxiosResponse<DoorDashApiResponse<DoorDashDeliveryResponse>> = 
        await this.client.get(`/deliveries/${deliveryId}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to fetch delivery');
      }
      
      return response.data.data;
    };

    return this.queueRequest(() => this.executeWithRetry(operation));
  }

  /**
   * Get delivery by external ID
   */
  async getDeliveryByExternalId(externalDeliveryId: string): Promise<DoorDashDeliveryResponse> {
    this.logger.info(`Fetching DoorDash delivery by external ID ${externalDeliveryId}`);
    
    await this.ensureAuthenticated();

    const operation = async () => {
      const response: AxiosResponse<DoorDashApiResponse<DoorDashDeliveryResponse>> = 
        await this.client.get(`/deliveries/external/${externalDeliveryId}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to fetch delivery');
      }
      
      return response.data.data;
    };

    return this.queueRequest(() => this.executeWithRetry(operation));
  }

  /**
   * Update delivery status
   */
  async updateDelivery(deliveryId: string, update: DoorDashDeliveryUpdate): Promise<DoorDashDeliveryResponse> {
    this.logger.info(`Updating DoorDash delivery ${deliveryId}`);
    
    await this.ensureAuthenticated();

    const operation = async () => {
      const response: AxiosResponse<DoorDashApiResponse<DoorDashDeliveryResponse>> = 
        await this.client.patch(`/deliveries/${deliveryId}`, update);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to update delivery');
      }
      
      this.logger.info(`DoorDash delivery updated: ${deliveryId}`);
      return response.data.data;
    };

    return this.queueRequest(() => this.executeWithRetry(operation));
  }

  /**
   * Cancel delivery
   */
  async cancelDelivery(deliveryId: string, reason?: string): Promise<DoorDashDeliveryResponse> {
    this.logger.info(`Cancelling DoorDash delivery ${deliveryId}`);
    
    await this.ensureAuthenticated();

    const operation = async () => {
      const response: AxiosResponse<DoorDashApiResponse<DoorDashDeliveryResponse>> = 
        await this.client.post(`/deliveries/${deliveryId}/cancel`, {
          reason: reason || 'Cancelled by merchant'
        });
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to cancel delivery');
      }
      
      this.logger.info(`DoorDash delivery cancelled: ${deliveryId}`);
      return response.data.data;
    };

    return this.queueRequest(() => this.executeWithRetry(operation));
  }

  /**
   * List deliveries with filters
   */
  async listDeliveries(filters?: DoorDashDeliveryFilters): Promise<DoorDashDeliveryListResponse> {
    this.logger.info('Fetching DoorDash deliveries...');
    
    await this.ensureAuthenticated();

    const params = new URLSearchParams();
    
    if (filters) {
      if (filters.status) {
        filters.status.forEach(status => params.append('status', status));
      }
      if (filters.external_delivery_id) {
        params.append('external_delivery_id', filters.external_delivery_id);
      }
      if (filters.delivery_id) {
        params.append('delivery_id', filters.delivery_id);
      }
      if (filters.date_from) {
        params.append('date_from', filters.date_from);
      }
      if (filters.date_to) {
        params.append('date_to', filters.date_to);
      }
      if (filters.page) {
        params.append('page', filters.page.toString());
      }
      if (filters.limit) {
        params.append('limit', filters.limit.toString());
      }
    }

    const operation = async () => {
      const response: AxiosResponse<DoorDashApiResponse<DoorDashDeliveryListResponse>> = 
        await this.client.get(`/deliveries?${params.toString()}`);
      
      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to fetch deliveries');
      }
      
      return response.data.data;
    };

    return this.queueRequest(() => this.executeWithRetry(operation));
  }

  /**
   * Get active deliveries
   */
  async getActiveDeliveries(): Promise<DoorDashDeliveryResponse[]> {
    const filters: DoorDashDeliveryFilters = {
      status: ['pending', 'accepted', 'picked_up'],
      limit: 100
    };
    
    const response = await this.listDeliveries(filters);
    return response.deliveries;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch (error) {
      this.logger.error('DoorDash API connection test failed:', error);
      return false;
    }
  }

  /**
   * Get API health status
   */
  async getHealthStatus(): Promise<{ status: string; timestamp: string; version?: string }> {
    try {
      await this.ensureAuthenticated();
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      this.logger.error('DoorDash health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      };
    }
  }
}
