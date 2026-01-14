import * as dotenv from 'dotenv';
import { IDatabase, Merchant } from './database-factory';
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

    // Load all active merchants from database (always load from database)
    await this.loadMerchantsFromDatabase();

    const merchantCount = this.merchants.size;
    if (merchantCount === 0) {
      console.log(chalk.yellow('   ⚠️  No merchants found in database'));
      console.log(chalk.cyan('   💡 Add your first merchant through the Integrations page'));
      console.log(chalk.gray('   💡 Go to: Integrations → API Credentials → Add Integration\n'));
    } else {
      console.log(chalk.green(`   ✅ Loaded ${merchantCount} active merchant(s) from database\n`));
      this.merchants.forEach((merchant, storeId) => {
        console.log(chalk.gray(`      • ${merchant.merchant_name} (${storeId})`));
      });
      console.log();
    }
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
        this.merchants.set(merchant.store_id, merchant);
        console.log(chalk.green(`   ✅ Merchant "${merchant.merchant_name}" (${merchant.store_id}) configured`));
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
        this.merchants.set(merchant.store_id, merchant);
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
   */
  getMerchantByStoreId(storeId: string): Merchant | null {
    return this.merchants.get(storeId) || null;
  }

  /**
   * Find merchant by store ID from order data (tries multiple fields)
   */
  findMerchantForOrder(orderData: any): Merchant | null {
    const storeId = orderData.store_id || 
                   orderData.restaurant_id || 
                   orderData.restaurantId ||
                   orderData.storeId;
    
    if (storeId) {
      return this.getMerchantByStoreId(String(storeId));
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

