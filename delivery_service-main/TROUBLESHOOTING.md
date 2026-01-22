# 🔧 Troubleshooting Guide

## Problem 1: DoorDash JWT Authentication Error

**Error:** `⚠️ Order #1144283352: Could not get DoorDash status: DoorDash API Error: 401 - {"code":"authentication_error","message":"The JWT is null, empty, or is just whitespaces"}`

### Cause
DoorDash credentials are missing, empty, or incorrect in environment variables.

### Solution

1. **Check Environment Variables in Render:**
   - Go to Render Dashboard → Your Web Service → **Environment** tab
   - Verify these variables are set:
     ```
     DOORDASH_DEVELOPER_ID=your-developer-id
     DOORDASH_KEY_ID=your-key-id
     DOORDASH_SIGNING_SECRET=your-signing-secret
     ```

2. **Verify Credentials in DoorDash Developer Portal:**
   - Go to https://developer.doordash.com/
   - Log in with your DoorDash developer account
   - Navigate to **API Keys** or **Credentials** section
   - Verify:
     - **Developer ID** matches `DOORDASH_DEVELOPER_ID` exactly (no truncation)
     - **Key ID** matches `DOORDASH_KEY_ID` exactly
     - **Signing Secret** matches `DOORDASH_SIGNING_SECRET` exactly
   - **Important:** Key ID must belong to the Developer ID account

3. **Update Environment Variables:**
   - Copy exact values from DoorDash Developer Portal
   - Update in Render Dashboard → Environment tab
   - **No spaces** before or after `=` sign
   - **No quotes** around values

4. **Redeploy:**
   - After updating environment variables, redeploy the service
   - Check logs for: `✅ DoorDash API client initialized successfully`

5. **If DoorDash is Not Needed:**
   - You can leave DoorDash credentials unset
   - The app will work without DoorDash integration
   - Only delivery orders will not be sent to DoorDash

---

## Problem 2: Not Receiving Orders from GloriaFood

**Symptom:** No orders appearing in dashboard, webhook not being called

### Causes & Solutions

#### Cause 1: Webhook URL Not Configured in GloriaFood

**Solution:**
1. Get your webhook URL from Render:
   - Format: `https://your-app.onrender.com/webhook/gloriafood/orders`
   - Or: `https://your-app.onrender.com/webhook` (legacy)

2. Configure in GloriaFood:
   - Go to GloriaFood Admin Dashboard
   - Navigate to **Settings** → **Integrations** → **Custom Integration** or **Webhooks**
   - Paste the webhook URL
   - Save

3. Test:
   - Place a test order
   - Check Render logs for: `🔵 WEBHOOK ENDPOINT CALLED`

#### Cause 2: Merchant Not Added in Integrations Page

**Solution:**
1. Add Merchant:
   - Go to your app → **Integrations** page
   - Click **"Connect Merchant"** or **"Add Merchant"**
   - Fill in:
     - **Merchant Name**: Your restaurant name
     - **Store ID**: From GloriaFood (Settings → Integrations)
     - **GloriaFood API Key**: From GloriaFood (Settings → Integrations)
     - **Master Key**: From GloriaFood (Settings → Integrations)
   - Click **"Connect Merchant"**

2. Verify Store ID:
   - Store ID in your app must **match exactly** with Store ID in GloriaFood
   - Check logs when order is received:
     ```
     📦 Store ID from order: YOUR_STORE_ID
     ```
   - If mismatch, update Store ID in Integrations page

#### Cause 3: Store ID Mismatch

**Solution:**
1. Check Store ID in Order:
   - When order is received, check logs:
     ```
     📦 Store ID from order: abc123
     ⚠️  Merchant not found for store_id: abc123
     ```

2. Update Merchant:
   - Go to Integrations page
   - Find the merchant
   - Update **Store ID** to match exactly (case-sensitive)

#### Cause 4: Webhook URL Not Accessible

**Solution:**
1. Test Webhook URL:
   - Open browser: `https://your-app.onrender.com/webhook/gloriafood/orders`
   - Should see JSON response (not 404)

2. Check Render Logs:
   - Look for: `🔵 WEBHOOK ENDPOINT CALLED`
   - If not appearing, webhook URL might be wrong

3. Verify Webhook Path:
   - Check `render.yaml` or server logs for webhook path
   - Default: `/webhook/gloriafood/orders` or `/webhook`

---

## Verification Steps

### For DoorDash:
1. Check logs for: `✅ DoorDash API client initialized successfully`
2. Check logs for: `Mode: SANDBOX` or `Mode: PRODUCTION`
3. If error appears, check environment variables

### For Orders:
1. Place test order in GloriaFood
2. Check Render logs for: `🔵 WEBHOOK ENDPOINT CALLED`
3. Check logs for: `✅ Order data extracted successfully`
4. Check logs for: `💾 Saving order to database...`
5. Check dashboard - order should appear

---

## Common Issues

### Issue: "Merchant not found for store_id: XXX"

**Solution:**
- Add merchant in Integrations page with exact Store ID
- Store ID is case-sensitive

### Issue: "Webhook secret verification failed"

**Solution:**
- If using webhook secret, ensure it matches in:
  - GloriaFood webhook configuration
  - Merchant settings in Integrations page

### Issue: "Database error while saving order"

**Solution:**
- Check database connection (PostgreSQL)
- Verify `DATABASE_URL` environment variable
- Check database schema is initialized

---

## Getting Help

If issues persist:
1. Check Render logs for error messages
2. Check browser console for frontend errors
3. Verify all environment variables are set correctly
4. Test webhook URL manually (GET request should return JSON)
