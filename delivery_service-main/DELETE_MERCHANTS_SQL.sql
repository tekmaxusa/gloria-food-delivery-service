-- SQL Commands to Delete All Merchants from Database
-- Run this in Render PostgreSQL Dashboard or psql

-- Step 1: Check current merchants
SELECT id, merchant_name, store_id, user_id, is_active, created_at 
FROM merchants 
ORDER BY id;

-- Step 2: Check locations
SELECT id, merchant_id, location_name, store_id 
FROM locations 
ORDER BY merchant_id;

-- Step 3: Delete all locations first (due to foreign key constraint)
DELETE FROM locations;

-- Step 4: Delete all merchants
DELETE FROM merchants;

-- Step 5: Verify deletion (should return 0)
SELECT COUNT(*) as remaining_merchants FROM merchants;
SELECT COUNT(*) as remaining_locations FROM locations;

-- Optional: Delete merchants by user_id (if you want to delete only specific user's merchants)
-- DELETE FROM locations WHERE merchant_id IN (SELECT id FROM merchants WHERE user_id = 1);
-- DELETE FROM merchants WHERE user_id = 1;
