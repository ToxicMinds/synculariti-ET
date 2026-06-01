import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { withTestHandler } from '@/lib/withTestHandler';
import { ServerLogger } from '@/lib/logger-server';
import { SecureHandler } from '@/lib/types/api';
import { computeFCVReport, type FCVPurchaseRow, type FCVPOSRow } from '@/lib/food-cost-variance';
import { refreshRecipeCache, enrichStagingRow } from '@/lib/ims-client';
import { getErrorMessage } from '@/lib/utils';
import type { SupabaseClient } from '@supabase/supabase-js';

function defaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

type DBClient = SupabaseClient<any, 'public', any>;

async function fetchAll<T>(
  supabase: DBClient,
  table: string,
  select: string,
  eq: Record<string, unknown>,
  gte: [string, unknown][],
  lte: [string, unknown][],
  orderBy: string,
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allRows: T[] = [];
  let page = 0;
  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .eq(Object.keys(eq)[0], Object.values(eq)[0])
      .order(orderBy)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    for (const [col, val] of gte) query = query.gte(col, val);
    for (const [col, val] of lte) query = query.lte(col, val);
    const { data: chunk, error } = await query;
    if (error) throw error;
    if (!chunk || chunk.length === 0) break;
    allRows = allRows.concat(chunk as T[]);
    if (chunk.length < PAGE_SIZE) break;
    page++;
  }
  return allRows;
}

interface StagingRow {
  id: string;
  transaction_time: string;
  revenue: number;
  location_id: string;
  menu_item_id: string;
  quantity_sold: number;
  recipe_found: boolean | null;
  theoretical_grams: {
    ingredients?: Array<{ ingredient_id: string; ingredient_name: string; grams: number; cost: number }>;
  } | null;
  flag?: string;
}

interface PurchaseRow {
  ingredient_id: string;
  ingredient_name: string;
  total_amount: number;
  purchase_date: string;
  location_id: string;
}

const handler: SecureHandler = async (req, context) => {
  const { tenantId } = context.auth || { tenantId: 'fallback' };
  const supabase = await createClient();

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start') || defaultPeriod().start;
  const end = searchParams.get('end') || defaultPeriod().end;

  await ServerLogger.system('INFO', 'API', 'FCV report request', { tenantId, start, end });

  try {
    // Warm up recipe cache (graceful degradation if IMS is offline)
    await refreshRecipeCache(supabase, tenantId).catch((e: unknown) => {
      ServerLogger.system('WARN', 'FCV', 'Recipe cache refresh failed', { tenantId, error: getErrorMessage(e) });
    });

    // Fetch approved POS staging rows (including rows needing enrichment)
    const stagingRows = await fetchAll<StagingRow>(
      supabase, 'pos_transaction_staging',
      'id, transaction_time, revenue, location_id, menu_item_id, quantity_sold, recipe_found, theoretical_grams, flag',
      { tenant_id: tenantId },
      [['transaction_time', start]],
      [['transaction_time', end + 'T23:59:59Z']],
      'transaction_time',
    );

    // Lazy enrichment: backfill theoretical_grams for rows that haven't been processed yet
    for (const row of stagingRows) {
      if (row.recipe_found === true || row.recipe_found === false) continue;
      if (row.flag !== 'APPROVED' && row.flag !== undefined) continue;

      try {
        const enriched = await enrichStagingRow(supabase, tenantId, row as any);
        const hasGrams = enriched.theoretical_grams?.ingredients != null
          && enriched.theoretical_grams.ingredients.length > 0;

        await supabase.from('pos_transaction_staging').update({
          theoretical_grams: enriched.theoretical_grams,
          recipe_found: hasGrams,
        }).eq('id', row.id);

        row.theoretical_grams = enriched.theoretical_grams;
        row.recipe_found = hasGrams;
      } catch (e: unknown) {
        await ServerLogger.system('WARN', 'FCV', 'Staging enrichment failed for individual row', {
          rowId: row.id, error: getErrorMessage(e),
        });
        await supabase.from('pos_transaction_staging').update({ recipe_found: false }).eq('id', row.id);
        row.recipe_found = false;
      }
    }

    // Explode theoretical_grams into per-ingredient FCVPOSRow entries
    const posRows: FCVPOSRow[] = [];
    for (const row of stagingRows) {
      if (!row.theoretical_grams?.ingredients) continue;
      for (const ing of row.theoretical_grams.ingredients) {
        posRows.push({
          ingredient_id: ing.ingredient_id,
          ingredient_name: ing.ingredient_name,
          grams: ing.grams,
          cost: ing.cost,
          transaction_time: row.transaction_time,
          revenue: row.revenue,
          location_id: row.location_id,
        });
      }
    }

    // Fetch ingredient-linked purchases
    const purchaseRows = await fetchAll<PurchaseRow>(
      supabase, 'purchases',
      'ingredient_id, ingredient_name, total_amount, purchase_date, location_id',
      { tenant_id: tenantId },
      [['purchase_date', start]],
      [['purchase_date', end]],
      'purchase_date',
    );

    // Filter to rows with ingredient_id populated
    const filteredPurchases: FCVPurchaseRow[] = purchaseRows
      .filter(p => p.ingredient_id)
      .map(p => ({
        ingredient_id: p.ingredient_id,
        ingredient_name: p.ingredient_name,
        total_amount: Number(p.total_amount),
        purchase_date: p.purchase_date,
        location_id: p.location_id,
      }));

    const report = computeFCVReport({
      purchases: filteredPurchases,
      posStaging: posRows,
      period: { start, end },
    });

    return NextResponse.json({ success: true, report });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await ServerLogger.system('ERROR', 'API', 'FCV report failed', { tenantId, error: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
};

export const GET = withTestHandler(handler);
