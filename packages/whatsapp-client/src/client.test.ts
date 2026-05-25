import { OpenWAClient } from './client';

describe('OpenWAClient', () => {
  const config = {
    baseUrl: 'http://34.66.35.89:2785',
    apiKey: 'mock-key',
    sessionId: 'mock-session'
  };

  it('should format requests correctly when sending text', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
    ) as jest.Mock;

    const client = new OpenWAClient(config);
    const result = await client.sendText('421900123456@c.us', 'Hello World');
    
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://34.66.35.89:2785/api/sendText',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Api-Key': 'mock-key'
        })
      })
    );
  });

  it('should format requests correctly when sending poll', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
    ) as jest.Mock;

    const client = new OpenWAClient(config);
    const result = await client.sendPoll('421900123456@c.us', 'Vote Now', ['Yes', 'No'], 'https://callback.com');
    
    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://34.66.35.89:2785/api/sendPoll',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Api-Key': 'mock-key'
        }),
        body: JSON.stringify({
          chatId: '421900123456@c.us',
          name: 'Vote Now',
          options: ['Yes', 'No'],
          webhookUrl: 'https://callback.com',
          session: 'mock-session'
        })
      })
    );
  });
});
