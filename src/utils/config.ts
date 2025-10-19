/**
 * Configuration management for Gloria Food API
 */

import dotenv from 'dotenv';
import { GloriaFoodConfig } from '../types/gloria-food';
import { DoorDashConfig } from '../types/doordash';

// Load environment variables
dotenv.config();

export class ConfigManager {
  private static instance: ConfigManager;
  private gloriaFoodConfig: GloriaFoodConfig;
  private doorDashConfig: DoorDashConfig;

  private constructor() {
    this.gloriaFoodConfig = this.loadGloriaFoodConfig();
    this.doorDashConfig = this.loadDoorDashConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadGloriaFoodConfig(): GloriaFoodConfig {
    const requiredEnvVars = [
      'GLORIA_FOOD_API_URL',
      'GLORIA_FOOD_API_KEY',
      'GLORIA_FOOD_RESTAURANT_ID'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required Gloria Food environment variables: ${missingVars.join(', ')}`);
    }

    return {
      apiUrl: process.env.GLORIA_FOOD_API_URL!,
      apiKey: process.env.GLORIA_FOOD_API_KEY!,
      restaurantId: process.env.GLORIA_FOOD_RESTAURANT_ID!,
      companyUid: process.env.GLORIA_FOOD_COMPANY_UID,
      webhookSecret: process.env.WEBHOOK_SECRET
    };
  }

  private loadDoorDashConfig(): DoorDashConfig {
    const requiredEnvVars = [
      'DOORDASH_API_URL',
      'DOORDASH_CLIENT_ID',
      'DOORDASH_CLIENT_SECRET',
      'DOORDASH_DEVELOPER_ID'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required DoorDash environment variables: ${missingVars.join(', ')}`);
    }

    return {
      apiUrl: process.env.DOORDASH_API_URL!,
      clientId: process.env.DOORDASH_CLIENT_ID!,
      clientSecret: process.env.DOORDASH_CLIENT_SECRET!,
      developerId: process.env.DOORDASH_DEVELOPER_ID!,
      environment: (process.env.DOORDASH_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox'
    };
  }

  public getGloriaFoodConfig(): GloriaFoodConfig {
    return { ...this.gloriaFoodConfig };
  }

  public getDoorDashConfig(): DoorDashConfig {
    return { ...this.doorDashConfig };
  }

  public getApiUrl(): string {
    return this.gloriaFoodConfig.apiUrl;
  }

  public getApiKey(): string {
    return this.gloriaFoodConfig.apiKey;
  }

  public getRestaurantId(): string {
    return this.gloriaFoodConfig.restaurantId;
  }

  public getWebhookSecret(): string | undefined {
    return this.gloriaFoodConfig.webhookSecret;
  }

  public getRetryConfig() {
    return {
      maxAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
      delayMs: parseInt(process.env.RETRY_DELAY_MS || '1000'),
      backoffMultiplier: 2
    };
  }

  public getRateLimitConfig() {
    return {
      requestsPerMinute: parseInt(process.env.REQUESTS_PER_MINUTE || '60'),
      burstLimit: 10
    };
  }

  public validateConfig(): boolean {
    try {
      this.loadGloriaFoodConfig();
      this.loadDoorDashConfig();
      return true;
    } catch (error) {
      console.error('Configuration validation failed:', error);
      return false;
    }
  }

  public getRestaurantConfig() {
    return {
      name: process.env.RESTAURANT_NAME || 'Restaurant',
      address: {
        street_address: process.env.RESTAURANT_ADDRESS || '',
        city: process.env.RESTAURANT_CITY || '',
        state: process.env.RESTAURANT_STATE || '',
        zip_code: process.env.RESTAURANT_ZIP || '',
        country: process.env.RESTAURANT_COUNTRY || 'US'
      },
      phone: process.env.RESTAURANT_PHONE || '',
      businessHours: {
        open: process.env.RESTAURANT_OPEN_HOURS || '09:00',
        close: process.env.RESTAURANT_CLOSE_HOURS || '22:00'
      }
    };
  }
}
