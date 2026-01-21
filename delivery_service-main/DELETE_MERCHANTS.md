# Delete All Merchants from Database

## Option 1: Using SQL (Recommended for Render)

### Via Render PostgreSQL Dashboard:

1. Go to Render Dashboard
2. Navigate to your PostgreSQL database
3. Click on "Connect" or "Query"
4. Run this SQL command:

```sql
-- Delete all locations first (due to foreign key constraint)
DELETE FROM locations;

-- Delete all merchants
DELETE FROM merchants;

-- Verify deletion
SELECT COUNT(*) FROM merchants;
SELECT COUNT(*) FROM locations;
```

### Via psql command line:

```bash
psql -h <your-db-host> -U <your-db-user> -d <your-db-name>

-- Then run:
DELETE FROM locations;
DELETE FROM merchants;
```

## Option 2: Using TypeScript Script

1. Make sure you have the database connection details in `.env`:
   ```
   DB_HOST=your-host
   DB_PORT=5432
   DB_USER=your-user
   DB_PASSWORD=your-password
   DB_NAME=your-database
   DB_SSL=true
   ```

2. Run the script:
   ```bash
   npx ts-node delete-all-merchants.ts
   ```

## Option 3: Via API (if you have access)

You can delete merchants one by one via the UI or API endpoint:
- `DELETE /merchants/:merchantId`

## Important Notes:

⚠️ **WARNING**: This will permanently delete:
- All merchants
- All locations (cascade delete)
- **Orders will NOT be deleted** (they reference merchants but won't break)

⚠️ **Backup First**: If you want to keep the data, export it first:
```sql
-- Export merchants
COPY merchants TO '/tmp/merchants_backup.csv' WITH CSV HEADER;

-- Export locations
COPY locations TO '/tmp/locations_backup.csv' WITH CSV HEADER;
```

## After Deletion:

1. Restart your Render service
2. Clear browser cache
3. Test adding a new merchant
