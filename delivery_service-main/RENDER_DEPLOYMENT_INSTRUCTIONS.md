# Render Deployment Instructions

## ⚠️ IMPORTANT: Steps to Fix and Deploy

### Step 1: Delete All Merchants from Database

**Option A: Via Render Dashboard (Easiest)**

1. Go to Render Dashboard → Your PostgreSQL Database
2. Click "Connect" or open "Query" tab
3. Run these SQL commands:

```sql
-- Delete all locations first
DELETE FROM locations;

-- Delete all merchants
DELETE FROM merchants;

-- Verify (should return 0)
SELECT COUNT(*) FROM merchants;
SELECT COUNT(*) FROM locations;
```

**Option B: Via psql (if you have access)**

```bash
psql -h <your-db-host> -U <your-db-user> -d <your-db-name>
```

Then run:
```sql
DELETE FROM locations;
DELETE FROM merchants;
```

### Step 2: Deploy Latest Code to Render

1. **Go to Render Dashboard**
   - Navigate to your web service

2. **Check Repository Connection**
   - Settings → Repository
   - Verify it's connected to: `https://github.com/tekmaxusa/gloria-food-delivery-service.git`
   - Branch should be: `main` or `master`

3. **Manual Deploy**
   - Click "Manual Deploy" button
   - Select "Deploy latest commit"
   - Wait for deployment to complete (check build logs)

4. **Verify Deployment**
   - Check build logs for any errors
   - Verify the commit hash matches latest: `69595a6`

### Step 3: Clear Browser Cache

**After deployment completes:**

1. **Hard Refresh Browser**
   - Windows: `Ctrl + Shift + R`
   - Mac: `Cmd + Shift + R`

2. **Or Clear Cache Completely**
   - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
   - Firefox: Settings → Privacy → Clear Data → Cached Web Content

3. **Or Use Incognito/Private Mode**
   - Test in incognito window to bypass cache

### Step 4: Verify Fixes

After deployment and cache clear, test:

1. ✅ **Add Integration** - Should NOT show `editingStoreId` error
2. ✅ **Store ID Input** - Should NOT show pattern regex error  
3. ✅ **Locations Endpoint** - Should NOT return 500 error
4. ✅ **Merchants List** - Should show Store ID (not API URL)

## Current Status

✅ **All fixes committed and pushed:**
- Commit `69595a6` - Delete merchants script
- Commit `c1215eb` - Show Store ID
- Commit `937a05d` - Fix sessionId
- Commit `4f0d6ae` - Fix constant variable error
- Commit `7111693` - Fix regex pattern
- Commit `eaf2a7a` - Fix editingStoreId error

## Troubleshooting

### If still seeing errors after deployment:

1. **Check Render Build Logs**
   - Look for build errors
   - Verify `npm run build` completed successfully

2. **Check Browser Console**
   - Open DevTools (F12)
   - Check for JavaScript errors
   - Verify app.js is loading from new deployment

3. **Check Network Tab**
   - Reload page
   - Check app.js request
   - Verify it's not cached (check response headers)

4. **Force Cache Clear**
   - Add `?v=2` to app.js URL in index.html (temporary)
   - Or use service worker to clear cache

### If merchants deletion fails:

1. Check database connection
2. Verify you have DELETE permissions
3. Check foreign key constraints
4. Try deleting one merchant at a time via UI first

## Next Steps After Deployment

1. ✅ Delete all merchants (via SQL above)
2. ✅ Deploy latest code to Render
3. ✅ Clear browser cache
4. ✅ Test adding new merchant
5. ✅ Verify no errors in console

## Support

If issues persist:
- Check Render deployment logs
- Check browser console for errors
- Verify database connection
- Test in incognito mode
