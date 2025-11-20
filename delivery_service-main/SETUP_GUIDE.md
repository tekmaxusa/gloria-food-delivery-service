# 🚀 SIMPLE SETUP GUIDE - GloriaFood to DoorDash Integration

## 📋 Ano ang ginagawa nito?

Ang system na ito ay:
1. **Tumatanggap ng orders** mula sa GloriaFood via webhook
2. **Nag-save ng orders** sa database (SQLite o MySQL)
3. **Nag-send ng delivery orders** sa DoorDash automatically
4. **Nag-display ng order information** sa logs

---

## 🎯 QUICK SETUP SA RENDER (5 Steps)

### Step 1: Upload sa GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Step 2: Create Web Service sa Render
1. Pumunta sa: https://render.com
2. Click "New +" → "Web Service"
3. Connect ang GitHub repository
4. Piliin ang repository

### Step 3: Configure Render Settings

**Basic Settings:**
- **Name:** `gloriafood-webhook` (o kahit anong name)
- **Region:** `Singapore` (o pinakamalapit)
- **Branch:** `main` (o `master`)
- **Root Directory:** `delivery_service-main` (kung nasa subfolder) o iwanan blank (kung nasa root)
- **Runtime:** `Node`
- **Build Command:** `npm install --production=false && npm run build`
- **Start Command:** `npm start`
- **Health Check Path:** `/health`

### Step 4: Add Environment Variables

Click "Add Environment Variable" at i-add ang mga ito:

#### Required (GloriaFood):
```
GLORIAFOOD_API_KEY = your_gloriafood_api_key
GLORIAFOOD_STORE_ID = your_gloriafood_store_id
```

#### Required (DoorDash):
```
DOORDASH_DEVELOPER_ID = your_doordash_developer_id
DOORDASH_KEY_ID = your_doordash_key_id
DOORDASH_SIGNING_SECRET = your_doordash_signing_secret
DOORDASH_SANDBOX = true
DOORDASH_MERCHANT_ID = your_merchant_id (optional)
```

#### Optional:
```
NODE_VERSION = 20.18.0
WEBHOOK_PATH = /webhook
```

#### Database (kung MySQL):
```
DB_TYPE = mysql
DB_HOST = your_mysql_host
DB_PORT = 3306
DB_USER = root
DB_PASSWORD = your_password
DB_NAME = gloriafood_orders
```

### Step 5: Deploy
1. Click "Create Web Service"
2. Hintayin ang deployment (2-3 minutes)
3. Copy ang service URL (halimbawa: `https://gloriafood-webhook-abc123.onrender.com`)

---

## 🔗 Configure GloriaFood Webhook

1. Login sa GloriaFood admin dashboard
2. Pumunta sa: **Settings → Integrations → Webhooks**
3. I-add ang webhook:
   - **Webhook URL:** `https://your-service-url.onrender.com/webhook`
   - **Method:** `POST`
   - **Protocol:** `JSON`
   - **Version:** `v2`
4. Click "Save"

---

## ✅ Verification

### 1. Test Health Endpoint
Pumunta sa browser:
```
https://your-service-url.onrender.com/health
```
Dapat may response: `{"status":"ok"}`

### 2. Check Logs
- Pumunta sa Render Dashboard → Service → Logs
- Dapat makita mo:
  ```
  ✅ Server listening on 0.0.0.0:10000
  ✅ DoorDash API client initialized
  ```

### 3. Test Order
1. I-open ang merchant sa GloriaFood
2. Gumawa ng test order
3. I-accept ang order
4. I-check ang Render logs — dapat may:
   ```
   🔔 WEBHOOK REQUEST DETECTED FROM GLORIAFOOD!
   ✅ Order data extracted successfully from GloriaFood
   🚚 Sending order to DoorDash...
   ✅ Order sent to DoorDash successfully
   ```

---

## 📊 What You'll See in Logs

### Kapag may order:
```
📨 [timestamp] POST /webhook
   🔔 WEBHOOK REQUEST DETECTED FROM GLORIAFOOD!
   ✅ Connected to GloriaFood - Webhook received!

🆕 NEW ORDER #1234567890
  ──────────────────────────────────────────
  👤 CUSTOMER INFORMATION:
    Name: John Doe
    Phone: +1234567890
    Email: john@example.com
  📍 DELIVERY INFORMATION:
    Address: 123 Main St, City, State
  📋 ORDER INFORMATION:
    Total: USD 25.50
    Status: ACCEPTED
    Type: delivery
  🛒 ORDER ITEMS:
    1. Item Name x1 - USD 10.00 (Total: USD 10.00)

🚚 Sending order to DoorDash...
✅ Order sent to DoorDash successfully
   DoorDash Delivery ID: 1234567890
   External Delivery ID: 9876543210
   Status: created
   Tracking URL: https://www.doordash.com/orders/...
```

---

## 🔧 Troubleshooting

### Service "not found" o "can't be reached"
- **Solution:** Hintayin na mag-wake up ang service (Render free tier sleeps after inactivity)
- O i-click ang "Manual Deploy" sa Render dashboard

### Walang orders na natatanggap
- **Check:** Webhook URL sa GloriaFood settings
- **Check:** Merchant status (dapat "Open")
- **Check:** Render logs kung may "WEBHOOK REQUEST DETECTED"

### DoorDash hindi nag-send
- **Check:** DoorDash credentials sa Render environment variables
- **Check:** Logs kung may "✅ DoorDash API client initialized"
- **Check:** Order type (dapat "delivery")

### Customer info "Unknown"
- **Normal:** Kapag walang customer data sa webhook payload
- **Fix:** I-check ang GloriaFood webhook configuration

---

## 📝 Important Notes

1. **Render Free Tier:**
   - Service sleeps after 15 minutes of inactivity
   - First request after sleep takes ~30 seconds
   - Consider upgrading to paid plan for always-on service

2. **Database:**
   - Default: SQLite (file-based, no setup needed)
   - Optional: MySQL (kung may existing database)

3. **DoorDash:**
   - Sandbox mode: `DOORDASH_SANDBOX=true`
   - Production: `DOORDASH_SANDBOX=false` (o i-remove)

4. **Webhook URL:**
   - Gamitin ang actual Render URL, hindi `localhost`
   - Format: `https://your-service-name.onrender.com/webhook`

---

## 🆘 Support

Kung may problema:
1. I-check ang Render logs
2. I-verify ang environment variables
3. I-test ang `/health` endpoint
4. I-check ang GloriaFood webhook settings

---

## ✅ Success Checklist

- [ ] Na-deploy sa Render
- [ ] Health endpoint working (`/health`)
- [ ] DoorDash credentials configured
- [ ] GloriaFood webhook configured
- [ ] Test order successful
- [ ] Orders appearing sa logs
- [ ] DoorDash tracking URL showing

---

**Good luck! 🚀**

