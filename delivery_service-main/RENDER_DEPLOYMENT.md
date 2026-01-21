# Render Deployment Guide

This project is ready for Render. Current stack highlights:
- Node 20 (see `.nvmrc` and `render.yaml`)
- Webhook-first GloriaFood ingest with scheduled delivery handling and webhook reliability improvements
- PostgreSQL is the supported database (SQLite is local-only; MySQL is no longer used)

## 📋 Prerequisites
1. GitHub repo: `https://github.com/tekmaxusa/gloria-food-delivery-service.git`
2. Render account
3. Render PostgreSQL database (recommended) or any PostgreSQL-compatible instance

## 🚀 Quick Deploy (Render Web Service)
1. Push latest code to `main`.
2. In Render: **New → Web Service → Build & Deploy from a Git repository** and select this repo.
3. Render auto-detects `render.yaml`. If you configure manually, set **Root Directory** to `delivery_service-main`, then use:
   - Environment: `Node`
   - Build: `npm install --production=false && npm run build`
   - Start: `npm start`
   - Node version: `20.18.0`
   - Region: choose **Virginia (US East)** (matches the DB region)
4. Set environment variables (see lists below).
5. Create a PostgreSQL instance on Render and copy its `Internal Database URL`.
6. Run the PostgreSQL schema (`database-postgresql.sql`) on that database.
7. Deploy. Render will build and start the service; health check is `/health`.

## 🌱 Environment Variables
**Core (required)**
```
NODE_ENV=production
```

**GloriaFood (webhook-first, multi-merchant)**
- For webhook-only multi-merchant: merchants add their own keys in the UI, so globals are optional.
- For polling mode (if you decide to poll instead of webhooks): you must set global credentials.
```
# Optional for webhook-only; required if you use polling mode
GLORIAFOOD_API_KEY=your_api_key
GLORIAFOOD_STORE_ID=your_store_id

# Optional default API URL (set if not using the GloriaFood default)
GLORIAFOOD_API_URL=https://your-gloriafood-endpoint
```

**PostgreSQL (required in production)**
_Recommended single URL_
```
DB_TYPE=postgresql
DATABASE_URL=postgresql://user:password@host:5432/dbname
```
_Or separate fields_
```
DB_TYPE=postgresql
DB_HOST=your-host.onrender.com
DB_PORT=5432
DB_USER=your-user
DB_PASSWORD=your-password
DB_NAME=gloriafood_orders   # or your db name
DB_SSL=true                 # recommended for Render
```

**DoorDash (optional; enables delivery + scheduler)**
```
DOORDASH_DEVELOPER_ID=...
DOORDASH_KEY_ID=...
DOORDASH_SIGNING_SECRET=...
DOORDASH_MERCHANT_ID=...
DOORDASH_API_URL=https://openapi.doordash.com   # or sandbox URL
DOORDASH_SANDBOX=true                           # "true" for sandbox
DOORDASH_DELIVERY_BUFFER_MINUTES=30             # minutes before delivery time to dispatch
```

**Email (optional; merchant notifications)**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MERCHANT_EMAIL=merchant@example.com
SMTP_FROM=Delivery Service <no-reply@example.com>
SMTP_SECURE=false
```

**Other optional**
```
GLORIAFOOD_MASTER_KEY=...
POLL_INTERVAL_MS=30000
```

## 🗄️ PostgreSQL Setup on Render - Step by Step

### Step 1: Create PostgreSQL Database sa Render

1. **Pumunta sa Render Dashboard** → https://dashboard.render.com
2. **Click "New +"** (sa top right)
3. **Piliin "PostgreSQL"** sa dropdown
4. **Fill up ang form:**
   - **Name**: `gloriafood-db` (o kahit anong name mo)
   - **Database**: Leave blank (auto-generate) o lagay mo `gloriafood_orders`
   - **User**: Leave blank (auto-generate) o lagay mo `gloriafood_user`
   - **Region**: **Virginia (US East)** - IMPORTANTE: dapat same region sa Web Service mo
   - **PostgreSQL Version**: Latest (14 o 15)
   - **Plan**: Piliin mo (Free tier available)
5. **Click "Create Database"**
6. **Wait 2-3 minutes** para ma-create ang database

### Step 2: Kopyahin ang Database Connection Details

Pag na-create na ang database:

1. **Pumunta sa PostgreSQL database page** (sa Render Dashboard)
2. **Hanapin ang "Connections" section**
3. **Kopyahin ang "Internal Database URL"** - ITO ANG GAGAMITIN MO!
   - Format: `postgresql://user:password@host:5432/dbname`
   - Example: `postgresql://gloriafood_user:abc123@dpg-xxxxx-a.oregon-postgres.render.com:5432/gloriafood_orders`
4. **IMPORTANTE**: Gamitin ang **Internal Database URL** (hindi External), mas mabilis at secure para sa Render services

### Step 3: I-set ang Environment Variables sa Web Service

1. **Pumunta sa Web Service mo** sa Render Dashboard
2. **Click "Environment"** tab (sa left sidebar)
3. **Click "Add Environment Variable"**
4. **Add these variables:**

   **Required:**
   ```
   DB_TYPE=postgresql
   DATABASE_URL=<paste mo yung Internal Database URL na kinopya mo>
   ```

   **Example:**
   ```
   DB_TYPE=postgresql
   DATABASE_URL=postgresql://gloriafood_user:abc123@dpg-xxxxx-a.oregon-postgres.render.com:5432/gloriafood_orders
   ```

5. **Click "Save Changes"**

### Step 4: I-load ang Database Schema (Tables)

1. **Pumunta ulit sa PostgreSQL database page**
2. **Click "Connect"** button (sa top)
3. **Piliin "Shell"** (hindi "psql" o "External Connection")
4. **Sa Shell, i-type:**
   ```sql
   \i database-postgresql.sql
   ```
   - **Note**: Kung hindi gumana ang `\i`, kailangan mo i-upload ang file o copy-paste ang contents
5. **Wait** hanggang matapos ang schema creation
6. **I-verify na naka-create ang tables:**
   ```sql
   \dt
   ```
   - Dapat makita mo: `orders`, `users`, `drivers`, `reviews`, `merchants`, `locations`, etc.

### Step 5: Redeploy ang Web Service

1. **Pumunta sa Web Service page**
2. **Click "Manual Deploy"** → **"Clear build cache & deploy"**
3. **Wait** hanggang matapos ang build at deployment
4. **Check ang logs** - dapat may message na:
   - `✅ PostgreSQL connection successful!` o
   - `🔵 Database Type: PostgreSQL`

### Step 6: I-verify na Gumagana

1. **Pumunta sa Web Service URL**: `https://your-app.onrender.com/health`
2. **Dapat may response**: `{"status":"ok"}`
3. **Check ang Render logs** - dapat walang database connection errors

---

### 🔧 Alternative: Gamitin Separate Variables (kung ayaw mo ng DATABASE_URL)

Kung gusto mo hiwa-hiwalay ang variables:

1. **Sa PostgreSQL database page**, hanapin ang individual details:
   - **Host**: `dpg-xxxxx-a.oregon-postgres.render.com`
   - **Port**: `5432`
   - **Database**: `gloriafood_orders`
   - **User**: `gloriafood_user`
   - **Password**: (makikita mo sa "Show" button)

2. **Add sa Web Service Environment:**
   ```
   DB_TYPE=postgresql
   DB_HOST=dpg-xxxxx-a.oregon-postgres.render.com
   DB_PORT=5432
   DB_USER=gloriafood_user
   DB_PASSWORD=your_password_here
   DB_NAME=gloriafood_orders
   DB_SSL=true
   ```

**Note**: Mas recommended ang `DATABASE_URL` kasi mas simple at mas reliable.

## 🔀 What Render will run (from `render.yaml`)
- Build: `npm install --production=false && npm run build`
- Start: `npm start` (runs `dist/webhook-mode.js`)
- Health check: `/health`
- Region: Virginia (US East) (change in Render UI if needed)
- PORT: Provided by Render; the app should respect `process.env.PORT`.

## ✅ Post-deploy checks
1. `GET /health` → expect `{"status":"ok"}`.
2. Send a test webhook to `/webhook` (or your configured path) with your GloriaFood payload.
3. Verify new orders appear in the DB and UI, and DoorDash dispatch works if creds are set.
4. Check Render logs for:
   - PostgreSQL connection success
   - Webhook processing logs
   - DoorDash scheduling/dispatch (if enabled)

## ⚠️ Notes & Tips
- If you see `ENOENT: package.json not found at /opt/render/project/src/package.json`, set **Root Directory** to `delivery_service-main` (in Render service settings) or rely on the provided `render.yaml` which already sets `rootDir: delivery_service-main`.
- SQLite is only for local dev; use PostgreSQL on Render.
- Prefer `DATABASE_URL` from Render (internal) for simpler SSL handling; `DB_SSL=true` is recommended if you use individual vars.
- If you change dependencies or build output, click **Manual Deploy → Clear cache & deploy** in Render.
- Keep secrets in Render env vars; never commit `.env`.
- Polling mode needs global `GLORIAFOOD_API_KEY/GLORIAFOOD_STORE_ID`; webhook-only multi-merchant can skip them.

## 🐛 Troubleshooting
- **Build fails**: Check Render build logs; ensure Node 20 and dependencies install.
- **DB connection errors**: Confirm `DATABASE_URL`/`DB_*` values; ensure SSL is allowed; rerun schema if tables are missing.
- **Webhook not firing**: Confirm Render URL is configured in GloriaFood; check logs for signature or payload errors.
- **DoorDash errors**: Verify Developer ID/Key ID/Signing Secret match; see `DOORDASH_TROUBLESHOOTING.md`.
- **Port issues**: App must use `process.env.PORT`; do not hardcode 3000 only.

