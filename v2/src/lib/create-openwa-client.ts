import { OpenWAClient } from '@synculariti/whatsapp-client';

export function createOpenWAClient(): OpenWAClient {
  return new OpenWAClient({
    baseUrl: process.env.OPENWA_BASE_URL || 'http://34.66.35.89:2785',
    apiKey: process.env.OPENWA_API_KEY || '',
    sessionId: process.env.OPENWA_SESSION_ID || 'synculariti-bot',
  });
}
