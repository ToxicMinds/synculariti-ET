import { WhatsAppNotificationEvent, WhatsAppInboundCommand } from './types';

export const Templates: Record<WhatsAppNotificationEvent, (data: any) => string> = {
  PROCUREMENT_RECEIVED: (data) => `📦 PO Received: ${data.poNumber}\nSupplier: ${data.supplier}`,
  INVOICE_APPROVED: (data) => `✅ Invoice Approved: ${data.invoiceId}`,
  RECEIPT_SCANNED: (data) => `🧾 Receipt Scanned: ${data.totalAmount}`,
  LOW_STOCK_ALERT: (data) => `⚠️ Low Stock: ${data.itemName}`,
};

export function parseInboundCommand(body: string): WhatsAppInboundCommand {
  const upperBody = body.toUpperCase();
  if (upperBody.includes('CONFIRM')) return 'CONFIRM';
  if (upperBody.includes('STOP')) return 'STOP';
  if (upperBody.includes('START')) return 'START';
  return 'UNKNOWN';
}
