# 🔧 How to Get DATABASE_URL from Render PostgreSQL

## ❌ Problem

You're seeing this error:
```
Error: getaddrinfo ENOTFOUND dpg-d4giqrp5pdvs738khbqg-a.render.com
```

This means the hostname cannot be resolved. **The solution is to use `DATABASE_URL` instead of individual variables.**

---

## ✅ Solution: Use DATABASE_URL

### Step 1: Get Internal Database URL from Render

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click on your PostgreSQL database** (not the web service)
3. **Look for "Connection" section** or **"Connect" button**
4. **Find "Internal Database URL"** - This is what you need!

   It looks like:
   ```
   postgresql://user:password@dpg-xxxxx-a.oregon-postgres.render.com:5432/dbname
   ```

   **Important:** Use **"Internal Database URL"** (for Render services), NOT "External Database URL" (for local dev)

### Step 2: Set DATABASE_URL in Web Service

1. **Go to your Web Service** in Render Dashboard
2. **Click "Environment"** tab
3. **Add new environment variable:**
   - **Key:** `DATABASE_URL`
   - **Value:** Paste the entire Internal Database URL you copied
4. **Save changes**

### Step 3: Remove Individual DB Variables (Optional but Recommended)

If you have these variables set, you can remove them (DATABASE_URL takes precedence):
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

**Keep these:**
- `DB_TYPE=postgresql` (still needed)

### Step 4: Redeploy

After setting `DATABASE_URL`, Render will automatically redeploy your service. Check the logs - you should see:

```
✅ Using DATABASE_URL connection string (recommended for Render)
✅ PostgreSQL connection successful!
```

---

## 🔍 Why This Works

1. **DATABASE_URL includes everything:**
   - Correct hostname (with proper domain)
   - Username and password
   - Database name
   - SSL settings
   - Port number

2. **Render provides the correct format:**
   - Internal Database URL is specifically for Render services
   - It uses the correct hostname format
   - It includes SSL configuration

3. **No guessing:**
   - You don't need to figure out hostname format
   - You don't need to add `.render.com` manually
   - Everything is pre-configured

---

## 📋 Example DATABASE_URL Format

```
postgresql://tekmaxusa_delivery_service_user:your_password@dpg-d4giqrp5pdvs738khbqg-a.oregon-postgres.render.com:5432/tekmaxusa_delivery_service
```

**Breakdown:**
- `postgresql://` - Protocol
- `tekmaxusa_delivery_service_user` - Username
- `your_password` - Password
- `dpg-d4giqrp5pdvs738khbqg-a.oregon-postgres.render.com` - Hostname (with region!)
- `5432` - Port
- `tekmaxusa_delivery_service` - Database name

---

## 🚨 Common Issues

### Issue 1: Can't Find Internal Database URL

**Solution:**
- Look for "Connection" or "Connect" button in PostgreSQL dashboard
- Check "Info" or "Details" tab
- It might be labeled as "Connection String" or "Database URL"

### Issue 2: Using External Database URL

**Problem:** External URL is for local development, not for Render services

**Solution:** Always use **Internal Database URL** for Render web services

### Issue 3: Database Name Has Forward Slash

If your database name is `tekmaxusa/delivery_service`:

**Option A:** Use DATABASE_URL (it handles this automatically)
```
DATABASE_URL=postgresql://user:pass@host:5432/tekmaxusa%2Fdelivery_service
```
(URL-encoded: `/` becomes `%2F`)

**Option B:** Check actual database name in Render - it might be `tekmaxusa_delivery_service` (underscore, not slash)

### Issue 4: Still Getting ENOTFOUND Error

**Check:**
1. ✅ Is DATABASE_URL set correctly? (copy entire string, no extra spaces)
2. ✅ Did you use Internal Database URL? (not External)
3. ✅ Does the database exist? (check Render dashboard)
4. ✅ Is the database in the same region as your web service?

---

## ✅ Verification

After setting DATABASE_URL, check your logs. You should see:

```
✅ Using DATABASE_URL connection string (recommended for Render)
🔌 Connecting to PostgreSQL database...
✅ PostgreSQL connection successful!
✅ Database table initialized successfully!
```

If you see this, **you're all set!** 🎉

---

## 💡 Pro Tips

1. **Always use DATABASE_URL** - It's the most reliable method
2. **Use Internal URL** - For Render services, always use Internal Database URL
3. **Connection Pooler** - For production, consider using connection pooler (better performance)
4. **Keep it secret** - DATABASE_URL contains credentials, don't commit it to git!

---

## 📞 Still Having Issues?

1. **Verify database exists** in Render dashboard
2. **Check database region** - should match your web service region
3. **Verify credentials** - username and password are correct
4. **Check Render status** - database might be paused or deleted

---

**Need more help?** Check:
- `POSTGRESQL_SETUP.md` - Full setup guide
- `RENDER_POSTGRESQL_QUICKSTART.md` - Quick start
- Render Documentation: https://render.com/docs/databases

