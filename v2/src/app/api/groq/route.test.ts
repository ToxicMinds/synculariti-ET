import { POST } from './route';

const mockCallGroq = jest.fn();
const mockServerLoggerSystem = jest.fn();

jest.mock('@/lib/groq', () => ({
  callGroq: (...args: any[]) => mockCallGroq(...args),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: (...args: any[]) => mockServerLoggerSystem(...args) },
}));

jest.mock('@/lib/withTestHandler', () => ({
  withTestHandler: (handler: any) => handler,
}));

describe('POST /api/groq', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockContext = {
    auth: { tenantId: 'tenant-1', user: { email: 'test@example.com', app_metadata: {} } },
  };

  it('returns 400 for missing messages field', async () => {
    const req = new Request('http://localhost/api/groq', {
      method: 'POST',
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile' }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid messages array');
  });

  it('returns 400 for non-array messages', async () => {
    const req = new Request('http://localhost/api/groq', {
      method: 'POST',
      body: JSON.stringify({ messages: 'not-an-array' }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid messages array');
  });

  it('returns 200 with Groq response for valid request', async () => {
    mockCallGroq.mockResolvedValue({
      choices: [{ message: { content: 'Hello from Groq' } }],
    });

    const req = new Request('http://localhost/api/groq', {
      method: 'POST',
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.choices[0].message.content).toBe('Hello from Groq');
    expect(mockCallGroq).toHaveBeenCalledWith('llama-3.3-70b-versatile', [{ role: 'user', content: 'Hi' }], undefined);
  });

  it('returns 200 with default model when model is not specified', async () => {
    mockCallGroq.mockResolvedValue({
      choices: [{ message: { content: 'Default model response' } }],
    });

    const req = new Request('http://localhost/api/groq', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.choices[0].message.content).toBe('Default model response');
  });

  it('returns 500 when callGroq throws', async () => {
    mockCallGroq.mockRejectedValue(new Error('GROQ_API_KEY is not configured in environment'));

    const req = new Request('http://localhost/api/groq', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toContain('GROQ_API_KEY');
  });

  it('uses default model when model is empty string', async () => {
    mockCallGroq.mockResolvedValue({
      choices: [{ message: { content: 'Fallback response' } }],
    });

    const req = new Request('http://localhost/api/groq', {
      method: 'POST',
      body: JSON.stringify({ model: '', messages: [{ role: 'user', content: 'Hi' }] }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.choices[0].message.content).toBe('Fallback response');
  });
});
