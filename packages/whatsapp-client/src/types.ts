export type WhatsAppSessionStatus = 'INITIALIZING' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'FAILED';

export interface WhatsAppSession {
  id: string;
  name: string;
  status: WhatsAppSessionStatus;
  phoneNumber: string | null;
  pushName: string | null;
  connectedAt: string | null;
  createdAt: string;
}

export interface WhatsAppQRCode {
  code: string;
  image: string;
}

export type WhatsAppNotificationEvent = 'PROCUREMENT_RECEIVED' | 'INVOICE_APPROVED' | 'RECEIPT_SCANNED' | 'LOW_STOCK_ALERT';

export interface WhatsAppNotificationPayload {
  tenantId: string;
  locationName: string;
  event: WhatsAppNotificationEvent;
  recipientPhone: string;
  data: Record<string, string | number>;
}

export type WhatsAppInboundCommand = 'CONFIRM' | 'STOP' | 'START' | 'UNKNOWN';

export interface WhatsAppInboundMessage {
  from: string;
  body: string;
  command: WhatsAppInboundCommand;
  timestamp: string;
  sessionId: string;
}

export interface OpenWAClientConfig {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
  timeoutMs?: number;
}
