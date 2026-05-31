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

const mockParseEkasaMetadata = jest.fn();
jest.mock('@/lib/ekasa-parser', () => ({
  parseEkasaMetadata: (...args: any[]) => mockParseEkasaMetadata(...args),
}));

beforeEach(() => {
  mockParseEkasaMetadata.mockReturnValue({
    store: 'Slovak Receipt',
    date: '2026-03-15',
    total: 42.50,
    items: [{ originalName: 'Mlieko', amount: 1.50 }],
    ico: '12345678',
    receiptNumber: 'R1',
  });
});

jest.mock('@/lib/validations/schemas', () => {
  const actual = jest.requireActual('@/lib/validations/schemas');
  return {
    ...actual,
    ResilientReceiptSchema: {
      parse: (data: any) => ({
        ...data,
        store: data.store || 'Slovak Receipt',
        date: data.date || '2026-03-15',
        total: data.total || 0,
        items: data.items || [],
      }),
    },
  };
});

describe('POST /api/ai/parse-receipt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockContext = {
    auth: { tenantId: 'tenant-1', user: { email: 'test@example.com', app_metadata: {} } },
  };

  it('returns 400 for missing ekasaData field', async () => {
    const req = new Request('http://localhost/api/ai/parse-receipt', {
      method: 'POST',
      body: JSON.stringify({ categories: ['Food'] }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(400);
  });

  it('returns 200 with merged receipt data on success', async () => {
    mockCallGroq.mockResolvedValue({
      content: JSON.stringify({
        inferredStore: 'Inferred Store',
        items: [{ name: 'Mlieko', category: 'Food' }],
      }),
      usage: { prompt_tokens: 30, completion_tokens: 15 },
    });

    const req = new Request('http://localhost/api/ai/parse-receipt', {
      method: 'POST',
      body: JSON.stringify({
        ekasaData: { raw: 'test' },
        categories: ['Food', 'Beverages'],
      }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.store).toBe('Inferred Store');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('Mlieko');
  });

  it('returns 200 with raw store when no inference needed', async () => {
    mockCallGroq.mockResolvedValue({
      content: JSON.stringify({
        items: [{ name: 'Mlieko 1L', category: 'Food' }],
      }),
      usage: { prompt_tokens: 25, completion_tokens: 10 },
    });

    mockParseEkasaMetadata.mockReturnValueOnce({
      store: 'LUNYS s.r.o.',
      date: '2026-03-15',
      total: 42.50,
      items: [{ originalName: 'Mlieko 1L', amount: 1.50 }],
      ico: '87654321',
      receiptNumber: 'R2',
    });

    const req = new Request('http://localhost/api/ai/parse-receipt', {
      method: 'POST',
      body: JSON.stringify({
        ekasaData: { raw: 'test' },
        categories: ['Food'],
      }),
    });
    const res = await POST(req, mockContext);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.store).toBe('LUNYS s.r.o.');
  });

  it('returns 500 when callGroq throws', async () => {
    mockCallGroq.mockRejectedValue(new Error('Groq failure'));

    const req = new Request('http://localhost/api/ai/parse-receipt', {
      method: 'POST',
      body: JSON.stringify({
        ekasaData: { raw: 'test' },
        categories: [],
      }),
    });
    const res = await POST(req, mockContext);
    expect(res.status).toBe(500);
  });
});
