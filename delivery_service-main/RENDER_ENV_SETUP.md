# 🚀 Environment Variables Setup para sa Render

## ✅ REQUIRED Environment Variables

### 1. Database Configuration (REQUIRED)

**Option A: PostgreSQL (Recommended para sa Render)**

1. **Create PostgreSQL Database sa Render:**
   - Pumunta sa Render Dashboard
   - Click **"New +"** → **"PostgreSQL"**
   - Piliin ang plan (Free tier available)
   - I-name ang database (e.g., `gloriafood-orders`)
   - Click **"Create Database"**

2. **Get Database Connection Details:**
   - Sa PostgreSQL database dashboard, makikita mo ang **"Internal Database URL"**
   - Copy ang buong URL

3. **Set Environment Variables sa Web Service:**
   
   Sa Render Web Service → **Environment** tab, add:
   
   ```
   DB_TYPE=postgresql
   DATABASE_URL=postgresql://user:password@host:5432/database_name
   ```
   
   **OR kung separate variables:**
   ```
   DB_TYPE=postgresql
   DB_HOST=your-postgres-host.onrender.com
   DB_PORT=5432
   DB_USER=your-db-user
   DB_PASSWORD=your-db-password
   DB_NAME=your-database-name
   ```

**Option B: MySQL (Kung may existing MySQL database)**

```
DB_TYPE=mysql
DB_HOST=your-mysql-host
DB_PORT=3306
DB_USER=your-mysql-user
DB_PASSWORD=your-mysql-password
DB_NAME=gloriafood_orders
```

**Option C: SQLite (Default - No setup needed, pero hindi recommended para sa production)**

Walang kailangan i-set, pero hindi recommended para sa Render kasi hindi persistent ang file system.

---

## ⚙️ OPTIONAL Environment Variables

### 2. Application Settings

```
NODE_ENV=production
NODE_VERSION=20.18.0
```

**Note:** `PORT` ay automatic na set ng Render, hindi kailangan i-set manually.

### 3. Webhook Configuration (Optional)

```
WEBHOOK_PATH=/webhook
```

### 4. DoorDash Integration (Optional - kung gagamitin)

```
DOORDASH_DEVELOPER_ID=your-developer-id
DOORDASH_KEY_ID=your-key-id
DOORDASH_SIGNING_SECRET=your-signing-secret
DOORDASH_MERCHANT_ID=your-merchant-id
DOORDASH_SANDBOX=true
DOORDASH_API_URL=https://openapi.doordash.com
```

### 5. Email/SMTP Configuration (Optional - para sa email alerts)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
SMTP_SECURE=false
MERCHANT_EMAIL=merchant@example.com
```

### 6. GloriaFood Merchants (Optional - kung gusto mo auto-load)

**Option A: Multi-merchant (Recommended)**
```
GLORIAFOOD_MERCHANTS=[{"store_id":"123","merchant_name":"Restaurant 1","api_key":"key1","api_url":"https://api.example.com"},{"store_id":"456","merchant_name":"Restaurant 2","api_key":"key2"}]
```

**Option B: Single merchant (Legacy)**
```
GLORIAFOOD_API_KEY=your-api-key
GLORIAFOOD_STORE_ID=your-store-id
```

**Note:** Pwede rin mag-add ng merchants through the UI (Integrations page), kaya optional lang ito.

---

## 📋 Quick Setup Checklist

### Step 1: Create PostgreSQL Database
- [ ] Create PostgreSQL database sa Render
- [ ] Copy ang **Internal Database URL**

### Step 2: Set Environment Variables
- [ ] Pumunta sa Web Service → **Environment** tab
- [ ] Add `DB_TYPE=postgresql`
- [ ] Add `DATABASE_URL=postgresql://...` (from Internal Database URL)
- [ ] Add `NODE_ENV=production` (optional pero recommended)

### Step 3: Initialize Database Schema
- [ ] Pumunta sa PostgreSQL database sa Render Dashboard
- [ ] Click **"Connect"** → **"Query"** tab
- [ ] Copy-paste ang contents ng `database-postgresql.sql`
- [ ] Click **"Run"**

### Step 4: Deploy
- [ ] Push code sa GitHub (already done)
- [ ] Render will automatically deploy
- [ ] Check logs para sa: `✅ PostgreSQL connection successful!`

---

## 🔍 Verification

After ma-deploy, check ang logs:

1. **Database Connection:**
   ```
   ✅ PostgreSQL connection successful!
   ```

2. **Server Started:**
   ```
   ✅ Server listening on port 10000
   ```

3. **Routes Registered:**
   ```
   ✅ API routes setup complete
   ```

---

## ❓ Troubleshooting

### Database Connection Failed

**Check:**
- [ ] `DATABASE_URL` ay correct at complete
- [ ] Database ay naka-create na
- [ ] Schema ay na-run na (tables created)

### 404 Errors

**Check:**
- [ ] Code ay na-push na sa GitHub
- [ ] Build ay successful (check logs)
- [ ] Routes ay na-register (check logs for "✅ API routes setup complete")

### Port Issues

**Note:** Render automatically sets `PORT` environment variable. Hindi kailangan i-set manually.

---

## 📝 Example Complete Environment Variables

Para sa basic setup (PostgreSQL only):

```
DB_TYPE=postgresql
DATABASE_URL=postgresql://user:password@dpg-xxxxx-a.singapore-postgres.render.com:5432/gloriafood_orders
NODE_ENV=production
NODE_VERSION=20.18.0
```

---

## 🎯 Minimum Required Setup

Para lang mapagana ang application, kailangan mo lang:

1. **PostgreSQL Database** (create sa Render)
2. **DATABASE_URL** environment variable
3. **DB_TYPE=postgresql** environment variable

Lahat ng iba ay optional!
