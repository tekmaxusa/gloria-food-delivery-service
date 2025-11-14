# 🚀 Quick Start: Deploy sa Libreng Hosting (5 Minutes)

## ⚡ Pinakamabilis na Paraan: Railway.app

### Step 1: Push sa GitHub (2 min)
```powershell
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/gloriafood-webhook.git
git push -u origin main
```

### Step 2: Deploy sa Railway (2 min)
1. Go to: https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Piliin ang repository mo
4. Click "Deploy"

### Step 3: Add Environment Variables (1 min)
Sa Railway dashboard → Variables tab, add:
```
GLORIAFOOD_API_KEY=your_api_key_here
GLORIAFOOD_STORE_ID=your_store_id_here
```

### Step 4: Copy Permanent URL
- Railway magbibigay ng URL: `https://your-app.up.railway.app`
- **Ito na ang permanent endpoint mo!** ✅

### Step 5: Update Gloria Food
- **Webhook URL:** `https://your-app.up.railway.app/webhook`
- Protocol: JSON
- Protocol Version: v2

---

## 🎯 Alternative: Render.com

### Step 1: Push sa GitHub (same as above)

### Step 2: Deploy sa Render
1. Go to: https://render.com
2. Click "New +" → "Web Service"
3. Connect GitHub repo
4. Settings:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
5. Add Environment Variables:
   ```
   GLORIAFOOD_API_KEY=your_api_key
   GLORIAFOOD_STORE_ID=your_store_id
   PORT=10000
   ```
6. Click "Create Web Service"

### Step 3: Get URL
- Render magbibigay: `https://your-app.onrender.com`
- **Permanent endpoint mo na ito!** ✅

---

## ✅ Checklist

Bago i-deploy:
- [ ] May `.env` file ka na (o ready ang environment variables)
- [ ] Na-test mo na locally (`npm run webhook`)
- [ ] Code ay naka-push na sa GitHub

Pagkatapos ng deploy:
- [ ] Na-copy mo na ang permanent URL
- [ ] Na-test mo na ang `/health` endpoint
- [ ] Na-update mo na ang Gloria Food webhook URL
- [ ] Na-test mo na ang webhook (test order)

---

## 🐛 Common Issues

**"Application Error"**
- Check logs sa dashboard
- Verify environment variables
- Check kung naka-build na (`npm run build`)

**"Cannot connect to webhook"**
- Verify ang URL (dapat may `/webhook` sa dulo)
- Check kung running ang service
- Test ang `/health` endpoint

**"404 Not Found"**
- Siguraduhin na `/webhook` ang path
- Check ang `WEBHOOK_PATH` environment variable

---

## 📞 Need Help?

1. Check ang service logs (Railway/Render dashboard)
2. Test ang health endpoint: `https://your-url.com/health`
3. Test ang webhook: `https://your-url.com/webhook` (GET request)
4. See full guide: `FREE_PERMANENT_ENDPOINT.md`

---

## 📚 Additional Resources

- **📖 Complete Tagalog Guide:** `SETUP_ENDPOINT_TAGALOG.md` - Detailed Tagalog instructions
- **✅ Deployment Checklist:** `DEPLOYMENT_CHECKLIST.md` - Step-by-step checklist
- **🆓 Free Endpoint Options:** `FREE_PERMANENT_ENDPOINT.md` - All free hosting options
- **⚙️ Configuration Files:**
  - `railway.json` - Railway.app deployment config (auto-detected)
  - `render.yaml` - Render.com deployment config (auto-detected)

---

**🎉 Done! May permanent endpoint ka na na 100% FREE!**

