# 🍕 Gloria Food Delivery Service Integration

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2+-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/yourusername/gloria-food-delivery-service.svg)](https://github.com/yourusername/gloria-food-delivery-service/stargazers)

A comprehensive TypeScript service for integrating Gloria Food API with delivery services like DoorDash. This project provides a complete solution for automated order processing, delivery management, and real-time webhook handling.

## ✨ Features

- 🔌 **Complete API Integration**: Full TypeScript client for Gloria Food API
- 🚚 **DoorDash Integration**: Automated delivery creation and tracking
- 📡 **Real-time Webhooks**: Instant order updates and processing
- 🖥️ **CLI Management**: Command-line interface for testing and operations
- 📊 **Order Processing**: Automated delivery order workflow
- 🔄 **Retry Logic**: Built-in retry mechanisms with exponential backoff
- 📈 **Rate Limiting**: Intelligent API rate limiting
- 📝 **Comprehensive Logging**: Winston-based logging system
- ⚙️ **Flexible Configuration**: Environment-based configuration
- 🛡️ **Error Handling**: Robust error handling and validation
- 🗄️ **Database Support**: SQLite3 and MySQL support
- 📱 **Webhook Security**: Signature verification and validation

## 🚀 Quick Start

### Prerequisites

- **Node.js 18.0.0+**
- **Gloria Food API credentials**
- **DoorDash API credentials** (optional)
- **MySQL** (optional, SQLite3 included)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/gloria-food-delivery-service.git
   cd gloria-food-delivery-service
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   # Edit .env with your API credentials
   ```

4. **Test the setup**
   ```bash
   npm run cli test
   ```

## ⚙️ Configuration

### Required Environment Variables

```env
# Gloria Food API (Required)
GLORIA_FOOD_API_URL=https://www.tekmaxfood.com
GLORIA_FOOD_API_KEY=your_api_key
GLORIA_FOOD_RESTAURANT_ID=your_restaurant_id

# DoorDash API (Optional - for delivery integration)
DOORDASH_API_URL=https://openapi.doordash.com/v2
DOORDASH_CLIENT_ID=your_client_id
DOORDASH_CLIENT_SECRET=your_client_secret
DOORDASH_DEVELOPER_ID=your_developer_id

# Restaurant Information (Required for delivery)
RESTAURANT_NAME=Your Restaurant Name
RESTAURANT_ADDRESS=123 Main Street
RESTAURANT_CITY=Your City
RESTAURANT_STATE=Your State
RESTAURANT_ZIP=12345
RESTAURANT_COUNTRY=US
RESTAURANT_PHONE=+1234567890

# Database (Optional - SQLite3 default)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=sueshero_delivery

# Webhook Security (Optional)
WEBHOOK_SECRET=your_webhook_secret
```

## 🎯 Usage

### CLI Commands

```bash
# Test API connections
npm run cli test

# List orders
npm run cli list

# Get delivery orders only
npm run cli delivery

# Get pending orders
npm run cli pending

# Get specific order
npm run cli get 12345

# Update order status
npm run cli update 12345 confirmed

# Start webhook server
npm run webhook

# Enhanced webhook with auto-delivery
npm run enhanced-webhook
```

### Programmatic Usage

```typescript
import { GloriaFoodApiClient } from './services/gloria-food-api-client';
import { DoorDashApiClient } from './services/doordash-api-client';
import { EnhancedWebhookHandler } from './services/enhanced-webhook-handler';

// Initialize API clients
const gloriaFoodClient = new GloriaFoodApiClient(config);
const doorDashClient = new DoorDashApiClient(config);

// Get pending delivery orders
const orders = await gloriaFoodClient.getPendingDeliveryOrders();

// Process each order
for (const order of orders) {
  // Create DoorDash delivery
  const delivery = await doorDashClient.createDelivery({
    external_delivery_id: order.orderNumber,
    pickup_address: restaurantAddress,
    dropoff_address: order.delivery.address,
    order_value: order.total
  });
  
  // Update order status
  await gloriaFoodClient.updateOrderStatus(order.id, 'out_for_delivery');
}

// Start webhook server
const webhookHandler = new EnhancedWebhookHandler(3000);
await webhookHandler.start();
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Gloria Food   │───▶│  Delivery Service │───▶│    DoorDash     │
│      API        │    │                  │    │      API        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌────────▼────────┐              │
         │              │   Webhook       │              │
         └─────────────▶│   Handler       │◀─────────────┘
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │    Database     │
                        │  (SQLite/MySQL) │
                        └─────────────────┘
```

## 📁 Project Structure

```
src/
├── cli.ts                          # CLI interface
├── index.ts                        # Main application entry
├── services/
│   ├── gloria-food-api-client.ts   # Gloria Food API client
│   ├── doordash-api-client.ts      # DoorDash API client
│   ├── enhanced-webhook-handler.ts  # Auto-delivery webhook
│   ├── webhook-handler.ts          # Basic webhook handler
│   ├── database-service.ts         # SQLite database service
│   └── mysql-database-service.ts   # MySQL database service
├── types/
│   ├── gloria-food.ts             # Gloria Food type definitions
│   ├── doordash.ts                # DoorDash type definitions
│   └── database.ts                # Database type definitions
└── utils/
    ├── config.ts                  # Configuration management
    ├── logger.ts                  # Logging utilities
    ├── error-handler.ts           # Error handling
    └── validator.ts               # Input validation
```

## 🔧 Development

### Available Scripts

```bash
npm run build          # Compile TypeScript
npm run dev            # Development mode
npm start              # Production mode
npm run cli            # CLI interface
npm run webhook        # Basic webhook server
npm run enhanced-webhook # Auto-delivery webhook
npm run test-webhook   # Test webhook system
npm run test-mysql     # Test MySQL connection
npm run setup-mysql    # Setup MySQL database
npm run lint           # Code linting
npm test               # Run tests
npm run clean          # Clean build directory
```

### Building for Production

```bash
npm run build
npm start
```

## 🌐 Webhook Endpoints

The service provides several webhook endpoints:

- `POST /webhook/gloria-food` - Main webhook endpoint
- `POST /webhook/gloria-food/delivery` - Delivery orders only
- `POST /webhook/test` - Test endpoint
- `GET /health` - Health check
- `GET /status` - System status

### Webhook Events

- `order.created` - New order received
- `order.updated` - Order status changed
- `order.cancelled` - Order cancelled
- `order.delivered` - Order delivered

## 🗄️ Database Schema

### Orders Table
```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gloria_food_order_id INTEGER UNIQUE NOT NULL,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  delivery_address TEXT NOT NULL,
  order_total REAL NOT NULL,
  order_status TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  gloria_food_data TEXT NOT NULL
);
```

### Deliveries Table
```sql
CREATE TABLE deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  doordash_delivery_id TEXT UNIQUE,
  external_delivery_id TEXT NOT NULL,
  status TEXT NOT NULL,
  driver_name TEXT,
  tracking_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders (id)
);
```

## 🚀 Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### PM2 Process Management

```bash
npm install -g pm2
pm2 start dist/index.js --name "delivery-service"
pm2 startup
pm2 save
```

### Environment Variables for Production

```env
NODE_ENV=production
LOG_LEVEL=info
LOG_FILE=/var/log/delivery-service.log
MAX_RETRY_ATTEMPTS=5
REQUESTS_PER_MINUTE=100
```

## 📊 Monitoring & Logging

### Log Levels
- `error` - Error conditions
- `warn` - Warning conditions  
- `info` - Informational messages
- `debug` - Debug-level messages

### Health Checks
- API health endpoint: `GET /health`
- Webhook health endpoint: `GET /webhook/gloria-food/health`

### Metrics Logged
- API request/response times
- Order processing statistics
- Error rates and types
- Webhook processing metrics

## 🔒 Security

- **Webhook Signature Verification**: Validates incoming webhook signatures
- **API Key Protection**: Secure storage of API credentials
- **Rate Limiting**: Prevents API abuse
- **Input Validation**: Validates all incoming data
- **Error Handling**: Prevents sensitive data leakage

## 🐛 Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Check your `.env` file has all required variables

2. **"API connection failed"**
   - Verify API URL and credentials
   - Check network connectivity

3. **"Database connection failed"**
   - Ensure MySQL service is running (if using MySQL)
   - Check database permissions

4. **"Webhook not receiving events"**
   - Verify webhook URL is accessible
   - Check webhook secret configuration

### Debug Mode

```bash
LOG_LEVEL=debug npm run dev
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- 📖 Check the [Documentation](README.md)
- 🐛 Create an [Issue](https://github.com/yourusername/gloria-food-delivery-service/issues)
- 💬 Join our [Discussions](https://github.com/yourusername/gloria-food-delivery-service/discussions)
- 📧 Contact: support@yourcompany.com

## 🙏 Acknowledgments

- [Gloria Food](https://gloriafood.com/) for the API
- [DoorDash](https://doordash.com/) for delivery integration
- [Node.js](https://nodejs.org/) and [TypeScript](https://www.typescriptlang.org/) communities

## 📈 Roadmap

- [ ] Support for additional delivery services (Uber Eats, Grubhub)
- [ ] Advanced analytics dashboard
- [ ] Mobile app integration
- [ ] Multi-restaurant support
- [ ] Advanced order routing
- [ ] Real-time notifications

---

⭐ **Star this repository** if you find it helpful!

🔔 **Watch** for updates and new features!

🍴 **Fork** to contribute to the project!