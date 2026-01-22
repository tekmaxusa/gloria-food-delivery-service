# GloriaFood Integration Guide

## Overview

This guide explains how to integrate GloriaFood merchants with the delivery management system. The integration allows merchants to receive real-time orders from GloriaFood via webhooks.

## Integration Flow

```
┌─────────────────┐
│   Merchant      │
│  (GloriaFood)   │
└────────┬────────┘
         │
         │ 1. Merchant enters credentials
         │    (API Key, Master Key, Store ID)
         ▼
┌─────────────────┐
│ Integration UI  │
│   (Frontend)     │
└────────┬────────┘
         │
         │ 2. POST /api/integrations/gloriafood/connect
         │    - Encrypts credentials
         │    - Stores in database
         │    - Tests connection
         ▼
┌─────────────────┐
│  Backend API    │
│  (Encryption)    │
└────────┬────────┘
         │
         │ 3. Credentials encrypted with AES-256-GCM
         │    - Uses ENCRYPTION_MASTER_KEY from .env
         │    - Stored in merchants table
         ▼
┌─────────────────┐
│   Database      │
│  (PostgreSQL)    │
└────────┬────────┘
         │
         │ 4. Webhook URL generated
         │    - Format: https://your-domain.com/webhook?merchant_id=X
         │    - Returned to merchant
         ▼
┌─────────────────┐
│  GloriaFood     │
│   Dashboard     │
└────────┬────────┘
         │
         │ 5. Merchant configures webhook in GloriaFood
         │    - Settings → Integrations → Custom Integration
         │    - Enters webhook URL
         │    - Enters Master Key (if required)
         ▼
┌─────────────────┐
│  GloriaFood     │
│   Platform      │
└────────┬────────┘
         │
         │ 6. Order placed → Webhook sent
         │    - POST to /webhook?merchant_id=X
         │    - Includes order data
         ▼
┌─────────────────┐
│  Webhook        │
│   Handler       │
└────────┬────────┘
         │
         │ 7. Verify merchant & decrypt credentials
         │    - Lookup merchant by merchant_id
         │    - Verify webhook secret (if configured)
         │    - Decrypt API credentials
         ▼
┌─────────────────┐
│  Order          │
│  Processing     │
└────────┬────────┘
         │
         │ 8. Save order to database
         │    - Create/update order record
         │    - Link to merchant
         │    - Update last_webhook_received timestamp
         ▼
┌─────────────────┐
│   Dashboard     │
│   (Frontend)     │
└─────────────────┘
```

## Required API Credentials

### 1. API Key (Restaurant Key)
- **Location**: GloriaFood Dashboard → Settings → Integrations
- **Purpose**: Authenticates API requests to GloriaFood
- **Format**: Alphanumeric string (e.g., `QOdM4SdOPT77oVaMO`)
- **Required**: Yes (for API polling, optional for webhooks only)

### 2. Master Key
- **Location**: GloriaFood Dashboard → Settings → Integrations
- **Purpose**: Authenticates webhook requests from GloriaFood
- **Format**: Alphanumeric string (e.g., `5YqgFlm4NL1FLgJ1SdJ8RjgPiybXij2T`)
- **Required**: Yes (for webhook verification)

### 3. Store ID (Restaurant Token)
- **Location**: GloriaFood Dashboard → Settings → Integrations
- **Purpose**: Identifies the specific restaurant/location
- **Format**: Alphanumeric string (e.g., `oGemlbPEfqnqSAEnAQJDc32vAS7ITP8nE`)
- **Required**: Yes

### 4. API URL (Optional)
- **Location**: Custom domain or GloriaFood API endpoint
- **Purpose**: Custom API endpoint URL (if using custom domain)
- **Format**: Full URL (e.g., `https://your-restaurant-domain.com/api`)
- **Required**: No (defaults to GloriaFood API)

## Secure Credential Storage

### Encryption Method
- **Algorithm**: AES-256-GCM (Advanced Encryption Standard)
- **Key Derivation**: PBKDF2 with SHA-256 (100,000 iterations)
- **Salt**: 64 bytes (random per encryption)
- **IV**: 16 bytes (random per encryption)
- **Authentication Tag**: 16 bytes (GCM authentication)

### Master Key Configuration
1. Generate a secure master key (minimum 32 characters):
   ```bash
   # Generate a secure key
   openssl rand -base64 32
   ```

2. Add to `.env` file:
   ```env
   ENCRYPTION_MASTER_KEY=your-generated-master-key-here
   ```

3. **Important**: 
   - Never commit the master key to version control
   - Store securely (use environment variables or secret management)
   - Rotate periodically for enhanced security

### Database Storage
- Credentials are encrypted before storage
- `credentials_encrypted` flag indicates encryption status
- Decryption happens automatically when credentials are needed
- Backward compatibility: Plaintext credentials are supported (auto-detected)

## Webhook Configuration

### Webhook URL Format
```
https://your-domain.com/webhook?merchant_id={MERCHANT_ID}
```

### Webhook Security
1. **Merchant ID Verification**: Webhook includes `merchant_id` in query params
2. **Webhook Secret** (Optional): Additional verification layer
   - Generated automatically or set manually
   - Sent in `X-Webhook-Secret` header
   - Verified against stored secret

### GloriaFood Webhook Setup Steps

1. **Get Webhook URL**
   - After connecting merchant, copy the webhook URL from integration status
   - Format: `https://your-domain.com/webhook?merchant_id=123`

2. **Configure in GloriaFood Dashboard**
   - Log in to GloriaFood Dashboard
   - Navigate to: **Settings → Integrations**
   - Click: **Add Integration → Custom Integration**

3. **Enter Webhook Details**
   - **Endpoint URL**: Paste the webhook URL
   - **Master Key**: Enter the Master Key (if required)
   - **Order Type**: Select which orders to receive (Delivery, Pickup, etc.)
   - **Order Status**: Select statuses to trigger webhooks
   - **Frequency**: Choose "Send every time an order is updated"

4. **Test the Integration**
   - Place a test order in GloriaFood
   - Check the Orders page in the delivery system
   - Verify order appears within seconds

## API Endpoints

### Connect Integration
```http
POST /api/integrations/gloriafood/connect
Content-Type: application/json

{
  "merchant_id": 123,
  "api_key": "your-api-key",
  "api_url": "https://your-domain.com/api",
  "master_key": "your-master-key",
  "store_id": "your-store-id",
  "webhook_secret": "optional-webhook-secret"
}
```

**Response:**
```json
{
  "success": true,
  "merchant": { ... },
  "test_result": {
    "success": true,
    "message": "Connection test successful"
  },
  "instructions": {
    "webhook_url": "https://...",
    "steps": [ ... ]
  }
}
```

### Test Connection
```http
POST /api/integrations/gloriafood/test
Content-Type: application/json

{
  "merchant_id": 123
}
```

### Get Integration Status
```http
GET /api/integrations/gloriafood/:merchantId
```

### Update Integration
```http
PUT /api/integrations/gloriafood/:merchantId
Content-Type: application/json

{
  "api_key": "new-api-key",
  "master_key": "new-master-key"
}
```

### Disconnect Integration
```http
DELETE /api/integrations/gloriafood/:merchantId
```

## Database Schema

### Merchants Table (New Fields)
```sql
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS:
  - webhook_secret VARCHAR(500)        -- Webhook verification secret
  - webhook_url TEXT                   -- Generated webhook URL
  - integration_status VARCHAR(50)    -- 'connected', 'disconnected', 'error', 'testing'
  - last_webhook_received TIMESTAMP   -- Last webhook received timestamp
  - credentials_encrypted BOOLEAN      -- Whether credentials are encrypted
  - integration_error TEXT            -- Error message if integration failed
```

## Troubleshooting

### Connection Test Fails
1. **Check API Credentials**
   - Verify API Key is correct
   - Verify Store ID matches GloriaFood dashboard
   - Check API URL if using custom domain

2. **Check Network**
   - Ensure server can reach GloriaFood API
   - Check firewall rules
   - Verify SSL certificates

3. **Check Logs**
   - Review server logs for detailed error messages
   - Check database connection
   - Verify encryption key is set

### Webhooks Not Received
1. **Verify Webhook URL**
   - Check URL is correctly configured in GloriaFood
   - Ensure `merchant_id` parameter is included
   - Test URL accessibility (should return 200)

2. **Check Webhook Secret**
   - Verify secret matches in both systems
   - Check `X-Webhook-Secret` header

3. **Check Merchant Status**
   - Verify `integration_status` is 'connected'
   - Check `last_webhook_received` timestamp
   - Review `integration_error` field

4. **Test Webhook Manually**
   ```bash
   curl -X POST https://your-domain.com/webhook?merchant_id=123 \
     -H "Content-Type: application/json" \
     -d '{"order": {...}}'
   ```

### Orders Not Appearing
1. **Check Order Processing**
   - Verify webhook is being received (check logs)
   - Check database for saved orders
   - Review order processing logic

2. **Check Merchant Matching**
   - Verify `store_id` matches between order and merchant
   - Check location configuration
   - Review merchant lookup logic

## Security Best Practices

1. **Encryption Key Management**
   - Use strong, randomly generated keys
   - Store in environment variables (never in code)
   - Rotate keys periodically
   - Use different keys for different environments

2. **Webhook Security**
   - Always verify webhook source
   - Use webhook secrets for additional security
   - Implement rate limiting
   - Log all webhook attempts

3. **Credential Handling**
   - Never log credentials in plaintext
   - Use HTTPS for all API communications
   - Implement proper access controls
   - Regular security audits

4. **Database Security**
   - Use encrypted connections (SSL)
   - Implement proper access controls
   - Regular backups
   - Monitor for suspicious activity

## Support

For issues or questions:
1. Check this documentation
2. Review server logs
3. Test connection using API endpoints
4. Contact support with:
   - Merchant ID
   - Error messages
   - Timestamp of issue
   - Steps to reproduce
