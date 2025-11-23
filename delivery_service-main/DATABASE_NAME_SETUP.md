# Database Name Setup: tekmaxusa/delivery_service

## 🔍 Understanding Your Database Name

Ang database name mo ay `tekmaxusa/delivery_service`. May ilang possibilities:

### Possibility 1: Database Name = `delivery_service`
**Most Common sa Render**

Sa Render PostgreSQL, usually ang format ay:
- **Database Name**: `delivery_service`
- **User/Owner**: `tekmaxusa`

**Environment Variables:**
```
DB_TYPE=postgresql
DB_NAME=delivery_service
DB_USER=tekmaxusa
DB_PASSWORD=your-password
DB_HOST=your-host.onrender.com
DB_PORT=5432
```

**DATABASE_URL Format:**
```
DATABASE_URL=postgresql://tekmaxusa:password@host:5432/delivery_service
```

### Possibility 2: Database Name = `tekmaxusa_delivery_service`
**With Underscore**

Kung ang actual database name ay may underscore:
```
DB_NAME=tekmaxusa_delivery_service
```

### Possibility 3: Database Name = `"tekmaxusa/delivery_service"` (Quoted)
**Rare - May Forward Slash**

Kung talagang may forward slash, kailangan i-quote:
```
DB_NAME="tekmaxusa/delivery_service"
```

**DATABASE_URL Format:**
```
DATABASE_URL=postgresql://user:password@host:5432/tekmaxusa%2Fdelivery_service
```
(URL-encoded: `/` becomes `%2F`)

## ✅ How to Check Your Actual Database Name

1. **Sa Render Dashboard:**
   - Pumunta sa PostgreSQL database
   - Check ang **"Database Name"** field
   - Usually walang forward slash

2. **Using psql:**
   ```bash
   psql "your-database-url"
   \l
   ```
   (List all databases - makikita mo ang exact name)

3. **Check Connection String:**
   - Sa Render, check ang **Internal Database URL**
   - Format: `postgresql://user:pass@host:port/database_name`
   - Ang `database_name` part ay ang actual database name

## 🚀 Recommended Setup

**Step 1: Check Actual Database Name**
- Sa Render PostgreSQL dashboard, check ang exact database name
- Usually format: `delivery_service` (walang slash)

**Step 2: Set Environment Variables**

Kung ang database name ay `delivery_service`:
```
DB_TYPE=postgresql
DATABASE_URL=postgresql://tekmaxusa:your-password@your-host.onrender.com:5432/delivery_service
```

**OR separate variables:**
```
DB_TYPE=postgresql
DB_HOST=your-host.onrender.com
DB_PORT=5432
DB_USER=tekmaxusa
DB_PASSWORD=your-password
DB_NAME=delivery_service
```

**Step 3: Initialize Schema**

Run ang `database-postgresql.sql`:
```sql
-- Connect sa database
\c delivery_service

-- Run schema
\i database-postgresql.sql
```

## 🔧 Troubleshooting

### Error: "database does not exist"
**Solution:** 
- Check ang exact database name sa Render dashboard
- Make sure walang typo sa `DB_NAME`

### Error: "relation does not exist"
**Solution:**
- Make sure na-run mo ang `database-postgresql.sql`
- Check kung nasa correct database ka: `\c delivery_service`

### Error: "permission denied"
**Solution:**
- Verify ang `DB_USER` at `DB_PASSWORD`
- Make sure ang user ay may access sa database

## 📝 Quick Reference

**Most Likely Setup:**
```
Database Name: delivery_service
User: tekmaxusa
Password: (from Render)
Host: (from Render)
Port: 5432
```

**Environment Variables:**
```
DB_TYPE=postgresql
DB_NAME=delivery_service
DB_USER=tekmaxusa
DB_PASSWORD=your-password-from-render
DB_HOST=your-host.onrender.com
DB_PORT=5432
```

---

**Tip:** Check mo muna sa Render dashboard ang exact database name bago mag-setup ng environment variables! 🎯



