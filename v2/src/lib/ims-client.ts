import { HEADER_API_KEY } from '@/lib/constants';

// ───── Types ─────

export interface CachedRecipeIngredient {
  ingredient_id: string;
  ingredient_name: string;
  grams_per_portion: number | null;
  cost_per_gram: number | null;
}

export interface CachedRecipe {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  menu_item_name: string;
  selling_price: number | null;
  is_active: boolean;
  ingredients: CachedRecipeIngredient[];
  total_ingredient_cost: number | null;
  food_cost_pct: number | null;
  fetched_at: string;
}

export interface CachedIngredient {
  id: string;
  tenant_id: string;
  ingredient_id: string;
  canonical_name: string;
  category: string | null;
  base_unit: string | null;
  perishability_days: number | null;
  current_stock_grams: number | null;
  cost_per_gram: number | null;
  fetched_at: string;
}

export interface IMSRecipeIngredient {
  ingredient_id: string;
  ingredient_name: string;
  canonical_name?: string;
  grams_per_portion: number;
  cost_per_gram: number | null;
}

export interface IMSRecipeItem {
  id: string;
  name: string;
  selling_price: number | null;
  is_active: boolean;
  ingredients: IMSRecipeIngredient[];
  total_ingredient_cost: number | null;
  food_cost_pct: number | null;
}

export interface IMSIngredient {
  id: string;
  canonical_name: string;
  category: string | null;
  base_unit: string | null;
  perishability_days: number | null;
  current_stock_grams: number | null;
  cost_per_gram: number | null;
}

export interface IMSRecipesResponse {
  tenant_id: string;
  fetched_at: string;
  menu_items: IMSRecipeItem[];
  ingredients: IMSIngredient[];
}

export interface IMSPOSItem {
  menu_item_id: string;
  menu_item_name: string;
  quantity: number;
  revenue: number;
}

export interface IMSPOSReceipt {
  transaction_time: string;
  receipt_number: string;
  total_revenue: number;
  is_void: boolean;
  is_comp: boolean;
  items: IMSPOSItem[];
}

export interface IMSPOSSalesResponse {
  page: number;
  total_pages: number;
  receipts: IMSPOSReceipt[];
}

export interface IMSLocation {
  id: string;
  name: string;
  code?: string;
  address?: string;
  is_active: boolean;
}

export interface IMSLocationsResponse {
  tenant_id: string;
  locations: IMSLocation[];
}

export interface TheoreticalConsumption {
  ingredientId: string;
  ingredientName: string;
  gramsConsumed: number;
  costAtLatestPrice: number;
}

export type ConsumptionStatus = 'RESOLVED' | 'PARTIAL' | 'UNKNOWN';

export interface ConsumptionResult {
  consumptions: TheoreticalConsumption[];
  status: ConsumptionStatus;
}

// ───── resolveConsumption (pure function) ─────

export function resolveConsumption(
  posItem: { menu_item_id: string; quantity: number },
  recipes: Map<string, CachedRecipe>,
): ConsumptionResult {
  const safeQty = Math.max(0, posItem.quantity || 0);

  const recipe = recipes.get(posItem.menu_item_id);

  if (!recipe || !recipe.is_active || !recipe.ingredients || recipe.ingredients.length === 0) {
    return { consumptions: [], status: 'UNKNOWN' };
  }

  const resolved = recipe.ingredients.filter(i => (i.grams_per_portion ?? 0) > 0);
  const total = recipe.ingredients.length;
  const resolvedCount = resolved.length;

  return {
    consumptions: resolved.map(i => ({
      ingredientId: i.ingredient_id,
      ingredientName: i.ingredient_name,
      gramsConsumed: safeQty * (i.grams_per_portion ?? 0),
      costAtLatestPrice: safeQty * (i.grams_per_portion ?? 0) * (i.cost_per_gram ?? 0),
    })),
    status: resolvedCount === total ? 'RESOLVED' : resolvedCount > 0 ? 'PARTIAL' : 'UNKNOWN',
  };
}

// ───── refreshRecipeCache ─────

export interface RefreshRecipeCacheOptions {
  fetch?: typeof globalThis.fetch;
  now?: number;
  imsBaseUrl?: string;
  apiKey?: string;
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const CACHE_TTL = DAY;
const STALE_GRACE = 3 * DAY;

export async function refreshRecipeCache(
  supabase: { from: (table: string) => any },
  tenantId: string,
  options: RefreshRecipeCacheOptions = {},
): Promise<void> {
  const fetcher = options.fetch || globalThis.fetch;
  const now = options.now ?? Date.now();

  const { data: cached } = await supabase
    .from('cached_recipes')
    .select('fetched_at')
    .eq('tenant_id', tenantId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    const age = now - new Date(cached.fetched_at).getTime();
    if (age < CACHE_TTL) {
      return;
    }
  }

  const imsBaseUrl = options.imsBaseUrl || process.env.IMS_API_BASE_URL || 'https://ims.synculariti.com';
  const apiKey = options.apiKey || process.env.IMS_API_KEY || '';

  let response: Response;
  try {
    response = await fetcher(`${imsBaseUrl}/api/v1/recipes?tenant_id=${tenantId}`, {
      headers: { [HEADER_API_KEY]: apiKey },
    });
  } catch {
    if (cached) {
      const age = now - new Date(cached.fetched_at).getTime();
      if (age < STALE_GRACE) {
        return;
      }
    }
    throw new Error('IMS is unreachable');
  }

  if (!response.ok) {
    throw new Error(`IMS recipe API returned ${response.status}`);
  }

  const data: IMSRecipesResponse = await response.json();

  for (const item of data.menu_items || []) {
    await supabase.from('cached_recipes').upsert({
      tenant_id: tenantId,
      menu_item_id: item.id,
      menu_item_name: item.name,
      selling_price: item.selling_price,
      is_active: item.is_active,
      ingredients: item.ingredients,
      total_ingredient_cost: item.total_ingredient_cost,
      food_cost_pct: item.food_cost_pct,
      fetched_at: new Date(now).toISOString(),
    }, { onConflict: 'tenant_id, menu_item_id' });
  }

  for (const ing of data.ingredients || []) {
    await supabase.from('cached_ingredients').upsert({
      tenant_id: tenantId,
      ingredient_id: ing.id,
      canonical_name: ing.canonical_name,
      category: ing.category,
      base_unit: ing.base_unit,
      perishability_days: ing.perishability_days,
      current_stock_grams: ing.current_stock_grams,
      cost_per_gram: ing.cost_per_gram,
      fetched_at: new Date(now).toISOString(),
    }, { onConflict: 'tenant_id, ingredient_id' });
  }
}

// ───── fetchPOSSales ─────

export interface FetchPOSSalesOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl: string;
  apiKey: string;
  tenantId: string;
  locationId: string;
  from: string;
  to: string;
  perPage?: number;
}

export async function fetchPOSSales(options: FetchPOSSalesOptions): Promise<IMSPOSReceipt[]> {
  const fetcher = options.fetch || globalThis.fetch;
  const perPage = options.perPage ?? 100;
  const allReceipts: IMSPOSReceipt[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `${options.baseUrl}/api/v1/pos-sales?tenant_id=${options.tenantId}&location_id=${options.locationId}&from=${options.from}&to=${options.to}&page=${page}&per_page=${perPage}`;
    const response = await fetcher(url, {
      headers: { [HEADER_API_KEY]: options.apiKey },
    });

    if (!response.ok) {
      throw new Error(`IMS POS sales API returned ${response.status}`);
    }

    const data: IMSPOSSalesResponse = await response.json();
    allReceipts.push(...(data.receipts || []));
    totalPages = data.total_pages;
    page++;
  }

  return allReceipts;
}

// ───── fetchLocations ─────

export interface FetchLocationsOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl: string;
  apiKey: string;
  tenantId: string;
}

export async function fetchLocations(options: FetchLocationsOptions): Promise<IMSLocation[]> {
  const fetcher = options.fetch || globalThis.fetch;
  const url = `${options.baseUrl}/api/v1/locations?tenant_id=${options.tenantId}`;
  const response = await fetcher(url, {
    headers: { [HEADER_API_KEY]: options.apiKey },
  });

  if (!response.ok) {
    throw new Error(`IMS locations API returned ${response.status}`);
  }

  const data: IMSLocationsResponse = await response.json();
  return data.locations || [];
}
