# PostgreSQL Setup Guide para sa Render

## 📋 Steps para sa PostgreSQL Database sa Render

### 1. Create PostgreSQL Database sa Render

1. Pumunta sa [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. Piliin ang plan (Free tier available)
4. Piliin ang region (Singapore recommended)
5. I-name ang database (e.g., `gloriafood-orders`)
6. Click **"Create Database"**

### 2. Get Database Connection Details

After ma-create ang database, makikita mo ang connection details:

- **Internal Database URL** (for Render services)
- **External Database URL** (for local development)
- **Host**
- **Port** (usually 5432)
- **Database Name** (e.g., `tekmaxusa/delivery_service` o `delivery_service`)
- **User**
- **Password**

**Note:** Kung ang database name mo ay `tekmaxusa/delivery_service`, check mo sa Render dashboard kung:
- Database name talaga ito (may need to quote sa SQL)
- O kaya schema name: `tekmaxusa`, database: `delivery_service`

### 3. Set Environment Variables sa Web Service

Sa Render Web Service settings, add ang mga environment variables:

**Para sa database name na `tekmaxusa/delivery_service`:**

**Option A: Using DATABASE_URL (Recommended)**
```
DB_TYPE=postgresql
DATABASE_URL=postgresql://your-user:your-password@your-host.onrender.com:5432/tekmaxusa/delivery_service
```

**Option B: Separate Variables**
```
DB_TYPE=postgresql
DB_HOST=your-postgres-host.onrender.com
DB_PORT=5432
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=delivery_service
```

**Important:** Para sa database name na `tekmaxusa/delivery_service`:

1. **Check sa Render Dashboard** - Usually ang actual database name ay walang forward slash
   - Common format: Database name = `delivery_service`
   - User/Schema = `tekmaxusa`

2. **Kung talagang may forward slash ang database name:**
   - Gamitin ang DATABASE_URL format (recommended)
   - O kaya i-quote ang database name: `DB_NAME="tekmaxusa/delivery_service"`

3. **Recommended setup:**
   ```
   DB_TYPE=postgresql
   DB_NAME=delivery_service
   ```
   (Assuming `delivery_service` ang actual database name sa Render)

### 4. Initialize Database Schema

May dalawang paraan:

#### Option A: Using Render Shell (Recommended)

1. Sa Render Dashboard, pumunta sa PostgreSQL database
2. Click **"Connect"** → **"Shell"**
3. Run ang SQL commands:

```sql
-- Copy paste ang contents ng database-postgresql.sql
-- O kaya i-run mo ang file:
\i database-postgresql.sql
```

#### Option B: Using psql (Local)

1. Install PostgreSQL client locally
2. Connect using external URL:
```bash
psql "postgresql://user:password@host:5432/dbname"
```
3. Run ang SQL file:
```sql
\i database-postgresql.sql
```

#### Option C: Using pgAdmin or DBeaver

1. Connect sa database using connection details
2. Open ang `database-postgresql.sql` file
3. Execute ang SQL script

### 5. Verify Database Setup

After ma-run ang schema, verify na naka-create ang tables:

```sql
-- Check tables
\dt

-- Should show:
-- orders
-- users
-- drivers
-- reviews
```

### 6. Update Web Service Configuration

Sa Render Web Service, make sure ang environment variables ay naka-set:

**Required:**
```
DB_TYPE=postgresql
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

**OR separate variables:**
```
DB_TYPE=postgresql
DB_HOST=your-host.onrender.com
DB_PORT=5432
DB_USER=your-user
DB_PASSWORD=your-password
DB_NAME=gloriafood_orders
```

### 7. Deploy!

1. Push ang code sa GitHub
2. Render will automatically:
   - Install dependencies (including `pg` package)
   - Build ang application
   - Start ang server
3. Check ang logs para sa database connection

## 🔍 Verification

After deployment:

1. **Check Health**: `https://your-app.onrender.com/health`
   - Dapat may response na `{"status":"ok"}`

2. **Check Database Connection**:
   - Check ang Render logs
   - Dapat may message na "✅ PostgreSQL connection successful!"

3. **Test Authentication**:
   - Pumunta sa `https://your-app.onrender.com/`
   - Create account
   - Login

## 📝 Database Schema File

Gamitin ang `database-postgresql.sql` file na naka-create na. Ito ay may:

- ✅ `orders` table
- ✅ `users` table (para sa authentication)
- ✅ `drivers` table
- ✅ `reviews` table
- ✅ Indexes para sa performance
- ✅ Triggers para sa `updated_at` timestamp
- ✅ Foreign key constraints

## ⚠️ Important Notes

1. **Free Tier Limitations**:
   - 90 days data retention
   - Limited connections
   - May sleep mode

2. **Connection Pooling**:
   - PostgreSQL adapter ay may connection pooling
   - Max 10 connections by default

3. **Backup**:
   - Render free tier ay may automatic backups
   - Pero recommended na mag-backup manually din

4. **Performance**:
   - PostgreSQL ay mas mabilis kaysa SQLite
   - Better para sa production

## 🐛 Troubleshooting

### Connection Error
```
Error: connect ECONNREFUSED
```
**Solution**: Check ang `DB_HOST` at `DB_PORT`. Make sure accessible ang database.

### Authentication Error
```
Error: password authentication failed
```
**Solution**: Verify ang `DB_PASSWORD` sa environment variables.

### Table Not Found
```
Error: relation "orders" does not exist
```
**Solution**: Run ang `database-postgresql.sql` schema file.

### SSL Required
```
Error: SSL connection required
```
**Solution**: Add `?ssl=true` sa DATABASE_URL o set `DB_SSL=true`

## 🔐 Security

1. **Never commit** database credentials
2. **Use environment variables** only
3. **Enable SSL** for production
4. **Use strong passwords**

## 📦 Package Dependencies

Ang `pg` package ay automatically ma-install during build kasi naka-add na sa `package.json`.

---

**Ready na! 🚀**

After ma-setup ang PostgreSQL database at ma-run ang schema, gagana na ang lahat ng features!

