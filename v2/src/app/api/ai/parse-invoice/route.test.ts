import { POST } from './route';

const mockCallGroq = jest.fn();
const mockServerLoggerSystem = jest.fn();
const mockServerLoggerUser = jest.fn();

jest.mock('@/lib/groq', () => ({
  callGroq: (...args: any[]) => mockCallGroq(...args),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: (...args: any[]) => mockServerLoggerSystem(...args), user: (...args: any[]) => mockServerLoggerUser(...args) },
}));

jest.mock('@/lib/withTestHandler', () => ({
  withTestHandler: (handler: any) => handler,
}));

jest.mock('@/lib/ai-categories', () => ({
  getCategoryPrompt: jest.fn().mockReturnValue(''),
}));

describe('POST /api/ai/parse-invoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockContext = {
    auth: { tenantId: 'tenant-1', user: { email: 'test@example.com', app_metadata: {} } },
  };

  it('returns 400 for missing image field', async () => {
    const req = new Request('http://localhost/api/ai/parse-invoice', {
      method: 'POST',
      body: JSON.stringify({ categories: ['Food'] }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-string image', async () => {
    const req = new Request('http://localhost/api/ai/parse-invoice', {
      method: 'POST',
      body: JSON.stringify({ image: 123, categories: ['Food'] }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(400);
  });

  it('returns rejected triage when AI says INVALID', async () => {
    mockCallGroq.mockResolvedValue({
      content: 'INVALID This image contains a receipt but no financial data.',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const req = new Request('http://localhost/api/ai/parse-invoice', {
      method: 'POST',
      body: JSON.stringify({
        image: 'data:image/jpeg;base64,/9j/test',
        categories: ['Food', 'Utilities'],
      }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.triage).toBe('REJECTED');
    expect(body.message).toContain('no financial data');
  });

  it('returns accepted with parsed invoice data on success', async () => {
    mockCallGroq
      .mockResolvedValueOnce({
        content: 'VALID Invoice detected.',
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          store: 'Metro Cash & Carry',
          date: '2026-03-15',
          total: 1250.00,
          ico: '12345678',
          items: [{ name: 'Mlieko 1L', amount: 1.50, category: 'Food', confidence: 'high' }],
          currency: 'EUR',
          vatDetail: {},
        }),
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

    const req = new Request('http://localhost/api/ai/parse-invoice', {
      method: 'POST',
      body: JSON.stringify({
        image: 'data:image/jpeg;base64,/9j/test-image',
        categories: ['Food', 'Utilities'],
      }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.triage).toBe('ACCEPTED');
    expect(body.data.store).toBe('Metro Cash & Carry');
    expect(body.data.items).toHaveLength(1);
    expect(mockCallGroq).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when callGroq throws on extraction', async () => {
    mockCallGroq
      .mockResolvedValueOnce({
        content: 'VALID Invoice.',
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      })
      .mockRejectedValueOnce(new Error('Vision API error'));

    const req = new Request('http://localhost/api/ai/parse-invoice', {
      method: 'POST',
      body: JSON.stringify({
        image: 'data:image/jpeg;base64,/9j/test',
        categories: [],
      }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(500);
  });
});
