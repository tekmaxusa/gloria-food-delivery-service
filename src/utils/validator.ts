/**
 * Validation utilities for Gloria Food API data
 */

import { GloriaFoodOrder, Customer, Address, OrderItem } from '../types/gloria-food';
import { ValidationError } from './error-handler';

export class DataValidator {
  /**
   * Validate a Gloria Food order
   */
  static validateOrder(order: any): GloriaFoodOrder {
    if (!order) {
      throw new ValidationError('Order data is required');
    }

    if (!order.id || typeof order.id !== 'number') {
      throw new ValidationError('Order ID is required and must be a number');
    }

    if (!order.orderNumber || typeof order.orderNumber !== 'string') {
      throw new ValidationError('Order number is required and must be a string');
    }

    if (!order.customer) {
      throw new ValidationError('Customer information is required');
    }

    this.validateCustomer(order.customer);
    this.validateOrderItems(order.items);
    this.validateDeliveryInfo(order.delivery);

    return order as GloriaFoodOrder;
  }

  /**
   * Validate customer information
   */
  static validateCustomer(customer: any): Customer {
    if (!customer) {
      throw new ValidationError('Customer data is required');
    }

    if (!customer.name || typeof customer.name !== 'string') {
      throw new ValidationError('Customer name is required and must be a string');
    }

    if (customer.email && !this.isValidEmail(customer.email)) {
      throw new ValidationError('Invalid email format', 'email');
    }

    if (customer.phone && !this.isValidPhone(customer.phone)) {
      throw new ValidationError('Invalid phone format', 'phone');
    }

    return customer as Customer;
  }

  /**
   * Validate order items
   */
  static validateOrderItems(items: any[]): OrderItem[] {
    if (!Array.isArray(items)) {
      throw new ValidationError('Order items must be an array');
    }

    if (items.length === 0) {
      throw new ValidationError('Order must have at least one item');
    }

    items.forEach((item, index) => {
      if (!item.name || typeof item.name !== 'string') {
        throw new ValidationError(`Item ${index + 1}: Name is required and must be a string`);
      }

      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
        throw new ValidationError(`Item ${index + 1}: Quantity must be a positive number`);
      }

      if (typeof item.price !== 'number' || item.price < 0) {
        throw new ValidationError(`Item ${index + 1}: Price must be a non-negative number`);
      }

      if (typeof item.totalPrice !== 'number' || item.totalPrice < 0) {
        throw new ValidationError(`Item ${index + 1}: Total price must be a non-negative number`);
      }
    });

    return items as OrderItem[];
  }

  /**
   * Validate delivery information
   */
  static validateDeliveryInfo(delivery: any): void {
    if (!delivery) {
      throw new ValidationError('Delivery information is required');
    }

    if (!delivery.address) {
      throw new ValidationError('Delivery address is required');
    }

    this.validateAddress(delivery.address);

    if (typeof delivery.deliveryFee !== 'number' || delivery.deliveryFee < 0) {
      throw new ValidationError('Delivery fee must be a non-negative number');
    }
  }

  /**
   * Validate address information
   */
  static validateAddress(address: any): Address {
    if (!address) {
      throw new ValidationError('Address data is required');
    }

    if (!address.street || typeof address.street !== 'string') {
      throw new ValidationError('Street address is required and must be a string');
    }

    if (!address.city || typeof address.city !== 'string') {
      throw new ValidationError('City is required and must be a string');
    }

    if (!address.zipCode || typeof address.zipCode !== 'string') {
      throw new ValidationError('ZIP code is required and must be a string');
    }

    if (!address.country || typeof address.country !== 'string') {
      throw new ValidationError('Country is required and must be a string');
    }

    return address as Address;
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone format
   */
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(input: string): string {
    return input.trim().replace(/[<>]/g, '');
  }

  /**
   * Validate order status
   */
  static isValidOrderStatus(status: string): boolean {
    const validStatuses = [
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refunded'
    ];
    return validStatuses.includes(status);
  }
}
