import * as dotenv from 'dotenv';
import { IDatabase, Merchant, Location } from './database-factory';
import chalk from 'chalk';

dotenv.config();

export interface MerchantConfig {
  store_id: string;
  merchant_name: string;
  api_key?: string;
  api_url?: string;
  master_key?: string;
  is_active?: boolean;
}

export class MerchantManager {
  private database: IDatabase;
  private merchants: Map<string, Merchant> = new Map();

  constructor(database: IDatabase) {
    this.database = database;
  }

  /**
   * Initialize merchants from environment variables and database
   * Supports both single merchant (backward compatible) and multiple merchants
   * 
   * IMPORTANT: By default, merchants are NOT loaded from .env file
   * Only loads from env vars if AUTO_LOAD_MERCHANTS=true is explicitly set
   * This ensures new accounts start with zero merchants - users add their own via UI
   */
  async initialize(): Promise<void> {
    console.log(chalk.blue('\n🔧 Initializing Merchants...\n'));

    // Check if auto-loading from env vars is enabled
    // DEFAULT: false - merchants from .env are IGNORED unless explicitly enabled
    const autoLoadMerchants = process.env.AUTO_LOAD_MERCHANTS === 'true';
    
    if (autoLoadMerchants) {
      // First, try to load from GLORIAFOOD_MERCHANTS JSON (new multi-merchant format)
      const merchantsJson = process.env.GLORIAFOOD_MERCHANTS;
      if (merchantsJson) {
        try {
          const merchants: MerchantConfig[] = JSON.parse(merchantsJson);
          console.log(chalk.cyan(`   Found ${merchants.length} merchant(s) in GLORIAFOOD_MERCHANTS`));
          
          for (const merchantConfig of merchants) {
            await this.upsertMerchant(merchantConfig);
          }
        } catch (error: any) {
          console.error(chalk.red(`   ❌ Error parsing GLORIAFOOD_MERCHANTS: ${error.message}`));
          console.error(chalk.yellow('   ⚠️  Falling back to single merchant configuration'));
        }
      }

      // Fallback: Load single merchant from old environment variables (backward compatibility)
      const oldStoreId = process.env.GLORIAFOOD_STORE_ID;
      const oldApiKey = process.env.GLORIAFOOD_API_KEY;
      
      if (oldStoreId && oldApiKey && !merchantsJson) {
        console.log(chalk.yellow('   ⚠️  Using legacy single merchant configuration'));
        console.log(chalk.gray('   💡 Tip: Use GLORIAFOOD_MERCHANTS JSON for multiple merchants'));
        
        await this.upsertMerchant({
          store_id: oldStoreId,
          merchant_name: process.env.MERCHANT_NAME || `Merchant ${oldStoreId}`,
          api_key: oldApiKey,
          api_url: process.env.GLORIAFOOD_API_URL,
          master_key: process.env.GLORIAFOOD_MASTER_KEY,
          is_active: true
        });
      }
    } else {
      // Default behavior: DO NOT load merchants from .env
      // This ensures new accounts start fresh with zero merchants
      console.log(chalk.cyan('   ℹ️  Auto-loading merchants from .env is DISABLED (default behavior)'));
      console.log(chalk.gray('   ✅ Merchants from .env file will be IGNORED'));
      console.log(chalk.gray('   ✅ New accounts start with ZERO merchants'));
      console.log(chalk.gray('   💡 Merchants will only be loaded from database (if any exist)'));
      console.log(chalk.gray('   💡 Add new merchants through: Integrations → API Credentials → Add Integration'));
      console.log(chalk.gray('   💡 To enable auto-loading from .env, set AUTO_LOAD_MERCHANTS=true in .env\n'));
    }

    // Don't load merchants at startup - merchants are now per-user
    // They will be loaded on-demand through API endpoints with user context
    console.log(chalk.cyan('   ℹ️  Merchants are now per-user and loaded on-demand'));
    console.log(chalk.gray('   💡 Each user will only see their own merchants'));
    console.log(chalk.gray('   💡 Add merchants through: Integrations → API Credentials → Add Integration\n'));
  }

  /**
   * Upsert a merchant (insert or update)
   */
  private async upsertMerchant(config: MerchantConfig): Promise<void> {
    try {
      const merchant = await this.database.insertOrUpdateMerchant({
        store_id: config.store_id,
        merchant_name: config.merchant_name,
        api_key: config.api_key,
        api_url: config.api_url,
        master_key: config.master_key,
        is_active: config.is_active !== false
      });

      if (merchant) {
        // Use store_id if available, otherwise use merchant id as key
        const key = merchant.store_id || `merchant_${merchant.id}`;
        this.merchants.set(key, merchant);
        console.log(chalk.green(`   ✅ Merchant "${merchant.merchant_name}" (${merchant.store_id || 'no store_id'}) configured`));
      }
    } catch (error: any) {
      console.error(chalk.red(`   ❌ Error upserting merchant ${config.store_id}: ${error.message}`));
    }
  }

  /**
   * Load all active merchants from database
   */
  private async loadMerchantsFromDatabase(): Promise<void> {
    try {
      const merchants = await this.database.getAllMerchants();
      this.merchants.clear();
      
      for (const merchant of merchants) {
        // Use store_id if available, otherwise use merchant id as key
        const key = merchant.store_id || `merchant_${merchant.id}`;
        this.merchants.set(key, merchant);
      }
    } catch (error: any) {
      console.error(chalk.red(`   ❌ Error loading merchants from database: ${error.message}`));
    }
  }

  /**
   * Get all active merchants
   */
  getAllMerchants(): Merchant[] {
    return Array.from(this.merchants.values());
  }

  /**
   * Get merchant by store ID
   * Note: This now finds merchant via location (store_id is in locations table)
   */
  getMerchantByStoreId(storeId: string): Merchant | null {
    // First try in-memory cache
    const cached = this.merchants.get(storeId);
    if (cached) return cached;
    
    // If not in cache, try to find via database (location lookup)
    // This will be handled by database.getMerchantByStoreId which now uses locations
    return null;
  }

  /**
   * Get location by store ID (for finding location from order data)
   */
  async getLocationByStoreId(storeId: string, userId?: number): Promise<Location | null> {
    if (this.database && typeof (this.database as any).getLocationByStoreId === 'function') {
      return await (this.database as any).getLocationByStoreId(storeId, userId);
    }
    return null;
  }

  /**
   * Find location by store ID from order data (tries multiple fields)
   */
  async findLocationForOrder(orderData: any, userId?: number): Promise<Location | null> {
    const storeId = orderData.store_id || 
                   orderData.restaurant_id || 
                   orderData.restaurantId ||
                   orderData.storeId;
    
    if (storeId) {
      return await this.getLocationByStoreId(String(storeId), userId);
    }
    
    return null;
  }

  /**
   * Find merchant by store ID from order data (tries multiple fields)
   * Updated to work with locations
   */
  async findMerchantForOrder(orderData: any, userId?: number): Promise<Merchant | null> {
    const storeId = orderData.store_id || 
                   orderData.restaurant_id || 
                   orderData.restaurantId ||
                   orderData.storeId;
    
    if (storeId && this.database) {
      // Use database method which now handles locations
      return await this.database.getMerchantByStoreId(String(storeId), userId);
    }
    
    return null;
  }

  /**
   * Check if we have any merchants configured
   */
  hasMerchants(): boolean {
    return this.merchants.size > 0;
  }

  /**
   * Reload merchants from database (useful after updates)
   */
  async reload(): Promise<void> {
    await this.loadMerchantsFromDatabase();
  }
}

