# Webhook Not Working - Complete Fix Guide

## 🚨 Problem: Walang lumalabas sa logs at UI

Kung walang lumalabas sa logs, ibig sabihin **hindi natatanggap ang webhook** mula sa GloriaFood.

## ✅ Step-by-Step Fix

### Step 1: Verify Server is Running

**Check Render Dashboard:**
1. Pumunta sa Render Dashboard
2. Click sa Web Service
3. Check kung **"Live"** ang status
4. Check **Logs** - dapat may "Server listening" message

**Test Server:**
```
GET https://your-app.onrender.com/health
```
Dapat may response: `{"status":"ok"}`

### Step 2: Test Webhook Endpoint

**Test kung accessible ang webhook:**
```
GET https://your-app.onrender.com/webhook
```
Dapat may response na "ready to receive webhooks"

### Step 3: Configure GloriaFood Webhook

**Important:** Dapat naka-configure ang webhook sa GloriaFood!

1. **Login sa GloriaFood Admin Panel**
2. **Pumunta sa Settings → Integrations → Webhooks**
3. **Add New Webhook:**
   - **URL**: `https://your-app.onrender.com/webhook`
   - **Method**: POST
   - **Content-Type**: application/json
   - **Events**: Order Created, Order Updated (select lahat ng order events)

4. **Save** ang webhook configuration

### Step 4: Test Webhook Manually

**Option A: Using curl**
```bash
curl -X POST https://your-app.onrender.com/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test123",
    "customer_name": "Test Customer",
    "customer_phone": "+1234567890",
    "total_price": 25.50,
    "currency": "USD",
    "status": "ACCEPTED",
    "order_type": "delivery",
    "delivery_address": "123 Test St, Manila"
  }'
```

**Option B: Using Test Endpoint**
```
POST https://your-app.onrender.com/test-webhook
Body: { "test": "data" }
```

### Step 5: Check Render Logs

**After sending test webhook:**
1. Pumunta sa Render Dashboard → Logs
2. Look for:
   - `🔵 WEBHOOK ENDPOINT CALLED` ✅
   - `✅ Order data extracted` ✅
   - `💾 Database save result: SUCCESS` ✅

**Kung walang logs:**
- Webhook URL ay mali
- Server ay hindi running
- Network issue

### Step 6: Verify Database Connection

**Check kung connected ang database:**
```sql
-- Sa Render Database Query
SELECT COUNT(*) FROM orders;
```

**Kung may error:**
- Check environment variables
- Verify database credentials
- Check database connection

### Step 7: Check Webhook Format

**GloriaFood ay may different formats. Check logs para sa exact format:**

Kung may logs pero "Invalid payload":
1. Check Render logs
2. Look for "Raw body" output
3. Adjust `extractOrderData` function kung kailangan

## 🔧 Common Issues

### Issue 1: Webhook Not Configured
**Symptom:** Walang logs sa Render
**Solution:**
- Configure webhook sa GloriaFood
- Verify webhook URL
- Test webhook endpoint

### Issue 2: Wrong Webhook URL
**Symptom:** 404 error o walang response
**Solution:**
- Verify URL: `https://your-app.onrender.com/webhook`
- Check kung may trailing slash
- Test using GET request

### Issue 3: Server Not Running
**Symptom:** Cannot access health endpoint
**Solution:**
- Check Render service status
- Restart service
- Check build logs

### Issue 4: Database Not Connected
**Symptom:** Webhook received pero hindi na-save
**Solution:**
- Check database environment variables
- Verify database connection
- Check database logs

### Issue 5: Wrong Payload Format
**Symptom:** "Invalid payload" sa logs
**Solution:**
- Check Render logs for exact payload
- Adjust `extractOrderData` function
- Contact GloriaFood support for format

## 🧪 Quick Test

### Test 1: Server Health
```bash
curl https://your-app.onrender.com/health
```

### Test 2: Webhook Endpoint
```bash
curl https://your-app.onrender.com/webhook
```

### Test 3: Test Webhook
```bash
curl -X POST https://your-app.onrender.com/test-webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### Test 4: Manual Order
```bash
curl -X POST https://your-app.onrender.com/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "manual123",
    "customer_name": "Manual Test",
    "total_price": 10.00,
    "status": "ACCEPTED"
  }'
```

## 📋 Checklist

- [ ] Server is running (check Render dashboard)
- [ ] Health endpoint working (`/health`)
- [ ] Webhook endpoint accessible (`/webhook` GET)
- [ ] Webhook configured sa GloriaFood
- [ ] Webhook URL correct: `https://your-app.onrender.com/webhook`
- [ ] Database connected (check environment variables)
- [ ] Test webhook sent successfully
- [ ] Render logs show webhook received
- [ ] Order saved sa database
- [ ] UI shows orders (check after 5 seconds)

## 🚀 Most Common Fix

**90% of cases:** Webhook not configured sa GloriaFood!

1. Login sa GloriaFood Admin
2. Go to Settings → Webhooks
3. Add webhook: `https://your-app.onrender.com/webhook`
4. Save
5. Place test order
6. Check Render logs

## 📞 Still Not Working?

1. **Check Render Logs** - May errors ba?
2. **Test Webhook Manually** - Using curl
3. **Check Database** - Connected ba?
4. **Verify URL** - Correct ba ang webhook URL?
5. **Contact Support** - GloriaFood webhook format issue

---

**Remember:** Webhook ay dapat naka-configure sa GloriaFood para mag-work! 🎯



