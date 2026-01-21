# Store ID Not Saving - Fix Instructions

## Problem
Store ID shows as "N/A" even when entered in the form.

## Root Cause
The Store ID format `oGemlbPEfqnqSAEnAQJDc32vAS7lTP8nE` contains **uppercase and lowercase letters**, which is valid, but there might be a validation issue.

## Solution Applied
1. ✅ Fixed merchant retrieval logic to properly get store_id after creation
2. ✅ Store ID is now saved to both merchants table (backward compatibility) and locations table

## About Your Store ID

Your Store ID: `oGemlbPEfqnqSAEnAQJDc32vAS7lTP8nE`

**This format is CORRECT** - it's a valid alphanumeric string with mixed case.

## Important Notes

### GLORIAFOOD_STORE_ID Environment Variable
⚠️ **You DON'T need `GLORIAFOOD_STORE_ID` in Render environment variables** if you're adding merchants through the UI.

The `GLORIAFOOD_STORE_ID` environment variable is only used if:
- You want to auto-load merchants from .env file
- You set `AUTO_LOAD_MERCHANTS=true`

**For UI-based merchant management (recommended):**
- Just add merchants through the Integration page
- Store ID will be saved in the database
- No environment variable needed

## Steps to Fix

1. **Delete existing merchant** (if store_id is wrong):
   - Go to Integrations page
   - Delete the merchant with "N/A" store_id

2. **Add new merchant** with correct Store ID:
   - Click "Add Integration"
   - Enter:
     - Merchant Name: `Sueshero`
     - Store ID: `oGemlbPEfqnqSAEnAQJDc32vAS7lTP8nE`
     - Location Name: `Sueshero` (or your location name)
   - Save

3. **Verify Store ID is saved**:
   - After saving, check the merchant list
   - Store ID should show: `oGemlbPEfqnqSAEnAQJDc32vAS7lTP8nE`

4. **Configure Webhook in GloriaFood**:
   - Copy webhook URL from Integrations page
   - Go to GloriaFood Admin Dashboard
   - Settings → Integrations/Webhooks
   - Paste webhook URL
   - Save

## After Fix

The Store ID should now be properly saved and displayed. The system will use this Store ID to match incoming orders from GloriaFood webhooks.
