# ✅ Deployment Checklist

## 📋 Pre-Deployment Checklist

### 1. Code Preparation
- [ ] Code ay naka-commit na sa git
- [ ] May `.env` file ka na (o ready ang environment variables)
- [ ] Na-test mo na locally (`npm run webhook`)
- [ ] Wala nang errors sa code

### 2. GitHub Setup
- [ ] May GitHub account ka na
- [ ] Na-push mo na ang code sa GitHub
- [ ] Repository ay public o may access ka sa private repo

### 3. Environment Variables Ready
- [ ] `GLORIAFOOD_API_KEY` - May value ka na
- [ ] `GLORIAFOOD_STORE_ID` - May value ka na
- [ ] `WEBHOOK_PORT` - Optional (default: 3000)
- [ ] `WEBHOOK_PATH` - Optional (default: /webhook)
- [ ] `DATABASE_PATH` - Optional (default: ./orders.db)

**Para sa MySQL/XAMPP:**
- [ ] `DB_TYPE=mysql`
- [ ] `DB_HOST` - MySQL host
- [ ] `DB_PORT` - MySQL port (default: 3306)
- [ ] `DB_USER` - MySQL user
- [ ] `DB_PASSWORD` - MySQL password
- [ ] `DB_NAME` - Database name

---

## 🚀 Railway.app Deployment

### Step 1: Deploy
- [ ] Na-visit mo na ang https://railway.app
- [ ] Na-sign up/login ka na
- [ ] Na-create mo na ang new project
- [ ] Na-connect mo na ang GitHub repository
- [ ] Na-deploy mo na ang project

### Step 2: Environment Variables
- [ ] Na-add mo na ang `GLORIAFOOD_API_KEY`
- [ ] Na-add mo na ang `GLORIAFOOD_STORE_ID`
- [ ] Na-add mo na ang iba pang environment variables (kung kailangan)

### Step 3: Get URL
- [ ] Na-copy mo na ang permanent URL
- [ ] URL format: `https://your-app-name.up.railway.app`

### Step 4: Test
- [ ] Na-test mo na ang `/health` endpoint
- [ ] Response: `{"status":"ok",...}`
- [ ] Na-test mo na ang `/webhook` endpoint (GET)
- [ ] Response: `{"service":"GloriaFood Webhook Server",...}`

### Step 5: Update GloriaFood
- [ ] Na-update mo na ang webhook URL sa GloriaFood
- [ ] Format: `https://your-app-name.up.railway.app/webhook`
- [ ] Protocol: JSON
- [ ] Protocol Version: v2
- [ ] Na-save mo na ang settings

### Step 6: Final Test
- [ ] Gumawa ng test order sa GloriaFood
- [ ] Na-verify mo na na-receive ang order sa webhook
- [ ] Na-check mo na ang logs sa Railway dashboard

---

## 🌐 Render.com Deployment

### Step 1: Deploy
- [ ] Na-visit mo na ang https://render.com
- [ ] Na-sign up/login ka na
- [ ] Na-create mo na ang new Web Service
- [ ] Na-connect mo na ang GitHub repository
- [ ] Na-configure mo na ang build/start commands
- [ ] Na-deploy mo na ang project

### Step 2: Environment Variables
- [ ] Na-add mo na ang `GLORIAFOOD_API_KEY`
- [ ] Na-add mo na ang `GLORIAFOOD_STORE_ID`
- [ ] Na-add mo na ang `PORT=10000`
- [ ] Na-add mo na ang iba pang environment variables

### Step 3: Get URL
- [ ] Na-copy mo na ang permanent URL
- [ ] URL format: `https://your-app-name.onrender.com`

### Step 4-6: Same as Railway (Test, Update GloriaFood, Final Test)

---

## ✈️ Fly.io Deployment

### Step 1: Setup
- [ ] Na-install mo na ang Fly CLI
- [ ] Na-sign up/login ka na sa Fly.io
- [ ] Na-run mo na ang `fly launch`

### Step 2: Secrets
- [ ] Na-set mo na ang `GLORIAFOOD_API_KEY`
- [ ] Na-set mo na ang `GLORIAFOOD_STORE_ID`
- [ ] Na-set mo na ang iba pang secrets

### Step 3: Deploy
- [ ] Na-run mo na ang `fly deploy`
- [ ] Na-copy mo na ang permanent URL
- [ ] URL format: `https://your-app-name.fly.dev`

### Step 4-6: Same as Railway (Test, Update GloriaFood, Final Test)

---

## 🎯 Post-Deployment

### Monitoring
- [ ] Na-bookmark mo na ang service dashboard
- [ ] Na-check mo na ang logs regularly
- [ ] Na-setup mo na ang monitoring (optional)

### Documentation
- [ ] Na-save mo na ang webhook URL
- [ ] Na-document mo na ang environment variables
- [ ] Na-share mo na ang URL sa team (kung may team)

---

## 🐛 Common Issues & Solutions

### Issue: "Application Error"
**Solution:**
- Check logs sa dashboard
- Verify environment variables
- Check kung naka-build na (`npm run build`)

### Issue: "Cannot connect to webhook"
**Solution:**
- Verify ang URL (dapat may `/webhook` sa dulo)
- Check kung running ang service
- Test ang `/health` endpoint

### Issue: "404 Not Found"
**Solution:**
- Siguraduhin na `/webhook` ang path
- Check ang `WEBHOOK_PATH` environment variable

### Issue: "Service Sleeping" (Railway/Render)
**Solution:**
- Normal lang ito sa free tier
- Auto-wake naman pag may request
- Kung gusto mo ng always-on, gamitin ang Fly.io

---

## ✅ Final Verification

- [ ] Webhook URL ay working na
- [ ] Health endpoint ay responding
- [ ] Test order ay na-receive na
- [ ] Orders ay na-save na sa database
- [ ] Logs ay showing na ang incoming orders

---

**🎉 Congratulations! May permanent endpoint ka na na 100% FREE!**

