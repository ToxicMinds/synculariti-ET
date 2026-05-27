# Batch Ingestion & Food Cost Variance Pipeline

**Status:** Design — internal module boundaries defined  
**Owner:** Synculariti team (IMS + ET are one product)  
**Dependencies:** IMS writes `cached_recipes` + `pos_processed_sales` to shared Postgres  
**Target:** MVP for first customer (3-location burger joint)  
**Prospect:** Burger joint running 3 locations. Wants inventory management, billing/invoicing, and ideally a website. Equity-sharing model: free usage + 20% lifetime commission on referrals.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Cross-App Contracts: IMS ↔ ET](#2-cross-app-contracts-ims--et)
   - [Recipe API](#21-recipe-api-ims-provides-et-consumes)
   - [POS Sales API](#22-pos-sales-api-ims-provides-et-consumes)
   - [WhatsApp Integration](#23-whatsapp-integration-et-provides-ims-consumes)
   - [End-to-End Data Flow](#24-end-to-end-data-flow)
3. [Staging + Quarantine Layer](#3-staging--quarantine-layer)
   - [Schema: pos_batch_uploads](#31-pos_batch_uploads)
   - [Schema: pos_transaction_staging](#32-pos_transaction_staging)
   - [Anomaly Detection: process_batch_v1](#33-process_batch_v1)
   - [Quarantine Audit View](#34-quarantine-audit-view)
   - [Gap Detection & WhatsApp Alerting](#35-gap-detection)
4. [Recipe Caching Layer](#4-recipe-caching-layer)
5. [POS → Consumption Math](#5-pos--consumption-math)
6. [Food Cost Variance Report](#6-food-cost-variance-report)
7. [Dashboard Plan](#7-dashboard-plan)
8. [Getting Smarter Over Time](#8-getting-smarter-over-time)
9. [AI-Executable Build Prompt](#9-ai-executable-build-prompt)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         IMS (Co-founder's system)                    │
│  ┌─────────────────────┐          ┌──────────────────────────────┐  │
│  │ Recipe Engine        │          │ POS Data Processor           │  │
│  │ (menu_item → grams   │          │ (raw sales → resolved        │  │
│  │  per ingredient)     │          │  inventory deductions)       │  │
│  └──────────┬──────────┘          └──────────────┬───────────────┘  │
└─────────────┼────────────────────────────────────┼──────────────────┘
              │ GET /api/v1/recipes                │ POST /api/v1/pos/batch
              │ (pulled by us, cached 24h)         │ (pushed to us)
              ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Expense Tracker (this codebase)                  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 1. BATCH STAGING                                              │   │
│  │    pos_batch_uploads (metadata)                                │   │
│  │    pos_transaction_staging (raw JSONB + flag)                  │   │
│  │    process_batch_v1() — 90d rolling baseline (σ) quarantine   │   │
│  │    v_quarantine_audit — human review view                      │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 2. ENRICHMENT                                                 │   │
│  │    Fetch recipes from cache (or IMS if stale)                 │   │
│  │    Compute: qty_sold × grams_per_portion = theoretical grams  │   │
│  │    Cost at latest purchase price = theoretical COGS           │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 3. GRAPH SYNC (existing outbox pattern)                      │   │
│  │    graph_sync_queue → Neo4j                                  │   │
│  │    New: :Sale nodes, :ConsumptionEstimate nodes              │   │
│  │    Existing: :Transaction nodes (purchases remain unchanged)  │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FOOD COST VARIANCE REPORT                       │
│                                                                      │
│  Revenue (POS) vs Theoretical COGS (POS × recipes)                  │
│  vs Actual Spend (purchase invoices)                                │
│                                                                      │
│  The Gap = Actual Spend – Theoretical COGS                          │
│  (positive gap = bleeding, negative gap = profitable variance)      │
│                                                                      │
│  "You spent €35,000 on ingredients. Based on sales, you should      │
│   have consumed €28,000 worth. The €7,000 gap is concentrated       │
│   in chicken (63%) and dairy (22%). Friday nights account for 40%   │
│   of the variance."                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Three key architectural decisions

**Decision 1: Consumption estimates are separate from purchase data in Neo4j.**

We do NOT create `:StockBatch` nodes with FIFO depletion. We cannot know which physical chicken delivery was used for which Schnitzel sale. Instead, we store `:ConsumptionEstimate` nodes derived from recipes — theoretical, not physical. The report compares these estimates against actual purchase data. The gap between them is the actionable signal.

**Decision 2: Anomaly quarantine is per-tenant, per-item-sku, rolling 90-day.**

The baseline learns each restaurant's normal pricing and volume. A new restaurant gets seeded with their historical POS data dump so the baseline has data from day one. Cold start (no history): auto-approve first batch.

**Decision 3: Reports degrade gracefully with incomplete data.**

If only 70% of days have POS data, the report shows: "Data coverage: 70% this period — gap estimate ±15%." If recipes don't exist for some menu items, those items show as `UNKNOWN` consumption. The system quantifies uncertainty rather than pretending it has perfect data.

---

## 2. Cross-App Contracts: IMS ↔ ET

**Critical architecture rule:** The IMS (Inventory Management System) and ET (Expense Tracker) are separate applications. They have separate Supabase projects (separate Postgres databases), separate Neo4j instances (ET only), and separate deployments. They communicate exclusively through HTTP APIs with `X-Api-Key` authentication.

Each app maintains its own `api_keys` table. Service-level keys (`tenant_id IS NULL`) are provisioned for cross-app communication.

```
IMS Database (owns):                           ET Database (owns):
  inventory_items, inventory_ledger              transactions, receipt_items
  purchase_orders, po_line_items                 graph_sync_queue, whatsapp_outbox
  cached_recipes (source of truth)               pos_transaction_staging (local cache)
  pos_processed_sales (source of truth)           cached_recipes (24h replica)
                                                 Neo4j graph (no IMS access)
```

### 2.1 Recipe API (IMS provides, ET consumes)

**Endpoint:** `GET /api/ims/recipes?tenant_id={uuid}`  
**Auth:** `X-Api-Key` (service-level key, ET has one)  
**Direction:** ET calls IMS, caches response locally for 24h

#### Response: 200 OK

```json
{
  "tenant_id": "f039714b-...",
  "fetched_at": "2026-05-27T14:00:00Z",
  "menu_items": [
    {
      "id": "a1b2c3d4-...",
      "name": "Chicken Schnitzel",
      "selling_price": 12.50,
      "is_active": true,
      "ingredients": [
        {
          "ingredient_id": "e5f6a7b8-...",
          "ingredient_name": "Chicken Breast",
          "canonical_name": "Chicken Breast",
          "grams_per_portion": 200,
          "cost_per_gram": 0.0085
        }
      ],
      "total_ingredient_cost": 1.74,
      "food_cost_pct": 13.9,
      "modified_at": "2026-05-20T09:00:00Z"
    }
  ],
  "ingredients": [
    {
      "id": "e5f6a7b8-...",
      "canonical_name": "Chicken Breast",
      "category": "Meat & Poultry",
      "base_unit": "g",
      "perishability_days": 5,
      "cost_per_gram": 0.0085,
      "current_stock_grams": 45000,
      "stock_updated_at": "2026-05-27T08:00:00Z"
    }
  ]
}
```

#### Rules for this API

1. **`cost_per_gram` must be NULL (not 0)** when unknown. The ET falls back to its own purchase-data average. Returning 0 makes COGS calculations think ingredients are free.

2. **`is_active: false`** — ET skips inactive items. If POS data shows sales for an inactive item, ET flags a data integrity issue.

3. **Empty `ingredients` array** means no recipe configured. ET reports revenue but marks consumption as `UNKNOWN`.

4. **ET caches this response locally** in its own `cached_recipes` table with a 24h TTL. Stale cache is used up to 72h if IMS is unreachable (graceful degradation).

### 2.2 POS Sales API (IMS provides, ET consumes)

**Endpoint:** `GET /api/ims/pos-sales?tenant_id={uuid}&from={date}&to={date}&page={n}&per_page={n}`  
**Auth:** `X-Api-Key` (service-level key, ET has one)  
**Direction:** ET polls IMS daily or on demand  
**Dedup key:** `tenant_id + receipt_number + transaction_time` — ET uses this to detect duplicates across overlapping batch windows

#### Response: 200 OK

```json
{
  "tenant_id": "f039714b-...",
  "from": "2026-05-01",
  "to": "2026-05-07",
  "page": 1,
  "total_pages": 3,
  "receipts": [
    {
      "transaction_time": "2026-05-03T19:45:00+02:00",
      "till_id": "TILL-01",
      "receipt_number": "R-28471",
      "total_revenue": 48.50,
      "currency": "EUR",
      "is_void": false,
      "is_comp": false,
      "items": [
        {
          "menu_item_id": "a1b2c3d4-...",
          "menu_item_name": "Chicken Schnitzel",
          "quantity": 2,
          "revenue": 25.00,
          "modifiers": []
        }
      ]
    }
  ]
}
```

#### Required fields (ET rejects rows without these):
- `transaction_time` (ISO 8601 with offset) — chronological anchor
- `receipt_number` — dedup identity
- `items[n].menu_item_id` — recipe lookup key
- `items[n].quantity` — how many sold
- `items[n].revenue` — money in

#### Strongly desired:
- `is_void` / `is_comp` — without these, comps look like theft
- `till_id` — identifies which register has data gaps

#### Explicitly NOT needed:
- Raw unprocessed transactions
- Payment methods (cash/card/voucher)
- Employee names, table numbers, server assignments
- Tax breakdowns (ET handles VAT via eKasa pipeline)

### 2.3 WhatsApp Integration (ET provides, IMS consumes)

**Endpoint:** `POST /api/whatsapp/notify` (already exists in ET)  
**Auth:** `X-Api-Key` (service-level key, IMS has one)  
**Direction:** IMS calls ET when it needs to notify a restaurant owner/manager

The IMS must NOT write to `whatsapp_outbox` directly or call `triggerWorkflow()` — those are ET-internal functions. The HTTP endpoint is the contract.

See the existing [WhatsApp External Integration docs](#67-integrating-external-applications-with-the-whatsapp-sidecar) in this document for the full protocol.

### 2.4 End-to-End Data Flow

```
IMS receives POS export from restaurant
  │
  ▼ IMS processes raw POS against inventory (deducts stock, resolves menu items)
  │
  ▼ ET calls GET /api/ims/pos-sales?tenant_id=X&from=Y&to=Z
  │   (polls on schedule — daily, or triggered by IMS notification)
  │
  ▼ POS data lands in ET's pos_transaction_staging table (own schema, own DB)
  │
  ▼ ET runs process_batch_v1() — 90-day rolling baseline anomaly quarantine
  │
  ▼ ET calls GET /api/ims/recipes?tenant_id=X
  │   (cached locally for 24h)
  │
  ▼ ET resolves: qty_sold × recipe.grams_per_portion = theoretical grams consumed
  │
  ▼ ET writes :Sale + :ConsumptionEstimate to Neo4j via graph_sync_queue
  │
  ▼ ET serves Food Cost Variance Report
  │   Revenue vs Theoretical COGS vs Actual Spend = The Gap
```

No shared tables. No shared databases. Two independent apps talking over HTTP with API keys.

---

## 3. Staging + Quarantine Layer

### 3.1 `pos_batch_uploads`

```sql
CREATE TABLE public.pos_batch_uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    batch_id        TEXT,                   -- IMS's batch identifier
    source          TEXT,                   -- 'ims-pos-processor' or 'manual_export'
    status          TEXT NOT NULL DEFAULT 'STAGED'
                    CHECK (status IN ('STAGED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    total_receipts  INTEGER NOT NULL DEFAULT 0,
    approved_rows   INTEGER NOT NULL DEFAULT 0,
    quarantined_rows INTEGER NOT NULL DEFAULT 0,
    period_start    DATE,
    period_end      DATE,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,
    error_detail    JSONB,
    UNIQUE (tenant_id, batch_id)            -- prevent IMS double-send
);
```

### 3.2 `pos_transaction_staging`

```sql
CREATE TABLE public.pos_transaction_staging (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id          UUID NOT NULL REFERENCES public.pos_batch_uploads(id) ON DELETE CASCADE,
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    line_number       INTEGER NOT NULL,

    -- Raw payload from IMS (free-form JSONB — loosely coupled)
    raw_payload       JSONB NOT NULL,

    -- Extracted timestamp for ordering and anomaly detection
    transaction_time  TIMESTAMPTZ NOT NULL,
    receipt_number    TEXT,

    -- Extracted item-level values (flattened from raw_payload for analysis)
    item_sku          TEXT,                  -- maps to ingredient/recipe ID
    item_name         TEXT,
    quantity          NUMERIC,
    revenue           NUMERIC,
    is_void           BOOLEAN DEFAULT false,
    is_comp           BOOLEAN DEFAULT false,

    -- Resolved fields (populated after recipe lookup)
    recipe_found      BOOLEAN,              -- true if recipe matched
    theoretical_grams JSONB,                -- [ { ingredient_id, grams, cost } ]

    -- Anomaly detection
    anomaly_score      NUMERIC,             -- max Z-score across checks
    anomaly_reason     TEXT,
    flag               TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (flag IN ('PENDING', 'APPROVED', 'QUARANTINED')),

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staging_batch ON public.pos_transaction_staging(batch_id, flag);
CREATE INDEX idx_staging_time  ON public.pos_transaction_staging(tenant_id, transaction_time);
CREATE INDEX idx_staging_sku   ON public.pos_transaction_staging(tenant_id, item_sku);
```

### 3.3 `process_batch_v1()`

The core anomaly detection function. Evaluates each row against a rolling 90-day baseline for that tenant + item_sku.

```sql
CREATE OR REPLACE FUNCTION public.process_batch_v1(p_batch_id UUID)
RETURNS TABLE(total_rows INTEGER, approved INTEGER, quarantined INTEGER)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    v_tenant_id UUID;
    v_batch_status TEXT;
    v_approved INTEGER := 0;
    v_quarantined INTEGER := 0;
    r RECORD;
    b RECORD;
    z_price NUMERIC;
    z_qty NUMERIC;
    max_z NUMERIC;
    reason TEXT;
BEGIN
    -- Lock batch
    SELECT tenant_id, status INTO v_tenant_id, v_batch_status
    FROM public.pos_batch_uploads WHERE id = p_batch_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;
    IF v_batch_status != 'STAGED' THEN
        RAISE EXCEPTION 'Batch % is in % state', p_batch_id, v_batch_status;
    END IF;

    UPDATE public.pos_batch_uploads SET status = 'PROCESSING', processed_at = NOW()
    WHERE id = p_batch_id;

    FOR r IN SELECT * FROM public.pos_transaction_staging
             WHERE batch_id = p_batch_id ORDER BY line_number
    LOOP
        max_z := 0;
        reason := NULL;

        -- Fetch 90-day baseline for this item_sku
        SELECT
            COUNT(*) AS n,
            AVG(revenue) AS mean_rev,
            COALESCE(STDDEV(revenue), 0) AS stddev_rev,
            AVG(quantity) AS mean_qty,
            COALESCE(STDDEV(quantity), 0) AS stddev_qty
        INTO b
        FROM public.pos_transaction_staging
        WHERE tenant_id = v_tenant_id
          AND item_sku = r.item_sku
          AND flag = 'APPROVED'
          AND created_at >= NOW() - INTERVAL '90 days';

        IF b.n >= 5 THEN
            -- Revenue Z-score
            IF b.stddev_rev > 0 THEN
                z_price := ABS(r.revenue - b.mean_rev) / b.stddev_rev;
                IF z_price > 3 THEN
                    max_z := GREATEST(max_z, z_price);
                    reason := COALESCE(reason || '; ', '')
                        || format('revenue Z=%.1f (>3σ)', z_price);
                END IF;
            END IF;

            -- Quantity Z-score
            IF b.stddev_qty > 0 THEN
                z_qty := ABS(r.quantity - b.mean_qty) / b.stddev_qty;
                IF z_qty > 3 THEN
                    max_z := GREATEST(max_z, z_qty);
                    reason := COALESCE(reason || '; ', '')
                        || format('quantity Z=%.1f (>3σ)', z_qty);
                END IF;
            END IF;

            -- Impossible values (always quarantine, no baseline needed)
            IF r.quantity < 0 AND NOT r.is_void THEN
                max_z := GREATEST(max_z, 99);
                reason := COALESCE(reason || '; ', '') || 'negative quantity without void flag';
            END IF;
            IF r.revenue < 0 THEN
                max_z := GREATEST(max_z, 99);
                reason := COALESCE(reason || '; ', '') || 'negative revenue';
            END IF;
        END IF;

        IF max_z >= 3 THEN
            v_quarantined := v_quarantined + 1;
            UPDATE public.pos_transaction_staging
            SET flag = 'QUARANTINED', anomaly_score = max_z, anomaly_reason = reason
            WHERE id = r.id;
        ELSE
            v_approved := v_approved + 1;
            UPDATE public.pos_transaction_staging
            SET flag = 'APPROVED', anomaly_score = max_z
            WHERE id = r.id;
        END IF;
    END LOOP;

    UPDATE public.pos_batch_uploads
    SET status = 'COMPLETED',
        approved_rows = v_approved,
        quarantined_rows = v_quarantined,
        total_receipts = v_approved + v_quarantined
    WHERE id = p_batch_id;

    RETURN QUERY SELECT v_approved + v_quarantined, v_approved, v_quarantined;
END;
$$;
```

**Cold start logic:** When `b.n < 5`, auto-approve. The first batch seeds the baseline. After 5+ purchases of an item, the σ-based checks activate.

### 3.4 Quarantine Audit View

```sql
CREATE VIEW public.v_quarantine_audit AS
SELECT
    b.id               AS batch_id,
    b.batch_id         AS ims_batch_id,
    b.received_at,
    s.line_number,
    s.transaction_time,
    s.item_sku,
    s.item_name,
    s.quantity,
    s.revenue,
    s.anomaly_score,
    s.anomaly_reason
FROM public.pos_transaction_staging s
JOIN public.pos_batch_uploads b ON b.id = s.batch_id
WHERE s.flag = 'QUARANTINED'
ORDER BY b.received_at DESC, s.line_number;
```

### 3.5 Gap Detection

When POS data hasn't arrived for a day, we track it and notify.

```sql
CREATE TABLE public.pos_data_gaps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    gap_date        DATE NOT NULL,
    notified_at     TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    UNIQUE (tenant_id, gap_date)
);
```

Gap detection runs every hour via a cron job or scheduled edge function:

```typescript
// Pseudocode — runs hourly
async function detectGaps(tenantId: string) {
  const lastBatchEnd = await getLatestBatchPeriodEnd(tenantId);
  const today = new Date();
  
  for (let d = lastBatchEnd + 1 day; d < today; d++) {
    const gap = await supabase
      .from('pos_data_gaps')
      .upsert({ tenant_id: tenantId, gap_date: d })
      .select()
      .single();
    
    if (gap.notified_at === null && hoursSince(d) > 12) {
      await triggerWhatsAppAlert(tenantId, 
        `No POS data received for ${formatDate(d)}. ` +
        `If this is expected, you can ignore this. ` +
        `Reply STOP to disable these alerts.`);
      await supabase.from('pos_data_gaps')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', gap.id);
    }
  }
}
```

---

## 4. Recipe Caching Layer

### 4.1 Local Cache Table

```sql
CREATE TABLE public.cached_recipes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    menu_item_id    TEXT NOT NULL,
    menu_item_name  TEXT NOT NULL,
    selling_price   NUMERIC,
    is_active       BOOLEAN DEFAULT true,
    ingredients     JSONB NOT NULL,       -- [ { ingredient_id, ingredient_name, grams_per_portion, cost_per_gram } ]
    total_ingredient_cost NUMERIC,
    food_cost_pct   NUMERIC,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, menu_item_id)
);

CREATE TABLE public.cached_ingredients (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    ingredient_id     TEXT NOT NULL,
    canonical_name    TEXT NOT NULL,
    category          TEXT,
    base_unit         TEXT,
    perishability_days INTEGER,
    current_stock_grams NUMERIC,
    cost_per_gram     NUMERIC,            -- latest from IMS
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, ingredient_id)
);
```

### 4.2 Refresh Logic

```typescript
// Runs on first recipe access of the day, or on demand
async function refreshRecipeCache(tenantId: string): Promise<void> {
  const cached = await supabase
    .from('cached_recipes')
    .select('fetched_at')
    .eq('tenant_id', tenantId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Respect 24h TTL
  if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < 24 * 60 * 60 * 1000) {
    return; // Fresh enough
  }

  // Fetch from IMS
  const response = await fetch(
    `https://ims.synculariti.com/api/v1/recipes?tenant_id=${tenantId}`,
    { headers: { 'X-Api-Key': process.env.IMS_API_KEY } }
  );

  if (!response.ok) {
    // Graceful degradation: keep stale cache up to 72h
    if (cached && (Date.now() - new Date(cached.fetched_at).getTime()) < 72 * 60 * 60 * 1000) {
      return;
    }
    throw new Error(`Recipe API returned ${response.status}`);
  }

  const data = await response.json();

  // Upsert recipes
  for (const item of data.menu_items) {
    await supabase.from('cached_recipes').upsert({
      tenant_id: tenantId,
      menu_item_id: item.id,
      menu_item_name: item.name,
      selling_price: item.selling_price,
      is_active: item.is_active,
      ingredients: item.ingredients,
      total_ingredient_cost: item.total_ingredient_cost,
      food_cost_pct: item.food_cost_pct,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id, menu_item_id' });
  }

  // Upsert ingredients
  for (const ing of data.ingredients) {
    await supabase.from('cached_ingredients').upsert({
      tenant_id: tenantId,
      ingredient_id: ing.id,
      canonical_name: ing.canonical_name,
      category: ing.category,
      base_unit: ing.base_unit,
      perishability_days: ing.perishability_days,
      current_stock_grams: ing.current_stock_grams,
      cost_per_gram: ing.cost_per_gram,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id, ingredient_id' });
  }
}
```

### 4.3 Consumption Resolution

```typescript
interface TheoreticalConsumption {
  ingredientId: string;
  ingredientName: string;
  gramsConsumed: number;
  costAtLatestPrice: number;
}

function resolveConsumption(
  posItem: { menu_item_id: string; quantity: number },
  recipes: Map<string, CachedRecipe>
): { consumptions: TheoreticalConsumption[]; status: 'RESOLVED' | 'PARTIAL' | 'UNKNOWN' } {
  const recipe = recipes.get(posItem.menu_item_id);

  if (!recipe || !recipe.is_active || recipe.ingredients.length === 0) {
    return { consumptions: [], status: 'UNKNOWN' };
  }

  const resolved = recipe.ingredients.filter(i => i.grams_per_portion > 0);

  return {
    consumptions: resolved.map(i => ({
      ingredientId: i.ingredient_id,
      ingredientName: i.ingredient_name,
      gramsConsumed: posItem.quantity * i.grams_per_portion,
      costAtLatestPrice: posItem.quantity * i.grams_per_portion * (i.cost_per_gram ?? 0),
    })),
    status: resolved.length === recipe.ingredients.length ? 'RESOLVED' : 'PARTIAL',
  };
}
```

---

## 5. POS → Consumption Math

### 5.1 New Neo4j Node Types

```
(:Sale {
    id,                    -- UUID
    tenant_id,
    transaction_time,      -- original POS timestamp
    receipt_number,
    till_id,
    total_revenue,
    is_void,
    is_comp
})

(:ConsumptionEstimate {
    id,                    -- UUID
    tenant_id,
    sale_id,               -- FK to :Sale
    ingredient_id,         -- matches :Ingredient.id in our ontology
    ingredient_name,
    grams_consumed,        -- quantity_sold × grams_per_portion
    cost_at_latest_price   -- grams_consumed × cost_per_gram
})
```

**Why ConsumptionEstimate is separate from StockBatch:** We cannot prove which physical batch was consumed. So we model consumption as a *derived estimate*, not a *physical deduction*. The report compares estimates against purchase data — the gap is the signal.

### 5.2 Neo4j Sync: New Phase

After the existing 3-phase bulk merge (which handles purchase-side `:Transaction` nodes), we add a 4th phase for sales + consumption:

```typescript
// In neo4jBulkMerge, after Phase 3:
async function syncSalesWithConsumption(
  sales: ProcessedSale[],
  tx: ManagedTransaction
): Promise<void> {
  // Phase 4a: Create Sale nodes
  await tx.run(`
    UNWIND $sales AS s
    MERGE (sale:Sale {id: s.saleId})
    ON CREATE SET
      sale.tenant_id = s.tenantId,
      sale.transaction_time = s.transactionTime,
      sale.receipt_number = s.receiptNumber,
      sale.till_id = s.tillId,
      sale.total_revenue = s.totalRevenue,
      sale.is_void = s.isVoid,
      sale.is_comp = s.isComp
    ON MATCH SET
      sale.total_revenue = s.totalRevenue,
      sale.is_void = s.isVoid,
      sale.is_comp = s.isComp
  `, { sales: sales.map(s => ({
    saleId: s.id, tenantId: s.tenant_id, transactionTime: s.transaction_time,
    receiptNumber: s.receipt_number, tillId: s.till_id,
    totalRevenue: s.total_revenue, isVoid: s.is_void, isComp: s.is_comp,
  })) });

  // Phase 4b: Create ConsumptionEstimate nodes and link to Ingredients
  await tx.run(`
    UNWIND $estimates AS e
    MATCH (sale:Sale {id: e.saleId})
    MATCH (ing:Ingredient {id: e.ingredientId})
    MERGE (ce:ConsumptionEstimate {id: e.id})
    ON CREATE SET
      ce.tenant_id = e.tenantId,
      ce.grams_consumed = e.gramsConsumed,
      ce.cost_at_latest_price = e.costAtLatestPrice
    ON MATCH SET
      ce.grams_consumed = e.gramsConsumed,
      ce.cost_at_latest_price = e.costAtLatestPrice
    MERGE (sale)-[:ESTIMATES]->(ce)
    MERGE (ce)-[:OF_INGREDIENT]->(ing)
  `, { estimates: sales.flatMap(s =>
    s.consumptions.map(c => ({
      id: c.id, saleId: s.id, tenantId: s.tenant_id,
      ingredientId: c.ingredient_id,
      gramsConsumed: c.grams_consumed,
      costAtLatestPrice: c.cost_at_latest_price,
    }))
  ) });
}
```

---

## 6. Food Cost Variance Report

### 6.1 Core Query

Run against Neo4j once the batch ingestion + recipe resolution is complete:

```cypher
// ==========================================
// Food Cost Variance Report
// Period: 2026-05-01 to 2026-05-31
// Tenant: f039714b-...
// ==========================================

// 1. TOTAL REVENUE from POS sales (exclude voids, include comps for tracking)
MATCH (s:Sale {tenant_id: 'f039714b-...'})
WHERE s.transaction_time >= '2026-05-01' AND s.transaction_time < '2026-06-01'
  AND s.is_void = false
RETURN
  round(sum(s.total_revenue) * 100) / 100 AS total_revenue,
  count(s) AS receipt_count,
  count(s) / 31 AS avg_daily_receipts

// 2. THEORETICAL COGS (from consumption estimates)
MATCH (ce:ConsumptionEstimate {tenant_id: 'f039714b-...'})
WHERE ce.transaction_time >= '2026-05-01' AND ce.transaction_time < '2026-06-01'
RETURN
  round(sum(ce.cost_at_latest_price) * 100) / 100 AS theoretical_cogs,
  sum(ce.grams_consumed) AS total_grams_consumed

// 3. ACTUAL SPEND (from purchase transactions — existing data)
MATCH (t:Transaction {tenant_id: 'f039714b-...', category: 'COGS'})
WHERE t.date >= '2026-05-01' AND t.date < '2026-06-01'
RETURN
  round(sum(t.amount) * 100) / 100 AS actual_spend

// 4. THE GAP — Per ingredient, weekly
MATCH (ce:ConsumptionEstimate {tenant_id: 'f039714b-...'})-[:OF_INGREDIENT]->(ing:Ingredient)
WHERE ce.transaction_time >= '2026-05-01' AND ce.transaction_time < '2026-06-01'
WITH ing.name AS ingredient, ce.grams_consumed AS grams, ce.cost_at_latest_price AS cost
WITH ingredient,
     sum(grams) AS total_grams,
     round(sum(cost) * 100) / 100 AS theoretical_cost
// Join with actual purchase data for this ingredient
OPTIONAL MATCH (sku:MerchantSKU)-[:IS_INSTANCE_OF]->(ing2:Ingredient {name: ingredient})
OPTIONAL MATCH (t:Transaction)-[c:CONTAINS]->(sku)
WHERE t.date >= '2026-05-01' AND t.date < '2026-06-01'
WITH ingredient, theoretical_cost, sum(c.amount) AS actual_cost
RETURN
  ingredient,
  theoretical_cost,
  round(actual_cost * 100) / 100 AS actual_cost,
  round((actual_cost - theoretical_cost) * 100) / 100 AS gap,
  CASE
    WHEN theoretical_cost = 0 THEN NULL
    ELSE round(((actual_cost - theoretical_cost) / theoretical_cost) * 10000) / 100
  END AS gap_pct
ORDER BY gap DESC
LIMIT 10

// 5. VARIANCE SPIKE CALENDAR — dates with highest gap
MATCH (ce:ConsumptionEstimate {tenant_id: 'f039714b-...'})-[:OF_INGREDIENT]->(ing:Ingredient)
WHERE ce.transaction_time >= '2026-05-01' AND ce.transaction_time < '2026-06-01'
WITH date(ce.transaction_time) AS d,
     sum(ce.cost_at_latest_price) AS daily_theoretical
OPTIONAL MATCH (sku:MerchantSKU)-[:IS_INSTANCE_OF]->(:Ingredient)
OPTIONAL MATCH (t:Transaction)-[c:CONTAINS]->(sku)
WHERE date(t.date) = d
WITH d, daily_theoretical, sum(c.amount) AS daily_actual
RETURN
  d,
  round(daily_theoretical * 100) / 100 AS theoretical_cogs,
  round(daily_actual * 100) / 100 AS actual_spend,
  round((daily_actual - daily_theoretical) * 100) / 100 AS gap,
  CASE
    WHEN daily_actual > daily_theoretical * 1.3 THEN 'HIGH_VARIANCE'
    WHEN daily_actual < daily_theoretical * 0.7 THEN 'NEGATIVE_VARIANCE'
    ELSE 'NORMAL'
  END AS flag
ORDER BY abs(daily_actual - daily_theoretical) DESC
LIMIT 10
```

### 6.2 Report JSON Output

```typescript
interface FoodCostVarianceReport {
  period: { start: string; end: string };
  dataCoverage: {
    daysWithPOSData: number;
    daysInPeriod: number;
    pctCovered: number;
    warning: string | null;          // e.g. "No POS data for 8 days this period"
  };
  headline: {
    totalRevenue: number;            // €84,000
    theoreticalCOGS: number;         // €28,000
    actualSpend: number;             // €35,000
    gap: number;                     // €7,000
    gapPct: number;                  // 25%
    confidenceBands: {
      gapLower: number;              // €5,600 (accounting for missing data)
      gapUpper: number;              // €8,400
    };
    direction: 'BLEEDING' | 'PROFITABLE' | 'NEUTRAL';
  };
  topIngredients: Array<{
    ingredient: string;
    theoreticalCost: number;
    actualCost: number;
    gap: number;
    gapPct: number;
    shareOfTotalGap: number;         // e.g. 0.63 = chicken is 63% of the gap
  }>;
  weeklyTrend: Array<{
    week: string;                    // "2026-W18"
    revenue: number;
    theoreticalCOGS: number;
    actualSpend: number;
    gap: number;
  }>;
  varianceSpikes: Array<{
    date: string;
    gap: number;
    flag: 'HIGH_VARIANCE' | 'NEGATIVE_VARIANCE' | 'NORMAL';
    likelyCause: string | null;      // e.g. "Friday before Easter — 2.4x normal gap"
  }>;
  recommendation: string | null;     // Top finding, narrated
}
```

### 6.3 Recommendation Engine

The recommendation is generated by cross-referencing three signals:

```
signal_strength = |Δprice| × |Δvariance| × |Δvolume|

Only surface a finding if ALL three are elevated.
One flat signal kills the finding — no noise.
```

Example: "Chicken gap widened from 12% to 31% in May. Chicken sales volume is up 8% (expected). Chicken price is unchanged. The gap is driven by consumption exceeding recorded purchases — check portion sizes, Friday night prep waste, or informal usage."

---

## 7. Dashboard Plan

### Keep (already useful):

| Card | Reason |
|------|--------|
| Operating Margin | Core business metric — "am I making money?" |
| BudgetHealth | "Am I on track to hit my budget?" |
| MonthlyPerformance | Month-over-month comparison |
| Cash Flow (MarketTrends) | 6-month trend — liquidity signal |
| Category Breakdown | "Where is my money going?" — donut |

### Remove (noise):

| Card | Reason |
|------|--------|
| TeamAllocation | Ranks employees by spend — irrelevant, potentially harmful optics |
| CommandCenter QuickAdd pills | Abstract categories nobody uses |

### Repurpose:

| Card | Change |
|------|--------|
| AIInsights | Stop showing trivia (Saturday vs Monday). Instead: Food Cost Variance headline + top finding. First sentence is always a number ("Your food cost gap is €7,200 this period"). Second sentence is the cross-referenced recommendation. |
| Top Items (ItemAnalytics) | Repurpose to show ingredient-level gap, not raw purchase counts. "Chicken: €2,300 gap (31% variance)" is actionable. "Chicken: bought 12 times" is trivia. |

### Add:

| Card | Description |
|------|-------------|
| **Food Cost Variance Card** | The Gap number (big, colored red/amber/green), coverage indicator, top 3 ingredients by gap |
| **Variance Spike Mini-Calendar** | Monthly calendar view with red dots on high-variance days. Click a date to see the breakdown. |
| **Data Completeness Bar** | "POS data: 22/30 days (73%). The gap estimate has ±15% uncertainty." — sets expectations |

### Layout Order (top to bottom):

```
Row 1: Revenue / Theoretical COGS / Actual Spend  (3 big number cards)
Row 2: Food Cost Variance (the Gap) + Data Completeness
Row 3: Top Ingredients by Gap + Variance Spike Calendar
Row 4: Cash Flow Trend + Operating Margin
Row 5: Category Breakdown + Transaction List
```

---

## 8. Getting Smarter Over Time

The system improves on four concurrent feedback loops. None require ML — all are deterministic statistics over accumulating data.

### Loop 1: Anomaly Baseline Calibration

Each batch that processes updates μ and σ for every (tenant, item_sku) pair. As n grows, the t-distribution tightens:

| n | Detection sensitivity | What it catches |
|---|----------------------|-----------------|
| 0-4 | Off (auto-approve) | Cold start |
| 5-20 | Wide (~4σ) | Only absurd outliers (50kg instead of 5kg) |
| 20-100 | Moderate (~3σ) | Genuine data entry errors |
| 100+ | Tight (~2.5σ) | Drift in portion sizes or pricing |

### Loop 2: Pattern Library with Decay

Observed patterns (weekend variance, holiday dip, vendor price shifts) are stored with a confidence score. Each confirmed repetition adds confidence. Each missed cycle halves it. After 3 misses, the pattern is archived.

```
Pattern detected: "Friday chicken gap is 2x normal"
  May 2026: observed, confidence 0.3
  June 2026: observed again, confidence 0.6
  July 2026: missed (no data), confidence 0.3
  August 2026: missed, confidence 0.15
  September 2026: archived (not surfaced)
```

This separates real seasonality from random noise without manual thresholds.

### Loop 3: Cross-Reference Engine

A finding is only surfaced if it passes the "so what" test. The formula:

```
signal_strength = |Δprice| × |Δvariance| × |Δvolume|
                  ↑ how much did  ↑ how much did  ↑ is this a big
                   the cost shift? the gap widen?   part of the biz?
```

Each term is normalized to [0, 1]. If any term is flat (~0), the product dies. This prevents surfacing "chicken price went up 5% but volume is tiny" or "chicken gap widened but price didn't change."

### Loop 4: Confidence Calibration Against Reality (future)

When the report says "gap is €7,000 ±€1,000" and the owner investigates and finds €6,500 of actual waste, we record the delta. After 10 such calibrations, we adjust the uncertainty model. This requires user action (they need to tell us what they found), so it's the slowest loop.

### The Honest Ceiling

Even with perfect data, expect 85-90% explainability. The remaining 10-15% is:
- Owner grabbing a coke without recording it (inventory shrinks, no POS, no PO)
- Chef substituting chicken for veal when the delivery was short
- Staff meals, spills, over-portioning
- The line cook pulling 3kg from the Thursday delivery for Friday prep that was logged as Thursday usage

These are not bugs. They are features of restaurants. The system's job is not to eliminate them — it's to **quantify the unknown** so the operator decides which unknowns to care about.

---

## 9. AI-Executable Build Prompt

The following prompt is designed to be given to an AI coding assistant (Claude, GPT, etc.) to build this pipeline against the existing Synculariti-ET codebase.

**Critical context:** The IMS and ET are separate applications with separate databases. They communicate via HTTP APIs with `X-Api-Key` auth. The ET does NOT have direct database access to IMS data — it calls `GET /api/ims/recipes` and `GET /api/ims/pos-sales`. The IMS does NOT have access to ET's `whatsapp_outbox`, `graph_sync_queue`, or Neo4j — it calls `POST /api/whatsapp/notify`.

Within the ET codebase itself: all staging tables, caching tables, Neo4j sync, and WhatsApp infrastructure are internal. The cross-app boundary is only crossed via HTTP.

Copy and paste the block below as a single prompt:

---

```
You are a senior full-stack engineer implementing the Batch Ingestion & Food Cost Variance Pipeline for Synculariti-ET.

Read these files first to understand the existing architecture:
- /AGENTS.md
- supabase/migrations/20260525185942_remote_schema.sql (focus on graph_sync_queue, transactions, receipt_items, api_keys)
- supabase/migrations/20260525220000_pos_architecture.sql
- v2/src/lib/neo4j.ts
- v2/src/lib/types.ts
- v2/src/lib/insight-queries.ts
- v2/src/lib/neo4j-ontology.ts
- v2/src/lib/holidays.ts
- v2/src/app/api/debug/sync-neo4j/route.ts
- v2/src/modules/finance/components/AIInsights.tsx (for understanding current insight card)
- v2/src/app/page.tsx (for understanding dashboard layout)
- docs/architecture/batch-ingestion-pipeline.md (this document — full spec)

IMPORTANT CONTEXT: The IMS and ET are separate applications with separate databases. They communicate via HTTP APIs with `X-Api-Key` auth. The ET does NOT have direct database access to IMS data.

- ET fetches POS data via `GET /api/ims/pos-sales?tenant_id=X&from=Y&to=Z` (pagination supported)
- ET fetches recipes via `GET /api/ims/recipes?tenant_id=X` (cached locally for 24h)
- IMS sends WhatsApp via `POST /api/whatsapp/notify` (existing endpoint)
- All staging, caching, and Neo4j infrastructure is ET-internal (this codebase)

For @demo-2026 development: mock the IMS API responses with hardcoded JSON. The actual IMS API endpoints don't exist yet — build the ET side ready to receive them.

The target is @demo-2026 tenant which has seeded transaction + receipt_items data going back to November.

IMPLEMENT THE FOLLOWING IN ORDER:

=== PHASE 1: DATABASE MIGRATIONS ===

Create `/supabase/migrations/20260528001_pos_batch_staging.sql` with:
- pos_batch_uploads table
- pos_transaction_staging table with JSONB raw_payload
- process_batch_v1() PL/pgSQL function (90-day rolling baseline, per-tenant per-item_sku, σ=3 threshold)
- v_quarantine_audit view
- pos_data_gaps table
- Grant permissions and enable RLS

=== PHASE 2: RECIPE CACHE (ET's local replica of IMS data) ===

Create `/supabase/migrations/20260528002_recipe_cache.sql` with:
- cached_recipes table (ET-local — populated from IMS API, 24h TTL)
- cached_ingredients table (ET-local — populated from IMS API, 24h TTL)
- Grant permissions, create indexes

Create `/v2/src/lib/ims-client.ts` with:
- fetchRecipes(tenantId) — calls GET /api/ims/recipes, upserts into cached_recipes + cached_ingredients, 24h TTL, 72h stale grace
- fetchPOSSales(tenantId, from, to) — calls GET /api/ims/pos-sales with pagination, returns receipts array
- Mock implementations for @demo-2026 testing (hardcoded JSON)
- resolveConsumption(posItem, recipes) — returns { consumptions, status }

=== PHASE 3: POS BATCH INGESTION WORKER ===

Create `/v2/src/lib/pos-batch-worker.ts` with:
- pollNewSales(tenantId) — calls fetchPOSSalesFromIMS for the last N days, writes each receipt to pos_transaction_staging with raw JSONB payload
- processBatch(batchId) — calls process_batch_v1 RPC, then resolves recipes for APPROVED rows via fetchRecipesFromIMS, then enqueues to graph_sync_queue as 'sale' entity_type
- detectDataGaps(tenantId) — checks which calendar dates have no data in pos_batch_uploads for the last 14 days, upserts to pos_data_gaps, triggers WhatsApp alert via existing /api/whatsapp/notify pattern if 12h+ stale

=== PHASE 4: NEO4J SALES + CONSUMPTION SYNC ===

In `/v2/src/lib/neo4j.ts`:
- Add syncSalesWithConsumption() function that creates :Sale and :ConsumptionEstimate nodes
- Add a Phase 4 to neo4jBulkMerge (or create a separate function called from the sync route)

Update `/v2/src/app/api/debug/sync-neo4j/route.ts` to also process 'sale' and 'stock_batch' entity types from graph_sync_queue.

=== PHASE 5: FOOD COST VARIANCE REPORT ===

Create `/v2/src/lib/food-cost-variance.ts` with:
- generateReport(tenantId, startDate, endDate) — runs the Cypher queries from Section 6 of the arch doc
- Returns FoodCostVarianceReport interface (full JSON shape)
- Confidence bands based on data coverage
- Cross-reference recommendation engine
- Unit tests

Create `/v2/src/app/api/analytics/food-cost-variance/route.ts` with:
- GET handler, authenticated via withAuth
- Returns the report JSON
- Cached server-side for 1 hour

=== PHASE 6: DASHBOARD COMPONENTS ===

Create or update:
- `/v2/src/modules/finance/components/FoodCostVarianceCard.tsx` — shows the Gap number, top 3 ingredients, coverage indicator
- `/v2/src/modules/finance/components/VarianceCalendar.tsx` — monthly calendar with red dots on spike dates
- Update `/v2/src/modules/finance/components/AIInsights.tsx` — change insight generation to use Food Cost Variance as primary source, trivia as fallback only
- Update `/v2/src/app/page.tsx` — add Food Cost Variance card, variance calendar; remove TeamAllocation card

=== TESTING ===

Run the existing test suite to confirm nothing is broken:
- npm test (backend project)
- Check that the @demo-2026 tenant's Neo4j graph still merges correctly

New tests to write:
- pos-batch-worker.test.ts — mock IMS payload, verify staging + quarantine
- food-cost-variance.test.ts — mock Neo4j, verify report shape
- recipe-cache.test.ts — mock HTTP, verify 24h TTL, stale fallback

=== WHAT SUCCESS LOOKS LIKE ===

1. `fetchPOSSalesFromIMS()` mock returns sample receipts → they appear in `pos_transaction_staging` with flag PENDING
2. Running `processBatch()` approves normal rows, quarantines rows with quantity=500 when baseline mean=5
3. APPROVED rows have `recipe_found=true` and `theoretical_grams` populated from recipe cache
4. Neo4j has `:Sale` and `:ConsumptionEstimate` nodes linked via `[:ESTIMATES]`
5. `generateFoodCostVarianceReport()` returns a report with three big numbers (Revenue, Theoretical COGS, Actual Spend), ingredient gaps, and variance spike dates
6. Dashboard shows the Gap number as the primary insight — no Saturday-vs-Monday trivia
7. The AI Insight card uses Food Cost Variance finding as its primary source
8. `detectDataGaps()` correctly flags missing days and the WhatsApp alert is triggerable

Do not add any comments to the code. Follow existing code style and conventions (Zod for validation, ServerLogger for audit, getErrorMessage for errors, zero `: any` usages). Match the existing test patterns (jest.mock for supabase, mockReset after clearAllMocks).
```

---

*End of architecture document. This is a live design — update as decisions change.*
