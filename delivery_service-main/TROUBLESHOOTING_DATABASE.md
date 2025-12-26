# 🔧 Troubleshooting: Database Connection Issues

## ❌ Common Errors

### Error 1: `getaddrinfo ENOTFOUND dpg-xxxxx-a.render.com`

**Meaning:** Hindi ma-resolve ang hostname ng database.

**Solution:**
1. **Gamitin ang DATABASE_URL** (hindi individual variables)
2. **Tiyakin na "Internal Database URL"** ang ginagamit (hindi External)
3. **Check kung may `-pooler`** sa hostname (mas reliable)

**Steps:**
```
1. Pumunta sa Render Dashboard → PostgreSQL Database
2. Hanapin ang "Internal Database URL"
3. Copy ang BUONG connection string
4. I-set sa Web Service environment variables:
   DATABASE_URL=postgresql://user:pass@host:5432/dbname
5. Redeploy
```

### Error 2: `DATABASE_URL` naka-set pero may error pa rin

**Possible Causes:**

#### A. Mali ang format ng URL
**Check:**
- Dapat nagsisimula sa `postgresql://`
- Dapat may username, password, host, port, at database name
- Example: `postgresql://user:password@host:5432/dbname`

#### B. Walang SSL parameter
**Fix:** Add `?sslmode=require` sa dulo ng URL:
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require
```

#### C. Mali ang database name
**Check sa Render Dashboard:**
- Tiyakin ang exact database name
- Kung may forward slash (`tekmaxusa/delivery_service`), i-URL encode: `tekmaxusa%2Fdelivery_service`
- O kaya gamitin ang actual name (usually walang slash)

#### D. Database ay paused o deleted
**Check:**
- Sa Render Dashboard, tiyakin na running ang PostgreSQL database
- Check kung may billing issues (free tier may limits)

### Error 3: `Connection refused` o `ETIMEDOUT`

**Meaning:** Hindi ma-connect sa database server.

**Solutions:**
1. **Gamitin ang Internal Database URL** (hindi External)
2. **Check kung same region** ang database at web service
3. **Try connection pooler** format: `dpg-xxxxx-a-pooler.render.com`

### Error 4: `Authentication failed` o `password authentication failed`

**Meaning:** Mali ang username o password.

**Solution:**
1. **Reset password** sa Render Dashboard
2. **Update DATABASE_URL** with new password
3. **Redeploy** ang web service

## ✅ Step-by-Step Fix

### Step 1: Get Correct Connection String

1. **Pumunta sa Render Dashboard**
2. **Click sa PostgreSQL Database**
3. **Hanapin ang "Internal Database URL"**
   - Ito ang para sa Render services (hindi External)
   - Format: `postgresql://user:password@host:5432/dbname`

### Step 2: Set Environment Variable

1. **Pumunta sa Web Service → Environment**
2. **Add o Update:**
   ```
   DATABASE_URL=postgresql://your-actual-connection-string-here
   ```
3. **Tiyakin:**
   - Walang extra spaces
   - Complete ang connection string
   - May `?sslmode=require` kung kailangan (auto-added by code)

### Step 3: Remove Conflicting Variables (Optional)

Kung may `DATABASE_URL`, puwede mong i-remove ang:
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

(Optional lang - `DATABASE_URL` takes priority)

### Step 4: Redeploy

1. **Save** ang environment variables
2. **Render will auto-restart** ang service
3. **Check logs** - dapat may:
   ```
   Using DATABASE_URL connection string
   ✅ PostgreSQL connection successful!
   ```

## 🔍 Debugging Steps

### Check 1: Verify DATABASE_URL is Set

Sa logs, dapat may:
```
Using DATABASE_URL connection string
```

Kung wala, ibig sabihin hindi naka-set ang `DATABASE_URL`.

### Check 2: Verify URL Format

Sa Render Dashboard, i-verify:
- ✅ Nagsisimula sa `postgresql://`
- ✅ May username at password
- ✅ May hostname (dapat may `-pooler.render.com` o `.render.com`)
- ✅ May port (usually `:5432`)
- ✅ May database name

### Check 3: Test Connection

Puwede mong i-test ang connection string locally:
```bash
psql "postgresql://user:pass@host:5432/dbname?sslmode=require"
```

Kung gumana locally pero hindi sa Render, possible na:
- Hindi Internal Database URL ang ginamit
- May network/firewall issue
- Database ay paused

## 📝 Common DATABASE_URL Formats

### Render PostgreSQL (Internal):
```
postgresql://user:password@dpg-xxxxx-a-pooler.render.com:5432/dbname
```

### With SSL (if needed):
```
postgresql://user:password@dpg-xxxxx-a-pooler.render.com:5432/dbname?sslmode=require
```

### With Database Name na may Slash:
```
postgresql://user:password@host:5432/tekmaxusa%2Fdelivery_service
```
(URL-encoded: `/` becomes `%2F`)

## 🚨 Still Not Working?

1. **Check Render PostgreSQL Dashboard:**
   - Status: Dapat "Available" o "Running"
   - Region: Dapat same sa web service
   - Plan: Check kung may limits

2. **Check Web Service Logs:**
   - Look for error messages
   - Check kung naka-detect ang `DATABASE_URL`
   - Check kung may SSL errors

3. **Try Manual Connection:**
   - Use Render Shell to connect
   - Verify credentials work
   - Check database name

4. **Contact Support:**
   - Render Support (kung database issue)
   - Check documentation

## ✅ Success Indicators

Kapag working na, makikita mo sa logs:
```
🔍 Database Factory:
   DB_TYPE from env: "postgresql"
   ✅ Using PostgreSQL database only

   Using DATABASE_URL connection string
   🔒 SSL enabled for Render PostgreSQL (auto-added sslmode=require)
🔌 Connecting to PostgreSQL database...
   Using DATABASE_URL connection string
   Host: dpg-xxxxx-a-pooler.render.com:5432
   Database: your_database_name
   User: your_username
✅ PostgreSQL connection successful!
✅ Database table initialized successfully!
```

---

**Remember:** Always use `DATABASE_URL` for Render PostgreSQL! It's the most reliable method.

