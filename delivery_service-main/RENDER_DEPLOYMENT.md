# Render Deployment Guide

## ✅ Oo, Gagana ito sa Render!

Ang application ay configured na para sa Render deployment. Sundin ang steps na ito:

## 📋 Prerequisites

1. **MySQL Database** - Kailangan mo ng MySQL database (hindi pwedeng SQLite sa Render dahil ephemeral ang filesystem)
   - Pwede mong gamitin ang Render's MySQL database service
   - O kaya external MySQL database (like PlanetScale, AWS RDS, etc.)

## 🚀 Deployment Steps

### 1. Push sa GitHub
```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

### 2. Create New Web Service sa Render

1. Pumunta sa [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the repository
5. Render will auto-detect ang `render.yaml` file

### 3. Configure Environment Variables

**REQUIRED:**
```
NODE_ENV=production
DB_TYPE=mysql
DB_HOST=your-mysql-host.render.com
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=gloriafood_orders
```

**OPTIONAL (kung may GloriaFood API):**
```
GLORIAFOOD_API_KEY=your_api_key
GLORIAFOOD_STORE_ID=your_store_id
```

**OPTIONAL (kung may DoorDash):**
```
DOORDASH_DEVELOPER_ID=your_dev_id
DOORDASH_KEY_ID=your_key_id
DOORDASH_SIGNING_SECRET=your_secret
DOORDASH_MERCHANT_ID=your_merchant_id
DOORDASH_SANDBOX=true
```

**OPTIONAL (kung may Email):**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MERCHANT_EMAIL=merchant@example.com
```

### 4. Setup MySQL Database

**Option A: Render MySQL Database**
1. Sa Render Dashboard, create "PostgreSQL" o "MySQL" database
2. Copy ang connection details
3. Gamitin ang details sa environment variables

**Option B: External MySQL**
- Pwede mong gamitin ang PlanetScale, AWS RDS, o iba pang MySQL provider

### 5. Initialize Database Schema

After deployment, kailangan mong i-run ang database schema:

1. Connect sa MySQL database
2. Run ang `database.sql` file:
```sql
-- Copy paste ang contents ng database.sql
```

O kaya gamitin ang MySQL client:
```bash
mysql -h your-host -u your-user -p your-database < database.sql
```

### 6. Deploy!

1. Click "Create Web Service"
2. Render will automatically:
   - Install dependencies
   - Run `npm run build`
   - Start the server with `npm start`

## 🔍 Verification

After deployment, check:

1. **Health Check**: `https://your-app.onrender.com/health`
   - Dapat may response na `{"status":"ok"}`

2. **Dashboard**: `https://your-app.onrender.com/`
   - Dapat makita mo ang login page

3. **API Endpoints**:
   - `/orders` - List of orders
   - `/api/dashboard/stats` - Dashboard statistics
   - `/api/drivers` - Drivers list
   - `/api/reviews` - Reviews list

## ⚠️ Important Notes

1. **SQLite won't work** - Render's filesystem ay ephemeral, kaya kailangan MySQL
2. **First deployment** - Maaaring tumagal ng 5-10 minutes
3. **Free tier** - May sleep mode pag walang activity (15 minutes)
4. **Webhook URL** - Gamitin ang Render URL sa GloriaFood webhook settings:
   ```
   https://your-app.onrender.com/webhook
   ```

## 🐛 Troubleshooting

### Build Fails
- Check ang build logs sa Render dashboard
- Make sure lahat ng dependencies ay naka-install

### Database Connection Error
- Verify ang MySQL credentials
- Check kung accessible ang database from Render
- Make sure ang database schema ay naka-run na

### Static Files Not Loading
- Check kung naka-copy ang `public` folder sa `dist/public`
- Verify ang build logs

### Authentication Not Working
- Make sure ang database schema ay may `users` table
- Check kung naka-create na ang user account

## 📝 Database Schema

Make sure na-run mo ang `database.sql` file para sa:
- `orders` table
- `users` table (para sa authentication)
- `drivers` table
- `reviews` table

## 🔐 Security Notes

1. **Never commit** `.env` file
2. **Use strong passwords** para sa database
3. **Enable HTTPS** (automatic sa Render)
4. **Session management** - Sessions expire after 24 hours

## 📞 Support

Kung may problema:
1. Check ang Render logs
2. Verify ang environment variables
3. Test ang database connection
4. Check ang `/health` endpoint

---

**Ready na! 🚀**

Deploy mo na sa Render at gagana ang lahat ng features:
- ✅ Login/Signup
- ✅ Dashboard with real-time stats
- ✅ Orders management
- ✅ Drivers management
- ✅ Reports
- ✅ Reviews
- ✅ Real-time updates

