import * as dotenv from 'dotenv';
import chalk from 'chalk';
import { EmailService } from '../email-service';

dotenv.config();

async function main() {
  console.log(chalk.blue('\n📧 Testing merchant email configuration...\n'));

  const emailService = new EmailService();
  if (!emailService.isEnabled()) {
    console.log(
      chalk.red(
        '❌ Merchant email notifications are disabled.\n   Ensure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and MERCHANT_EMAIL are set.'
      )
    );
    process.exit(1);
  }

  const mockOrder = {
    orderNumber: `TEST-${Date.now()}`,
    client_name: 'Merchant Email Test',
    client_first_name: 'Merchant',
    client_last_name: 'Tester',
    client_phone: '+1 555 0100',
    client_email: process.env.MERCHANT_EMAIL,
    currency: 'USD',
    total_price: '25.50',
    client_address: '123 Sample Street, Manila, PH',
    items: [
      { name: 'Sample Pizza', quantity: 1, price: 12.5 },
      { name: 'Sample Pasta', quantity: 1, price: 13.0 },
    ],
  };

  try {
    await emailService.sendOrderUpdate(mockOrder, {
      event: 'general',
      currentStatus: 'TEST',
      notes: `Manual test triggered at ${new Date().toISOString()}`,
    });
    console.log(chalk.green('\n✅ Test email sent! Check the merchant inbox.\n'));
  } catch (error: any) {
    console.error(chalk.red(`\n❌ Failed to send test email: ${error.message}`));
    process.exit(1);
  }
}

main();

