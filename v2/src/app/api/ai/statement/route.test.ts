import { POST } from './route';

const mockCallGroq = jest.fn();
const mockServerLoggerSystem = jest.fn();

jest.mock('@/lib/groq', () => ({
  callGroq: (...args: any[]) => mockCallGroq(...args),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: (...args: any[]) => mockServerLoggerSystem(...args), user: jest.fn() },
}));

jest.mock('@/lib/withTestHandler', () => ({
  withTestHandler: (handler: any) => handler,
}));

jest.mock('@/lib/ai-categories', () => ({
  getCategoryPrompt: jest.fn().mockReturnValue(''),
}));

describe('POST /api/ai/statement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockContext = {
    auth: { tenantId: 'tenant-1', user: { email: 'test@example.com', app_metadata: {} } },
  };

  it('returns 400 for missing text field', async () => {
    const req = new Request('http://localhost/api/ai/statement', {
      method: 'POST',
      body: JSON.stringify({ categories: ['Food'] }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details).toBeDefined();
  });

  it('returns 400 for non-string text', async () => {
    const req = new Request('http://localhost/api/ai/statement', {
      method: 'POST',
      body: JSON.stringify({ text: 123, categories: ['Food'] }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(400);
  });

  it('returns 200 with parsed transactions on success', async () => {
    mockCallGroq.mockResolvedValue({
      content: '{"transactions": [{"date": "2026-01-15", "description": "Metro", "amount": 125.50, "category": "Food"}]}',
      usage: { prompt_tokens: 50, completion_tokens: 20 },
    });

    const req = new Request('http://localhost/api/ai/statement', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Bank statement text here...\nMetro 125.50\n',
        categories: ['Food', 'Utilities'],
      }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].description).toBe('Metro');
    expect(body.usage).toBeDefined();
  });

  it('returns 500 when callGroq throws', async () => {
    mockCallGroq.mockRejectedValue(new Error('Groq API error'));

    const req = new Request('http://localhost/api/ai/statement', {
      method: 'POST',
      body: JSON.stringify({ text: 'Some text', categories: [] }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(500);
  });
});
