# 🆓 Libreng Permanent Endpoint Setup (Tagalog Guide)

## 🎯 Ano ang kailangan mo?

Gusto mo ng **LIBRENG permanent endpoint** para sa GloriaFood webhook mo na hindi na magbabago ang URL. Mayroon kang **3 options** na 100% FREE:

1. **Railway.app** ⭐ PINAKA RECOMMENDED - Pinakamadali
2. **Render.com** - Alternative sa Railway
3. **Fly.io** - Always-on (hindi natutulog)

---

## 🚀 Option 1: Railway.app (PINAKA RECOMMENDED)

### Bakit Railway?
- ✅ 100% FREE (may $5 credit monthly)
- ✅ Permanent URL (hindi nagbabago)
- ✅ Auto-deploy mula sa GitHub
- ✅ Walang domain kailangan
- ✅ Pinakamadaling setup

### Step-by-Step:

#### Step 1: Push sa GitHub
```powershell
# Sa terminal, pumunta sa project folder
cd delivery_service-main

# Initialize git (kung wala pa)
git init

# Add lahat ng files
git add .

# Commit
git commit -m "Initial commit - ready for deployment"

# Push sa GitHub (kailangan mo ng GitHub account)
# Palitan ang URL ng repository mo
git remote add origin https://github.com/yourusername/gloriafood-webhook.git
git branch -M main
git push -u origin main
```

**Note:** Kung wala ka pang GitHub account, gumawa muna sa https://github.com

#### Step 2: Deploy sa Railway
1. Pumunta sa: **https://railway.app**
2. Click **"Start a New Project"** o **"New Project"**
3. Piliin **"Deploy from GitHub repo"**
4. I-connect ang GitHub account mo (kung first time)
5. Piliin ang repository mo (`gloriafood-webhook` o kung ano man ang pangalan)
6. Click **"Deploy Now"**

#### Step 3: Add Environment Variables
Sa Railway dashboard:
1. Click sa project mo
2. Pumunta sa **"Variables"** tab
3. I-add ang mga sumusunod:

```
GLORIAFOOD_API_KEY=your_api_key_here
GLORIAFOOD_STORE_ID=your_store_id_here
WEBHOOK_PORT=3000
WEBHOOK_PATH=/webhook
DATABASE_PATH=./orders.db
```

**Para sa MySQL/XAMPP:**
```
DB_TYPE=mysql
DB_HOST=your_mysql_host
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=gloriafood_orders
```

#### Step 4: Get Permanent URL
1. Pagkatapos ng deploy, pumunta sa **"Settings"** tab
2. Sa **"Domains"** section, makikita mo ang URL mo
3. Halimbawa: `https://gloriafood-webhook-production.up.railway.app`
4. **Ito na ang permanent URL mo!** ✅

#### Step 5: Update GloriaFood
1. Pumunta sa GloriaFood dashboard
2. Navigate sa **Settings** → **Integrations** → **Webhooks**
3. I-set ang **Webhook URL** sa:
   ```
   https://your-app-name.up.railway.app/webhook
   ```
4. **Protocol:** JSON
5. **Protocol Version:** v2
6. Click **Save**

#### Step 6: Test
1. Test ang health endpoint: `https://your-app-name.up.railway.app/health`
2. Dapat may response na: `{"status":"ok",...}`
3. Test ang webhook endpoint: `https://your-app-name.up.railway.app/webhook` (GET request)
4. Gumawa ng test order sa GloriaFood para ma-verify

---

## 🌐 Option 2: Render.com

### Step-by-Step:

#### Step 1: Push sa GitHub (same as Railway)

#### Step 2: Deploy sa Render
1. Pumunta sa: **https://render.com**
2. Sign up (FREE)
3. Click **"New +"** → **"Web Service"**
4. Connect GitHub repository
5. Piliin ang repository mo

#### Step 3: Configure
- **Name:** `gloriafood-webhook` (o kahit ano)
- **Environment:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Instance Type:** Free

#### Step 4: Environment Variables
Add sa Environment tab:
```
GLORIAFOOD_API_KEY=your_api_key
GLORIAFOOD_STORE_ID=your_store_id
PORT=10000
WEBHOOK_PATH=/webhook
NODE_ENV=production
```

#### Step 5: Get URL
- Render magbibigay ng URL: `https://gloriafood-webhook.onrender.com`
- **Ito ang permanent URL mo!**

#### Step 6: Update GloriaFood
- **Webhook URL:** `https://gloriafood-webhook.onrender.com/webhook`

---

## ✈️ Option 3: Fly.io (Always-On)

### Step-by-Step:

#### Step 1: Install Fly CLI
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

#### Step 2: Sign up at Login
```powershell
fly auth signup
# O kung may account na:
fly auth login
```

#### Step 3: Initialize
```powershell
cd delivery_service-main
fly launch
```

#### Step 4: Set Secrets
```powershell
fly secrets set GLORIAFOOD_API_KEY=your_api_key
fly secrets set GLORIAFOOD_STORE_ID=your_store_id
fly secrets set WEBHOOK_PORT=3000
fly secrets set WEBHOOK_PATH=/webhook
```

#### Step 5: Deploy
```powershell
fly deploy
```

#### Step 6: Get URL
- Fly magbibigay ng URL: `https://gloriafood-webhook.fly.dev`
- **Ito ang permanent URL mo!**

---

## ✅ Checklist

Bago i-deploy:
- [ ] May `.env` file ka na (o ready ang environment variables)
- [ ] Na-test mo na locally (`npm run webhook`)
- [ ] Code ay naka-push na sa GitHub
- [ ] May GitHub account ka na

Pagkatapos ng deploy:
- [ ] Na-copy mo na ang permanent URL
- [ ] Na-test mo na ang `/health` endpoint
- [ ] Na-update mo na ang GloriaFood webhook URL
- [ ] Na-test mo na ang webhook (test order)

---

## 🐛 Troubleshooting

### "Application Error"
- Check logs sa dashboard (Railway/Render/Fly)
- Verify environment variables
- Check kung naka-build na (`npm run build`)

### "Cannot connect to webhook"
- Verify ang URL (dapat may `/webhook` sa dulo)
- Check kung running ang service
- Test ang `/health` endpoint

### "404 Not Found"
- Siguraduhin na `/webhook` ang path
- Check ang `WEBHOOK_PATH` environment variable

### Railway/Render: "Service Sleeping"
- Normal lang ito sa free tier
- Auto-wake naman pag may request
- Kung gusto mo ng always-on, gamitin ang Fly.io

---

## 📞 Need Help?

1. Check ang service logs (Railway/Render/Fly dashboard)
2. Test ang health endpoint: `https://your-url.com/health`
3. Test ang webhook: `https://your-url.com/webhook` (GET request)
4. See full guide: `FREE_PERMANENT_ENDPOINT.md`

---

## 🎉 Tapos na!

Pagkatapos ng setup, mayroon ka nang:
- ✅ Permanent URL (hindi na magbabago)
- ✅ 100% FREE hosting
- ✅ Auto-deploy mula sa GitHub
- ✅ Webhook endpoint na ready na para sa GloriaFood

**Webhook URL mo:** `https://your-app-name.up.railway.app/webhook` (o kung ano man ang URL mo)

---

**Good luck! 🚀**

