import { resolveConsumption, refreshRecipeCache, fetchPOSSales, fetchLocations } from './ims-client';
import type { CachedRecipe, ConsumptionResult, IMSPOSReceipt } from './ims-client';

// ───── resolveConsumption — pure function, no mocking needed ─────

function makeRecipe(overrides: Partial<CachedRecipe> = {}): CachedRecipe {
  return {
    id: 'r-001',
    tenant_id: 't-001',
    menu_item_id: 'menu-schnitzel',
    menu_item_name: 'Chicken Schnitzel',
    selling_price: 12.50,
    is_active: true,
    ingredients: [
      { ingredient_id: 'ing-chicken', ingredient_name: 'Chicken Breast', grams_per_portion: 200, cost_per_gram: 0.0085 },
      { ingredient_id: 'ing-flour', ingredient_name: 'Flour', grams_per_portion: 50, cost_per_gram: 0.0012 },
    ],
    total_ingredient_cost: 1.76,
    food_cost_pct: 14.1,
    fetched_at: '2026-05-29T00:00:00Z',
    ...overrides,
  };
}

function recipesMap(recipes: CachedRecipe[]): Map<string, CachedRecipe> {
  return new Map(recipes.map(r => [r.menu_item_id, r]));
}

describe('resolveConsumption', () => {

  it('returns RESOLVED with correct grams for a matching recipe', () => {
    const recipes = recipesMap([makeRecipe()]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: 1 }, recipes);
    expect(result.status).toBe('RESOLVED');
    expect(result.consumptions).toHaveLength(2);
    expect(result.consumptions[0].ingredientId).toBe('ing-chicken');
    expect(result.consumptions[0].gramsConsumed).toBe(200);
    expect(result.consumptions[1].gramsConsumed).toBe(50);
  });

  it('returns correct cost when cost_per_gram is provided', () => {
    const recipes = recipesMap([makeRecipe()]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: 1 }, recipes);
    expect(result.consumptions[0].costAtLatestPrice).toBeCloseTo(1.70, 1);
    expect(result.consumptions[1].costAtLatestPrice).toBeCloseTo(0.06, 2);
  });

  it('returns cost=0 when cost_per_gram is null', () => {
    const recipe = makeRecipe({
      ingredients: [
        { ingredient_id: 'ing-unknown', ingredient_name: 'Unknown', grams_per_portion: 100, cost_per_gram: null },
      ],
    });
    const recipes = recipesMap([recipe]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: 1 }, recipes);
    expect(result.consumptions[0].costAtLatestPrice).toBe(0);
  });

  it('returns PARTIAL when some ingredients have grams_per_portion <= 0', () => {
    const recipe = makeRecipe({
      ingredients: [
        { ingredient_id: 'ing-a', ingredient_name: 'A', grams_per_portion: 100, cost_per_gram: 0.01 },
        { ingredient_id: 'ing-b', ingredient_name: 'B', grams_per_portion: 0, cost_per_gram: 0.01 },
        { ingredient_id: 'ing-c', ingredient_name: 'C', grams_per_portion: 0, cost_per_gram: 0.01 },
      ],
    });
    const recipes = recipesMap([recipe]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: 1 }, recipes);
    expect(result.status).toBe('PARTIAL');
    expect(result.consumptions).toHaveLength(1);
    expect(result.consumptions[0].ingredientId).toBe('ing-a');
  });

  it('returns UNKNOWN when no recipe matches the menu_item_id', () => {
    const recipes = recipesMap([makeRecipe()]);
    const result = resolveConsumption({ menu_item_id: 'menu-nonexistent', quantity: 1 }, recipes);
    expect(result.status).toBe('UNKNOWN');
    expect(result.consumptions).toHaveLength(0);
  });

  it('returns UNKNOWN when recipe is inactive', () => {
    const recipes = recipesMap([makeRecipe({ is_active: false })]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: 1 }, recipes);
    expect(result.status).toBe('UNKNOWN');
    expect(result.consumptions).toHaveLength(0);
  });

  it('returns UNKNOWN when recipe has empty ingredients array', () => {
    const recipes = recipesMap([makeRecipe({ ingredients: [] })]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: 1 }, recipes);
    expect(result.status).toBe('UNKNOWN');
    expect(result.consumptions).toHaveLength(0);
  });

  it('returns 0 grams when quantity is 0', () => {
    const recipes = recipesMap([makeRecipe()]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: 0 }, recipes);
    expect(result.status).toBe('RESOLVED');
    expect(result.consumptions[0].gramsConsumed).toBe(0);
  });

  it('multiplies grams by quantity', () => {
    const recipes = recipesMap([makeRecipe()]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: 3 }, recipes);
    expect(result.consumptions[0].gramsConsumed).toBe(600);
    expect(result.consumptions[0].costAtLatestPrice).toBeCloseTo(5.10, 1);
  });

  it('treats null quantity as 0, returning 0 grams', () => {
    const recipes = recipesMap([makeRecipe()]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: null as any }, recipes);
    expect(result.consumptions[0].gramsConsumed).toBe(0);
  });

  it('treats negative quantity as 0, returning 0 grams', () => {
    const recipes = recipesMap([makeRecipe()]);
    const result = resolveConsumption({ menu_item_id: 'menu-schnitzel', quantity: -2 }, recipes);
    expect(result.consumptions[0].gramsConsumed).toBe(0);
  });

  it('returns UNKNOWN when recipes Map is empty', () => {
    const recipes = new Map<string, CachedRecipe>();
    const result = resolveConsumption({ menu_item_id: 'anything', quantity: 1 }, recipes);
    expect(result.status).toBe('UNKNOWN');
  });
});

// ───── refreshRecipeCache — mocked HTTP + Supabase ─────

describe('refreshRecipeCache', () => {
  const tenantId = 't-001';
  const now = Date.now();
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;

  let mockMaybeSingle: jest.Mock;
  let mockUpsert: jest.Mock;
  let mockFrom: jest.Mock;
  let mockFetch: jest.Mock;
  let mockSupabase: any;

  function makeFreshCache(fetchedAt: Date): any {
    return { data: { fetched_at: fetchedAt.toISOString() }, error: null };
  }

  function makeNoCache(): any {
    return { data: null, error: null };
  }

  function makeIMSResponse(body: any, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  /** Builds a chainable Supabase query builder for cached_recipes.select().eq().order().limit().maybeSingle() */
  function makeQueryChain() {
    const chain: any = {
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: mockMaybeSingle,
    };
    return chain;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockMaybeSingle = jest.fn();
    mockUpsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom = jest.fn((table: string) => {
      if (table === 'cached_recipes') {
        return { select: jest.fn().mockReturnValue(makeQueryChain()), upsert: mockUpsert };
      }
      if (table === 'cached_ingredients') {
        return { upsert: mockUpsert };
      }
      return {};
    });
    mockSupabase = { from: mockFrom };

    mockFetch = jest.fn();
  });

  it('returns early when cache is fresh (< 24h old)', async () => {
    const fresh = makeFreshCache(new Date(now - 12 * HOUR));
    mockMaybeSingle.mockResolvedValue(fresh);

    await refreshRecipeCache(mockSupabase, tenantId, { fetch: mockFetch, now });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('fetches from IMS when no cache exists', async () => {
    mockMaybeSingle.mockResolvedValue(makeNoCache());
    mockFetch.mockResolvedValue(makeIMSResponse({ menu_items: [], ingredients: [] }));

    await refreshRecipeCache(mockSupabase, tenantId, { fetch: mockFetch, now, imsBaseUrl: 'https://ims.test', apiKey: 'key-123' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('tenant_id=t-001');
  });

  it('gracefully degrades when IMS is down but stale cache < 72h exists', async () => {
    const stale = makeFreshCache(new Date(now - 48 * HOUR)); // 48h stale
    mockMaybeSingle.mockResolvedValue(stale);
    mockFetch.mockRejectedValue(new Error('Network error'));

    await refreshRecipeCache(mockSupabase, tenantId, { fetch: mockFetch, now });

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('throws when IMS is down and no cache exists', async () => {
    mockMaybeSingle.mockResolvedValue(makeNoCache());
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(refreshRecipeCache(mockSupabase, tenantId, { fetch: mockFetch, now })).rejects.toThrow(/IMS.*unreachable/i);
  });

  it('throws when IMS is down and cache is > 72h stale', async () => {
    const veryStale = makeFreshCache(new Date(now - 96 * HOUR)); // 96h stale
    mockMaybeSingle.mockResolvedValue(veryStale);
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(refreshRecipeCache(mockSupabase, tenantId, { fetch: mockFetch, now })).rejects.toThrow(/IMS.*unreachable/i);
  });

  it('upserts recipes from IMS response', async () => {
    mockMaybeSingle.mockResolvedValue(makeNoCache());
    mockFetch.mockResolvedValue(makeIMSResponse({
      menu_items: [
        { id: 'mi-1', name: 'Burger', selling_price: 8.50, is_active: true, ingredients: [], total_ingredient_cost: null, food_cost_pct: null },
      ],
      ingredients: [],
    }));

    await refreshRecipeCache(mockSupabase, tenantId, { fetch: mockFetch, now, imsBaseUrl: 'https://ims.test', apiKey: 'key-123' });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: tenantId, menu_item_id: 'mi-1', menu_item_name: 'Burger' }),
      { onConflict: 'tenant_id, menu_item_id' },
    );
  });

  it('upserts ingredients from IMS response', async () => {
    mockMaybeSingle.mockResolvedValue(makeNoCache());
    mockFetch.mockResolvedValue(makeIMSResponse({
      menu_items: [],
      ingredients: [
        { id: 'ig-1', canonical_name: 'Chicken Breast', category: 'Meat', base_unit: 'g', perishability_days: 5, current_stock_grams: 10000, cost_per_gram: 0.0085 },
      ],
    }));

    await refreshRecipeCache(mockSupabase, tenantId, { fetch: mockFetch, now, imsBaseUrl: 'https://ims.test', apiKey: 'key-123' });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ ingredient_id: 'ig-1', canonical_name: 'Chicken Breast' }),
      { onConflict: 'tenant_id, ingredient_id' },
    );
  });

  it('handles empty menu_items array without error', async () => {
    mockMaybeSingle.mockResolvedValue(makeNoCache());
    mockFetch.mockResolvedValue(makeIMSResponse({ menu_items: [], ingredients: [] }));

    await expect(refreshRecipeCache(mockSupabase, tenantId, { fetch: mockFetch, now })).resolves.toBeUndefined();
  });

  it('throws when IMS returns non-200 status', async () => {
    mockMaybeSingle.mockResolvedValue(makeNoCache());
    mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    await expect(refreshRecipeCache(mockSupabase, tenantId, { fetch: mockFetch, now })).rejects.toThrow(/401/);
  });
});

// ───── fetchPOSSales — mocked HTTP ─────

describe('fetchPOSSales', () => {
  let mockFetch: jest.Mock;

  function makeReceipt(overrides: Partial<any> = {}): any {
    return {
      transaction_time: '2026-05-03T19:45:00+02:00',
      receipt_number: 'R-001',
      total_revenue: 48.50,
      is_void: false,
      is_comp: false,
      items: [{ menu_item_id: 'mi-1', menu_item_name: 'Burger', quantity: 2, revenue: 25.00 }],
      ...overrides,
    };
  }

  function makePOSResponse(receipts: any[], page = 1, totalPages = 1): Response {
    return new Response(JSON.stringify({
      page, total_pages: totalPages,
      receipts,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  beforeEach(() => {
    mockFetch = jest.fn();
  });

  it('returns all items across multiple pages', async () => {
    mockFetch
      .mockResolvedValueOnce(makePOSResponse([makeReceipt({ receipt_number: 'R-001' })], 1, 2))
      .mockResolvedValueOnce(makePOSResponse([makeReceipt({ receipt_number: 'R-002' })], 2, 2));

    const result = await fetchPOSSales({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
      locationId: 'loc-001',
      from: '2026-05-01',
      to: '2026-05-07',
    });

    expect(result).toHaveLength(2);
    expect(result[0].receipt_number).toBe('R-001');
    expect(result[1].receipt_number).toBe('R-002');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('respects per_page parameter in query string', async () => {
    mockFetch.mockResolvedValue(makePOSResponse([makeReceipt()], 1, 1));

    await fetchPOSSales({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
      locationId: 'loc-001',
      from: '2026-05-01',
      to: '2026-05-07',
      perPage: 50,
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('per_page=50');
  });

  it('returns empty array when IMS returns no receipts', async () => {
    mockFetch.mockResolvedValue(makePOSResponse([], 1, 1));

    const result = await fetchPOSSales({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
      locationId: 'loc-001',
      from: '2026-05-01',
      to: '2026-05-07',
    });

    expect(result).toEqual([]);
  });

  it('passes tenant_id, location_id, from, to as query params', async () => {
    mockFetch.mockResolvedValue(makePOSResponse([makeReceipt()], 1, 1));

    await fetchPOSSales({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
      locationId: 'loc-001',
      from: '2026-05-01',
      to: '2026-05-07',
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('tenant_id=t-001');
    expect(url).toContain('location_id=loc-001');
    expect(url).toContain('from=2026-05-01');
    expect(url).toContain('to=2026-05-07');
  });

  it('passes X-Api-Key header', async () => {
    mockFetch.mockResolvedValue(makePOSResponse([makeReceipt()], 1, 1));

    await fetchPOSSales({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
      locationId: 'loc-001',
      from: '2026-05-01',
      to: '2026-05-07',
    });

    const headers = mockFetch.mock.calls[0][1]?.headers;
    expect(headers['X-Api-Key']).toBe('key-123');
  });

  it('throws on non-200 response', async () => {
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));

    await expect(fetchPOSSales({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
      locationId: 'loc-001',
      from: '2026-05-01',
      to: '2026-05-07',
    })).rejects.toThrow(/404/);
  });

  it('handles single page (no pagination loop)', async () => {
    mockFetch.mockResolvedValue(makePOSResponse([makeReceipt()], 1, 1));

    const result = await fetchPOSSales({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
      locationId: 'loc-001',
      from: '2026-05-01',
      to: '2026-05-07',
    });

    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ───── fetchLocations — mocked HTTP ─────

describe('fetchLocations', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
  });

  it('returns parsed locations on 200', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      locations: [
        { id: 'loc-1', name: 'Bratislava', code: 'BA', is_active: true },
        { id: 'loc-2', name: 'Košice', code: 'KE', is_active: true },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await fetchLocations({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
    });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Bratislava');
  });

  it('throws on 401', async () => {
    mockFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    await expect(fetchLocations({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'bad-key',
      tenantId: 't-001',
    })).rejects.toThrow(/401/);
  });

  it('throws on 404', async () => {
    mockFetch.mockResolvedValue(new Response('Not Found', { status: 404 }));

    await expect(fetchLocations({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
    })).rejects.toThrow(/404/);
  });

  it('returns empty array when locations array is empty', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ locations: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));

    const result = await fetchLocations({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
    });

    expect(result).toEqual([]);
  });

  it('includes X-Api-Key and tenant_id in request', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ locations: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));

    await fetchLocations({
      fetch: mockFetch,
      baseUrl: 'https://ims.test',
      apiKey: 'key-123',
      tenantId: 't-001',
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('tenant_id=t-001');
    const headers = mockFetch.mock.calls[0][1]?.headers;
    expect(headers['X-Api-Key']).toBe('key-123');
  });
});
