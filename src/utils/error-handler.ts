/**
 * Error handling utilities for the Gloria Food API integration
 */

import { ApiError } from '../types/gloria-food';
import { Logger } from './logger';

export class ErrorHandler {
  private logger: Logger;

  constructor(service: string) {
    this.logger = new Logger(service);
  }

  /**
   * Handle API errors with appropriate logging and retry logic
   */
  handleApiError(error: ApiError, context?: string): void {
    const errorContext = context ? `[${context}] ` : '';
    
    switch (error.code) {
      case '401':
        this.logger.error(`${errorContext}Authentication failed - Invalid API key`);
        break;
      case '403':
        this.logger.error(`${errorContext}Access forbidden - Insufficient permissions`);
        break;
      case '404':
        this.logger.error(`${errorContext}Resource not found`);
        break;
      case '429':
        this.logger.error(`${errorContext}Rate limit exceeded - Too many requests`);
        break;
      case '500':
        this.logger.error(`${errorContext}Internal server error from Gloria Food API`);
        break;
      case 'NETWORK_ERROR':
        this.logger.error(`${errorContext}Network connectivity issue`);
        break;
      default:
        this.logger.error(`${errorContext}Unknown error: ${error.message}`, error.details);
    }
  }

  /**
   * Check if an error is retryable
   */
  isRetryableError(error: ApiError): boolean {
    const retryableCodes = ['500', '502', '503', '504', 'NETWORK_ERROR'];
    return retryableCodes.includes(error.code);
  }

  /**
   * Get retry delay based on error type
   */
  getRetryDelay(error: ApiError, attempt: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    
    if (error.code === '429') {
      // Rate limit - use exponential backoff with jitter
      return Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay);
    }
    
    // Other retryable errors - exponential backoff
    return Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  }

  /**
   * Wrap async operations with error handling
   */
  async withErrorHandling<T>(
    operation: () => Promise<T>,
    context?: string,
    fallback?: T
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      this.handleApiError(error as ApiError, context);
      
      if (fallback !== undefined) {
        this.logger.warn(`Using fallback value for ${context}`);
        return fallback;
      }
      
      throw error;
    }
  }
}

/**
 * Custom error classes for specific scenarios
 */
export class GloriaFoodApiError extends Error {
  public readonly code: string;
  public readonly details?: any;

  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'GloriaFoodApiError';
    this.code = code;
    this.details = details;
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
