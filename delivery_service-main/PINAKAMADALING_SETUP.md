# 🚀 PINAKAMADALING PARAAN: Permanent URL para sa Gloria Food

## ⚡ Option 1: Render.com (PINAKAMADALI - RECOMMENDED)

**✅ FREE, Permanent URL, Walang domain kailangan, Auto-deploy**

### Step-by-Step Guide:

#### 1. **Mag-sign up sa Render.com**
   - Pumunta sa: https://render.com
   - Click "Get Started for Free"
   - Sign up gamit ang GitHub account (o email)

#### 2. **I-upload ang code sa GitHub** (kung wala pa)
   
   **Option A: Gamit ang existing repo mo**
   ```powershell
   cd "C:\Users\Admin\Downloads\delivery_service-main (1)\delivery_service-main"
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

   **Option B: Gumawa ng bagong repo**
   - Pumunta sa: https://github.com/new
   - Create new repository
   - Follow instructions para i-upload ang code

#### 3. **Deploy sa Render.com**

   a. **Pumunta sa Render Dashboard:**
      - Login sa https://dashboard.render.com
      - Click "New +" → "Web Service"

   b. **Connect GitHub:**
      - Piliin ang repository mo
      - Click "Connect"

   c. **Configure ang Service:**
      ```
      Name: gloriafood-webhook (o kahit anong name)
      Region: Singapore (o pinakamalapit sa iyo)
      Branch: main
      Root Directory: delivery_service-main (kung nasa subfolder)
      Runtime: Node
      Build Command: npm install && npm run build
      Start Command: npm start
      ```

   d. **Add Environment Variables:**
      Click "Advanced" → "Add Environment Variable"
      
      Add these:
      ```
      GLORIAFOOD_API_KEY=your_api_key_here
      GLORIAFOOD_STORE_ID=your_store_id_here
      PORT=10000
      NODE_ENV=production
      ```
      
      (Optional - kung may MySQL):
      ```
      DB_TYPE=mysql
      DB_HOST=your_mysql_host
      DB_PORT=3306
      DB_USER=your_username
      DB_PASSWORD=your_password
      DB_NAME=gloriafood_orders
      ```

   e. **Click "Create Web Service"**

#### 4. **Wait for Deployment**
   - Render will automatically build and deploy
   - Makikita mo ang logs sa dashboard
   - Wait for "Your service is live" message

#### 5. **Kunin ang Permanent URL**
   - Sa dashboard, makikita mo ang URL: `https://gloriafood-webhook.onrender.com`
   - **Ito na ang permanent URL mo!** ✅

#### 6. **I-configure sa Gloria Food**
   - Login sa Gloria Food admin panel
   - Pumunta sa: Settings → Integrations → Webhooks
   - **Webhook URL:** `https://gloriafood-webhook.onrender.com/webhook`
   - **Method:** POST
   - **Protocol:** JSON
   - **Protocol Version:** v2
   - **Events:** Piliin ang events (New Order, Order Status Changed, etc.)
   - Click "Save"

#### 7. **Test ang Webhook**
   - Pumunta sa: `https://gloriafood-webhook.onrender.com/health`
   - Dapat may response: `{"status":"ok","service":"GloriaFood Webhook Server"}`
   - Gumawa ng test order sa Gloria Food
   - Check ang logs sa Render dashboard kung may natanggap na order

---

## 🎯 Option 2: Railway.app (Alternative - FREE din)

**✅ FREE tier available, Permanent URL, Easy setup**

### Quick Steps:

1. **Sign up:** https://railway.app (gamit GitHub)

2. **Deploy:**
   - Click "New Project"
   - "Deploy from GitHub repo"
   - Piliin ang repo mo
   - Railway will auto-detect ang `railway.json`

3. **Add Environment Variables:**
   - Sa project settings, add:
     ```
     GLORIAFOOD_API_KEY=your_api_key
     GLORIAFOOD_STORE_ID=your_store_id
     PORT=3000
     ```

4. **Get URL:**
   - Railway will give you: `https://your-app.up.railway.app`
   - **Ito na ang permanent URL mo!**

5. **Configure sa Gloria Food:**
   - **Webhook URL:** `https://your-app.up.railway.app/webhook`

---

## 🌐 Option 3: Cloudflare Tunnel (Kung may domain ka na)

**✅ FREE, Permanent URL, Pero kailangan ng domain**

Tingnan ang: `CLOUDFLARE_TUNNEL_SETUP.md` para sa complete guide.

---

## 📋 Checklist

### Bago mo i-configure sa Gloria Food:

- [ ] Na-deploy mo na ang app sa Render/Railway
- [ ] Na-test mo na ang health endpoint (dapat may response)
- [ ] Na-add mo na ang environment variables (API_KEY, STORE_ID)
- [ ] Nakita mo na ang permanent URL

### Sa Gloria Food Dashboard:

- [ ] Login sa admin panel
- [ ] Pumunta sa Settings → Integrations → Webhooks
- [ ] Add webhook:
  - **URL:** `https://your-app.onrender.com/webhook` (o Railway URL)
  - **Method:** POST
  - **Protocol:** JSON
  - **Protocol Version:** v2
- [ ] Test ang webhook (may test button)
- [ ] Check ang logs sa Render/Railway dashboard

---

## 🐛 Troubleshooting

### "Service failed to start"
**Solution:**
- Check ang logs sa Render/Railway dashboard
- Siguraduhin na tama ang `startCommand`: `npm start`
- Check kung may error sa build

### "Cannot reach webhook"
**Solution:**
- Test ang health endpoint: `https://your-app.onrender.com/health`
- Check kung running ang service sa dashboard
- Verify ang URL sa Gloria Food (dapat may `/webhook` sa dulo)

### "404 Not Found"
**Solution:**
- Siguraduhin na tama ang path: `/webhook` (hindi `/webhooks`)
- Check ang webhook server logs

### "Environment variables missing"
**Solution:**
- Add ang `GLORIAFOOD_API_KEY` at `GLORIAFOOD_STORE_ID` sa Render/Railway dashboard
- Redeploy ang service pagkatapos mag-add ng variables

---

## 💡 Tips

1. **Render Free Tier:**
   - Service sleeps after 15 minutes of inactivity
   - First request after sleep ay medyo mabagal (cold start)
   - Para sa production, consider paid plan ($7/month)

2. **Railway Free Tier:**
   - May $5 free credit monthly
   - After maubos, kailangan mag-upgrade

3. **Monitoring:**
   - Check ang logs regularly sa dashboard
   - Set up email notifications para sa errors

4. **Backup:**
   - Regular backup ng database
   - Export orders periodically

---

## ✅ Recommended Setup

**Para sa Production:**
- **Render.com** (Option 1) - Pinakamadali, FREE, permanent URL
- O **Railway.app** (Option 2) - Alternative na FREE din

**Para sa Development:**
- Cloudflare Tunnel (kung may domain)
- O localtunnel/ngrok para sa quick testing

---

## 📞 Need Help?

Kung may problema:
1. Check ang logs sa Render/Railway dashboard
2. Test ang health endpoint: `https://your-url.com/health`
3. Verify ang environment variables
4. Check ang Gloria Food webhook logs

---

## 🎉 Success!

Kapag successful na:
- ✅ Permanent URL: `https://your-app.onrender.com/webhook`
- ✅ Auto-deploy kapag may update sa code
- ✅ 24/7 available (Render free tier sleeps pero auto-wake)
- ✅ Logs available sa dashboard
- ✅ Easy to update environment variables

**Ito na ang pinakamadaling paraan para magkaroon ng permanent URL!** 🚀

