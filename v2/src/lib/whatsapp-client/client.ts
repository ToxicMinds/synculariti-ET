import { OpenWAClientConfig, WhatsAppSessionStatus } from './types';

export class OpenWAClient {
  private config: OpenWAClientConfig;

  constructor(config: OpenWAClientConfig) {
    this.config = config;
  }
  
  async sendText(to: string, text: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/sendText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.config.apiKey,
        },
        body: JSON.stringify({
          chatId: to,
          text: text,
          session: this.config.sessionId
        })
      });
      return response.ok;
    } catch (e: unknown) {
      return false;
    }
  }

  async sendPoll(to: string, name: string, options: string[], webhookUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/sendPoll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.config.apiKey,
        },
        body: JSON.stringify({
          chatId: to,
          name: name,
          options: options,
          webhookUrl: webhookUrl,
          session: this.config.sessionId
        })
      });
      return response.ok;
    } catch (e: unknown) {
      return false;
    }
  }

  async getSessionStatus(): Promise<{ status: WhatsAppSessionStatus }> {
    const response = await fetch(`${this.config.baseUrl}/api/sessions/${this.config.sessionId}/status`, {
      headers: {
        'X-Api-Key': this.config.apiKey,
      }
    });
    return response.json();
  }
}
