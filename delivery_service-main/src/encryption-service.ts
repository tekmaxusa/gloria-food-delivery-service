/**
 * Encryption Service for Securely Storing API Credentials
 * Uses AES-256-GCM encryption with a master key from environment variables
 */

import * as crypto from 'crypto';

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly SALT_LENGTH = 64; // 512 bits
  private static readonly TAG_LENGTH = 16; // 128 bits
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly ITERATIONS = 100000; // PBKDF2 iterations

  /**
   * Get the master encryption key from environment variable
   * Falls back to a default key if not set (for development only)
   */
  private static getMasterKey(): string {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    
    if (!masterKey) {
      console.warn('⚠️  ENCRYPTION_MASTER_KEY not set in environment variables!');
      console.warn('⚠️  Using default key for development. Set ENCRYPTION_MASTER_KEY in production!');
      // Default key for development (should be changed in production)
      return 'default-dev-key-change-in-production-32chars!!';
    }
    
    if (masterKey.length < 32) {
      throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 characters long');
    }
    
    return masterKey;
  }

  /**
   * Derive a key from the master key using PBKDF2
   */
  private static deriveKey(masterKey: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      masterKey,
      salt,
      this.ITERATIONS,
      this.KEY_LENGTH,
      'sha256'
    );
  }

  /**
   * Encrypt sensitive data (API keys, tokens, etc.)
   * Returns a base64-encoded string containing: salt + iv + tag + encryptedData
   */
  static encrypt(plaintext: string): string {
    if (!plaintext) {
      return '';
    }

    try {
      const masterKey = this.getMasterKey();
      
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.SALT_LENGTH);
      const iv = crypto.randomBytes(this.IV_LENGTH);
      
      // Derive key from master key
      const key = this.deriveKey(masterKey, salt);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
      
      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      // Combine: salt + iv + tag + encrypted data
      const combined = Buffer.concat([salt, iv, tag, encrypted]);
      
      // Return base64 encoded
      return combined.toString('base64');
    } catch (error: any) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data encrypted with encrypt()
   */
  static decrypt(encryptedData: string): string {
    if (!encryptedData) {
      return '';
    }

    try {
      const masterKey = this.getMasterKey();
      
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract components
      const salt = combined.slice(0, this.SALT_LENGTH);
      const iv = combined.slice(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
      const tag = combined.slice(
        this.SALT_LENGTH + this.IV_LENGTH,
        this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH
      );
      const encrypted = combined.slice(this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH);
      
      // Derive key from master key
      const key = this.deriveKey(masterKey, salt);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      
      // Decrypt
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error: any) {
      // If decryption fails, it might be plaintext (for backward compatibility)
      // Check if it looks like encrypted data (base64, long enough)
      if (encryptedData.length > 100 && /^[A-Za-z0-9+/=]+$/.test(encryptedData)) {
        throw new Error(`Decryption failed: ${error.message}. Data may be corrupted or encrypted with a different key.`);
      }
      // Otherwise, assume it's plaintext (for backward compatibility)
      return encryptedData;
    }
  }

  /**
   * Check if a string is encrypted (heuristic check)
   */
  static isEncrypted(data: string): boolean {
    if (!data || data.length < 100) {
      return false;
    }
    
    // Encrypted data should be base64 and long enough
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) {
      return false;
    }
    
    // Try to decrypt - if it fails with a specific error, it's likely encrypted
    try {
      this.decrypt(data);
      return true;
    } catch {
      // If it's not valid base64 or wrong format, assume plaintext
      return false;
    }
  }

  /**
   * Encrypt credentials object
   */
  static encryptCredentials(credentials: {
    apiKey?: string;
    apiUrl?: string;
    masterKey?: string;
    webhookSecret?: string;
  }): {
    apiKey?: string;
    apiUrl?: string;
    masterKey?: string;
    webhookSecret?: string;
  } {
    return {
      apiKey: credentials.apiKey ? this.encrypt(credentials.apiKey) : undefined,
      apiUrl: credentials.apiUrl ? this.encrypt(credentials.apiUrl) : undefined,
      masterKey: credentials.masterKey ? this.encrypt(credentials.masterKey) : undefined,
      webhookSecret: credentials.webhookSecret ? this.encrypt(credentials.webhookSecret) : undefined,
    };
  }

  /**
   * Decrypt credentials object
   */
  static decryptCredentials(encryptedCredentials: {
    apiKey?: string;
    apiUrl?: string;
    masterKey?: string;
    webhookSecret?: string;
  }): {
    apiKey?: string;
    apiUrl?: string;
    masterKey?: string;
    webhookSecret?: string;
  } {
    return {
      apiKey: encryptedCredentials.apiKey ? this.decrypt(encryptedCredentials.apiKey) : undefined,
      apiUrl: encryptedCredentials.apiUrl ? this.decrypt(encryptedCredentials.apiUrl) : undefined,
      masterKey: encryptedCredentials.masterKey ? this.decrypt(encryptedCredentials.masterKey) : undefined,
      webhookSecret: encryptedCredentials.webhookSecret ? this.decrypt(encryptedCredentials.webhookSecret) : undefined,
    };
  }
}
