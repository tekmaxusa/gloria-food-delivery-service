# ⚡ QUICK START: Permanent URL sa 5 Minuto

## 🎯 Pinakamadaling Paraan: Render.com

### Step 1: Upload sa GitHub (2 minuto)
```powershell
cd "C:\Users\Admin\Downloads\delivery_service-main (1)\delivery_service-main"
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Step 2: Deploy sa Render (3 minuto)

1. **Pumunta sa:** https://render.com → Sign up (FREE)

2. **Click "New +" → "Web Service"**

3. **Connect GitHub repo mo**

4. **Settings:**
   - **Name:** `gloriafood-webhook`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`

5. **Add Environment Variables:**
   - `GLORIAFOOD_API_KEY` = your_api_key
   - `GLORIAFOOD_STORE_ID` = your_store_id

6. **Click "Create Web Service"**

7. **Wait 2-3 minutes** → Makikita mo ang URL: `https://gloriafood-webhook.onrender.com`

### Step 3: Configure sa Gloria Food (1 minuto)

1. Login sa Gloria Food admin
2. Settings → Integrations → Webhooks
3. **Webhook URL:** `https://gloriafood-webhook.onrender.com/webhook`
4. **Method:** POST
5. **Protocol:** JSON
6. **Version:** v2
7. **Save**

### ✅ Tapos na!

**Permanent URL mo:** `https://gloriafood-webhook.onrender.com/webhook`

---

## 📝 Full Guide

Para sa detailed instructions, tingnan: **[PINAKAMADALING_SETUP.md](PINAKAMADALING_SETUP.md)**

---

## 🆘 Troubleshooting

**Service failed?**
- Check logs sa Render dashboard
- Verify environment variables

**Cannot reach webhook?**
- Test: `https://your-app.onrender.com/health`
- Dapat may response: `{"status":"ok"}`

**404 Error?**
- Siguraduhin na may `/webhook` sa dulo ng URL

---

## 🎉 Success Checklist

- [ ] Na-deploy sa Render
- [ ] Health endpoint working (`/health`)
- [ ] Na-configure sa Gloria Food
- [ ] Na-test ang webhook (gumawa ng test order)

