import { NextResponse } from 'next/server';
import { GET } from './route';
import { createMockAuthContext } from '@/lib/test-utils';
import type { SecureContext } from '@/lib/types/api';

// ── Shared mock objects ──────────────────────────────────────────
const mockSession = { close: jest.fn() };
const mockDriver = { session: jest.fn(() => mockSession) };

// ── Module mocks ─────────────────────────────────────────────────
jest.mock('@/lib/neo4j', () => ({
  getNeo4jDriver: jest.fn(() => ({ session: jest.fn(() => ({ close: jest.fn() })) })),
}));

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn().mockResolvedValue(undefined), user: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/lib/api-error-handler', () => ({
  apiError: jest.fn((msg: string) => NextResponse.json({ success: false, error: msg }, { status: 500 })),
}));

jest.mock('@/lib/insight-queries', () => {
  const mockPrice = {
    type: 'price' as const, impact: 150,
    summary: 'Milk 1L costs 25% more at Billa than Metro',
    detail: 'Milk 1L: €1.20 at Metro vs €1.50 at Billa',
    recommendation: 'Switch Milk 1L procurement to Metro',
    data: { ingredient: 'Milk 1L' },
  };
  const mockTiming = {
    type: 'timing' as const, impact: 80,
    summary: 'Friday has highest avg spend',
    detail: 'Most expensive day is Friday',
    recommendation: 'Shift from Friday to Monday',
    data: {},
  };
  const mockWaste = {
    type: 'waste' as const, impact: 95,
    summary: 'Fresh Milk high spoilage risk',
    detail: '10 units at €1.50/unit',
    recommendation: 'Reduce order by 30%',
    data: {},
  };
  return {
    queryPriceIntelligence: jest.fn().mockResolvedValue(mockPrice),
    queryTimingPatterns: jest.fn().mockResolvedValue(mockTiming),
    queryWasteRisk: jest.fn().mockResolvedValue(mockWaste),
    InsightFinding: {} as any,
  };
});

jest.mock('@/lib/groq', () => ({
  callGroq: jest.fn(),
}));

import { queryPriceIntelligence, queryTimingPatterns, queryWasteRisk } from '@/lib/insight-queries';
import { callGroq } from '@/lib/groq';
import { getNeo4jDriver } from '@/lib/neo4j';
import { apiError } from '@/lib/api-error-handler';

const mockContext: SecureContext = createMockAuthContext('test-tenant-abc');
const req = new Request('http://localhost/api/ai/insight');

function resetMocks() {
  jest.clearAllMocks();
  delete process.env.GROQ_API_KEY;
  // Re-stub getNeo4jDriver to return our controlled driver
  (getNeo4jDriver as jest.Mock).mockImplementation(() => mockDriver);
  mockDriver.session.mockImplementation(() => mockSession);
  mockSession.close.mockImplementation(() => Promise.resolve());
  // Re-stub query mocks to return findings
  (queryPriceIntelligence as jest.Mock).mockResolvedValue({
    type: 'price', impact: 150,
    summary: 'Milk 1L costs 25% more at Billa than Metro',
    detail: 'Milk 1L: €1.20 at Metro vs €1.50 at Billa',
    recommendation: 'Switch Milk 1L procurement to Metro',
    data: { ingredient: 'Milk 1L' },
  });
  (queryTimingPatterns as jest.Mock).mockResolvedValue(null);
  (queryWasteRisk as jest.Mock).mockResolvedValue(null);
}

describe('GET /api/ai/insight', () => {
  beforeEach(resetMocks);

  it('returns template-articulated insight when no GROQ_API_KEY', async () => {
    const response = await (GET as any)(req, mockContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.insight).toContain('Milk 1L');
    expect(body.category).toBe('price');
  });

  it('returns LLM-narrated insight when GROQ_API_KEY is set', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    (callGroq as jest.Mock).mockResolvedValue({
      content: 'Your milk costs 25% more at Billa than Metro. Switch to Metro to save.',
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    });

    const response = await (GET as any)(req, mockContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.insight).toBe('Your milk costs 25% more at Billa than Metro. Switch to Metro to save.');
    expect(body.category).toBe('price');
    expect(callGroq).toHaveBeenCalled();
  });

  it('falls back to template when Groq call fails', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    (callGroq as jest.Mock).mockRejectedValue(new Error('Groq 503'));

    const response = await (GET as any)(req, mockContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.insight).toContain('Milk 1L');
    expect(body.category).toBe('price');
  });

  it('returns analyzing message when no findings at all', async () => {
    (queryPriceIntelligence as jest.Mock).mockResolvedValue(null);
    (queryTimingPatterns as jest.Mock).mockResolvedValue(null);
    (queryWasteRisk as jest.Mock).mockResolvedValue(null);

    const response = await (GET as any)(req, mockContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.insight).toContain('Analyzing your spending patterns');
    expect(body.category).toBe('empty');
  });

  it('returns syncing message when Neo4j queries throw', async () => {
    (queryPriceIntelligence as jest.Mock).mockRejectedValue(new Error('Neo4j timeout'));

    const response = await (GET as any)(req, mockContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.insight).toContain('Syncing your financial graph');
    expect(body.category).toBe('empty');
  });

  it('returns 500 when Neo4j driver is null', async () => {
    (getNeo4jDriver as jest.Mock).mockReturnValue(null);

    const response = await (GET as any)(req, mockContext);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('closes all sessions in finally block', async () => {
    await (GET as any)(req, mockContext);
    expect(mockSession.close).toHaveBeenCalledTimes(3);
  });

  it('closes all sessions even on error', async () => {
    (queryPriceIntelligence as jest.Mock).mockRejectedValue(new Error('fail'));
    await (GET as any)(req, mockContext);
    expect(mockSession.close).toHaveBeenCalledTimes(3);
  });
});
