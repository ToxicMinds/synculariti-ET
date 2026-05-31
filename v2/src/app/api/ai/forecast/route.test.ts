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

describe('POST /api/ai/forecast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockContext = {
    auth: { tenantId: 'tenant-1', user: { email: 'test@example.com', app_metadata: {} } },
  };

  it('returns 400 for missing spent field', async () => {
    const req = new Request('http://localhost/api/ai/forecast', {
      method: 'POST',
      body: JSON.stringify({ budget: 10000, daysElapsed: 15, daysInMonth: 30 }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(400);
  });

  it('returns early result when daysElapsed is 0', async () => {
    const req = new Request('http://localhost/api/ai/forecast', {
      method: 'POST',
      body: JSON.stringify({ spent: 500, budget: 10000, daysElapsed: 0, daysInMonth: 30 }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.aiForecast).toContain('Insufficient data');
    expect(body.mathForecast).toBe(500);
    expect(mockCallGroq).not.toHaveBeenCalled();
  });

  it('returns 400 when daysElapsed is negative (Zod validation)', async () => {
    const req = new Request('http://localhost/api/ai/forecast', {
      method: 'POST',
      body: JSON.stringify({ spent: 300, budget: 5000, daysElapsed: -1, daysInMonth: 30 }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(400);
  });

  it('returns 200 with AI forecast on success', async () => {
    mockCallGroq.mockResolvedValue({
      content: 'Based on your spending pattern, you are on track to spend approximately EUR 8,500 this month, which is within budget.',
      usage: { prompt_tokens: 80, completion_tokens: 25 },
    });

    const req = new Request('http://localhost/api/ai/forecast', {
      method: 'POST',
      body: JSON.stringify({
        spent: 4250,
        budget: 10000,
        daysElapsed: 15,
        daysInMonth: 30,
        history: [{ month: '2026-02', spent: 8500 }],
      }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.aiForecast).toContain('budget');
    expect(body.mathForecast).toBe((4250 / 15) * 30);
    expect(mockCallGroq).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when callGroq throws', async () => {
    mockCallGroq.mockRejectedValue(new Error('Groq API failure'));

    const req = new Request('http://localhost/api/ai/forecast', {
      method: 'POST',
      body: JSON.stringify({ spent: 1000, budget: 5000, daysElapsed: 10, daysInMonth: 30 }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(500);
  });
});
