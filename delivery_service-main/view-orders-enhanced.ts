import * as dotenv from 'dotenv';
import { DatabaseFactory, IDatabase, Order } from './src/database-factory';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

const database = DatabaseFactory.createDatabase();

function displayOrder(order: Order, index?: number): void {
  const orderNum = index !== undefined ? `${index + 1}. ` : '';
  
  // Parse raw_data to extract more details
  let rawData: any = null;
  try {
    rawData = JSON.parse(order.raw_data);
  } catch (e) {
    // Ignore parsing errors
  }

  console.log(chalk.blue.bold(`\n${orderNum}📦 Order #${order.gloriafood_order_id}`));
  console.log(chalk.gray('  ════════════════════════════════════════════════════════════'));
  
  // Order Information Section
  console.log(chalk.yellow.bold('\n  📋 ORDER INFORMATION:'));
  console.log(`    ${chalk.bold('Order ID:')} ${order.gloriafood_order_id}`);
  console.log(`    ${chalk.bold('Internal ID:')} ${order.id}`);
  console.log(`    ${chalk.bold('Store ID:')} ${order.store_id || 'N/A'}`);
  console.log(`    ${chalk.bold('Status:')} ${formatStatus(order.status)}`);
  console.log(`    ${chalk.bold('Type:')} ${order.order_type || 'N/A'}`);
  console.log(`    ${chalk.bold('Total:')} ${order.currency} ${order.total_price.toFixed(2)}`);
  
  // Extract additional order details from raw_data
  if (rawData) {
    if (rawData.order_number) {
      console.log(`    ${chalk.bold('Order Number:')} ${rawData.order_number}`);
    }
    if (rawData.order_date) {
      console.log(`    ${chalk.bold('Order Date:')} ${new Date(rawData.order_date).toLocaleString()}`);
    }
    if (rawData.payment_method) {
      console.log(`    ${chalk.bold('Payment Method:')} ${rawData.payment_method}`);
    }
    if (rawData.note || rawData.notes || rawData.customer_note) {
      const note = rawData.note || rawData.notes || rawData.customer_note;
      console.log(`    ${chalk.bold('Notes:')} ${note}`);
    }
  }

  // Customer Information Section
  console.log(chalk.yellow.bold('\n  👤 CUSTOMER INFORMATION:'));
  
  // Try to extract customer info from multiple sources
  let customerName = order.customer_name;
  let customerPhone = order.customer_phone;
  let customerEmail = order.customer_email;
  
  if (rawData) {
    // Try different paths for customer data
    if (rawData.client) {
      const firstName = rawData.client.first_name || '';
      const lastName = rawData.client.last_name || '';
      if (firstName || lastName) {
        customerName = `${firstName} ${lastName}`.trim() || customerName;
      }
      customerPhone = rawData.client.phone || customerPhone;
      customerEmail = rawData.client.email || customerEmail;
    }
    if (rawData.customer) {
      customerName = rawData.customer.name || rawData.customer.first_name || customerName;
      customerPhone = rawData.customer.phone || customerPhone;
      customerEmail = rawData.customer.email || customerEmail;
    }
    if (rawData.customer_name) {
      customerName = rawData.customer_name || customerName;
    }
    if (rawData.phone || rawData.customer_phone) {
      customerPhone = rawData.phone || rawData.customer_phone || customerPhone;
    }
    if (rawData.email || rawData.customer_email) {
      customerEmail = rawData.email || rawData.customer_email || customerEmail;
    }
  }
  
  console.log(`    ${chalk.bold('Name:')} ${customerName || 'N/A'}`);
  console.log(`    ${chalk.bold('Phone:')} ${customerPhone || 'N/A'}`);
  console.log(`    ${chalk.bold('Email:')} ${customerEmail || 'N/A'}`);

  // Delivery Information Section
  console.log(chalk.yellow.bold('\n  📍 DELIVERY INFORMATION:'));
  
  let deliveryAddress = order.delivery_address;
  if (rawData) {
    if (rawData.delivery && rawData.delivery.address) {
      const addr = rawData.delivery.address;
      const addressParts = [
        addr.street || addr.address_line_1 || addr.address,
        addr.city,
        addr.state || addr.province,
        addr.zip || addr.postal_code,
        addr.country
      ].filter(Boolean);
      if (addressParts.length > 0) {
        deliveryAddress = addressParts.join(', ');
      }
    }
    if (rawData.delivery_address) {
      deliveryAddress = rawData.delivery_address || deliveryAddress;
    }
    if (rawData.address) {
      deliveryAddress = typeof rawData.address === 'string' ? rawData.address : JSON.stringify(rawData.address);
    }
    
    if (rawData.delivery) {
      if (rawData.delivery.phone) {
        console.log(`    ${chalk.bold('Delivery Phone:')} ${rawData.delivery.phone}`);
      }
      if (rawData.delivery.instructions) {
        console.log(`    ${chalk.bold('Delivery Instructions:')} ${rawData.delivery.instructions}`);
      }
      if (rawData.delivery.fee !== undefined) {
        console.log(`    ${chalk.bold('Delivery Fee:')} ${order.currency} ${rawData.delivery.fee}`);
      }
    }
  }
  
  console.log(`    ${chalk.bold('Address:')} ${deliveryAddress || 'N/A'}`);

  // Items Section
  console.log(chalk.yellow.bold('\n  🛒 ORDER ITEMS:'));
  try {
    const items = JSON.parse(order.items);
    if (Array.isArray(items) && items.length > 0) {
      let itemsTotal = 0;
      items.forEach((item: any, idx: number) => {
        const name = item.name || item.product_name || item.title || item.item_name || 'Unknown Item';
        const quantity = item.quantity || 1;
        const price = parseFloat(item.price || item.unit_price || item.total_price || 0);
        const subtotal = quantity * price;
        itemsTotal += subtotal;
        
        console.log(`    ${idx + 1}. ${name}`);
        console.log(`       ${chalk.gray(`Quantity: ${quantity} × ${order.currency} ${price.toFixed(2)} = ${order.currency} ${subtotal.toFixed(2)}`)}`);
        
        if (item.variations || item.options) {
          const variations = item.variations || item.options || [];
          variations.forEach((opt: any) => {
            console.log(`       ${chalk.gray(`  - ${opt.name || opt.title || ''}`)}`);
          });
        }
        if (item.note || item.special_instructions) {
          console.log(`       ${chalk.gray(`  Note: ${item.note || item.special_instructions}`)}`);
        }
      });
      
      const deliveryFee = order.total_price - itemsTotal;
      if (deliveryFee > 0 && deliveryFee.toFixed(2) !== '0.00') {
        console.log(`\n    ${chalk.bold('Subtotal:')} ${order.currency} ${itemsTotal.toFixed(2)}`);
        console.log(`    ${chalk.bold('Delivery Fee:')} ${order.currency} ${deliveryFee.toFixed(2)}`);
      }
      console.log(`    ${chalk.bold('Total:')} ${order.currency} ${order.total_price.toFixed(2)}`);
    } else {
      console.log(`    ${chalk.gray('No items data available')}`);
    }
  } catch (e) {
    console.log(`    ${chalk.gray('Error parsing items data')}`);
  }

  // Timestamps Section
  console.log(chalk.yellow.bold('\n  ⏰ TIMESTAMPS:'));
  console.log(`    ${chalk.bold('Created:')} ${new Date(order.created_at).toLocaleString()}`);
  console.log(`    ${chalk.bold('Updated:')} ${new Date(order.updated_at).toLocaleString()}`);
  console.log(`    ${chalk.bold('Received:')} ${new Date(order.fetched_at).toLocaleString()}`);
  
  console.log(chalk.gray('\n  ════════════════════════════════════════════════════════════'));
}

function formatStatus(status: string): string {
  const statusColors: { [key: string]: chalk.Chalk } = {
    'accepted': chalk.green,
    'pending': chalk.yellow,
    'preparing': chalk.cyan,
    'ready': chalk.blue,
    'completed': chalk.green,
    'cancelled': chalk.red,
    'rejected': chalk.red,
  };

  const lowerStatus = status.toLowerCase();
  const colorizer = statusColors[lowerStatus] || chalk.white;
  return colorizer(status.toUpperCase());
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log(chalk.blue.bold('\n📋 GloriaFood Orders Viewer\n'));

  try {
    if (command === 'stats' || command === 'summary') {
      // Show statistics
      const totalOrders = database.getOrderCount();
      const recentOrders = database.getRecentOrders(60);
      const recentOrders24h = database.getRecentOrders(1440);
      const allOrders = database.getAllOrders(1000);

      // Calculate by status
      const statusCounts: { [key: string]: number } = {};
      let totalRevenue = 0;
      
      allOrders.forEach(order => {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
        totalRevenue += order.total_price || 0;
      });

      console.log(chalk.green.bold('📊 Statistics:\n'));
      console.log(`  Total Orders: ${chalk.bold(totalOrders.toString())}`);
      console.log(`  Recent (1 hour): ${chalk.bold(recentOrders.length.toString())}`);
      console.log(`  Recent (24 hours): ${chalk.bold(recentOrders24h.length.toString())}`);
      console.log(`  Total Revenue: ${chalk.bold(`${allOrders[0]?.currency || 'USD'} ${totalRevenue.toFixed(2)}`)}\n`);
      
      console.log(chalk.green.bold('Status Breakdown:\n'));
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  ${formatStatus(status)}: ${count}`);
      });

    } else if (command === 'recent') {
      // Show recent orders
      const minutes = parseInt(args[1]) || 60;
      const orders = database.getRecentOrders(minutes);
      
      console.log(chalk.green.bold(`📦 Recent Orders (Last ${minutes} minutes):\n`));
      
      if (orders.length === 0) {
        console.log(chalk.gray('  No orders found in the last ' + minutes + ' minutes.'));
      } else {
        orders.forEach((order, index) => {
          displayOrder(order, index);
        });
        console.log(chalk.green(`\n✅ Found ${orders.length} order(s)\n`));
      }

    } else if (command === 'status') {
      // Show orders by status
      const status = args[1];
      if (!status) {
        console.error(chalk.red('Please specify a status. Example: npm run view-orders status accepted'));
        process.exit(1);
      }
      
      const orders = database.getOrdersByStatus(status);
      console.log(chalk.green.bold(`📦 Orders with status "${status.toUpperCase()}":\n`));
      
      if (orders.length === 0) {
        console.log(chalk.gray(`  No orders found with status: ${status}`));
      } else {
        orders.forEach((order, index) => {
          displayOrder(order, index);
        });
        console.log(chalk.green(`\n✅ Found ${orders.length} order(s)\n`));
      }

    } else if (command === 'order' || command === 'id') {
      // Show specific order
      const orderId = args[1];
      if (!orderId) {
        console.error(chalk.red('Please specify an order ID. Example: npm run view-orders order 12345'));
        process.exit(1);
      }
      
      const order = database.getOrderByGloriaFoodId(orderId);
      if (!order) {
        console.error(chalk.red(`Order not found: ${orderId}`));
        process.exit(1);
      }
      
      displayOrder(order);
      console.log(chalk.green(`\n✅ Order found\n`));

    } else if (command === 'all' || !command) {
      // Show all orders
      const limit = parseInt(args[1]) || 50;
      const orders = database.getAllOrders(limit);
      
      console.log(chalk.green.bold(`📦 All Orders (Showing ${Math.min(limit, orders.length)} of ${database.getOrderCount()}):\n`));
      
      if (orders.length === 0) {
        console.log(chalk.gray('  No orders found in database.'));
      } else {
        orders.forEach((order, index) => {
          displayOrder(order, index);
        });
        console.log(chalk.green(`\n✅ Displayed ${orders.length} order(s)\n`));
      }

    } else {
      console.error(chalk.red(`Unknown command: ${command}`));
      console.log(chalk.yellow('\nAvailable commands:'));
      console.log('  npm run view-orders              - Show all orders (limit 50)');
      console.log('  npm run view-orders all [limit]  - Show all orders');
      console.log('  npm run view-orders recent [min] - Show recent orders (default: 60 minutes)');
      console.log('  npm run view-orders stats        - Show statistics');
      console.log('  npm run view-orders status <status> - Show orders by status');
      console.log('  npm run view-orders order <id>   - Show specific order\n');
      process.exit(1);
    }

  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  } finally {
    database.close();
  }
}

main();

