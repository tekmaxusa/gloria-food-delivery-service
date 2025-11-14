# 🚀 Libreng Permanent Endpoint Setup - Railway.app (Tagalog Guide)

## 🎯 Ano ang gagawin natin?

Magde-deploy tayo ng webhook server sa **Railway.app** para makakuha ng **libreng permanent URL endpoint**. Ito ay 100% FREE at permanent!

---

## ✅ Pre-requisites (Kailangan mo):

1. ✅ GitHub account (mayroon ka na: `tekmaxusa`)
2. ✅ Code mo ay naka-push na sa GitHub (tutulungan kita)
3. ✅ Railway.app account (gagawa tayo)

---

## 📋 Step-by-Step Guide:

### Step 1: I-commit at i-push ang code sa GitHub

**Kung may changes ka pa:**

```powershell
cd "C:\Users\Admin\Downloads\delivery_service-main (1)\delivery_service-main"
git add .
git commit -m "Update: Improved polling mode and added test-connection script"
git push origin master
```

**Kung wala nang changes, skip mo na ito.**

---

### Step 2: Gumawa ng Railway.app Account

1. Pumunta sa: **https://railway.app**
2. Click **"Start a New Project"** o **"Login"**
3. Piliin **"Login with GitHub"**
4. I-authorize ang Railway.app sa GitHub account mo

---

### Step 3: Deploy sa Railway

1. Sa Railway dashboard, click **"New Project"**
2. Piliin **"Deploy from GitHub repo"**
3. I-connect ang GitHub account (kung first time)
4. Piliin ang repository: **`tekmaxusa/gloriafood-webhook`**
5. Click **"Deploy Now"**

**Maghintay ng 2-3 minutes** habang nagde-deploy.

---

### Step 4: Add Environment Variables

Pagkatapos ng deploy, pumunta sa **"Variables"** tab at i-add ang mga sumusunod:

```
GLORIAFOOD_API_KEY=QOdM4SdOPT77oVaMO
GLORIAFOOD_STORE_ID=oGemlbPEfqnqSAEnAQJDc32vAS7lTP8nE
GLORIAFOOD_MASTER_KEY=5YqgFIm4NL1FLgJ1SdJ8RjgPiybXij2T
GLORIAFOOD_API_URL=https://tekmaxllc.com
GLORIAFOOD_CONTACT_EMAIL=yu.jeremiah612@gmail.com

DOORDASH_DEVELOPER_ID=14b18bde-7ac6-44e5-afe9-de8bc32d32b4
DOORDASH_KEY_ID=748ada93-0e4d-432a-b66f-5284e30d8c87
DOORDASH_SIGNING_SECRET=yMLbl1yZVVcyFvWJRIXZJDYTrSXofQvPmc9m9qbC0Ds
DOORDASH_SANDBOX=true

WEBHOOK_PORT=3000
WEBHOOK_PATH=/webhook

DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=gloriafood_orders

PORT=3000
NODE_ENV=production
```

**Important:** 
- I-copy mo lang ang values mula sa `.env` file mo
- Para sa MySQL, kailangan mo ng publicly accessible MySQL database (o gumamit ng Railway MySQL addon)

---

### Step 5: Get Permanent URL

1. Pumunta sa **"Settings"** tab
2. Scroll down sa **"Domains"** section
3. Click **"Generate Domain"** (kung wala pa)
4. Makikita mo ang URL mo, halimbawa: `https://gloriafood-webhook-production.up.railway.app`
5. **Ito na ang permanent URL mo!** ✅

---

### Step 6: Test ang Endpoint

1. Buksan ang browser at pumunta sa: `https://your-app-name.up.railway.app/health`
2. Dapat may response na: `{"status":"ok",...}`
3. Test ang webhook endpoint: `https://your-app-name.up.railway.app/webhook` (GET request)
4. Dapat may response na: `{"message":"Webhook endpoint is active",...}`

---

### Step 7: Update GloriaFood Webhook URL

1. Pumunta sa GloriaFood dashboard
2. Navigate sa **Settings** → **Integrations** → **Webhooks**
3. I-set ang **Webhook URL** sa:
   ```
   https://your-app-name.up.railway.app/webhook
   ```
4. **Protocol:** JSON
5. **Protocol Version:** v2
6. Click **Save**

---

### Step 8: Test ang Webhook

1. Gumawa ng test order sa GloriaFood
2. Check ang Railway logs (sa **"Deployments"** tab → Click sa latest deployment → **"View Logs"**)
3. Dapat makita mo ang order na dumating

---

## 🎉 Tapos na!

Mayroon ka nang:
- ✅ Permanent URL (hindi na magbabago)
- ✅ 100% FREE hosting
- ✅ Auto-deploy mula sa GitHub (kapag may update, auto-deploy)
- ✅ Webhook endpoint na ready na

---

## 🐛 Troubleshooting:

### "Application Error" o "Build Failed"
- Check ang logs sa Railway dashboard
- Verify na lahat ng environment variables ay naka-set
- Check kung may error sa build process

### "Cannot connect to webhook"
- Verify ang URL (dapat may `/webhook` sa dulo)
- Check kung running ang service (green status sa Railway)
- Test ang `/health` endpoint

### "404 Not Found"
- Siguraduhin na `/webhook` ang path
- Check ang `WEBHOOK_PATH` environment variable

### Service Sleeping (Free Tier)
- Normal lang ito sa free tier
- Auto-wake naman pag may request
- Kung gusto mo ng always-on, upgrade sa paid plan (o gumamit ng Fly.io)

---

## 📞 Need Help?

1. Check ang service logs (Railway dashboard → Deployments → View Logs)
2. Test ang health endpoint: `https://your-url.com/health`
3. Test ang webhook: `https://your-url.com/webhook` (GET request)

---

**Good luck! 🚀**

