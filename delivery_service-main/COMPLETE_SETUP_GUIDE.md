# Complete Setup Guide: Login, Merchant Connection, Orders & DoorDash

## 📋 Table of Contents
1. [Login to Your Account](#1-login-to-your-account)
2. [Connect Merchant (GloriaFood Integration)](#2-connect-merchant-gloriafood-integration)
3. [Receive Actual Orders](#3-receive-actual-orders)
4. [DoorDash Delivery Rider Integration](#4-doordash-delivery-rider-integration)

---

## 1. Login to Your Account

### Step 1: Access the Application
- Open your browser and go to: `https://gloria-food-delivery-service.onrender.com`
- You'll see the login page

### Step 2: Login Credentials
- **Email**: Your registered email address
- **Password**: Your account password

### Step 3: If You Don't Have an Account
1. Click "Sign Up" or "Create Account" on the login page
2. Fill in:
   - Full Name
   - Email Address
   - Password
3. Click "Sign Up"
4. You'll be automatically logged in after signup

### Step 4: Login
1. Enter your email and password
2. Click "Login"
3. You'll be redirected to the Dashboard

---

## 2. Connect Merchant (GloriaFood Integration)

### Step 1: Go to Integrations Page
- After logging in, click on **"Integrations"** in the sidebar
- Or navigate to: `https://gloria-food-delivery-service.onrender.com/#integrations`

### Step 2: Add Integration
1. Click **"Add Integration"** button
2. Fill in the form:

   **Required Fields:**
   - **Merchant Name**: Your business/restaurant name (e.g., "Sueshero")
   - **Store ID**: Your GloriaFood Store ID (e.g., `oGemlbPEfqnqSAEnAQJDc32vAS7ITP8nE`)
     - This is the **Restaurant Token** from your GloriaFood dashboard
   - **Location Name**: Name of your location (usually same as Merchant Name)

   **Optional Fields:**
   - **Location Address**: Physical address of your restaurant
   - **Location Phone**: Contact phone number
   - **API Key**: Restaurant Key from GloriaFood (optional)
   - **API URL**: GloriaFood API URL (optional, leave empty if unsure)
   - **Master Key**: Master Key from GloriaFood (optional)

3. Check **"Active"** checkbox
4. Click **"Save Integration"**

### Step 3: Configure Webhook in GloriaFood
1. **Copy Webhook URL** from the Integrations page:
   ```
   https://gloria-food-delivery-service.onrender.com/webhook
   ```

2. **Go to GloriaFood Admin Dashboard**:
   - Login to your GloriaFood account
   - Navigate to: **Settings → Integrations/Webhooks** or **Custom Integration**

3. **Configure Webhook**:
   - **Template**: "Push Accepted Orders"
   - **API Type**: "Accepted Orders API"
   - **Protocol**: "JSON"
   - **Protocol version**: "Version 2"
   - **Endpoint URL**: `https://gloria-food-delivery-service.onrender.com/webhook`
   - **Master key**: Your Master Key (e.g., `5YqgFlm4NL1FLgJ1SdJ8RjgPiybXij2T`)
   - **Restaurant Key**: Your Restaurant Key (e.g., `QOdM4SdOPT77oVaMO`)
   - **Restaurant Token**: Your Store ID (e.g., `oGemlbPEfqnqSAEnAQJDc32vAS7ITP8nE`)

4. **Order Settings**:
   - **Order Type**: Check all (Pickup, Delivery, Table reservation, etc.)
   - **Order Status**: Check "Accepted" (and others if needed)
   - **Frequency**: "Send once, when the order is accepted"

5. **Click "Save"** in GloriaFood

---

## 3. Receive Actual Orders

### Step 1: Verify Integration
1. Go to **Integrations** page in your system
2. Verify your merchant is listed and shows **"Active"** status
3. Check that the Store ID matches your GloriaFood Restaurant Token

### Step 2: Test Order Reception
1. **Create a test order** in GloriaFood:
   - Go to your GloriaFood ordering page
   - Place a test order
   - Accept the order in GloriaFood admin

2. **Check your system**:
   - Go to **Dashboard** or **Orders** page
   - You should see the new order appear within a few seconds
   - Order will show:
     - Order number
     - Customer name
     - Delivery address
     - Total amount
     - Status: "PENDING" or "ACCEPTED"

### Step 3: Verify Order Details
- Click on an order to view full details
- Check that all information is correct:
  - Customer information
  - Delivery address
  - Order items
  - Payment method
  - Delivery instructions

---

## 4. DoorDash Delivery Rider Integration

### Step 1: Get DoorDash API Credentials
You need to sign up for DoorDash Drive API:

1. **Go to DoorDash Developer Portal**:
   - Visit: https://developer.doordash.com/
   - Sign up for a developer account
   - Apply for DoorDash Drive API access

2. **Get Your Credentials**:
   - **Developer ID**: Your DoorDash developer account ID
   - **Key ID**: API key identifier
   - **Signing Secret**: Secret key for API authentication
   - **Merchant ID**: Your DoorDash merchant ID (optional but recommended)

### Step 2: Configure DoorDash in Render
1. **Go to Render Dashboard**:
   - Login to https://dashboard.render.com
   - Select your service

2. **Add Environment Variables**:
   - Go to **Environment** tab
   - Add these variables:

   ```
   DOORDASH_DEVELOPER_ID=your_developer_id_here
   DOORDASH_KEY_ID=your_key_id_here
   DOORDASH_SIGNING_SECRET=your_signing_secret_here
   DOORDASH_MERCHANT_ID=your_merchant_id_here (optional)
   DOORDASH_SANDBOX=true (use "true" for testing, "false" for production)
   DOORDASH_API_URL=https://openapi.doordash.com (or sandbox URL)
   ```

3. **Save and Redeploy**:
   - Click "Save Changes"
   - Service will automatically redeploy

### Step 3: Verify DoorDash Integration
1. **Check Logs**:
   - After redeploy, check Render logs
   - Look for: `✅ DoorDash API client initialized successfully`
   - If you see: `⚠️ DoorDash integration disabled`, check your credentials

2. **Test with an Order**:
   - Create a **delivery order** in GloriaFood
   - Accept the order
   - The system will automatically:
     - Send order to DoorDash
     - Assign a delivery driver
     - Track the delivery

### Step 4: Manual Driver Assignment (Optional)
If you want to manually assign a driver to an order:

1. **Go to Orders page**
2. **Find the order** you want to assign
3. **Click "Assign Driver"** button
4. **Confirm** the assignment
5. System will:
   - Send order to DoorDash
   - Automatically assign a driver
   - Show tracking URL

### Step 5: Monitor DoorDash Deliveries
- **Orders page** shows:
  - DoorDash delivery status
  - Driver information (when assigned)
  - Tracking URL (click to track delivery)
  - Estimated delivery time

---

## 🔧 Troubleshooting

### Login Issues
- **"Invalid email or password"**: 
  - Check your credentials
  - Try resetting password (if available)
  - Contact support if account is locked

- **"Cannot connect to server"**:
  - Check if Render service is running
  - Check your internet connection
  - Try refreshing the page

### Merchant Connection Issues
- **Store ID not saving**:
  - Make sure Store ID field is filled
  - Check that Store ID matches GloriaFood Restaurant Token
  - Hard refresh browser (Ctrl+Shift+R)

- **Orders not appearing**:
  - Verify webhook URL in GloriaFood matches: `https://gloria-food-delivery-service.onrender.com/webhook`
  - Check that merchant is "Active" in Integrations page
  - Verify Store ID matches between system and GloriaFood
  - Check Render logs for webhook errors

### DoorDash Issues
- **"DoorDash integration disabled"**:
  - Check environment variables in Render
  - Verify all required credentials are set
  - Check logs for specific error messages

- **Orders not sending to DoorDash**:
  - Verify DoorDash credentials are correct
  - Check that order type is "Delivery" (DoorDash only works for delivery orders)
  - Check Render logs for DoorDash API errors
  - Verify DOORDASH_SANDBOX setting (use "true" for testing)

- **Driver not assigned**:
  - Check DoorDash API response in logs
  - Verify merchant address is correct
  - Check that delivery address is valid
  - Contact DoorDash support if API returns errors

---

## 📞 Support

If you encounter issues:
1. Check Render logs for error messages
2. Verify all credentials are correct
3. Check that all environment variables are set
4. Contact support with:
   - Error messages from logs
   - Steps to reproduce the issue
   - Screenshots if possible

---

## ✅ Checklist

Before going live, verify:

- [ ] Account created and logged in successfully
- [ ] Merchant added with correct Store ID
- [ ] Webhook URL configured in GloriaFood
- [ ] Test order received successfully
- [ ] DoorDash credentials configured (if using DoorDash)
- [ ] DoorDash integration verified in logs
- [ ] Test delivery order sent to DoorDash successfully
- [ ] Driver assigned and tracking working

---

**Last Updated**: January 2025
