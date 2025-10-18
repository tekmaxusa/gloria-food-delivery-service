/**
 * DoorDash API Types and Interfaces
 * Based on DoorDash Drive API documentation
 */

export interface DoorDashConfig {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  developerId: string;
  environment: 'sandbox' | 'production';
}

export interface DoorDashCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface DoorDashAddress {
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  lat?: number;
  lng?: number;
}

export interface DoorDashContact {
  name: string;
  phone_number: string;
  email?: string;
}

export interface DoorDashItem {
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface DoorDashDeliveryRequest {
  external_delivery_id: string;
  pickup_address: DoorDashAddress;
  dropoff_address: DoorDashAddress;
  pickup_phone_number: string;
  dropoff_phone_number: string;
  pickup_business_name: string;
  pickup_instructions?: string;
  dropoff_instructions?: string;
  order_value: number;
  tip?: number;
  items: DoorDashItem[];
  estimated_pickup_time?: string;
  estimated_delivery_time?: string;
  contains_alcohol?: boolean;
  requires_id?: boolean;
  signature_required?: boolean;
}

export interface DoorDashDeliveryResponse {
  external_delivery_id: string;
  delivery_id: string;
  status: DoorDashDeliveryStatus;
  pickup_address: DoorDashAddress;
  dropoff_address: DoorDashAddress;
  pickup_phone_number: string;
  dropoff_phone_number: string;
  pickup_business_name: string;
  pickup_instructions?: string;
  dropoff_instructions?: string;
  order_value: number;
  tip?: number;
  items: DoorDashItem[];
  estimated_pickup_time?: string;
  estimated_delivery_time?: string;
  actual_pickup_time?: string;
  actual_delivery_time?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_photo_url?: string;
  vehicle_type?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  vehicle_license_plate?: string;
  tracking_url?: string;
  created_at: string;
  updated_at: string;
}

export type DoorDashDeliveryStatus = 
  | 'pending'
  | 'accepted'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'
  | 'failed';

export interface DoorDashDeliveryUpdate {
  delivery_id: string;
  status: DoorDashDeliveryStatus;
  estimated_pickup_time?: string;
  estimated_delivery_time?: string;
  actual_pickup_time?: string;
  actual_delivery_time?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_photo_url?: string;
  vehicle_type?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  vehicle_license_plate?: string;
  tracking_url?: string;
  notes?: string;
}

export interface DoorDashApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: string[];
}

export interface DoorDashError {
  code: string;
  message: string;
  details?: any;
}

export interface DoorDashAuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface DoorDashDeliveryListResponse {
  deliveries: DoorDashDeliveryResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface DoorDashDeliveryFilters {
  status?: DoorDashDeliveryStatus[];
  external_delivery_id?: string;
  delivery_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export interface DoorDashWebhookPayload {
  event: 'delivery.created' | 'delivery.updated' | 'delivery.cancelled' | 'delivery.completed';
  delivery: DoorDashDeliveryResponse;
  timestamp: string;
  signature?: string;
}

export interface DoorDashRetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
}

export interface DoorDashRateLimitConfig {
  requestsPerMinute: number;
  burstLimit: number;
}
