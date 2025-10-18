/**
 * Database Models and Types
 */

export interface OrderRecord {
  id?: number;
  gloria_food_order_id: number;
  order_number: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state?: string;
  delivery_zip: string;
  delivery_country: string;
  order_total: number;
  order_status: string;
  order_type: string;
  created_at: string;
  updated_at: string;
  gloria_food_data: string; // JSON string
}

export interface DeliveryRecord {
  id?: number;
  order_id: number;
  doordash_delivery_id?: string;
  external_delivery_id: string;
  status: string;
  driver_name?: string;
  driver_phone?: string;
  tracking_url?: string;
  estimated_delivery_time?: string;
  actual_delivery_time?: string;
  created_at: string;
  updated_at: string;
  doordash_data: string; // JSON string
}

export interface WebhookLogRecord {
  id?: number;
  event_type: string;
  gloria_food_order_id?: number;
  doordash_delivery_id?: string;
  payload: string; // JSON string
  processed: boolean;
  error_message?: string;
  created_at: string;
}

export interface DatabaseConfig {
  databasePath: string;
}
