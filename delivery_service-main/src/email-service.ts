import nodemailer, { Transporter } from 'nodemailer';
import chalk from 'chalk';

type MerchantEvent = 'new-order' | 'status-update' | 'cancelled' | 'general';

export interface MerchantEmailContext {
  event: MerchantEvent;
  previousStatus?: string;
  currentStatus?: string;
  notes?: string;
}

export interface CustomerEmailContext {
  event: 'order-confirmation' | 'status-update' | 'order-cancelled';
  previousStatus?: string;
  currentStatus?: string;
  notes?: string;
}

interface EmailConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  secure?: boolean;
  from?: string;
  to?: string;
}

export class EmailService {
  private transporter?: Transporter;
  private readonly config: EmailConfig;
  private readonly enabled: boolean;
  private readonly customerEmailsEnabled: boolean;

  constructor() {
    this.config = this.loadConfig();

    // Check what's missing
    const missing: string[] = [];
    if (!this.config.host) missing.push('SMTP_HOST');
    if (!this.config.user) missing.push('SMTP_USER');
    if (!this.config.pass) missing.push('SMTP_PASS');

    if (this.config.host && this.config.user && this.config.pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host: this.config.host,
          port: this.config.port || 587,
          secure: this.config.secure ?? (this.config.port === 465),
          auth: {
            user: this.config.user,
            pass: this.config.pass,
          },
          // Increased timeouts for Render/cloud environments
          connectionTimeout: 30000, // 30 seconds
          greetingTimeout: 30000,   // 30 seconds
          socketTimeout: 30000,     // 30 seconds
          // Additional options for better reliability
          requireTLS: !this.config.secure && (this.config.port === 587 || !this.config.port),
          tls: {
            rejectUnauthorized: false, // Allow self-signed certificates if needed
            ciphers: 'SSLv3'
          },
          // Pool connections for better performance
          pool: true,
          maxConnections: 1,
          maxMessages: 3,
        });
        
        // Verify transporter connection (async, will run in background)
        this.verifyConnection().catch(err => {
          console.error(chalk.red('Error verifying SMTP connection:'), err);
        });
        
        // Merchant emails enabled if merchant email is set (checks MERCHANT_EMAIL, API_VENDOR_CONTACT_EMAIL, VENDOR_CONTACT_EMAIL, or VENDOR_EMAIL)
        this.enabled = !!this.config.to;
        if (this.enabled) {
          console.log(chalk.green('✅ Merchant email notifications enabled'));
          console.log(chalk.gray(`   SMTP Host: ${this.config.host}:${this.config.port || 587}`));
          console.log(chalk.gray(`   SMTP User: ${this.config.user}`));
          console.log(chalk.gray(`   Merchant Email: ${this.config.to}`));
        } else {
          console.log(chalk.yellow('⚠️  Merchant email notifications disabled (missing merchant email variable)'));
          console.log(chalk.gray('   Set one of these environment variables to enable merchant notifications:'));
          console.log(chalk.gray('   - MERCHANT_EMAIL'));
          console.log(chalk.gray('   - API_VENDOR_CONTACT_EMAIL'));
          console.log(chalk.gray('   - VENDOR_CONTACT_EMAIL'));
          console.log(chalk.gray('   - VENDOR_EMAIL'));
        }
        
        // Customer emails enabled by default if SMTP is configured
        // Can be disabled with SEND_CUSTOMER_EMAILS=false
        const customerEmailsEnv = (process.env.SEND_CUSTOMER_EMAILS || 'true').toLowerCase();
        this.customerEmailsEnabled = customerEmailsEnv === 'true' || customerEmailsEnv === '1';
        
        if (this.customerEmailsEnabled) {
          console.log(chalk.green('✅ Customer email notifications enabled'));
        } else {
          console.log(chalk.yellow('⚠️  Customer email notifications disabled (SEND_CUSTOMER_EMAILS=false)'));
        }
      } catch (error: any) {
        this.enabled = false;
        this.customerEmailsEnabled = false;
        console.error(chalk.red(`❌ Failed to initialize email transporter: ${error.message}`));
      }
    } else {
      this.enabled = false;
      this.customerEmailsEnabled = false;
      console.log(
        chalk.yellow(
          `⚠️  Email notifications disabled (missing: ${missing.join(', ')})`
        )
      );
      console.log(chalk.gray('   Required environment variables:'));
      console.log(chalk.gray('   - SMTP_HOST (e.g., smtp.gmail.com, smtp.outlook.com)'));
      console.log(chalk.gray('   - SMTP_USER (your email address)'));
      console.log(chalk.gray('   - SMTP_PASS (your email password or app password)'));
      console.log(chalk.gray('   - SMTP_PORT (optional, default: 587)'));
      console.log(chalk.gray('   - SMTP_SECURE (optional, true for port 465)'));
      console.log(chalk.gray('   - MERCHANT_EMAIL or API_VENDOR_CONTACT_EMAIL or VENDOR_CONTACT_EMAIL or VENDOR_EMAIL (email address to receive order notifications)'));
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isCustomerEmailsEnabled(): boolean {
    return this.customerEmailsEnabled && !!this.transporter;
  }

  isTransporterAvailable(): boolean {
    return !!this.transporter;
  }

  private async verifyConnection(): Promise<void> {
    if (!this.transporter) return;
    
    try {
      await this.transporter.verify();
      console.log(chalk.green('✅ SMTP connection verified successfully'));
    } catch (error: any) {
      console.error(chalk.red('❌ SMTP connection verification failed:'));
      console.error(chalk.red(`   ${error.message}`));
      if (error.code) {
        console.error(chalk.red(`   Error Code: ${error.code}`));
      }
      console.error(chalk.yellow('⚠️  Emails may not be sent. Please check your SMTP configuration.'));
    }
  }

  async sendOrderUpdate(orderData: any, context: MerchantEmailContext): Promise<void> {
    if (!this.enabled || !this.transporter || !this.config.to) {
      if (!this.enabled) {
        console.log(chalk.yellow(`⚠️  Email service disabled, skipping email for order ${this.getOrderId(orderData) || 'unknown'}`));
      } else if (!this.transporter) {
        console.log(chalk.yellow(`⚠️  Email transporter not initialized, skipping email for order ${this.getOrderId(orderData) || 'unknown'}`));
      } else if (!this.config.to) {
        console.log(chalk.yellow(`⚠️  Merchant email not set (check MERCHANT_EMAIL, API_VENDOR_CONTACT_EMAIL, VENDOR_CONTACT_EMAIL, or VENDOR_EMAIL), skipping email for order ${this.getOrderId(orderData) || 'unknown'}`));
      }
      return;
    }

    const subject = this.buildSubject(orderData, context);
    const text = this.buildTextBody(orderData, context);
    const html = this.buildHtmlBody(orderData, context);

    const orderId = this.getOrderId(orderData) || 'unknown';
    
    try {
      console.log(chalk.blue(`📧 Attempting to send merchant email for order ${orderId}...`));
      console.log(chalk.gray(`   To: ${this.config.to}`));
      console.log(chalk.gray(`   Subject: ${subject}`));
      console.log(chalk.gray(`   SMTP Host: ${this.config.host}:${this.config.port || 587}`));
      
      // Add timeout wrapper for the sendMail operation
      const sendMailPromise = this.transporter.sendMail({
        from: this.config.from || this.config.user,
        to: this.config.to,
        subject,
        text,
        html,
      });

      // Reduced timeout to 30 seconds for faster failure detection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Email send operation timed out after 30 seconds')), 30000);
      });

      const result = await Promise.race([sendMailPromise, timeoutPromise]) as any;
      
      console.log(
        chalk.green(
          `✅ Merchant email sent successfully (${context.event}) for order ${orderId}`
        )
      );
      console.log(chalk.gray(`   Message ID: ${result.messageId || 'N/A'}`));
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to send merchant email for order ${orderId}`));
      console.error(chalk.red(`   Error: ${error.message}`));
      
      // More detailed error logging
      if (error.code) {
        console.error(chalk.red(`   Error Code: ${error.code}`));
      }
      if (error.response) {
        console.error(chalk.red(`   SMTP Response: ${error.response}`));
      }
      if (error.responseCode) {
        console.error(chalk.red(`   Response Code: ${error.responseCode}`));
      }
      if (error.command) {
        console.error(chalk.red(`   Failed Command: ${error.command}`));
      }
      if (error.errno) {
        console.error(chalk.red(`   System Error: ${error.errno}`));
      }
      
      // Check if it's a connection timeout issue
      if (error.message && (error.message.includes('timeout') || error.message.includes('ETIMEDOUT') || error.code === 'ETIMEDOUT')) {
        console.error(chalk.yellow(`   ⚠️  Connection timeout detected. This might be due to:`));
        console.error(chalk.yellow(`      - Network restrictions on Render (free tier may block SMTP)`));
        console.error(chalk.yellow(`      - Firewall blocking outbound SMTP connections`));
        console.error(chalk.yellow(`      - Gmail blocking connections from Render's IP`));
        console.error(chalk.yellow(`      - Try using a different SMTP service (SendGrid, Mailgun, etc.)`));
      }
      
      // Don't re-throw - allow the webhook to continue processing
      // The order is still saved even if email fails
    }
  }

  private loadConfig(): EmailConfig {
    const portValue = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
    const secureEnv = (process.env.SMTP_SECURE || '').toLowerCase();

    // Check for merchant email in multiple possible variable names
    const merchantEmail = 
      process.env.MERCHANT_EMAIL ||
      process.env.API_VENDOR_CONTACT_EMAIL ||
      process.env.VENDOR_CONTACT_EMAIL ||
      process.env.VENDOR_EMAIL;

    return {
      host: process.env.SMTP_HOST,
      port: Number.isFinite(portValue) ? portValue : undefined,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      secure: secureEnv === 'true' || secureEnv === '1',
      from: process.env.SMTP_FROM,
      to: merchantEmail,
    };
  }

  private buildSubject(orderData: any, context: MerchantEmailContext): string {
    const orderId = this.getOrderId(orderData) || 'Order';
    const status = (context.currentStatus || orderData.status || orderData.order_status || '').toUpperCase();

    switch (context.event) {
      case 'new-order':
        return `🆕 New Order ${orderId} (${status || 'New'})`;
      case 'status-update':
        return `🔁 Order ${orderId} status updated to ${status || 'updated'}`;
      case 'cancelled':
        return `⚠️ Order ${orderId} was cancelled`;
      default:
        return `📬 Update for ${orderId}`;
    }
  }

  private buildTextBody(orderData: any, context: MerchantEmailContext): string {
    const lines = [
      `Event: ${context.event}`,
      `Order ID: ${this.getOrderId(orderData) || 'N/A'}`,
      `Status: ${(context.currentStatus || orderData.status || 'unknown').toString()}`,
      context.previousStatus ? `Previous Status: ${context.previousStatus}` : null,
      `Customer: ${this.getCustomerName(orderData)}`,
      `Phone: ${this.getCustomerPhone(orderData)}`,
      `Email: ${this.getCustomerEmail(orderData)}`,
      `Total: ${this.getCurrency(orderData)} ${this.getTotal(orderData).toFixed(2)}`,
      `Delivery Address: ${this.getDeliveryAddress(orderData)}`,
      context.notes ? `Notes: ${context.notes}` : null,
      '',
      'Items:',
      ...this.getItems(orderData).map(
        (item) => ` - ${item.quantity || 1} x ${item.name || 'Item'} (${this.getCurrency(orderData)} ${Number(item.price || item.unit_price || 0).toFixed(2)})`
      ),
    ].filter(Boolean);

    return lines.join('\n');
  }

  private buildHtmlBody(orderData: any, context: MerchantEmailContext): string {
    const currency = this.getCurrency(orderData);
    const itemsHtml = this.getItems(orderData)
      .map((item) => {
        const qty = item.quantity || 1;
        const price = Number(item.price || item.unit_price || 0);
        return `<tr>
          <td style="padding: 4px 8px;">${qty} × ${this.escapeHtml(item.name || 'Item')}</td>
          <td style="padding: 4px 8px; text-align:right;">${currency} ${(qty * price).toFixed(2)}</td>
        </tr>`;
      })
      .join('');

    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2 style="margin-bottom: 8px;">${this.escapeHtml(this.buildSubject(orderData, context))}</h2>
        <p style="margin: 4px 0;"><strong>Order ID:</strong> ${this.escapeHtml(this.getOrderId(orderData) || 'N/A')}</p>
        <p style="margin: 4px 0;"><strong>Status:</strong> ${this.escapeHtml(
          (context.currentStatus || orderData.status || 'unknown').toString()
        )}</p>
        ${context.previousStatus ? `<p style="margin:4px 0;"><strong>Previous Status:</strong> ${this.escapeHtml(context.previousStatus)}</p>` : ''}
        <p style="margin: 4px 0;"><strong>Customer:</strong> ${this.escapeHtml(this.getCustomerName(orderData))}</p>
        <p style="margin: 4px 0;"><strong>Phone:</strong> ${this.escapeHtml(this.getCustomerPhone(orderData))}</p>
        <p style="margin: 4px 0;"><strong>Email:</strong> ${this.escapeHtml(this.getCustomerEmail(orderData))}</p>
        <p style="margin: 4px 0;"><strong>Total:</strong> ${currency} ${this.getTotal(orderData).toFixed(2)}</p>
        <p style="margin: 4px 0;"><strong>Delivery Address:</strong> ${this.escapeHtml(this.getDeliveryAddress(orderData))}</p>
        ${context.notes ? `<p style="margin: 4px 0;"><strong>Notes:</strong> ${this.escapeHtml(context.notes)}</p>` : ''}
        <h3 style="margin-top: 16px;">Items</h3>
        <table style="width:100%; border-collapse: collapse;">
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  private getItems(orderData: any): any[] {
    if (Array.isArray(orderData.items)) return orderData.items;
    if (Array.isArray(orderData.order_items)) return orderData.order_items;
    return [];
  }

  private getCurrency(orderData: any): string {
    return (orderData.currency || orderData.currency_code || 'USD').toString();
  }

  private getTotal(orderData: any): number {
    const total = parseFloat(orderData.total_price || orderData.total || '0');
    return Number.isFinite(total) ? total : 0;
  }

  private getCustomerName(orderData: any): string {
    const candidates = [
      orderData.client_name,
      `${orderData.client_first_name || ''} ${orderData.client_last_name || ''}`.trim(),
      orderData.client?.name,
      `${orderData.client?.first_name || ''} ${orderData.client?.last_name || ''}`.trim(),
      orderData.customer?.name,
      `${orderData.customer?.first_name || ''} ${orderData.customer?.last_name || ''}`.trim(),
      orderData.customer_name,
    ];
    return this.firstNonEmpty(candidates) || 'Unknown Customer';
  }

  private getCustomerPhone(orderData: any): string {
    const candidates = [
      orderData.client_phone,
      orderData.client?.phone,
      orderData.customer?.phone,
      orderData.customer_phone,
      orderData.phone,
    ];
    return this.firstNonEmpty(candidates) || 'N/A';
  }

  private getCustomerEmail(orderData: any): string {
    const candidates = [
      orderData.client_email,
      orderData.client?.email,
      orderData.customer?.email,
      orderData.customer_email,
      orderData.email,
    ];
    return this.firstNonEmpty(candidates) || 'N/A';
  }

  private getDeliveryAddress(orderData: any): string {
    if (orderData.client_address) {
      return orderData.client_address;
    }

    const parts: string[] = [];
    const structured = orderData.client_address_parts || orderData.delivery?.address || {};

    if (structured.street || structured.address_line_1) {
      parts.push(structured.street || structured.address_line_1);
    } else if (orderData.delivery?.address?.street) {
      parts.push(orderData.delivery.address.street);
    }

    if (structured.more_address || structured.address_line_2) {
      parts.push(structured.more_address || structured.address_line_2);
    }

    if (structured.city || orderData.delivery?.address?.city) {
      parts.push(structured.city || orderData.delivery.address.city);
    }

    if (structured.state || orderData.delivery?.address?.state) {
      parts.push(structured.state || orderData.delivery.address.state);
    }

    if (structured.zip || structured.postal_code || orderData.delivery?.address?.zipCode) {
      parts.push(structured.zip || structured.postal_code || orderData.delivery.address.zipCode);
    }

    if (structured.country || orderData.delivery?.address?.country) {
      parts.push(structured.country || orderData.delivery.address.country);
    }

    if (parts.length > 0) {
      return parts.filter(Boolean).join(', ');
    }

    return 'N/A';
  }

  private getOrderId(orderData: any): string | null {
    if (!orderData) return null;

    const candidates = [
      orderData.orderNumber,
      orderData.order_number,
      orderData.id,
      orderData.order_id,
      orderData.external_delivery_id,
    ];

    return this.firstNonEmpty(candidates, null);
  }

  private firstNonEmpty(values: Array<string | undefined | null>, fallback: string | null = null): string | null {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return fallback;
  }

  private escapeHtml(value: string): string {
    return (value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async sendPasswordResetEmail(email: string, resetToken: string, resetUrl: string): Promise<void> {
    if (!this.transporter) {
      console.log(chalk.yellow('⚠️  Email transporter not initialized, cannot send password reset email'));
      console.log(chalk.gray('   Make sure SMTP_HOST, SMTP_USER, and SMTP_PASS are configured in your .env file'));
      throw new Error('Email transporter not initialized');
    }

    const subject = 'Reset Your Password - TekMax Delivery Management';
    const text = this.buildPasswordResetText(email, resetToken, resetUrl);
    const html = this.buildPasswordResetHtml(email, resetToken, resetUrl);

    try {
      console.log(chalk.blue(`📧 Sending password reset email to ${email}...`));
      console.log(chalk.gray(`   From: ${this.config.from || this.config.user}`));
      console.log(chalk.gray(`   To: ${email}`));
      console.log(chalk.gray(`   SMTP Host: ${this.config.host}:${this.config.port || 587}`));
      
      const sendMailPromise = this.transporter.sendMail({
        from: this.config.from || this.config.user,
        to: email,
        subject,
        text,
        html,
      });

      // Reduced timeout to 30 seconds for faster failure detection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Email send operation timed out after 30 seconds')), 30000);
      });

      const result = await Promise.race([sendMailPromise, timeoutPromise]) as any;
      
      console.log(chalk.green(`✅ Password reset email sent successfully to ${email}`));
      console.log(chalk.gray(`   Message ID: ${result.messageId || 'N/A'}`));
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to send password reset email to ${email}`));
      console.error(chalk.red(`   Error: ${error.message}`));
      throw error;
    }
  }

  private buildPasswordResetText(email: string, resetToken: string, resetUrl: string): string {
    return `
Reset Your Password - TekMax Delivery Management

Hello,

You requested to reset your password for your TekMax account.

Click the link below to reset your password:
${resetUrl}

Or copy and paste this token if the link doesn't work:
${resetToken}

This link will expire in 1 hour.

If you didn't request this password reset, please ignore this email.

Best regards,
TekMax Team
    `.trim();
  }

  private buildPasswordResetHtml(email: string, resetToken: string, resetUrl: string): string {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">TekMax</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Delivery Management System</p>
        </div>
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #0f172a; margin-top: 0;">Reset Your Password</h2>
          <p style="color: #475569;">Hello,</p>
          <p style="color: #475569;">You requested to reset your password for your TekMax account (${this.escapeHtml(email)}).</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Reset Password</a>
          </div>
          <p style="color: #64748b; font-size: 14px; margin-top: 30px;">Or copy and paste this link into your browser:</p>
          <p style="color: #3b82f6; word-break: break-all; font-size: 12px; background: #f1f5f9; padding: 10px; border-radius: 6px;">${resetUrl}</p>
          <p style="color: #64748b; font-size: 14px; margin-top: 20px;"><strong>Reset Token:</strong></p>
          <p style="color: #1e293b; font-size: 14px; background: #f8fafc; padding: 10px; border-radius: 6px; font-family: monospace; word-break: break-all;">${resetToken}</p>
          <p style="color: #ef4444; font-size: 13px; margin-top: 20px;"><strong>⚠️ This link will expire in 1 hour.</strong></p>
          <p style="color: #64748b; font-size: 14px; margin-top: 30px;">If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">Best regards,<br>TekMax Team</p>
        </div>
      </div>
    `.trim();
  }
}


