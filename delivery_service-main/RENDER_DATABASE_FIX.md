# 🔧 URGENT FIX: Render PostgreSQL Connection Error

## ❌ Error You're Seeing

```
Error: getaddrinfo ENOTFOUND dpg-d4giqrp5pdvs738khbqg-a.render.com
```

**This means the hostname cannot be resolved.**

## ✅ SOLUTION: Use DATABASE_URL (REQUIRED)

**Render PostgreSQL REQUIRES using `DATABASE_URL` - individual hostname variables often don't work.**

### Step-by-Step Fix:

1. **Go to Render Dashboard**
   - Navigate to your PostgreSQL database
   - Click on the database name

2. **Find "Internal Database URL"**
   - Look for the connection string that looks like:
     ```
     postgresql://user:password@dpg-xxxxx-a-pooler.render.com:5432/dbname
     ```
   - **IMPORTANT:** Use "Internal Database URL" (NOT External)

3. **Copy the ENTIRE connection string**

4. **Set as Environment Variable in Render Web Service:**
   - Go to your Web Service → Environment
   - Add or update:
     ```
     DATABASE_URL=postgresql://your-user:your-password@dpg-xxxxx-a-pooler.render.com:5432/your-database
     ```
   - **Replace with your actual connection string from step 3**

5. **Remove or keep individual variables (optional):**
   - You can remove `DB_HOST`, `DB_USER`, `DB_PASSWORD`, etc.
   - Or keep them as backup (but `DATABASE_URL` takes priority)

6. **Redeploy your service**
   - Render will automatically restart
   - Check logs - you should see: `✅ PostgreSQL connection successful!`

## 🔍 Why This Happens

Render PostgreSQL databases use:
- **Connection Pooler** (recommended) - format: `dpg-xxxxx-a-pooler.render.com`
- **Direct Connection** (less reliable) - format: `dpg-xxxxx-a.render.com`

The code tries to auto-fix hostnames, but **DATABASE_URL is the most reliable method** because:
- ✅ It includes the correct hostname format
- ✅ It includes SSL settings
- ✅ It's pre-configured by Render
- ✅ It works consistently

## 📝 Example DATABASE_URL Format

```
postgresql://tekmaxusa_delivery_service_user:your-password@dpg-d4giqrp5pdvs738khbqg-a-pooler.render.com:5432/tekmaxusa_delivery_service
```

**Note:** Your actual URL will be different - get it from Render dashboard!

## 🚨 If DATABASE_URL Still Doesn't Work

1. **Check the URL format:**
   - Should start with `postgresql://`
   - Should include username, password, host, port, and database
   - Should use `-pooler.render.com` (not just `.render.com`)

2. **Verify credentials:**
   - Username and password are correct
   - Database name is correct (check in Render dashboard)

3. **Check database status:**
   - Make sure PostgreSQL database is running
   - Check if database was deleted or paused

4. **Try connection pooler manually:**
   - If your URL uses `dpg-xxxxx-a.render.com`, change to `dpg-xxxxx-a-pooler.render.com`
   - Connection pooler is more reliable for Render services

## ✅ Success Indicators

When it's working, you'll see:
```
   Using DATABASE_URL connection string
🔌 Connecting to PostgreSQL database...
✅ PostgreSQL connection successful!
✅ Database table initialized successfully!
```

## 📞 Still Having Issues?

1. Check Render PostgreSQL dashboard for exact connection details
2. Verify environment variables are set correctly
3. Make sure you're using "Internal Database URL" (not External)
4. Check Render service logs for more details

---

**Remember: Always use DATABASE_URL for Render PostgreSQL! It's the most reliable method.**

