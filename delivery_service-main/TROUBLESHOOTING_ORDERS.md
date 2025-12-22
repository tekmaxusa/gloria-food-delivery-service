# Troubleshooting: Orders Not Showing sa UI

## 🔍 Step-by-Step Debugging

### Step 1: Check Webhook Configuration sa GloriaFood

1. **Verify Webhook URL:**
   - Dapat: `https://your-app.onrender.com/webhook`
   - Method: POST
   - Content-Type: application/json

2. **Test Webhook Endpoint:**
   ```
   GET https://your-app.onrender.com/webhook
   ```
   - Dapat may response na "ready to receive webhooks"

### Step 2: Check Render Logs

1. **Pumunta sa Render Dashboard**
2. **Click sa Web Service**
3. **Click "Logs" tab**
4. **Look for:**
   - `🔵 WEBHOOK ENDPOINT CALLED` - Webhook received
   - `✅ Order data extracted` - Order data found
   - `💾 Saving order to database...` - Saving to DB
   - `💾 Database save result: SUCCESS` - Saved successfully

### Step 3: Check Database

**Check kung naka-save ang order:**

**Option A: Using Render Database Query**
```sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;
```

**Option B: Using API**
```
GET https://your-app.onrender.com/orders
```

**Option C: Check UI**
- Login sa application
- Pumunta sa Orders page
- Check kung may orders

### Step 4: Check UI Authentication

1. **Make sure naka-login ka:**
   - Check kung may sessionId sa localStorage
   - Open browser console (F12)
   - Type: `localStorage.getItem('sessionId')`
   - Dapat may value

2. **Check API Response:**
   - Open browser console (F12)
   - Go to Network tab
   - Reload page
   - Click sa `/orders` request
   - Check response - dapat may orders data

### Step 5: Common Issues

#### Issue 1: Webhook Not Configured
**Symptom:** Walang logs sa Render
**Solution:**
- Configure webhook sa GloriaFood settings
- Webhook URL: `https://your-app.onrender.com/webhook`
- Method: POST

#### Issue 2: Webhook Received Pero Walang Data
**Symptom:** May logs pero "Invalid payload"
**Solution:**
- Check GloriaFood webhook format
- May need to adjust `extractOrderData` function
- Check Render logs para sa exact payload format

#### Issue 3: Order Saved Pero Hindi Lumalabas sa UI
**Symptom:** May data sa database pero walang sa UI
**Solution:**
- Check browser console for errors
- Verify authentication (sessionId)
- Check kung naka-refresh ang UI (every 5 seconds)
- Try manual refresh (F5)

#### Issue 4: Authentication Error
**Symptom:** 401 error sa API calls
**Solution:**
- Logout at login ulit
- Check kung valid ang sessionId
- Verify database connection

## 🛠️ Quick Fixes

### Fix 1: Manual Refresh
1. Open UI
2. Press F5 to refresh
3. Check Orders page

### Fix 2: Check Database Directly
```sql
-- Sa Render Database Query
SELECT * FROM orders ORDER BY created_at DESC;
```

### Fix 3: Test Webhook Manually
```bash
# Test webhook endpoint
curl -X POST https://your-app.onrender.com/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test123",
    "customer_name": "Test Customer",
    "total_price": 25.50,
    "status": "ACCEPTED"
  }'
```

### Fix 4: Check Browser Console
1. Open UI
2. Press F12 (Developer Tools)
3. Go to Console tab
4. Look for errors
5. Go to Network tab
6. Check `/orders` request
7. Verify response

## 📋 Checklist

- [ ] Webhook configured sa GloriaFood
- [ ] Webhook URL correct: `https://your-app.onrender.com/webhook`
- [ ] Render logs show webhook received
- [ ] Order saved sa database (check via SQL)
- [ ] UI authenticated (check sessionId)
- [ ] Browser console walang errors
- [ ] Network tab shows successful `/orders` request
- [ ] UI auto-refresh working (every 5 seconds)

## 🔧 Debug Commands

### Check Webhook Endpoint:
```bash
curl https://your-app.onrender.com/webhook
```

### Check Orders API:
```bash
curl https://your-app.onrender.com/orders
```

### Check Database:
```sql
-- Count orders
SELECT COUNT(*) FROM orders;

-- Recent orders
SELECT * FROM orders ORDER BY created_at DESC LIMIT 5;

-- Check if order exists
SELECT * FROM orders WHERE gloriafood_order_id = 'YOUR_ORDER_ID';
```

## 🚨 Emergency Fix: Force UI Refresh

Kung hindi pa rin lumalabas:

1. **Clear Browser Cache:**
   - Press Ctrl+Shift+Delete
   - Clear cache
   - Reload page

2. **Check API Directly:**
   - Open: `https://your-app.onrender.com/orders`
   - Check kung may data

3. **Verify Database:**
   - Run SQL query sa Render
   - Verify na may orders

4. **Check Render Logs:**
   - Look for errors
   - Check webhook reception

## 📞 Next Steps

Kung lahat ng steps ay nagawa na pero hindi pa rin lumalabas:

1. **Check Render Logs** - May errors ba?
2. **Check Database** - Naka-save ba ang order?
3. **Check Browser Console** - May JavaScript errors ba?
4. **Check Network Tab** - Successful ba ang API calls?

---

**Most Common Issue:** Webhook not configured sa GloriaFood o wrong webhook URL.

**Quick Test:** Place test order → Check Render logs → Check database → Check UI














