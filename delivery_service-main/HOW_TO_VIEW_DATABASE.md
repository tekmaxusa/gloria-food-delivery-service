# Paano Makita ang Laman ng Database

## 📊 Option 1: Sa UI (Easiest - Recommended)

### Dashboard
1. Login sa application: `https://your-app.onrender.com/`
2. Pumunta sa **Dashboard** page
3. Makikita mo:
   - Total Orders
   - Active Orders
   - Completed Orders
   - Revenue
   - Recent Orders table

### Orders Page
1. Click **"Orders"** sa navigation
2. Makikita mo ang complete list ng orders:
   - Order Number
   - Customer Name
   - Customer Address
   - Amount
   - Status
   - Order Date
   - At iba pa

### Drivers Page
1. Click **"Drivers"** sa navigation
2. Makikita mo ang lahat ng drivers

### Reviews Page
1. Click **"Reviews"** sa navigation
2. Makikita mo ang lahat ng reviews

## 🔍 Option 2: Using API Endpoints

### View All Orders
```
GET https://your-app.onrender.com/orders
```

**Example Response:**
```json
{
  "success": true,
  "count": 10,
  "orders": [
    {
      "id": 1,
      "gloriafood_order_id": "12345",
      "customer_name": "Juan Dela Cruz",
      "customer_phone": "+63 912 345 6789",
      "customer_email": "juan@example.com",
      "delivery_address": "123 Main St, Manila",
      "total_price": 25.50,
      "currency": "USD",
      "status": "ACCEPTED",
      "order_type": "delivery",
      "created_at": "2024-11-22T10:30:00Z"
    }
  ]
}
```

### View Dashboard Stats
```
GET https://your-app.onrender.com/api/dashboard/stats
```

### View Drivers
```
GET https://your-app.onrender.com/api/drivers
```

### View Reviews
```
GET https://your-app.onrender.com/api/reviews
```

### View Order by ID
```
GET https://your-app.onrender.com/orders/12345
```

### View Statistics
```
GET https://your-app.onrender.com/stats
```

## 🗄️ Option 3: Using Render Database Interface

### Sa Render Dashboard:

1. **Pumunta sa PostgreSQL Database**
   - Render Dashboard → PostgreSQL database
   - Click **"Connect"** → **"Query"** tab

2. **Run SQL Queries:**

```sql
-- View all orders
SELECT * FROM orders ORDER BY created_at DESC;

-- View recent orders (last 24 hours)
SELECT * FROM orders 
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- View orders by status
SELECT * FROM orders WHERE status = 'ACCEPTED';

-- Count orders
SELECT COUNT(*) as total_orders FROM orders;

-- View users
SELECT * FROM users;

-- View drivers
SELECT * FROM drivers;

-- View reviews
SELECT * FROM reviews;
```

3. **View Tables:**
```sql
-- List all tables
\dt

-- View table structure
\d orders
\d users
\d drivers
\d reviews
```

## 💻 Option 4: Using psql (Command Line)

### Connect sa Database:

```bash
# Using DATABASE_URL
psql "postgresql://user:password@host:5432/database_name"

# O kung may external URL from Render
psql "your-external-database-url"
```

### Useful Commands:

```sql
-- Connect to database
\c delivery_service

-- List all tables
\dt

-- View all orders
SELECT * FROM orders;

-- View orders with details
SELECT 
  gloriafood_order_id,
  customer_name,
  customer_phone,
  delivery_address,
  total_price,
  status,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 20;

-- Count orders by status
SELECT status, COUNT(*) as count
FROM orders
GROUP BY status;

-- View recent orders
SELECT * FROM orders
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- View users
SELECT id, email, full_name, role, created_at FROM users;

-- View drivers
SELECT * FROM drivers;

-- View reviews
SELECT * FROM reviews;
```

## 🛠️ Option 5: Using Database Tools

### pgAdmin (Free)
1. Download: https://www.pgadmin.org/
2. Connect using Render database credentials
3. Browse tables visually

### DBeaver (Free)
1. Download: https://dbeaver.io/
2. Create PostgreSQL connection
3. Use Render database credentials
4. Browse and query data

### TablePlus (Paid, pero may free trial)
1. Download: https://tableplus.com/
2. Connect sa PostgreSQL
3. Visual interface para sa data

## 📱 Option 6: Using Browser (Simple View)

### Direct API Access:

1. **Open browser:**
   ```
   https://your-app.onrender.com/orders
   ```

2. **View JSON response** - Makikita mo ang raw data

3. **Use JSON formatter:**
   - Install browser extension (JSON Formatter)
   - O kaya copy-paste sa https://jsonformatter.org/

## 🔐 Option 7: Render Shell

1. **Sa Render Dashboard:**
   - Pumunta sa PostgreSQL database
   - Click **"Connect"** → **"Shell"**

2. **Run commands:**
```sql
-- Connect
\c delivery_service

-- View orders
SELECT * FROM orders;

-- View specific order
SELECT * FROM orders WHERE gloriafood_order_id = '12345';

-- View table structure
\d orders
```

## 📊 Quick Queries para sa Common Tasks

### View All Data:
```sql
-- All orders
SELECT * FROM orders ORDER BY created_at DESC;

-- All users
SELECT * FROM users;

-- All drivers  
SELECT * FROM drivers;

-- All reviews
SELECT * FROM reviews;
```

### Statistics:
```sql
-- Total orders
SELECT COUNT(*) FROM orders;

-- Orders by status
SELECT status, COUNT(*) as count 
FROM orders 
GROUP BY status;

-- Total revenue
SELECT SUM(total_price) as total_revenue FROM orders;

-- Recent orders (last 24h)
SELECT COUNT(*) FROM orders 
WHERE created_at >= NOW() - INTERVAL '24 hours';
```

### Search:
```sql
-- Search by customer name
SELECT * FROM orders 
WHERE customer_name ILIKE '%Juan%';

-- Search by order ID
SELECT * FROM orders 
WHERE gloriafood_order_id = '12345';

-- Search by phone
SELECT * FROM orders 
WHERE customer_phone LIKE '%912%';
```

## 🎯 Recommended: UI Dashboard

**Pinakamadali:** Gamitin ang UI Dashboard
- Login sa application
- Pumunta sa **Dashboard** o **Orders** page
- Makikita mo lahat ng data in real-time
- Auto-refresh every 5 seconds
- May search at filter functionality

## 📝 Notes

1. **Security:** API endpoints ay naka-protect ng authentication
2. **Real-time:** UI ay auto-refresh every 5 seconds
3. **Filter:** Pwede mong i-filter ang orders by status
4. **Search:** May search functionality sa Orders page

---

**Easiest way:** Gamitin ang UI Dashboard! 🚀

Login ka lang at makikita mo na lahat ng data automatically.















