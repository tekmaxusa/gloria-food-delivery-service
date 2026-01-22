import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

export interface DoorDashConfig {
  developerId: string;
  keyId: string;
  signingSecret: string;
  merchantId?: string;
  apiUrl?: string;
  isSandbox?: boolean;
}

export interface DoorDashOrder {
  external_store_id: string;
  merchant_order_id: string;
  consumer?: {
    first_name: string;
    last_name: string;
    phone_number: string;
    email?: string;
  };
  delivery_address: {
    street_address: string;
    city: string;
    state: string;
    zip_code: string;
    country?: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    merchant_sku?: string;
  }>;
  merchant_supplied_id?: string;
  requested_dropoff_time?: string;
  special_instructions?: string;
  subtotal?: number;
  tax?: number;
  tip?: number;
  total?: number;
}

export interface DoorDashResponse {
  id?: string; // delivery_id
  external_delivery_id?: string;
  status?: string;
  tracking_url?: string;
  raw?: any;
  error?: {
    code: string;
    message: string;
  };
}

// DoorDash Drive delivery payload
export interface DoorDashDriveDelivery {
  external_delivery_id: string; // your order id
  pickup_address: string;
  pickup_phone_number?: string;
  pickup_business_name?: string;
  pickup_instructions?: string;
  pickup_reference_tag?: string;
  dropoff_address?: string; // Either dropoff_address or dropoff_address_components must be set
  dropoff_address_components?: {
    street_address: string;
    city: string;
    state: string;
    zip_code: string;
    country?: string;
  };
  dropoff_phone_number: string;
  dropoff_contact_given_name?: string;
  dropoff_contact_family_name?: string;
  dropoff_instructions?: string;
  order_value?: number; // cents
  tip?: number; // cents
  pickup_time?: string; // ISO8601
  dropoff_time?: string; // ISO8601
}

export class DoorDashClient {
  private axiosInstance: AxiosInstance;
  private config: DoorDashConfig;
  private cachedJwt?: string;
  private jwtExpiry?: number;

  constructor(config: DoorDashConfig) {
    this.config = config;
    
    // Use sandbox or production URL
    // DoorDash Drive base URL
    const baseURL = config.apiUrl || 'https://openapi.doordash.com/drive/v2';

    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add request interceptor for JWT authentication (DoorDash requires JWT)
    this.axiosInstance.interceptors.request.use((config) => {
      try {
        const jwt = this.getJwt();
        if (!jwt || jwt.trim().length === 0) {
          throw new Error('JWT is null, empty, or whitespace. Check DoorDash credentials (DOORDASH_DEVELOPER_ID, DOORDASH_KEY_ID, DOORDASH_SIGNING_SECRET)');
        }
        config.headers.Authorization = `Bearer ${jwt}`;
      } catch (error: any) {
        // Re-throw with more context
        throw new Error(`DoorDash JWT generation failed: ${error.message}. Make sure DOORDASH_DEVELOPER_ID, DOORDASH_KEY_ID, and DOORDASH_SIGNING_SECRET are set in environment variables.`);
      }
      return config;
    });
  }

  // Build a short-lived JWT required by DoorDash
  private getJwt(): string {
    // Validate credentials before building JWT
    if (!this.config.developerId || !this.config.keyId || !this.config.signingSecret) {
      throw new Error('Missing DoorDash credentials: developerId, keyId, and signingSecret are required');
    }

    // Validate credential formats
    if (this.config.developerId.trim().length === 0) {
      throw new Error('DOORDASH_DEVELOPER_ID is empty or invalid');
    }
    if (this.config.keyId.trim().length === 0) {
      throw new Error('DOORDASH_KEY_ID is empty or invalid');
    }
    if (this.config.signingSecret.trim().length === 0) {
      throw new Error('DOORDASH_SIGNING_SECRET is empty or invalid');
    }

    const now = Math.floor(Date.now() / 1000);
    if (this.cachedJwt && this.jwtExpiry && now < this.jwtExpiry - 15) {
      return this.cachedJwt;
    }

    const header = {
      alg: 'HS256',
      typ: 'JWT',
      kid: this.config.keyId.trim(),
      'dd-ver': 'DD-JWT-V1',
    } as const;

    const payload = {
      iss: this.config.developerId.trim(),
      kid: this.config.keyId.trim(), // DoorDash requires kid in payload too
      aud: 'doordash',
      iat: now,
      exp: now + 5 * 60, // 5 minutes
      jti: crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random()}`,
    } as const;

    const base64url = (input: Buffer | string) =>
      Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const unsigned = `${encodedHeader}.${encodedPayload}`;

    const decodeBase64Url = (b64url: string): Buffer => {
      const normalized = b64url.replace(/-/g, '+').replace(/_/g, '/');
      const pad = normalized.length % 4 === 2 ? '==' : normalized.length % 4 === 3 ? '=' : '';
      return Buffer.from(normalized + pad, 'base64');
    };

    const secretKey = decodeBase64Url(this.config.signingSecret);

    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(unsigned)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = `${unsigned}.${signature}`;
    this.cachedJwt = jwt;
    this.jwtExpiry = payload.exp;
    return jwt;
  }

  /**
   * Convert GloriaFood order format to DoorDash format
   */
  convertGloriaFoodOrderToDoorDash(orderData: any, storeId?: string): DoorDashOrder {
    // Extract customer information
    const firstName = orderData.client_first_name || orderData.client?.first_name || '';
    const lastName = orderData.client_last_name || orderData.client?.last_name || '';
    const phone = orderData.client_phone || orderData.client?.phone || '';
    const email = orderData.client_email || orderData.client?.email || '';

    // Extract delivery address
    let streetAddress = '';
    let city = '';
    let state = '';
    let zipCode = '';

    if (orderData.client_address) {
      // Try to parse structured address
      streetAddress = orderData.client_address;
    } else if (orderData.client_address_parts) {
      const parts = orderData.client_address_parts;
      streetAddress = parts.street || parts.address_line_1 || '';
      city = parts.city || '';
      state = parts.state || '';
      zipCode = parts.zip || parts.postal_code || '';
    } else if (orderData.delivery?.address) {
      const addr = orderData.delivery.address;
      streetAddress = addr.street || addr.address_line_1 || '';
      city = addr.city || '';
      state = addr.state || '';
      zipCode = addr.zip || addr.postal_code || '';
    }

    // Extract items
    const items: DoorDashOrder['items'] = [];
    const orderItems = orderData.items || orderData.order_items || [];
    
    orderItems.forEach((item: any) => {
      items.push({
        name: item.name || item.product_name || item.title || 'Unknown Item',
        quantity: item.quantity || 1,
        unit_price: parseFloat(item.price || item.unit_price || item.total_price || 0),
        merchant_sku: item.sku || item.id?.toString(),
      });
    });

    // Calculate totals
    const subtotal = parseFloat(orderData.sub_total_price || orderData.subtotal || '0');
    const tax = parseFloat(orderData.tax_value || orderData.tax || '0');
    const total = parseFloat(orderData.total_price || orderData.total || '0');

    return {
      external_store_id: storeId || orderData.store_id || orderData.restaurant_id || '',
      merchant_order_id: orderData.id?.toString() || orderData.order_id?.toString() || '',
      consumer: {
        first_name: firstName,
        last_name: lastName,
        phone_number: phone,
        ...(email && { email }),
      },
      delivery_address: {
        street_address: streetAddress,
        city: city,
        state: state,
        zip_code: zipCode,
        country: orderData.client_address_parts?.country || 'US',
      },
      items: items,
      merchant_supplied_id: orderData.id?.toString() || orderData.order_id?.toString(),
      special_instructions: orderData.instructions || orderData.notes || orderData.special_instructions,
      subtotal: subtotal || undefined,
      tax: tax || undefined,
      total: total || undefined,
    };
  }

  /**
   * Convert GloriaFood order to DoorDash Drive delivery payload
   */
  convertGloriaFoodToDrive(orderData: any, merchantAddress?: string): DoorDashDriveDelivery {
    const externalId = orderData.id?.toString() || orderData.order_id?.toString() || crypto.randomUUID?.() || `${Date.now()}`;

    // Helper to parse raw_data if it's a JSON string
    let rawDataParsed: any = null;
    if (orderData.raw_data) {
      try {
        rawDataParsed = typeof orderData.raw_data === 'string' 
          ? JSON.parse(orderData.raw_data) 
          : orderData.raw_data;
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Merge raw_data into orderData for easier access
    const mergedData = rawDataParsed ? { ...orderData, ...rawDataParsed } : orderData;

    // Extract pickup address (restaurant/merchant address)
    let pickupAddress = '';
    
    // Try merchant address from database first
    if (merchantAddress && merchantAddress.trim()) {
      pickupAddress = merchantAddress.trim();
    } else {
      // Try various fields for restaurant address
      const pickupParts = [
        mergedData.restaurant_street || mergedData.restaurant?.street || mergedData.merchant_street,
        mergedData.restaurant_city || mergedData.restaurant?.city || mergedData.merchant_city,
        mergedData.restaurant_state || mergedData.restaurant?.state || mergedData.merchant_state,
        mergedData.restaurant_zipcode || mergedData.restaurant?.zipcode || mergedData.restaurant?.zip || mergedData.merchant_zipcode,
        mergedData.restaurant_country || mergedData.restaurant?.country || mergedData.merchant_country || 'US'
      ].filter(Boolean);
      
      pickupAddress = pickupParts.join(', ');
    }

    // Validate pickup address
    if (!pickupAddress || pickupAddress.trim().length < 10) {
      throw new Error(`Invalid pickup address: "${pickupAddress}". Please ensure merchant address is set in Integrations page or order contains restaurant address fields.`);
    }

    // Extract dropoff address (customer delivery address)
    let dropoffStreet = '';
    let dropoffCity = '';
    let dropoffState = '';
    let dropoffZip = '';
    let dropoffCountry = '';

    // Try multiple sources for dropoff address
    if (mergedData.client_address_parts) {
      const parts = mergedData.client_address_parts;
      dropoffStreet = (parts.street || parts.address || parts.address_line_1 || '').toString().trim();
      dropoffCity = (parts.city || parts.locality || '').toString().trim();
      dropoffState = (parts.state || parts.province || parts.region || '').toString().trim();
      dropoffZip = (parts.zip || parts.postal_code || parts.postcode || '').toString().trim();
      dropoffCountry = (parts.country || 'US').toString().trim();
    } else if (mergedData.delivery?.address) {
      const addr = mergedData.delivery.address;
      dropoffStreet = (addr.street || addr.address_line_1 || addr.address || addr.line1 || '').toString().trim();
      dropoffCity = (addr.city || addr.locality || '').toString().trim();
      dropoffState = (addr.state || addr.province || addr.region || '').toString().trim();
      dropoffZip = (addr.zip || addr.postal_code || addr.postcode || '').toString().trim();
      dropoffCountry = (addr.country || 'US').toString().trim();
    } else if (mergedData.delivery) {
      const delivery = mergedData.delivery;
      dropoffStreet = (delivery.street || delivery.address || delivery.address_line_1 || '').toString().trim();
      dropoffCity = (delivery.city || delivery.locality || '').toString().trim();
      dropoffState = (delivery.state || delivery.province || delivery.region || '').toString().trim();
      dropoffZip = (delivery.zip || delivery.postal_code || delivery.postcode || '').toString().trim();
      dropoffCountry = (delivery.country || 'US').toString().trim();
    } else if (mergedData.client_address) {
      // Try to parse a full address string
      const fullAddress = mergedData.client_address.toString().trim();
      dropoffStreet = fullAddress;
      // Try to extract city/state/zip from full address if possible
      const zipMatch = fullAddress.match(/\b(\d{5}(?:-\d{4})?)\b/);
      if (zipMatch) {
        dropoffZip = zipMatch[1];
      }
    } else if (mergedData.delivery_address) {
      dropoffStreet = mergedData.delivery_address.toString().trim();
    }

    // Build dropoff address string
    const dropoffParts = [
      dropoffStreet,
      dropoffCity,
      [dropoffState, dropoffZip].filter(Boolean).join(' '),
      dropoffCountry
    ].filter(Boolean);
    const dropoffAddress = dropoffParts.join(', ');

    // Validate dropoff address
    if (!dropoffAddress || dropoffAddress.trim().length < 10 || !dropoffStreet) {
      throw new Error(`Invalid dropoff address: "${dropoffAddress}". Order must contain valid customer delivery address (client_address_parts or delivery.address).`);
    }

    // Extract customer contact info
    const given = mergedData.client_first_name || mergedData.client?.first_name || '';
    const family = mergedData.client_last_name || mergedData.client?.last_name || '';
    const phone = mergedData.client_phone || mergedData.client?.phone || '';

    const normalizePhone = (raw: string): string => {
      const trimmed = (raw || '').replace(/[^\d+]/g, '');
      // If already E.164, keep it
      if (trimmed.startsWith('+')) return trimmed;
      // Otherwise, return digits only (no country assumption)
      return trimmed;
    };

    // Convert totals to cents if present
    const toCents = (v: any) => {
      const n = parseFloat(v || 0);
      return Number.isFinite(n) ? Math.round(n * 100) : undefined;
    };

    // Build dropoff_address_components as alternative format (DoorDash accepts either dropoff_address or dropoff_address_components)
    // DoorDash prefers dropoff_address_components when we have structured data
    const dropoffAddressComponents = dropoffStreet && dropoffCity && dropoffState && dropoffZip ? {
      street_address: dropoffStreet,
      city: dropoffCity,
      state: dropoffState,
      zip_code: dropoffZip,
      country: dropoffCountry || 'US'
    } : undefined;

    const payload: DoorDashDriveDelivery = {
      external_delivery_id: externalId,
      pickup_address: pickupAddress,
      pickup_phone_number: (mergedData.restaurant_phone || mergedData.restaurant?.phone) ? normalizePhone(mergedData.restaurant_phone || mergedData.restaurant?.phone) : undefined,
      pickup_business_name: mergedData.restaurant_name || mergedData.restaurant?.name || mergedData.merchant_name || undefined,
      dropoff_phone_number: normalizePhone(phone),
      dropoff_contact_given_name: given || undefined,
      dropoff_contact_family_name: family || undefined,
      dropoff_instructions: mergedData.instructions || mergedData.notes || mergedData.special_instructions || undefined,
      order_value: toCents(mergedData.total_price || mergedData.total),
    };

    // Use dropoff_address_components if we have structured data (DoorDash prefers this), otherwise use dropoff_address string
    if (dropoffAddressComponents) {
      payload.dropoff_address_components = dropoffAddressComponents;
    } else {
      // Fallback to string address if we don't have structured components
      payload.dropoff_address = dropoffAddress;
    }

    return payload;
  }

  /**
   * Create a DoorDash Drive delivery
   */
  async createDriveDelivery(payload: DoorDashDriveDelivery): Promise<DoorDashResponse> {
    try {
      const response = await this.axiosInstance.post('/deliveries', payload);
      const data = response.data || {};
      const id = data.delivery_id || data.id || data.support_reference || data.data?.delivery_id;
      const status = data.status || data.delivery_status || data.state || data.data?.status;
      const externalId = data.external_delivery_id || payload.external_delivery_id;
      const tracking = data.tracking_url || data.data?.tracking_url;
      return {
        id,
        external_delivery_id: externalId,
        status,
        tracking_url: tracking,
        raw: data,
      };
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data || {};
        const errorCode = errorData.code || '';
        const errorMessage = errorData.message || JSON.stringify(errorData);

        // Provide helpful error messages for common authentication issues
        if (status === 401) {
          if (errorCode === 'authentication_error' || errorMessage.includes('kid') || errorMessage.includes('iss')) {
            const devId = this.config.developerId || 'NOT SET';
            const keyId = this.config.keyId || 'NOT SET';
            // Show more of the Developer ID to help detect truncation issues
            const devIdPreview = devId !== 'NOT SET' ? (devId.length > 20 ? `${devId.substring(0, 20)}...` : devId) : 'NOT SET';
            const keyIdPreview = keyId !== 'NOT SET' ? (keyId.length > 20 ? `${keyId.substring(0, 20)}...` : keyId) : 'NOT SET';
            
            throw new Error(
              `DoorDash Authentication Error (401): ${errorMessage}\n` +
              `\n` +
              `  This usually means the Key ID (kid) doesn't belong to the Developer ID (iss).\n` +
              `\n` +
              `  Current Configuration:\n` +
              `  - Developer ID: ${devIdPreview} (length: ${devId !== 'NOT SET' ? devId.length : 0} chars)\n` +
              `  - Key ID: ${keyIdPreview} (length: ${keyId !== 'NOT SET' ? keyId.length : 0} chars)\n` +
              `\n` +
              `  Steps to Fix:\n` +
              `  1. Go to https://developer.doordash.com/\n` +
              `  2. Verify your Developer ID matches exactly (check for truncation)\n` +
              `  3. Ensure the Key ID was created by the Developer ID account\n` +
              `  4. Verify DOORDASH_SIGNING_SECRET matches the secret for this Key ID\n` +
              `  5. Update environment variables in Render and redeploy\n` +
              `\n` +
              `  See DOORDASH_TROUBLESHOOTING.md for detailed instructions.\n` +
              `\n` +
              `  Raw API response: ${JSON.stringify(errorData)}`
            );
          }
        }

        throw new Error(
          `DoorDash API Error: ${status} - ${JSON.stringify(errorData)}`
        );
      }
      throw new Error(`DoorDash API Error: ${error.message}`);
    }
  }

  /**
   * Get order status from DoorDash
   */
  async getOrderStatus(idOrExternalId: string): Promise<DoorDashResponse> {
    const key = (idOrExternalId || '').trim();
    if (!key) {
      throw new Error('Missing DoorDash identifier to query status');
    }
    const tryEndpoints = [
      // Delivery ID
      `/deliveries/${encodeURIComponent(key)}`,
      // Correct Drive v2 external id route
      `/deliveries/external_delivery_id/${encodeURIComponent(key)}`,
      // Legacy/alternate path (kept for compatibility)
      `/deliveries/by_external_id/${encodeURIComponent(key)}`,
    ];
    let lastError: any = null;
    for (const path of tryEndpoints) {
      try {
        const response = await this.axiosInstance.get(path);
        const data = response.data || {};
        return {
          id: data.delivery_id || data.id || data.support_reference,
          external_delivery_id: data.external_delivery_id || idOrExternalId,
          status: data.status || data.delivery_status || data.state,
          tracking_url: data.tracking_url,
          raw: data,
        };
      } catch (error: any) {
        lastError = error;
      }
    }
    if (lastError?.response) {
      // Provide a friendlier message for 404 (commonly means delivery not created yet)
      if (lastError.response.status === 404) {
        throw new Error(
          `DoorDash not found (404) for identifier "${key}" — delivery may not exist yet. Raw: ${JSON.stringify(lastError.response.data)}`
        );
      }
      throw new Error(
        `DoorDash API Error: ${lastError.response.status} - ${JSON.stringify(lastError.response.data)}`
      );
    }
    throw new Error(`DoorDash API Error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Cancel an order in DoorDash
   */
  async cancelOrder(merchantOrderId: string, reason?: string): Promise<DoorDashResponse> {
    try {
      const response = await this.axiosInstance.post(`/deliveries/${merchantOrderId}/cancel`, {
        cancellation_reason: reason || 'Restaurant cancellation',
      });

      return {
        id: response.data.id,
        status: response.data.status || 'cancelled',
      };
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `DoorDash API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }
      throw new Error(`DoorDash API Error: ${error.message}`);
    }
  }

  /**
   * Notify DoorDash that order is ready for pickup
   * This will notify the assigned rider
   */
  async notifyReadyForPickup(deliveryId: string): Promise<DoorDashResponse> {
    try {
      // DoorDash API endpoint to update delivery status to ready for pickup
      // Using PATCH to update the delivery status
      const response = await this.axiosInstance.patch(`/deliveries/${deliveryId}`, {
        pickup_ready: true,
        pickup_time: new Date().toISOString(),
      });

      return {
        id: response.data.delivery_id || response.data.id || deliveryId,
        status: response.data.status || 'ready_for_pickup',
        raw: response.data,
      };
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `DoorDash API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }
      throw new Error(`DoorDash API Error: ${error.message}`);
    }
  }

  /**
   * Test connection to DoorDash API by making a lightweight request
   */
  async testConnection(): Promise<boolean> {
    try {
      // First validate JWT can be created
      this.getJwt();
      
      // Make a lightweight API call to validate credentials
      // Try a simple GET request that will validate authentication
      // If credentials are invalid, this will throw with 401
      try {
        // Try to get deliveries list (lightweight call that validates auth)
        // Use validateStatus to accept 200, 401, 403, 404 as valid responses
        const response = await this.axiosInstance.get('/deliveries', {
          params: { limit: 1 },
          validateStatus: (status) => status === 200 || status === 401 || status === 403 || status === 404
        });
        
        // If we get 401, it's definitely an authentication issue
        if (response.status === 401) {
          const errorData = response.data || {};
          const errorMessage = errorData.message || JSON.stringify(errorData);
          throw new Error(
            `DoorDash Authentication Failed: ${errorMessage}\n` +
            `  Your Key ID (${this.config.keyId.substring(0, 8)}...) does not belong to Developer ID (${this.config.developerId.substring(0, 8)}...)\n` +
            `  Please verify in DoorDash Developer Portal: https://developer.doordash.com/`
          );
        }
        
        // 200, 403, or 404 means credentials are valid (403/404 are API permission/not found, not auth issues)
        return true;
      } catch (apiError: any) {
        // If we get 401 in the catch block, it's an authentication issue
        if (apiError.response?.status === 401) {
          const errorData = apiError.response.data || {};
          const errorMessage = errorData.message || JSON.stringify(errorData);
          throw new Error(
            `DoorDash Authentication Failed: ${errorMessage}\n` +
            `  Your Key ID (${this.config.keyId.substring(0, 8)}...) does not belong to Developer ID (${this.config.developerId.substring(0, 8)}...)\n` +
            `  Please verify in DoorDash Developer Portal: https://developer.doordash.com/`
          );
        }
        // For network errors or other issues, re-throw
        if (!apiError.response) {
          throw apiError;
        }
        // For other HTTP errors, credentials might be valid but API call failed
        // This is acceptable for a connection test
        return true;
      }
    } catch (error: any) {
      if (error.message && error.message.includes('DoorDash Authentication Failed')) {
        throw error;
      }
      throw new Error(`DoorDash Connection Test Failed: ${error.message}`);
    }
  }
}

