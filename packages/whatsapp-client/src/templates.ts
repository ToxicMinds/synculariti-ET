import { WhatsAppNotificationEvent, WhatsAppInboundCommand } from './types';

export const Templates: Record<WhatsAppNotificationEvent, (data: Record<string, string | number>) => string> = {
  PROCUREMENT_RECEIVED: (data) => `📦 PO Received: ${String(data['poNumber'] || '')}\nSupplier: ${String(data['supplier'] || '')}`,
  INVOICE_APPROVED: (data) => `✅ Invoice Approved: ${String(data['invoiceId'] || '')}`,
  RECEIPT_SCANNED: (data) => `🧾 Receipt Scanned: ${String(data['totalAmount'] || '')}`,
  LOW_STOCK_ALERT: (data) => `⚠️ Low Stock: ${String(data['itemName'] || '')}`,
};

export function parseInboundCommand(body: string): WhatsAppInboundCommand {
  const upperBody = body.toUpperCase();
  if (upperBody.includes('CONFIRM')) return 'CONFIRM';
  if (upperBody.includes('STOP')) return 'STOP';
  if (upperBody.includes('START')) return 'START';
  return 'UNKNOWN';
}
