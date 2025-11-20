# GloriaFood Order Fetcher

A TypeScript script that automatically fetches orders from the GloriaFood API, stores them in a SQLite database, and displays them in the terminal with real-time updates.

## Features

- 🔄 Automatic order polling from GloriaFood API
- 💾 SQLite database storage for orders
- 🖥️ Beautiful terminal output with colored formatting
- 📊 Real-time order statistics
- 🔍 Filter and search orders by status, date, etc.
- ⚡ Handles duplicate orders automatically
- 🛡️ Error handling and retry logic
- 📧 Automatic merchant email notifications for new orders & status changes

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- GloriaFood API credentials (API Key, Store ID)

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   Create a `.env` file in the root directory:
   ```env
   GLORIAFOOD_API_KEY=your_api_key_here
   GLORIAFOOD_STORE_ID=your_store_id_here
   GLORIAFOOD_API_URL=https://api.gloriafood.com
   GLORIAFOOD_MASTER_KEY=your_master_key_here
   DATABASE_PATH=./orders.db
   POLL_INTERVAL_MS=30000
   ```

## Configuration

### Environment Variables

- `GLORIAFOOD_API_KEY` (required): Your GloriaFood API key
- `GLORIAFOOD_STORE_ID` (required): Your GloriaFood store/restaurant ID
- `GLORIAFOOD_API_URL` (optional): API base URL (default: `https://api.gloriafood.com`)
- `GLORIAFOOD_MASTER_KEY` (optional): Master key for authentication
- `DATABASE_PATH` (optional): Path to SQLite database file (default: `./orders.db`)
- `POLL_INTERVAL_MS` (optional): Polling interval in milliseconds (default: `30000` = 30 seconds)

#### Merchant Email Notifications

Set these variables to enable automatic merchant updates via SMTP:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=app-specific-password
SMTP_FROM="Your Restaurant <orders@restaurant.com>"   # optional
SMTP_SECURE=false                                      # set true for port 465
MERCHANT_EMAIL=merchant@restaurant.com
```

> The webhook server sends an email for every new order and whenever an existing order's status changes (including cancellations).

## Usage

### Webhook Mode (Recommended for Production):
```bash
npm run webhook
```
This starts a webhook server that receives orders from GloriaFood in real-time.

**🆓 Need a FREE permanent endpoint?** See:
- **[FREE_PERMANENT_ENDPOINT.md](FREE_PERMANENT_ENDPOINT.md)** - Complete guide for free hosting (Railway, Render, Fly.io)
- **[DEPLOY_QUICK_START.md](DEPLOY_QUICK_START.md)** - 5-minute quick start guide
- **[CLOUDFLARE_TUNNEL_SETUP.md](CLOUDFLARE_TUNNEL_SETUP.md)** - Cloudflare Tunnel setup (requires domain)

### Development Mode (Polling - with auto-reload):
```bash
npm run dev
```

### See orders as they come:
```bash
npm run watch
```

### Production Mode:
```bash
npm run build
npm start
```

## How to Get GloriaFood API Credentials

1. Log in to your GloriaFood restaurant account
2. Navigate to **"Other"** section → **"3rd party integrations"**
3. Click on **"Add custom integration"**
4. Configure the integration:
   - **Template**: Push Accepted Orders (or GET Orders)
   - **Protocol**: JSON
   - **Protocol version**: Version 2
   - **API Key**: Generated key for authentication
   - **Master Key**: Optional secure key
   - **Restaurant Token/ID**: Your store ID

## Database Schema

Orders are stored in a SQLite database with the following structure:

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gloriafood_order_id TEXT UNIQUE NOT NULL,
  store_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  delivery_address TEXT,
  total_price REAL,
  currency TEXT DEFAULT 'USD',
  status TEXT,
  order_type TEXT,
  items TEXT,           -- JSON string
  raw_data TEXT,        -- Full JSON from API
  created_at TEXT,
  updated_at TEXT,
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## Project Structure

```
delivery_service-main/
├── src/
│   ├── index.ts              # Main application entry point
│   ├── gloriafood-client.ts  # GloriaFood API client
│   └── database.ts           # Database operations
├── dist/                     # Compiled JavaScript (after build)
├── package.json
├── tsconfig.json
├── .env                      # Environment variables (create this)
└── README.md
```

## API Endpoint Notes

The script automatically tries multiple common GloriaFood API endpoint patterns:

- `/api/v2/restaurants/{storeId}/orders`
- `/api/v1/orders`
- `/api/orders`

If your GloriaFood API uses a different endpoint structure, you may need to update `src/gloriafood-client.ts` accordingly.

## Troubleshooting

### "Missing required environment variables" error
- Make sure you've created a `.env` file with `GLORIAFOOD_API_KEY` and `GLORIAFOOD_STORE_ID`

### "401 Unauthorized" or "403 Forbidden" errors
- Verify your API credentials are correct
- Check if your API key has the necessary permissions

### "404 Not Found" errors
- Verify your Store ID is correct
- Check if the API endpoint URL is correct
- Your GloriaFood account may use a different API structure

### "No new orders found"
- This is normal if there are no new orders
- Check your GloriaFood dashboard to confirm orders exist
- Verify the store ID matches an active restaurant

## Features in Detail

### Automatic Polling
- Fetches orders at regular intervals (configurable)
- Tracks which orders are new vs. updated
- Prevents duplicate storage

### Terminal Display
- Color-coded order status
- Customer information display
- Order items breakdown
- Real-time statistics

### Database Features
- Automatic table creation
- Indexed for fast queries
- Handles order updates
- Full order history tracking

## Example Output

```
🚀 GloriaFood Order Fetcher Started

Configuration:
  Store ID: 12345
  API URL: https://api.gloriafood.com
  Database: ./orders.db
  Poll Interval: 30s

✅ Polling started. Press Ctrl+C to stop.

[2024-01-15T10:30:00.000Z] Fetching orders...
  Found 2 order(s)

🆕 NEW ORDER #67890
  ──────────────────────────────────────────
  Customer: John Doe
  Phone: +1234567890
  Email: john@example.com
  Delivery Address: 123 Main St, City, State, 12345
  Total: USD 25.50
  Status: ACCEPTED
  Type: delivery
  Fetched: 1/15/2024, 10:30:00 AM
  Items:
    1. Pizza x1 - USD 18.00
    2. Coke x2 - USD 7.50
  ──────────────────────────────────────────

  ✓ Stored: 1 new, 1 updated
  📊 Total Orders: 156 | Recent (1h): 5
```

## License

MIT

## Webhook Setup & Permanent Endpoints

This project supports both **polling mode** (checking for orders periodically) and **webhook mode** (receiving orders in real-time).

### Quick Links:
- 🆓 **[FREE_PERMANENT_ENDPOINT.md](FREE_PERMANENT_ENDPOINT.md)** - Get a FREE permanent endpoint (Railway, Render, Fly.io)
- ⚡ **[DEPLOY_QUICK_START.md](DEPLOY_QUICK_START.md)** - Deploy in 5 minutes
- 🌐 **[CLOUDFLARE_TUNNEL_SETUP.md](CLOUDFLARE_TUNNEL_SETUP.md)** - Cloudflare Tunnel setup
- 🚚 **[DOORDASH_SETUP.md](DOORDASH_SETUP.md)** - DoorDash integration guide

### Webhook Environment Variables:
```env
GLORIAFOOD_API_KEY=your_api_key
GLORIAFOOD_STORE_ID=your_store_id
WEBHOOK_PORT=3000          # Optional (default: 3000)
WEBHOOK_PATH=/webhook      # Optional (default: /webhook)
PORT=3000                  # Used by hosting services (Railway, Render, etc.)
```

## Support

For issues related to:
- **This script**: Check the troubleshooting section or create an issue
- **GloriaFood API**: Contact GloriaFood support or check their API documentation
- **Deployment**: See the deployment guides above
