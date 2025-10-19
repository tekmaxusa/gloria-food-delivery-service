/**
 * Gloria Food API Types and Interfaces
 * Based on Gloria Food API documentation
 */

export interface GloriaFoodConfig {
  apiUrl: string;
  apiKey: string;
  restaurantId: string;
  companyUid?: string;
  webhookSecret?: string;
}

export interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: Address;
}

export interface Address {
  street: string;
  city: string;
  state?: string;
  zipCode: string;
  country: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  totalPrice: number;
  category?: string;
  modifiers?: OrderModifier[];
  specialInstructions?: string;
}

export interface OrderModifier {
  id: number;
  name: string;
  price: number;
}

export interface PaymentInfo {
  method: 'cash' | 'card' | 'online';
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  transactionId?: string;
}

export interface DeliveryInfo {
  address: Address;
  estimatedDeliveryTime?: string;
  deliveryFee: number;
  deliveryInstructions?: string;
  contactPhone?: string;
}

export interface GloriaFoodOrder {
  id: number;
  orderNumber: string;
  restaurantId: number;
  customer: Customer;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  tip?: number;
  total: number;
  payment: PaymentInfo;
  delivery: DeliveryInfo;
  status: OrderStatus;
  orderType: 'delivery' | 'pickup';
  createdAt: string;
  updatedAt: string;
  notes?: string;
  specialInstructions?: string;
}

export type OrderStatus = 
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface GloriaFoodApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: string[];
}

export interface OrdersListResponse {
  orders: GloriaFoodOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrderFilters {
  status?: OrderStatus[];
  orderType?: 'delivery' | 'pickup';
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface WebhookPayload {
  event: 'order.created' | 'order.updated' | 'order.cancelled' | 'order.delivered';
  order: GloriaFoodOrder;
  timestamp: string;
  signature?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  burstLimit: number;
}

export interface MenuItem {
  id: number;
  name: string;
  description?: string;
  price: number;
  category: string;
  available: boolean;
  imageUrl?: string;
  modifiers?: MenuModifier[];
  allergens?: string[];
  calories?: number;
}

export interface MenuModifier {
  id: number;
  name: string;
  price: number;
  required: boolean;
  options: MenuModifierOption[];
}

export interface MenuModifierOption {
  id: number;
  name: string;
  price: number;
}

export interface MenuCategory {
  id: number;
  name: string;
  description?: string;
  items: MenuItem[];
  sortOrder: number;
}

export interface MenuResponse {
  categories: MenuCategory[];
  restaurant: {
    id: number;
    name: string;
    description?: string;
  };
  lastUpdated: string;
}
