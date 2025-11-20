import nodemailer, { Transporter } from 'nodemailer';
import chalk from 'chalk';

type MerchantEvent = 'new-order' | 'status-update' | 'cancelled' | 'general';

export interface MerchantEmailContext {
  event: MerchantEvent;
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

  constructor() {
    this.config = this.loadConfig();

    if (this.config.host && this.config.user && this.config.pass && this.config.to) {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port || 587,
        secure: this.config.secure ?? (this.config.port === 465),
        auth: {
          user: this.config.user,
          pass: this.config.pass,
        },
      });
      this.enabled = true;
      console.log(chalk.green('✅ Merchant email notifications enabled'));
    } else {
      this.enabled = false;
      console.log(
        chalk.yellow(
          '⚠️  Merchant email notifications disabled (missing SMTP_HOST/SMTP_USER/SMTP_PASS/MERCHANT_EMAIL)'
        )
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendOrderUpdate(orderData: any, context: MerchantEmailContext): Promise<void> {
    if (!this.enabled || !this.transporter || !this.config.to) {
      return;
    }

    const subject = this.buildSubject(orderData, context);
    const text = this.buildTextBody(orderData, context);
    const html = this.buildHtmlBody(orderData, context);

    try {
      await this.transporter.sendMail({
        from: this.config.from || this.config.user,
        to: this.config.to,
        subject,
        text,
        html,
      });
      console.log(
        chalk.green(
          `📧 Merchant email sent (${context.event}) for order ${this.getOrderId(orderData) || 'unknown'}`
        )
      );
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to send merchant email: ${error.message}`));
    }
  }

  private loadConfig(): EmailConfig {
    const portValue = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
    const secureEnv = (process.env.SMTP_SECURE || '').toLowerCase();

    return {
      host: process.env.SMTP_HOST,
      port: Number.isFinite(portValue) ? portValue : undefined,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      secure: secureEnv === 'true' || secureEnv === '1',
      from: process.env.SMTP_FROM,
      to: process.env.MERCHANT_EMAIL,
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
}


