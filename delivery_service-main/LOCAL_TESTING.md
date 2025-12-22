# Local Testing Guide

## Quick Start para sa Local Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Create .env File (Optional - para sa testing)
Gumawa ng `.env` file sa root directory. Hindi required kung mag-a-add ka ng merchants sa UI.

**Minimum .env (optional):**
```env
# Database (SQLite - default, no config needed)
# O kung gusto mo MySQL:
# DB_TYPE=mysql
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=root
# DB_PASSWORD=
# DB_NAME=gloriafood_orders

# Port (optional, default: 3000)
PORT=3000
WEBHOOK_PATH=/webhook
```

### 3. Run the Webhook Server
```bash
npm run webhook
```

O kung gusto mo ng production build:
```bash
npm run build
npm start
```

### 4. Access the UI
Buksan sa browser:
```
http://localhost:3000
```

### 5. Test Merchant Management
1. Login o Sign up (kung may user account)
2. Click "Merchants" sa navigation
3. Click "Add New Merchant"
4. Fill up ang form:
   - Store ID: Test store ID
   - Merchant Name: Test Merchant
   - API Key: Test API key (para sa testing lang)
   - API URL: (optional)
   - Master Key: (optional)
5. Click "Save Merchant"

### Notes:
- SQLite database ay auto-created sa `./orders.db` kung walang MySQL config
- Hindi kailangan ng actual Gloria Food credentials para sa UI testing
- Puwede mong i-test ang add/edit/delete ng merchants kahit walang real API keys
- Para sa actual order fetching, kailangan ng valid Gloria Food credentials

### Troubleshooting:
- **Port already in use**: Baguhin ang PORT sa .env file
- **Database error**: Check kung may MySQL running (kung MySQL ang gamit)
- **Cannot connect**: Make sure walang firewall blocking port 3000

