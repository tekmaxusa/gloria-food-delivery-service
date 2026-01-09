# Quick Start: PostgreSQL Setup para sa tekmaxusa/delivery_service

## 🚀 Fast Setup Steps

### 1. Environment Variables sa Render Web Service

Add ang mga environment variables na ito sa Render Web Service:

```
DB_TYPE=postgresql
DATABASE_URL=postgresql://your-user:your-password@your-host.onrender.com:5432/tekmaxusa/delivery_service
```

**OR kung separate variables:**

```
DB_TYPE=postgresql
DB_HOST=your-postgres-host.onrender.com
DB_PORT=5432
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=tekmaxusa/delivery_service
```

### 2. Get Connection Details

Sa Render PostgreSQL database dashboard, makikita mo:
- **Internal Database URL** - para sa Render services
- **External Database URL** - para sa local development
- **Host, Port, User, Password, Database Name**

### 3. Initialize Database Schema

**Option A: Using Render Shell (Easiest)**

1. Pumunta sa PostgreSQL database sa Render Dashboard
2. Click **"Connect"** → **"Shell"**
3. Copy-paste ang contents ng `database-postgresql.sql`
4. Press Enter

**Option B: Using psql (Local)**

```bash
# Connect sa database
psql "postgresql://user:password@host:5432/tekmaxusa/delivery_service"

# O kung may external URL:
psql "your-external-database-url"

# Then run ang schema:
\i database-postgresql.sql
```

**Option C: Direct SQL Execution**

1. Sa Render PostgreSQL dashboard, click **"Connect"**
2. Pumunta sa **"Query"** tab
3. Copy-paste ang contents ng `database-postgresql.sql`
4. Click **"Run"**

### 4. Verify Tables Created

After ma-run ang schema, verify:

```sql
-- Check tables
\dt

-- Should show:
-- orders
-- users  
-- drivers
-- reviews
```

### 5. Deploy Web Service

1. Push code sa GitHub
2. Render will automatically:
   - Install `pg` package
   - Build application
   - Connect sa PostgreSQL database
3. Check logs para sa: `✅ PostgreSQL connection successful!`

## 🔍 Verification Checklist

- [ ] Environment variables naka-set
- [ ] Database schema na-run
- [ ] Tables created (orders, users, drivers, reviews)
- [ ] Web service deployed
- [ ] Health check working: `/health`
- [ ] Can create account at login

## 📝 Database Name Notes

Kung ang database name mo ay `tekmaxusa/delivery_service`:

1. **PostgreSQL naming**: Forward slashes ay hindi standard sa database names
2. **Possible formats**:
   - Database: `delivery_service`, Schema: `tekmaxusa`
   - Database: `tekmaxusa_delivery_service` (underscore instead)
   - Quoted name: `"tekmaxusa/delivery_service"`

3. **Check sa Render**: 
   - Sa PostgreSQL dashboard, check ang exact database name
   - Usually format ay: `database_name` (no slashes)

4. **If using schema**:
   ```sql
   -- Set search path
   SET search_path TO tekmaxusa;
   
   -- Then run schema
   \i database-postgresql.sql
   ```

## 🐛 Common Issues

### Issue: "database does not exist"
**Solution**: Check ang exact database name sa Render dashboard. Usually walang forward slash.

### Issue: "relation does not exist"
**Solution**: Make sure na-run mo ang `database-postgresql.sql` schema.

### Issue: "connection refused"
**Solution**: 
- Check ang `DB_HOST` at `DB_PORT`
- Make sure accessible ang database from web service
- Use Internal Database URL para sa Render services

### Issue: "authentication failed"
**Solution**: Verify ang `DB_PASSWORD` sa environment variables.

## ✅ Success Indicators

Kapag successful:
- ✅ Logs show: "✅ PostgreSQL connection successful!"
- ✅ Health endpoint returns: `{"status":"ok"}`
- ✅ Can create user account
- ✅ Can login
- ✅ Dashboard shows data

---

**Ready na! 🚀**

After ma-setup, lahat ng features ay gagana:
- Login/Signup
- Dashboard with real-time stats
- Orders management
- Drivers management
- Reports
- Reviews

























