# Gloria Food API - Quick Start Guide

This guide will help you get started with the Gloria Food API integration script quickly.

## Prerequisites

- Node.js 18+ installed
- Gloria Food API credentials
- Basic knowledge of TypeScript/JavaScript

## Setup (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy the example environment file and add your credentials:
```bash
cp env.example .env
```

Edit `.env` with your Gloria Food API details:
```env
GLORIA_FOOD_API_URL=https://api.gloriafood.com/api/v1
GLORIA_FOOD_API_KEY=your_actual_api_key
GLORIA_FOOD_RESTAURANT_ID=your_restaurant_id
```

### 3. Test Connection
```bash
npm run cli test
```

If successful, you should see:
```
✅ API connection successful
```

## Common Use Cases

### 1. Get All Orders
```bash
npm run cli list
```

### 2. Get Delivery Orders Only
```bash
npm run cli delivery
```

### 3. Get Pending Orders
```bash
npm run cli pending
```

### 4. Get Order Details
```bash
npm run cli get 12345
```

### 5. Update Order Status
```bash
npm run cli update 12345 confirmed
```

### 6. Start Webhook Server
```bash
npm run webhook
```

## Programmatic Usage

### Basic Example
```typescript
import { GloriaFoodApiClient } from './services/gloria-food-api-client';
import { ConfigManager } from './utils/config';

const config = ConfigManager.getInstance();
const apiClient = new GloriaFoodApiClient(config.getConfig());

// Get pending delivery orders
const orders = await apiClient.getPendingDeliveryOrders();
console.log(`Found ${orders.length} pending orders`);

// Process each order
for (const order of orders) {
  console.log(`Processing order ${order.orderNumber}`);
  // Your delivery integration logic here
}
```

### Webhook Example
```typescript
import { GloriaFoodWebhookHandler } from './services/webhook-handler';

const webhookHandler = new GloriaFoodWebhookHandler(3000);
await webhookHandler.start();

// Webhook will automatically handle:
// - order.created events
// - order.updated events  
// - order.cancelled events
// - order.delivered events
```

## Integration with Delivery Services

### DoorDash Integration Example
```typescript
class DeliveryService {
  async processOrder(order: GloriaFoodOrder) {
    // 1. Create delivery request
    const deliveryRequest = {
      external_delivery_id: order.orderNumber,
      pickup_address: this.getRestaurantAddress(),
      dropoff_address: order.delivery.address,
      pickup_phone_number: this.getRestaurantPhone(),
      dropoff_phone_number: order.customer.phone,
      order_value: order.total
    };

    // 2. Send to DoorDash
    const delivery = await this.doorDashClient.createDelivery(deliveryRequest);
    
    // 3. Update Gloria Food order
    await this.gloriaFoodClient.updateOrderStatus(order.id, 'out_for_delivery');
    
    return delivery;
  }
}
```

## Troubleshooting

### Connection Issues
```bash
# Check your API credentials
npm run cli test

# Enable debug logging
LOG_LEVEL=debug npm run cli test
```

### Webhook Issues
```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"event":"order.created","order":{"id":123}}'
```

### Common Errors

1. **"Missing required environment variables"**
   - Check your `.env` file has all required variables

2. **"API connection failed"**
   - Verify API URL and credentials
   - Check network connectivity

3. **"Invalid webhook signature"**
   - Ensure `WEBHOOK_SECRET` matches Gloria Food configuration

## Next Steps

1. **Run Examples**: `npm run examples`
2. **Read Full Documentation**: See README.md
3. **Explore CLI Commands**: `npm run cli --help`
4. **Set Up Webhooks**: Configure in Gloria Food dashboard
5. **Integrate Delivery Service**: Use the examples as templates

## Need Help?

- Check the full README.md for detailed documentation
- Review examples in `src/examples/`
- Use `npm run cli --help` for CLI options
- Enable debug logging: `LOG_LEVEL=debug`

## Production Deployment

### Environment Variables for Production
```env
GLORIA_FOOD_API_URL=https://api.gloriafood.com/api/v1
GLORIA_FOOD_API_KEY=your_production_api_key
GLORIA_FOOD_RESTAURANT_ID=your_restaurant_id
WEBHOOK_SECRET=your_webhook_secret
LOG_LEVEL=info
LOG_FILE=/var/log/delivery-service.log
MAX_RETRY_ATTEMPTS=5
REQUESTS_PER_MINUTE=100
```

### Build for Production
```bash
npm run build
npm start
```

### Docker Deployment
```bash
docker build -t gloria-food-api .
docker run -p 3000:3000 --env-file .env gloria-food-api
```

That's it! You're ready to start integrating with the Gloria Food API.
