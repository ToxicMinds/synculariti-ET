# Batch Ingestion & Food Cost Variance Pipeline

**Status:** Design v2 — two-table architecture (purchases + transactions), two-path quarantine (POS auto + purchase interactive)  
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
   - [Locations API](#23-locations-api-ims-provides-et-consumes)
   - [Inventory Snapshots API](#24-inventory-snapshots-api-ims-provides-et-consumes)
   - [Data Gaps API](#25-data-gaps-api-ims-provides-et-consumes)
   - [WhatsApp Integration](#26-whatsapp-integration-et-provides-ims-consumes)
   - [End-to-End Data Flow](#27-end-to-end-data-flow)
3. [POS Data: Staging + Quarantine](#3-pos-data-staging--quarantine)
   - [Schema: pos_batch_uploads](#31-pos_batch_uploads)
   - [Schema: pos_transaction_staging](#32-pos_transaction_staging)
   - [Anomaly Detection: process_batch_v1](#33-process_batch_v1)
   - [Quarantine Audit View](#34-quarantine-audit-view)
   - [Gap Detection](#35-gap-detection)
   - [POS Alerting (Informational)](#36-pos-alerting-informational-only)
4. [Purchase Data: Quarantine & Reconciliation](#4-purchase-data-quarantine--reconciliation)
   - [Two-Table Architecture](#41-two-table-architecture)
   - [Schema: purchases](#42-schema-purchases)
   - [Schema: purchase_anomaly_queue](#43-schema-purchase_anomaly_queue)
   - [Two-Path Quarantine Flow](#44-two-path-quarantine-flow)
   - [Rejection-with-Reason](#45-rejection-with-reason)
   - [WhatsApp Decision Handlers](#46-whatsapp-decision-handlers)
   - [release_expired_quarantines_v1](#47-release_expired_quarantines_v1)
   - [Receipt Items: Polymorphic FK](#48-receipt-items-polymorphic-fk)
5. [Recipe Caching Layer](#5-recipe-caching-layer)
   - [Local Cache Table](#51-local-cache-table)
   - [Refresh Logic](#52-refresh-logic)
   - [Consumption Resolution](#53-consumption-resolution)
6. [POS → Consumption Math](#6-pos--consumption-math)
   - [New Neo4j Node Types](#61-new-neo4j-node-types)
   - [Neo4j Sync: Phase 4](#62-neo4j-sync-phase-4)
7. [Food Cost Variance Report](#7-food-cost-variance-report)
   - [Core Query](#71-core-query)
   - [Report JSON Output](#72-report-json-output)
   - [Recommendation Engine](#73-recommendation-engine)
8. [Multi-Location Design](#8-multi-location-design)
   - [Location Hierarchy](#81-location-hierarchy)
   - [Enforcement Rules](#82-enforcement-rules)
   - [Location Selector UI](#83-location-selector-ui)
9. [Dashboard Plan](#9-dashboard-plan)
10. [Getting Smarter Over Time](#10-getting-smarter-over-time)
11. [AI-Executable Build Prompt](#11-ai-executable-build-prompt)
12. [Implementation Plan](#12-implementation-plan)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          IMS (Co-founder's system)                        │
│  ┌─────────────────────┐          ┌──────────────────────────────┐       │
│  │ Recipe Engine        │          │ POS Data Processor           │       │
│  │ (menu_item → grams   │          │ (raw sales → resolved        │       │
│  │  per ingredient)     │          │  inventory deductions)       │       │
│  └──────────┬──────────┘          └──────────────┬───────────────┘       │
│             │                                    │                        │
│  ┌──────────▼────────────────────────────────────▼───────────────────┐   │
│  │ IMS Database (owns): inventory_items, inventory_ledger,            │   │
│  │ purchase_orders, locations, pos_processed_sales, cached_recipes    │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└─────────────┬────────────────────────────────────┬────────────────────────┘
              │ GET /api/ims/recipes                 │ GET /api/ims/pos-sales
              │ GET /api/ims/locations               │ GET /api/ims/inventory-snapshots
              │ (pulled by ET, cached 24h)           │ GET /api/ims/data-gaps
              ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Expense Tracker (this codebase)                        │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ 1. POS DATA (informational)     │ 2. PURCHASE DATA (interactive) │    │
│  │    pos_batch_uploads            │    purchases (COGS table)       │    │
│  │    pos_transaction_staging      │    transactions (OPEX table)    │    │
│  │    process_batch_v1()           │    receipt_items (polymorphic)  │    │
│  │    v_quarantine_audit           │    purchase_anomaly_queue       │    │
│  │    pos_data_gaps                │    QuarantineDecisionService    │    │
│  └──────────┬───────────────────────────────────────┬─────────────────┘    │
│             │                                       │                       │
│             ▼                                       ▼                       │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ 3. RECIPE ENRICHMENT (shared between both paths)                 │    │
│  │    cached_recipes + cached_ingredients (24h TTL from IMS API)    │    │
│  │    resolveConsumption() → theoretical grams + cost               │    │
│  └──────────────────────────┬───────────────────────────────────────┘    │
│                             │                                            │
│                             ▼                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ 4. GRAPH SYNC (graph_sync_queue → Neo4j)                         │    │
│  │    :Transaction (purchases — existing, re-categorized)            │    │
│  │    :Sale + :ConsumptionEstimate (POS — new)                      │    │
│  └──────────────────────────┬───────────────────────────────────────┘    │
│                             │                                            │
└─────────────────────────────┼────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     FOOD COST VARIANCE REPORT                             │
│                                                                           │
│  Revenue (POS) vs Theoretical COGS (POS × recipes)                       │
│  vs Actual Spend (purchases = COGS) + OPEX (transactions)                │
│                                                                           │
│  The Gap = Actual COGS Spend – Theoretical COGS                          │
│  (positive gap = bleeding, negative gap = profitable variance)            │
│                                                                           │
│  "You spent €35,000 on ingredients. Based on sales, you should           │
│   have consumed €28,000 worth. The €7,000 gap is concentrated            │
│   in chicken (63%) and dairy (22%). Friday nights account for 40%        │
│   of the variance."                                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### Five key architectural decisions

**Decision 1: Consumption estimates are separate from purchase data in Neo4j.**

We do NOT create `:StockBatch` nodes with FIFO depletion. We cannot know which physical chicken delivery was used for which Schnitzel sale. Instead, we store `:ConsumptionEstimate` nodes derived from recipes — theoretical, not physical. The report compares these estimates against actual purchase data. The gap between them is the actionable signal.

**Decision 2: Anomaly quarantine is per-tenant, per-item-sku, rolling 90-day.**

The baseline learns each restaurant's normal pricing and volume. A new restaurant gets seeded with their historical POS data dump so the baseline has data from day one. Cold start (no history): auto-approve first batch until at least 5 data points exist per item-sku. This applies to both POS data (informational only) and purchase receipts (interactive poll). The 90-day window is a moving target — stale data falls out naturally, adapting to seasonality without manual intervention.

**Decision 3: Two-Table Architecture (purchases + transactions).**

COGS and OPEX are fundamentally different financial concepts with different validation needs. `purchases` tracks ingredient/inventory acquisitions (receipt scans, POs) — the data that feeds FCV. `transactions` tracks operating expenses (rent, utilities, bank fees) — entered manually or via bank import. They share `receipt_items` via a polymorphic FK (`source_id` + `source_type`). This split prevents the FCV from being diluted by non-COGS items.

| Table | Purpose | Entry Method | Receipt Required? |
|-------|---------|-------------|-------------------|
| `purchases` | COGS (ingredients, inventory) | Scanner (eKasa/AI) | Yes |
| `transactions` | OPEX (rent, utilities, etc.) | Manual, bank import | No |

**Decision 4: Two-Path Quarantine (POS auto-release vs Purchase interactive poll).**

| Source | Truth Owner | ET Can Reject? | WhatsApp Action | Auto-Release? |
|--------|-------------|----------------|-----------------|---------------|
| POS data | IMS (correct in IMS) | No | Informational text only | Yes (always auto-releases) |
| Purchase (receipt scan) | ET | Yes (Approve/Reject/Explain) | Poll with 3 options | Yes (after configurable timer expires) |

POS data anomalies are flagged and auto-released because ET cannot fix the source data — the restaurant owner must correct it in IMS. Purchase data anomalies require human judgment because ET owns the ingestion.

**Decision 5: Reports degrade gracefully with incomplete data.**

If only 70% of days have POS data, the report shows: "Data coverage: 70% this period — gap estimate ±15%." If recipes don't exist for some menu items, those items show as `UNKNOWN` consumption. The system quantifies uncertainty rather than pretending it has perfect data.

---

## 2. Cross-App Contracts: IMS ↔ ET

**Critical architecture rule:** The IMS (Inventory Management System) and ET (Expense Tracker) are separate applications. They have separate Supabase projects (separate Postgres databases), separate Neo4j instances (ET only), and separate deployments. They communicate exclusively through HTTP APIs with `X-Api-Key` authentication.

Each app maintains its own `api_keys` table. Service-level keys (`tenant_id IS NULL`) are provisioned for cross-app communication.

```
IMS Database (owns):                           ET Database (owns):
  inventory_items, inventory_ledger              purchases, transactions, receipt_items
  purchase_orders, po_line_items                 graph_sync_queue, whatsapp_outbox
  locations (source of truth)                    pos_transaction_staging (local cache)
  cached_recipes (source of truth)               cached_recipes (24h replica)
  pos_processed_sales (source of truth)          cached_locations (5min TTL dashboard view)
  inventory_snapshots (physical counts)          Neo4j graph (no IMS access)
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

**Endpoint:** `GET /api/ims/pos-sales?tenant_id={uuid}&location_id={uuid}&from={date}&to={date}&page={n}&per_page={n}`  
**Auth:** `X-Api-Key` (service-level key, ET has one)  
**Direction:** ET polls IMS daily or on demand  
**Dedup key:** `tenant_id + location_id + receipt_number + transaction_time` — ET uses this to detect duplicates across overlapping batch windows

#### Response: 200 OK

```json
{
  "tenant_id": "f039714b-...",
  "location_id": "a1b2c3d4-...",
  "location_name": "Bratislava Centrum",
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
- `location_id` — which location this sale belongs to

#### Strongly desired:
- `is_void` / `is_comp` — without these, comps look like theft
- `till_id` — identifies which register has data gaps

#### Explicitly NOT needed:
- Raw unprocessed transactions
- Payment methods (cash/card/voucher)
- Employee names, table numbers, server assignments
- Tax breakdowns (ET handles VAT via eKasa pipeline)

### 2.3 Locations API (IMS provides, ET consumes)

**Endpoint:** `GET /api/ims/locations?tenant_id={uuid}`  
**Auth:** `X-Api-Key` (service-level key, ET has one)  
**Direction:** ET calls IMS on dashboard load, caches for 5 min

**Purpose:** IMS is the source of truth for locations (created/managed there). ET needs location names and IDs to populate the location selector dropdown in the UI and to validate incoming POS/purchase data.

#### Response: 200 OK

```json
{
  "tenant_id": "f039714b-...",
  "locations": [
    {
      "id": "a1b2c3d4-...",
      "name": "Bratislava Centrum",
      "code": "BA-CENTRUM",
      "address": "Hlavné námestie 1, 811 01 Bratislava",
      "is_active": true,
      "opened_at": "2024-03-15",
      "timezone": "Europe/Bratislava"
    },
    {
      "id": "e5f6a7b8-...",
      "name": "Košice Staré Mesto",
      "code": "KE-OLD",
      "address": "Hlavná 42, 040 01 Košice",
      "is_active": true,
      "opened_at": "2025-01-20",
      "timezone": "Europe/Bratislava"
    }
  ]
}
```

#### Error States:

| HTTP Status | Meaning | What to do |
|-------------|---------|------------|
| `200` | Success | Parse response body |
| `400` | Missing `tenant_id` param | Check query string includes `tenant_id={uuid}` |
| `401` | Invalid/missing `X-Api-Key` | Check the API key header is present and valid |
| `404` | Tenant not found | Verify the tenant UUID exists in the IMS database |
| `500` | IMS internal error | Retry with exponential backoff; use cached locations if available (max 1h stale) |

#### Edge Cases:
- **Empty `locations` array**: Tenant has no locations configured. ET should create a default "Head Office" location on first dashboard load, or display a setup prompt.
- **All locations inactive**: ET falls back to cached data. If no cache exists, show "No locations configured" in the location selector.
- **Location ID mismatch**: If an incoming POS/purchase batch references a `location_id` not in the IMS response, ET rejects the batch with a 400 error.

#### Caching Rules:
- ET stores locations in its own `locations` table (already exists, see `sql/b2b_evolution/01_locations.sql`)
- 5-minute TTL for dashboard use (locations change rarely)
- `location_type` field: `'restaurant' | 'commissary' | 'office' | 'warehouse'`
- Inactive locations (`is_active = false`) are excluded from dropdown but historical data still references them

### 2.4 Inventory Snapshots API (IMS provides, ET consumes)

**Endpoint:** `GET /api/ims/inventory-snapshots?tenant_id={uuid}&location_id={uuid}&from={date}&to={date}`  
**Auth:** `X-Api-Key` (service-level key, ET has one)  
**Direction:** ET fetches when generating FCV report for the period  
**Purpose:** Physical inventory counts from IMS provide ground-truth stock levels. ET uses these to:
1. Validate that theoretical consumption (POS × recipes) ≈ actual inventory depletion
2. Detect systematic theft/waste (book-to-physical gap > 5%)
3. Calibrate the FCV confidence bands

#### Response: 200 OK

```json
{
  "tenant_id": "f039714b-...",
  "location_id": "a1b2c3d4-...",
  "snapshots": [
    {
      "id": "x1y2z3-...",
      "taken_at": "2026-05-01T08:00:00+02:00",
      "type": "full",                    // 'full' | 'partial' | 'spot_check'
      "ingredients": [
        {
          "ingredient_id": "e5f6a7b8-...",
          "ingredient_name": "Chicken Breast",
          "unit": "g",
          "book_quantity": 50000,         // what the system thinks
          "physical_quantity": 48200,      // what was actually counted
          "variance_g": -1800,
          "variance_pct": -3.6
        }
      ]
    }
  ]
}
```

#### Error States:

| HTTP Status | Meaning | What to do |
|-------------|---------|------------|
| `200` | Success | Parse response body |
| `400` | Missing/invalid params | Check `tenant_id`, `location_id`, `from`, `to` are valid UUIDs/ISO dates |
| `401` | Invalid/missing `X-Api-Key` | Check the API key header is present and valid |
| `404` | Tenant or location not found | Verify tenant UUID and location UUID exist in IMS |
| `500` | IMS internal error | Retry with backoff; skip physical accuracy for this FCV period |

#### Edge Cases:
- **Empty `snapshots` array**: No physical counts taken in the date range. ET proceeds without a `physical_accuracy` score, adding a note: "No physical inventory data for this period."
- **Partial snapshots** (`type: 'partial'`): Only specific ingredients were counted. ET uses available data and marks the accuracy score as `partial`.
- **Missing ingredient in snapshot**: If an ingredient tracked in Neo4j wasn't counted, it's excluded from physical accuracy calculations.
- **`book_quantity = 0`**: Division-by-zero guard — variance_pct is set to `NULL` (not 0).

#### Data Usage in FCV:
- Physical counts are NOT used to correct the ledger (that's IMS's job)
- They ARE used to generate a `physical_accuracy` score: `1 - abs(variance) / total_book`
- An accuracy score < 0.95 adds a warning to the FCV: "Physical inventory differs from book by 8% — gap estimate confidence is reduced"

### 2.5 Data Gaps API (IMS provides, ET consumes)

**Endpoint:** `GET /api/ims/data-gaps?tenant_id={uuid}&location_id={uuid}`  
**Auth:** `X-Api-Key` (service-level key, ET has one)  
**Direction:** ET polls to cross-reference its own `pos_data_gaps` table with IMS's view  
**Purpose:** IMS might know about missing data that ET doesn't (e.g., a till that was offline but IMS received the batch later). This lets ET reconcile its gap tracking.

#### Response: 200 OK

```json
{
  "tenant_id": "f039714b-...",
  "location_id": "a1b2c3d4-...",
  "known_gaps": [
    {
      "date": "2026-05-12",
      "reason": "till_offline",
      "till_id": "TILL-03",
      "notes": "Till crashed during dinner service. Data for 18:00-22:00 was recovered but 22:00-23:00 is missing.",
      "recovered": false,
      "affected_revenue_est": 340.00
    }
  ],
  "late_data": [
    {
      "date": "2026-05-10",
      "received_at": "2026-05-11T14:30:00Z",
      "reason": "network_outage"
    }
  ]
}
```

#### Error States:

| HTTP Status | Meaning | What to do |
|-------------|---------|------------|
| `200` | Success | Parse response body |
| `400` | Missing `tenant_id` or `location_id` | Check query string includes both params |
| `401` | Invalid/missing `X-Api-Key` | Check the API key header is present and valid |
| `404` | Tenant not found | Verify the tenant UUID exists in the IMS database |
| `500` | IMS internal error | Retry with backoff; skip gap reconciliation for this cycle |

#### Edge Cases:
- **Empty `known_gaps` and `late_data` arrays**: No gaps or late data known to IMS. ET trusts its own `pos_data_gaps` table.
- **Gap already resolved in ET**: If IMS reports a gap as `recovered: true` but ET already has it as `resolved_at IS NOT NULL`, the reconciliation is a no-op.
- **Conflict**: IMS says a date has data but ET has no batch for it. ET should add it to `pos_data_gaps` with `resolved_at = now()` (IMS confirmed it exists — ET just hasn't polled it yet).
- **Location-scoped gaps**: Each gap is per-location. The same date may have a gap for one location but not another.

ET reconciles this against its own `pos_data_gaps`:
- Gaps that IMS says are recovered → ET removes from its alerting
- Gaps ET didn't know about → ET adds to `pos_data_gaps` with `resolved_at` if IMS says recovered
- Late data with received_at > 24h after gap_date → ET flags in the FCV confidence band

### 2.6 WhatsApp Integration (ET provides, IMS consumes)

**Endpoint:** `POST /api/whatsapp/notify` (already exists in ET)  
**Auth:** `X-Api-Key` (service-level key, IMS has one)  
**Direction:** IMS calls ET when it needs to notify a restaurant owner/manager

The IMS must NOT write to `whatsapp_outbox` directly or call `triggerWorkflow()` — those are ET-internal functions. The HTTP endpoint is the contract.

See the existing [WhatsApp External Integration docs](#67-integrating-external-applications-with-the-whatsapp-sidecar) in this document for the full protocol.

### 2.7 End-to-End Data Flow

```
IMS receives POS export from restaurant
  │
  ▼ IMS processes raw POS against inventory (deducts stock, resolves menu items)
  │
  ▼ ET calls GET /api/ims/pos-sales?tenant_id=X&location_id=Y&from=Z&to=W
  │   (polls on schedule — daily, or triggered by IMS notification)
  │
  ▼ POS data lands in ET's pos_transaction_staging table (informational path)
  │   → process_batch_v1() anomaly detection
  │   → quarantined rows are auto-released (no reject option)
  │   → WhatsApp text alert: "Anomaly detected in POS batch #batch_id"
  │
  ▼ ET calls GET /api/ims/recipes?tenant_id=X (cached locally for 24h)
  │
  ▼ ET resolves: qty_sold × recipe.grams_per_portion = theoretical grams consumed
  │
  ▼ ET writes :Sale + :ConsumptionEstimate to Neo4j via graph_sync_queue
  │
  ▼ Meanwhile: Receipt scanner ingests purchase invoices
  │   → AI vision or eKasa QR
  │   → lands in purchases table (COGS)
  │   → receipt_items created with source_type='purchase'
  │   → purchase_anomaly_queue entry created (quarantine)
  │   → WhatsApp poll: "Approve/Reject/Explain this purchase?"
  │   → User responds → decision recorded → reviewed at finalize
  │   → if no response within N hours → auto-release
  │
  ▼ FCV Report calculates:
      Revenue (POS) vs Theoretical COGS (POS × recipes) vs Actual Spend (purchases)
```

---

## 3. POS Data: Staging + Quarantine

### 3.1 `pos_batch_uploads`

```sql
CREATE TABLE public.pos_batch_uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id     UUID REFERENCES public.locations(id),
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
    location_id       UUID REFERENCES public.locations(id),
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
    location_id     UUID REFERENCES public.locations(id),
    gap_date        DATE NOT NULL,
    notified_at     TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    UNIQUE (tenant_id, location_id, gap_date)
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

### 3.6 POS Alerting (Informational Only)

When POS rows are quarantined, the system sends a **one-way WhatsApp text** — no poll, no decision required.

```typescript
// In processBatch completion handler:
async function notifyPOSQuarantine(batchId: string, quarantinedCount: number) {
  if (quarantinedCount === 0) return;

  const tenantId = await getTenantForBatch(batchId);
  const config = await getWorkflowConfig(tenantId);

  // Informational only — POS anomalies are IMS's domain
  await triggerWorkflow(supabase, {
    tenantId,
    workflowKey: 'pos_anomaly_alert',
    metadata: {
      batchId,
      quarantinedCount,
      message: `📊 POS data anomaly: ${quarantinedCount} item(s) flagged in the latest batch. These were auto-released — review in IMS if needed.`,
    },
  });
}
```

The `pos_anomaly_alert` workflow type is a `text` type (not `poll`). No human decision is required because ET cannot correct POS data — it must be corrected in IMS.

---

## 4. Purchase Data: Quarantine & Reconciliation

### 4.1 Two-Table Architecture

COGS and OPEX are split into separate tables:

| Table | Purpose | Receipt Required | Anomaly Check | Source |
|-------|---------|-----------------|---------------|--------|
| `purchases` | COGS (ingredients, inventory, supplies) | Yes (eKasa or AI scan) | Item-level 3σ + human review | Scanner |
| `transactions` (existing) | OPEX (rent, utilities, bank fees, services) | No | None | Manual entry, bank import |

`receipt_items` gains a polymorphic FK to support both:

```
receipt_items.source_type IN ('purchase', 'transaction')
receipt_items.source_id = purchases.id | transactions.id
```

### 4.2 Schema: `purchases`

```sql
CREATE TABLE public.purchases (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id       UUID NOT NULL REFERENCES public.locations(id),
    account_id        UUID NOT NULL REFERENCES public.chart_of_accounts(id),

    -- Vendor info
    vendor_id         UUID REFERENCES public.vendors(id),
    vendor_name       TEXT,
    invoice_number    TEXT,

    -- Financial
    total_amount      NUMERIC(12,2) NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'EUR',
    tax_amount        NUMERIC(12,2),
    tax_rate          NUMERIC(5,2),

    -- Receipt source
    receipt_type      TEXT NOT NULL DEFAULT 'scanned'
                      CHECK (receipt_type IN ('scanned', 'ekasa', 'manual', 'imported')),
    receipt_hash      TEXT,                  -- SHA-256 for dedup
    source_image_url  TEXT,                  -- original scan URL

    -- Temporal
    purchase_date     DATE NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Quarantine state
    quarantine_status TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (quarantine_status IN (
                        'PENDING',          -- waiting for human review
                        'APPROVED',         -- human approved
                        'REJECTED',         -- human rejected
                        'AUTO_RELEASED'     -- timer expired, auto-approved
                      )),
    reviewed_at       TIMESTAMPTZ,
    reviewed_by       UUID REFERENCES auth.users(id),
    rejection_reason  TEXT,
    rejection_note    TEXT,                  -- free-text "Explain" answer

    UNIQUE (tenant_id, receipt_hash)
);

CREATE INDEX idx_purchases_tenant ON public.purchases(tenant_id, purchase_date);
CREATE INDEX idx_purchases_location ON public.purchases(tenant_id, location_id);
CREATE INDEX idx_purchases_status ON public.purchases(tenant_id, quarantine_status);
```

`location_id` is NOT NULL — every purchase must be attributed to a location. `account_id` defaults to the COGS account (seeded during setup).

### 4.3 Schema: `purchase_anomaly_queue`

Each receipt scan creates one or more queue entries (one per receipt item with anomalous characteristics).

```sql
CREATE TABLE public.purchase_anomaly_queue (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id       UUID NOT NULL REFERENCES public.locations(id),

    -- Reference to purchase
    purchase_id       UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    receipt_item_id   UUID REFERENCES public.receipt_items(id),  -- NULL if total-level check

    -- Anomaly details
    check_type        TEXT NOT NULL
                      CHECK (check_type IN (
                        'price_spike',       -- unit price > 3σ from historical avg
                        'quantity_spike',    -- qty > 3σ from historical avg
                        'new_vendor',        -- first purchase from this vendor
                        'duplicate',         -- same receipt_hash already exists
                        'missing_receipt',   -- total amount > threshold with no image
                        'vendor_mismatch'    -- item usually from different vendor
                      )),
    severity          TEXT NOT NULL DEFAULT 'medium'
                      CHECK (severity IN ('low', 'medium', 'high')),
    anomaly_score      NUMERIC,             -- Z-score if applicable
    anomaly_detail     TEXT,                -- human-readable explanation

    -- State
    status            TEXT NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN', 'DISMISSED', 'ESCALATED')),
    outbox_id         UUID REFERENCES public.whatsapp_outbox(id),  -- poll sent

    notification_sent_at  TIMESTAMPTZ,
    response_received_at  TIMESTAMPTZ,
    response_decision     TEXT              -- 'approve' | 'reject' | 'explain'

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paq_status ON public.purchase_anomaly_queue(tenant_id, status);
CREATE INDEX idx_paq_purchase ON public.purchase_anomaly_queue(purchase_id);
```

### 4.4 Two-Path Quarantine Flow

```
Receipt scanned (eKasa QR or AI vision)
  │
  ▼ receipt_items created, purchases row inserted
  │
  ▼ Item-level anomaly detection runs:
  │   • Unit price vs 90d avg for (tenant, location, item_name)
  │   • Quantity vs 90d avg for (tenant, location, item_name)
  │   • New vendor check (vendor_id not seen in 180 days)
  │   • Duplicate detection (receipt_hash collision)
  │
  ├── No anomalies → purchase.approved = true (implicit)
  │     → receipt_items approved → graph_sync_queue → Neo4j
  │
  └── Anomaly found → purchase_anomaly_queue entry created (status=OPEN)
        → WhatsApp poll sent to owner/manager
        → User chooses: Approve | Reject | Explain
        |
        ├── Approve → purchase.quarantine_status = 'APPROVED'
        │              anomaly_queue.status = 'DISMISSED'
        │              → Neo4j sync proceeds
        │
        ├── Reject → purchase.quarantine_status = 'REJECTED'
        │            anomaly_queue.status = 'DISMISSED'
        │            → purchase NOT synced to Neo4j
        │            → receipt_items marked as excluded from FCV
        │
        └── Explain → Follow-up WhatsApp text: "Why does this look wrong?"
                       User replies with free text
                       → stored in rejection_note
                       → purchase.quarantine_status = 'REJECTED'
                       → system logs the reason for future ML training
        |
        └── No response within N hours → AUTO_RELEASED
              purchase.quarantine_status = 'AUTO_RELEASED'
              → Neo4j sync proceeds (but marked as auto-released)
```

**State machine for `purchases.quarantine_status`:**

```
INSERT → PENDING
         │
         ├── Anomaly detected → stays PENDING (poll sent)
         │     ├── User approves → APPROVED
         │     ├── User rejects  → REJECTED
         │     ├── User explains → REJECTED (with rejection_note)
         │     └── Timer expires → AUTO_RELEASED
         │
         └── No anomaly → APPROVED (implicitly)

APPROVED → synced to Neo4j as :Transaction nodes (existing flow)
REJECTED → excluded from Neo4j, excluded from FCV
AUTO_RELEASED → synced to Neo4j with note "auto-released"
```

### 4.5 Rejection-with-Reason

When a user taps "Explain" on a WhatsApp poll:

```
1. System sends: "Please briefly explain why this purchase looks wrong:"
   ↳ User replies with free text

2. Text is captured via WhatsApp webhook → insert_inbox.rs

3. decision-router.ts matches handler for 'explain_followup' decision type

4. Handler:
   a. Creates pending_text_followups row (tracks multi-turn context)
   b. Stores the user's explanation in purchases.rejection_note
   c. Sets purchases.quarantine_status = 'REJECTED'
   d. Logs: "User rejected purchase P-123: 'Duplicate invoice, already paid'"

5. The rejection_note is stored for future:
   - Training data for AI categorization improvements
   - Audit trail for accountants
   - Pattern detection ("user rejected 5/5 Monday morning Bidfood deliveries")
```

**`pending_text_followups` table:**

```sql
CREATE TABLE public.pending_text_followups (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    outbox_id         UUID NOT NULL REFERENCES public.whatsapp_outbox(id),
    entity_type       TEXT NOT NULL,        -- 'purchase_anomaly'
    entity_id         UUID NOT NULL,        -- purchase_anomaly_queue.id
    status            TEXT NOT NULL DEFAULT 'AWAITING_REPLY'
                      CHECK (status IN ('AWAITING_REPLY', 'COMPLETED', 'TIMEOUT')),
    prompt            TEXT NOT NULL,        -- "Why does this look wrong?"
    response          TEXT,                 -- user's free-text reply
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at      TIMESTAMPTZ,
    expires_at        TIMESTAMPTZ NOT NULL  -- 24h timeout
);
```

### 4.6 WhatsApp Decision Handlers

The existing `decision-router.ts` gets two new handlers:

#### `PurchaseAnomalyDecisionHandler`

```typescript
class PurchaseAnomalyDecisionHandler implements DecisionHandler {
  canHandle(payload: { type: string; outboxId: string }): boolean {
    return payload.type === 'purchase_anomaly_decision';
  }

  async process(params: {
    decision: string;      // 'approve' | 'reject' | 'explain'
    outboxId: string;
    recipientPhone: string;
  }): Promise<void> {
    // Phase 1: Lookup the anomaly queue entry
    const queueItem = await supabase
      .from('purchase_anomaly_queue')
      .select('*, purchases!inner(*)')
      .eq('outbox_id', params.outboxId)
      .single();

    if (!queueItem) throw new Error('Anomaly queue item not found');

    if (params.decision === 'approve') {
      await supabase.rpc('approve_purchase_v1', {
        p_purchase_id: queueItem.purchase_id,
        p_queue_id: queueItem.id,
      });
      // Send confirmation
      await sendText(queueItem.purchases.tenant_id, params.recipientPhone,
        `✅ Purchase #${queueItem.purchases.invoice_number || queueItem.purchase_id.slice(0, 8)} approved.`);
    }

    else if (params.decision === 'reject') {
      await supabase.rpc('reject_purchase_v1', {
        p_purchase_id: queueItem.purchase_id,
        p_queue_id: queueItem.id,
        p_rejection_note: null,
      });
      await sendText(queueItem.purchases.tenant_id, params.recipientPhone,
        `❌ Purchase #${queueItem.purchases.invoice_number || queueItem.purchase_id.slice(0, 8)} rejected.`);
    }

    else if (params.decision === 'explain') {
      // Create pending_text_followup — wait for free-text response
      await supabase.from('pending_text_followups').insert({
        tenant_id: queueItem.tenant_id,
        outbox_id: params.outboxId,
        entity_type: 'purchase_anomaly',
        entity_id: queueItem.id,
        status: 'AWAITING_REPLY',
        prompt: 'Why does this purchase look wrong?',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      await sendText(queueItem.purchases.tenant_id, params.recipientPhone,
        `✍️ Please briefly explain why this purchase looks wrong:`);
    }
  }
}
```

#### `ExplainFollowupHandler`

```typescript
class ExplainFollowupHandler implements DecisionHandler {
  canHandle(payload: { type: string; text?: string }): boolean {
    return payload.type === 'inbound_text' &&
           payload.text !== undefined;
  }

  async process(params: {
    text: string;
    recipientPhone: string;
  }): Promise<void> {
    // Find active pending followup for this phone
    const followup = await supabase
      .from('pending_text_followups')
      .select('*, purchase_anomaly_queue!inner(purchase_id)')
      .eq('status', 'AWAITING_REPLY')
      .eq('whatsapp_outbox.recipient_phone', params.recipientPhone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!followup) return; // Not a followup — pass through to other handlers

    // Complete the followup
    await supabase.from('pending_text_followups')
      .update({ status: 'COMPLETED', response: params.text, responded_at: new Date().toISOString() })
      .eq('id', followup.id);

    // Reject the purchase with the explanation
    await supabase.rpc('reject_purchase_v1', {
      p_purchase_id: followup.purchase_anomaly_queue.purchase_id,
      p_queue_id: followup.entity_id,
      p_rejection_note: params.text,
    });

    await sendText(followup.tenant_id, params.recipientPhone,
      `📝 Noted: "${params.text}". This purchase has been rejected.`);
  }
}
```

### 4.7 `release_expired_quarantines_v1`

Runs every 15 minutes via the GCP crontab on `openwa-gateway`. Releases quarantined purchases where the auto-release timer has expired.

```sql
CREATE OR REPLACE FUNCTION public.release_expired_quarantines_v1()
RETURNS TABLE(released_purchases INTEGER, released_queue INTEGER)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    v_auto_release_hours INTEGER;
    v_tenant_record RECORD;
    v_released_purchases INTEGER := 0;
    v_released_queue INTEGER := 0;
BEGIN
    FOR v_tenant_record IN
        SELECT id, config FROM public.tenants
    LOOP
        -- Read configurable timer from tenant config, default 6h, max 24h
        v_auto_release_hours := COALESCE(
            (v_tenant_record.config -> 'workflows' -> 'quarantine_alert' -> 'auto_release_hours')::INTEGER,
            6
        );
        v_auto_release_hours := LEAST(v_auto_release_hours, 24);

        -- Release expired purchase quarantines
        WITH expired_purchases AS (
            UPDATE public.purchases
            SET quarantine_status = 'AUTO_RELEASED',
                reviewed_at = NOW()
            WHERE tenant_id = v_tenant_record.id
              AND quarantine_status = 'PENDING'
              AND created_at < NOW() - (v_auto_release_hours || ' hours')::INTERVAL
            RETURNING id
        )
        SELECT COUNT(*) INTO v_released_purchases FROM expired_purchases;

        -- Dismiss corresponding anomaly queue entries
        WITH expired_queue AS (
            UPDATE public.purchase_anomaly_queue paq
            SET status = 'DISMISSED'
            FROM public.purchases p
            WHERE p.id = paq.purchase_id
              AND p.quarantine_status = 'AUTO_RELEASED'
              AND paq.status = 'OPEN'
            RETURNING paq.id
        )
        SELECT COUNT(*) INTO v_released_queue FROM expired_queue;

        -- Send notification for auto-released purchases
        IF v_released_purchases > 0 THEN
            -- Trigger text notification via WhatsApp workflow
            PERFORM public.enqueue_whatsapp_notification(
                p_tenant_id := v_tenant_record.id,
                p_workflow := 'quarantine_alert',
                p_message := format('%s purchase(s) were auto-approved after %s hours without review.',
                    v_released_purchases, v_auto_release_hours)
            );
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_released_purchases, v_released_queue;
END;
$$;
```

**Configurable timer:** Read from `tenants.config.workflows.quarantine_alert.auto_release_hours`:
- Default: 6 hours
- Minimum: 1 hour
- Maximum: 24 hours (hard-capped by `LEAST()`)
- Set by Login Service via `update_tenant_config_v1` RPC

**Cron route:** `GET /api/cron/release-quarantines`
- Node.js Serverless runtime (same as `process-outbox`)
- Authenticated via `x-cron-secret` header (not the spoofable `x-vercel-cron` header)
- Calls `release_expired_quarantines_v1()` RPC
- GCP crontab fires every 15 minutes:
  ```
  */15 * * * * curl -s -H "x-cron-secret: $CRON_SECRET" https://synculariti-et.vercel.app/api/cron/release-quarantines
  ```

### 4.8 Receipt Items: Polymorphic FK

The existing `receipt_items` table gains a polymorphic foreign key pattern. Instead of a single `transaction_id` FK, items now reference either a `purchase` or a `transaction`:

```sql
ALTER TABLE public.receipt_items
  ADD COLUMN source_type TEXT NOT NULL DEFAULT 'transaction'
    CHECK (source_type IN ('purchase', 'transaction')),
  ADD COLUMN source_id UUID NOT NULL;

-- Remove old single FK (migration: backfill first, then drop)
-- Old: transaction_id UUID REFERENCES transactions(id)
-- New: source_id + source_type

CREATE INDEX idx_receipt_items_source ON public.receipt_items(source_type, source_id);
```

**Justification:** Receipt items are conceptually the same thing (a line on a receipt) regardless of whether they're COGS or OPEX. Sharing the table enables unified analytics queries (`SELECT * FROM receipt_items WHERE source_type = 'purchase'`) and reuses the existing AI parsing pipeline, idempotency cache, and Neo4j ontology mapping.

---

## 5. Recipe Caching Layer

### 5.1 Local Cache Table

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

### 5.2 Refresh Logic

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

### 5.3 Consumption Resolution

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

## 6. POS → Consumption Math

### 6.1 New Neo4j Node Types

```
(:Sale {
    id,                    -- UUID
    tenant_id,
    location_id,
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
    location_id,
    sale_id,               -- FK to :Sale
    ingredient_id,         -- matches :Ingredient.id in our ontology
    ingredient_name,
    grams_consumed,        -- quantity_sold × grams_per_portion
    cost_at_latest_price,  -- grams_consumed × cost_per_gram
    transaction_time       -- denormalized from :Sale for direct filtering
})
```

**Why ConsumptionEstimate is separate from StockBatch:** We cannot prove which physical batch was consumed. So we model consumption as a *derived estimate*, not a *physical deduction*. The report compares estimates against purchase data — the gap is the signal.

**Why `transaction_time` is denormalized:** The Cypher report queries filter CEs by date range directly without joining through `:Sale`. This is a performance decision, not a normalization violation — the data is owned by the sale.

### 6.2 Neo4j Sync: Phase 4

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
      sale.location_id = s.locationId,
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
    saleId: s.id, tenantId: s.tenant_id, locationId: s.location_id,
    transactionTime: s.transaction_time,
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
      ce.location_id = e.locationId,
      ce.grams_consumed = e.gramsConsumed,
      ce.cost_at_latest_price = e.costAtLatestPrice,
      ce.transaction_time = e.transactionTime
    ON MATCH SET
      ce.grams_consumed = e.gramsConsumed,
      ce.cost_at_latest_price = e.costAtLatestPrice,
      ce.transaction_time = e.transactionTime
    MERGE (sale)-[:ESTIMATES]->(ce)
    MERGE (ce)-[:OF_INGREDIENT]->(ing)
  `, { estimates: sales.flatMap(s =>
    s.consumptions.map(c => ({
      id: c.id, saleId: s.id, tenantId: s.tenant_id, locationId: s.location_id,
      ingredientId: c.ingredient_id, transactionTime: s.transaction_time,
      gramsConsumed: c.grams_consumed,
      costAtLatestPrice: c.cost_at_latest_price,
    }))
  ) });
}
```

---

## 7. Food Cost Variance Report

### 7.1 Core Query

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

### 7.2 Report JSON Output

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

### 7.3 Recommendation Engine

The recommendation is generated by cross-referencing three signals:

```
signal_strength = |Δprice| × |Δvariance| × |Δvolume|

Only surface a finding if ALL three are elevated.
One flat signal kills the finding — no noise.
```

Example: "Chicken gap widened from 12% to 31% in May. Chicken sales volume is up 8% (expected). Chicken price is unchanged. The gap is driven by consumption exceeding recorded purchases — check portion sizes, Friday night prep waste, or informal usage."

---

## 8. Multi-Location Design

### 8.1 Location Hierarchy

Locations are owned by IMS. ET fetches them via the Locations API and stores them in its own `locations` table with a 5-minute TTL.

```
Tenant
  ├── Location: Bratislava Centrum (restaurant)
  │     ├── Tills: TILL-01, TILL-02
  │     ├── Purchases (COGS for this location)
  │     └── POS Data (sales for this location)
  │
  ├── Location: Košice Staré Mesto (restaurant)
  │     ├── Tills: TILL-03, TILL-04
  │     ├── Purchases
  │     └── POS Data
  │
  └── Location: Centrálny Sklad (warehouse)
        ├── Purchases (bulk orders allocated to locations)
        └── No POS data (warehouse doesn't sell)
```

### 8.2 Enforcement Rules

1. **`location_id` is NOT NULL** on `purchases`, `pos_transaction_staging`, `pos_batch_uploads`, `pos_data_gaps`, `purchase_anomaly_queue`, `pending_text_followups`.

2. **`location_id` is nullable** on `transactions` (OPEX can be business-wide like rent) and existing `receipt_items` (legacy data). New items must be linked through their parent.

3. **Dashboard filter**: All FCV queries include `WHERE location_id = :selectedLocationId`. The global view aggregates across all locations with a toggle.

4. **Selector persists**: `useNavigation` hook stores selected `location_id` in URL params (e.g., `?location=abc-123`). Defaults to first active location.

5. **Write-time validation**: When scanning a receipt, the user must select the location before the camera opens. The location is embedded in the metadata sent to the scanner pipeline.

### 8.3 Location Selector UI

- Top nav bar: dropdown with location names + "All Locations" option
- "All Locations" shows aggregate FCV data across all locations
- Individual location view shows per-location FCV
- Selection persists in `URLSearchParams` via `useNavigation` hook
- Uses existing `<LocationSelector>` component pattern (stateless view shell)

---

## 9. Dashboard Plan

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
| Top Items (ItemAnalytics) | Repurpose to show ingredient-level gap, not raw purchase counts. "Chicken: €2,300 gap (31% variance)" is actionable. "Chicken: bought 12 times" is trivia. Fix tenant isolation bug (missing `tenant_id` filter). |

### Add:

| Card | Description |
|------|-------------|
| **Food Cost Variance Card** | The Gap number (big, colored red/amber/green), coverage indicator, top 3 ingredients by gap |
| **Variance Spike Mini-Calendar** | Monthly calendar view with red dots on high-variance days. Click a date to see the breakdown. |
| **Data Completeness Bar** | "POS data: 22/30 days (73%). The gap estimate has ±15% uncertainty." — sets expectations |
| **Quarantine Queue Card** | "3 purchases pending review — tap to approve/reject" (appears only when unresolved quarantines exist) |

### Layout Order (top to bottom):

```
Row 1: Revenue / Theoretical COGS / Actual Spend  (3 big number cards)
Row 2: Food Cost Variance (the Gap) + Data Completeness
Row 3: Top Ingredients by Gap + Variance Spike Calendar
Row 4: Cash Flow Trend + Operating Margin
Row 5: Category Breakdown + Transaction List
Row 6: Quarantine Queue Card (conditional)
```

---

## 10. Getting Smarter Over Time

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

Observed patterns (weekend variance, holiday dip, vendor price shifts, rejection patterns) are stored with a confidence score. Each confirmed repetition adds confidence. Each missed cycle halves it. After 3 misses, the pattern is archived.

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

### Loop 4: Rejection Learning (NEW)

When users reject purchases with explanations, the system learns from each interaction:

```typescript
interface RejectionPattern {
  vendorId: string;
  itemName: string;
  rejectionReason: string;
  frequency: number;               // how many times this vendor+item was rejected
  userRationale: string[];         // collected "Explain" responses
  nextRecommendation: string;      // "Auto-reject Bidfood chicken on Mondays?"
}
```

After 5+ rejections of the same (vendor, item_name) pair, the anomaly detection adjusts:
- Lower the anomaly threshold for that specific pair (they're always wrong)
- Surface a recommendation to the tenant admin: "Would you like to auto-reject Bidfood chicken deliveries? You've rejected 7 of the last 10."

### Loop 5: Confidence Calibration Against Reality (future)

When the report says "gap is €7,000 ±€1,000" and the owner investigates and finds €6,500 of actual waste, we record the delta. After 10 such calibrations, we adjust the uncertainty model. This requires user action (they need to tell us what they found), so it's the slowest loop.

### The Honest Ceiling

Even with perfect data, expect 85-90% explainability. The remaining 10-15% is:
- Owner grabbing a coke without recording it (inventory shrinks, no POS, no PO)
- Chef substituting chicken for veal when the delivery was short
- Staff meals, spills, over-portioning
- The line cook pulling 3kg from the Thursday delivery for Friday prep that was logged as Thursday usage

These are not bugs. They are features of restaurants. The system's job is not to eliminate them — it's to **quantify the unknown** so the operator decides which unknowns to care about.

---

## 11. AI-Executable Build Prompt

The following prompt is designed to be given to an AI coding assistant (Claude, GPT, etc.) to build this pipeline against the existing Synculariti-ET codebase.

**Critical context:** The IMS and ET are separate applications with separate databases. They communicate via HTTP APIs with `X-Api-Key` auth. The ET does NOT have direct database access to IMS data — it calls `GET /api/ims/recipes`, `GET /api/ims/pos-sales`, `GET /api/ims/locations`, `GET /api/ims/inventory-snapshots`, and `GET /api/ims/data-gaps`. The IMS does NOT have access to ET's `whatsapp_outbox`, `graph_sync_queue`, or Neo4j — it calls `POST /api/whatsapp/notify`.

Within the ET codebase itself: all staging tables, caching tables, Neo4j sync, and WhatsApp infrastructure are internal. The cross-app boundary is only crossed via HTTP.

---

Copy and paste the block below as a single prompt:

<pre>
```
You are a senior full-stack engineer implementing the Batch Ingestion & Food Cost Variance Pipeline for Synculariti-ET.

NOTE: This project uses a two-table architecture. `purchases` (COGS) and `transactions` (OPEX) are separate tables.
NOTE: There are TWO quarantine paths: POS data (auto-release only, informational) and Purchase data (interactive poll with Approve/Reject/Explain).
NOTE: `location_id` is required on all new tables. Multi-location is non-negotiable.
NOTE: The auto-release timer for purchase quarantines is configurable via `tenants.config.workflows.quarantine_alert.auto_release_hours` (default 6h, max 24h).
NOTE: `receipt_items` uses a polymorphic FK (`source_type` + `source_id`) to support both purchases and transactions.

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
- docs/architecture/login-service-contract.md (Login Service boundary contract)
- sql/b2b_evolution/01_locations.sql (existing locations table)

IMPORTANT CONTEXT: The IMS and ET are separate applications with separate databases. They communicate via HTTP APIs with X-Api-Key auth. The ET does NOT have direct database access to IMS data.

- ET fetches POS data via `GET /api/ims/pos-sales?tenant_id=X&location_id=Y&from=Z&to=W` (pagination supported)
- ET fetches recipes via `GET /api/ims/recipes?tenant_id=X` (cached locally for 24h)
- ET fetches locations via `GET /api/ims/locations?tenant_id=X` (cached 5 min)
- IMS sends WhatsApp via `POST /api/whatsapp/notify` (existing endpoint)
- All staging, caching, and Neo4j infrastructure is ET-internal (this codebase)

For @demo-2026 development: mock the IMS API responses with hardcoded JSON. The actual IMS API endpoints don't exist yet — build the ET side ready to receive them.

The target is @demo-2026 tenant which has seeded transaction + receipt_items data going back to November.

IMPLEMENT THE FOLLOWING IN ORDER:

=== PHASE 0: SCHEMA MIGRATIONS (Two-Table Architecture + Quarantine) ===

Create `/supabase/migrations/20260529001_two_table_quarantine.sql` with:
- purchases table (COGS — see Section 4.2 for schema)
- location_id column on purchases (NOT NULL)
- purchase_anomaly_queue table (see Section 4.3)
- pending_text_followups table (see Section 4.5)
- receipt_items.source_type + source_id polymorphic FK migration (see Section 4.8)
  - Add columns, backfill existing receipt_items with source_type='transaction' and source_id=transaction_id
- release_expired_quarantines_v1() function (see Section 4.7)
- chart_of_accounts seed data (standard COGS account, standard OPEX accounts)
- account_id column on purchases (NOT NULL, FK to chart_of_accounts)
- Grant permissions, enable RLS, CREATE INDEX statements

=== PHASE 1: POS BATCH STAGING (unchanged from v1) ===

Create `/supabase/migrations/20260528001_pos_batch_staging.sql` with:
- pos_batch_uploads table (with location_id)
- pos_transaction_staging table with JSONB raw_payload (with location_id)
- process_batch_v1() PL/pgSQL function (90-day rolling baseline, per-tenant per-item_sku, σ=3 threshold)
- v_quarantine_audit view
- pos_data_gaps table (with location_id)
- Grant permissions and enable RLS

=== PHASE 2: RECIPE CACHE (ET's local replica of IMS data) ===

Create `/supabase/migrations/20260528002_recipe_cache.sql` with:
- cached_recipes table (ET-local — populated from IMS API, 24h TTL)
- cached_ingredients table (ET-local — populated from IMS API, 24h TTL)
- Grant permissions, create indexes

Create `/v2/src/lib/ims-client.ts` with:
- fetchRecipes(tenantId) — calls GET /api/ims/recipes, upserts into cached_recipes + cached_ingredients, 24h TTL, 72h stale grace
- fetchPOSSales(tenantId, locationId, from, to) — calls GET /api/ims/pos-sales with pagination, returns receipts array
- fetchLocations(tenantId) — calls GET /api/ims/locations, upserts into locations table, 5min TTL
- fetchInventorySnapshots(tenantId, locationId, from, to) — calls GET /api/ims/inventory-snapshots
- fetchDataGaps(tenantId, locationId) — calls GET /api/ims/data-gaps
- Mock implementations for @demo-2026 testing (hardcoded JSON with 3 locations)
- resolveConsumption(posItem, recipes) — returns { consumptions, status }

=== PHASE 3: POS BATCH INGESTION WORKER ===

Create `/v2/src/lib/pos-batch-worker.ts` with:
- pollNewSales(tenantId, locationId) — calls fetchPOSSalesFromIMS for the last N days, writes each receipt to pos_transaction_staging with raw JSONB payload
- processBatch(batchId) — calls process_batch_v1 RPC, then resolves recipes for APPROVED rows via fetchRecipesFromIMS, then enqueues to graph_sync_queue as 'sale' entity_type
- detectDataGaps(tenantId, locationId) — checks which calendar dates have no data in pos_batch_uploads for the last 14 days, upserts to pos_data_gaps, reconciles with IMS data-gaps API, triggers WhatsApp alert (informational text only — no poll)

=== PHASE 4: PURCHASE QUARANTINE WORKFLOW ===

Create `/v2/src/modules/finance/lib/usePurchaseScan.ts` (or extend existing hooks):
- After receipt scanner creates a purchase + receipt_items, run item-level anomaly detection:
  - Unit price vs 90d avg for (tenant, location, item_name)
  - Quantity vs 90d avg
  - New vendor check
  - Duplicate detection
- If anomaly found: insert into purchase_anomaly_queue, trigger WhatsApp poll via triggerWorkflow()
- If no anomaly: set purchases.quarantine_status = 'APPROVED' (implicit)

Add to `/v2/src/modules/whatsapp/lib/decision-router.ts`:
- PurchaseAnomalyDecisionHandler (handles 'purchase_anomaly_decision' type — Approve/Reject/Explain)
- ExplainFollowupHandler (handles 'inbound_text' for pending_text_followups)

Add to `/v2/src/modules/whatsapp/lib/triggerWorkflow.ts`:
- Support 'quarantine_alert' workflow type (text notification when auto-release fires)
- Support 'pos_anomaly_alert' workflow type (text notification for POS quarantines)

=== PHASE 5: NEO4J + FCV ===

In `/v2/src/lib/neo4j.ts`:
- Add syncSalesWithConsumption() function that creates :Sale and :ConsumptionEstimate nodes
- Add a Phase 4 to neo4jBulkMerge (or create a separate function called from the sync route)
- Include location_id on :Sale and :ConsumptionEstimate nodes

Update `/v2/src/app/api/debug/sync-neo4j/route.ts` to also process 'sale' entity types from graph_sync_queue.

Create `/v2/src/lib/food-cost-variance.ts` with:
- generateReport(tenantId, locationId?, startDate, endDate) — runs the Cypher queries from Section 7 of the arch doc
- Returns FoodCostVarianceReport interface (full JSON shape)
- Confidence bands based on data coverage
- Cross-reference recommendation engine
- Physical accuracy score from inventory snapshots
- Unit tests

Create `/v2/src/app/api/analytics/food-cost-variance/route.ts` with:
- GET handler, authenticated via withAuth
- Optional location_id query param
- Returns the report JSON
- Cached server-side for 1 hour

=== PHASE 6: CRON + RELEASE ===

Create `/v2/src/app/api/cron/release-quarantines/route.ts`:
- Node.js Serverless runtime (same as process-outbox)
- Authenticated via x-cron-secret header matching CRON_SECRET env var
- Calls release_expired_quarantines_v1() RPC
- Returns { released: number }

=== PHASE 7: DASHBOARD COMPONENTS ===

Create or update:
- `/v2/src/modules/finance/components/FoodCostVarianceCard.tsx` — shows the Gap number, top 3 ingredients, coverage indicator
- `/v2/src/modules/finance/components/VarianceCalendar.tsx` — monthly calendar with red dots on spike dates
- `/v2/src/modules/finance/components/QuarantineQueueCard.tsx` — "X purchases pending review" with approve/reject buttons (appears conditionally)
- Update `/v2/src/modules/finance/components/AIInsights.tsx` — change insight generation to use Food Cost Variance as primary source, trivia as fallback only
- Update `/v2/src/modules/finance/components/ItemAnalytics.tsx` — fix tenant isolation bug (add tenant_id filter); repurpose to show ingredient-level gap
- Update `/v2/src/app/page.tsx` — add Food Cost Variance card, variance calendar, quarantine queue card; remove TeamAllocation card; remove CommandCenter pills; add location selector via useNavigation hook
- Update `/v2/src/modules/finance/hooks/useNavigation.ts` — add location_id to URL params management

=== TESTING ===

Run the existing test suite to confirm nothing is broken:
- npm test (backend project)
- Check that the @demo-2026 tenant's Neo4j graph still merges correctly

New tests to write:
- purchase-quarantine.test.ts — mock scan with anomalies, verify queue + poll creation
- decision-router.test.ts — mock Approve/Reject/Explain, verify state transitions
- pos-batch-worker.test.ts — mock IMS payload, verify staging + quarantine
- food-cost-variance.test.ts — mock Neo4j, verify report shape
- recipe-cache.test.ts — mock HTTP, verify 24h TTL, stale fallback
- release-quarantines.test.ts — mock tenant config, verify auto-release timing

=== WHAT SUCCESS LOOKS LIKE ===

1. fetchPOSSalesFromIMS() mock returns sample receipts → they appear in pos_transaction_staging with location_id
2. Running processBatch() approves normal rows, quarantines rows with quantity=500 when baseline mean=5
3. APPROVED rows have recipe_found=true and theoretical_grams populated from recipe cache
4. Receipt scanner creates purchase + receipt_items with source_type='purchase' and location_id
5. Anomalous purchase items create purchase_anomaly_queue entries and trigger WhatsApp poll
6. WhatsApp Approve → purchase.quarantine_status = 'APPROVED' → synced to Neo4j
7. WhatsApp Reject → purchase.quarantine_status = 'REJECTED' → excluded from Neo4j
8. WhatsApp Explain → pending_text_followups created → user reply captured → purchase rejected with note
9. release_expired_quarantines_v1() auto-releases purchases after N hours (read from tenant config)
10. Neo4j has :Sale, :ConsumptionEstimate nodes linked via [:ESTIMATES]
11. generateFoodCostVarianceReport() returns report with Revenue, Theoretical COGS, Actual Spend, ingredient gaps, variance spike dates
12. Dashboard shows the Gap number as primary insight, location selector works, quarantine queue appears when pending items exist
13. detectDataGaps() correctly flags missing days and reconciles with IMS data-gaps API

Do not add any comments to the code. Follow existing code style and conventions (Zod for validation, ServerLogger for audit, getErrorMessage for errors, zero `: any` usages). Match the existing test patterns (jest.mock for supabase, mockReset after clearAllMocks).
```
</pre>

---

## 12. Implementation Plan

> **Status:** Design v2 approved. Awaiting schema migration before execution begins.

### Intent

Build the complete pipeline: two-table architecture (purchases + transactions), two-path quarantine (POS auto-release + Purchase interactive poll), location enforcement, rejection-with-reason, configurable auto-release timer, and FCV report. Since the IMS does not exist yet, the entire pipeline runs against **mocked IMS responses (Wizard of Oz)** — real ET infrastructure, real Supabase tables, real Neo4j nodes, real report output. Flip `IMS_MOCK_MODE=false` when the IMS is live.

### Execution Order (16 steps)

| # | Phase | File(s) | Action |
|---|-------|---------|--------|
| 0 | Schema | `20260529001_two_table_quarantine.sql` | Purchases table, purchase_anomaly_queue, pending_text_followups, receipt_items polymorphic FK, chart_of_accounts seed, release_expired_quarantines_v1(), indexes, RLS |
| 1 | Schema | `20260528001_pos_batch_staging.sql` | pos_batch_uploads, pos_transaction_staging (with location_id), process_batch_v1(), v_quarantine_audit, pos_data_gaps |
| 2 | Schema | `20260528002_recipe_cache.sql` | cached_recipes, cached_ingredients, grants |
| 3 | IMS | `v2/src/lib/ims-client.ts` | All 5 IMS API methods + mocks (3 locations, 8 menu items, 90 days POS data) |
| 4 | POS | `v2/src/lib/pos-batch-worker.ts` | pollNewSales, processBatch, detectDataGaps |
| 5 | Purchase | `v2/src/modules/finance/lib/usePurchaseScan.ts` | Anomaly detection + quarantine queue insertion |
| 6 | WhatsApp | `v2/src/modules/whatsapp/lib/decision-router.ts` | PurchaseAnomalyDecisionHandler + ExplainFollowupHandler |
| 7 | WhatsApp | `v2/src/modules/whatsapp/lib/triggerWorkflow.ts` | quarantine_alert + pos_anomaly_alert workflow types |
| 8 | Neo4j | `v2/src/lib/neo4j.ts` | Phase 4 syncSalesWithConsumption + location_id on nodes |
| 9 | Neo4j | `v2/src/app/api/debug/sync-neo4j/route.ts` | Handle 'sale' entity_type |
| 10 | FCV | `v2/src/lib/food-cost-variance.ts` | Report engine + recommendation + confidence bands |
| 11 | FCV | `v2/src/app/api/analytics/food-cost-variance/route.ts` | GET endpoint with optional location_id |
| 12 | Cron | `v2/src/app/api/cron/release-quarantines/route.ts` | Release expired quarantines (15-min GCP crontab) |
| 13 | UI | `FoodCostVarianceCard.tsx`, `VarianceCalendar.tsx`, `QuarantineQueueCard.tsx` | Create new dashboard components |
| 14 | UI | `AIInsights.tsx`, `ItemAnalytics.tsx`, `page.tsx`, `useNavigation.ts` | Repurpose + remove + fix |
| 15 | Test | 6 new test files | Purchase quarantine, decision router, POS batch, FCV, recipe cache, release quarantines |
| 16 | Seed | `seed_demo_2026.ts` rewrite | 3 locations, purchases + OPEX + POS mock data, Neo4j sync |

### Wizard of Oz Strategy

```
# .env.local
IMS_MOCK_MODE=true
IMS_BASE_URL=https://ims.synculariti.com
IMS_API_KEY=mock-key-placeholder
```

`ims-client.ts` checks `IMS_MOCK_MODE`. When `true` → returns hardcoded JSON. When `false` → makes real HTTP calls. **Zero code changes to go live.**

### Security Catalog Verification

After all migrations are applied, run the live security test suite:

```
npx jest --testPathPattern=db-security
```

This verifies:
- All new RPCs have `search_path=public` in `proconfig`
- No anonymous `EXECUTE` grants on new functions
- `purchases`, `purchase_anomaly_queue`, `pending_text_followups` have RLS enabled
- Legacy functions have no insecure overloads

---

### Key Architectural Decisions

**No shared DB.** `ims-client.ts` is the only file that crosses the IMS boundary (via HTTP). All staging, caching, Neo4j sync, and reporting is ET-internal.

**Two tables, not one.** `purchases` (COGS) and `transactions` (OPEX) are separate because they have different validation needs, different quarantine workflows, and different roles in the FCV report. Mixing them would dilute the COGS signal.

**Two quarantine paths, not one.** POS data is informational-only (correct in IMS). Purchase data is interactive (poll with Approve/Reject/Explain). They share the same WhatsApp infrastructure but have different decision handlers.

**`ConsumptionEstimate.transaction_time` is denormalized.** The Cypher report queries filter CEs by date range directly without joining through `:Sale`. This is a performance decision, not a normalisation violation — the data is owned by the sale.

**`location_id` is enforced at write time.** It's NOT NULL on all new tables. The selector persists in URL params. Dashboard queries filter by it. Legacy tables (`transactions`, existing `receipt_items`) remain nullable but new writes must provide it.

**`process_batch_v1` cold start = auto-approve.** The first 4 batches per (tenant, item_sku) have no baseline so all rows are approved. Anomaly detection activates after 5+ historical data points exist.

**Auto-release timeout is tenant-configurable.** Read from `tenants.config.workflows.quarantine_alert.auto_release_hours`. Default 6h, max 24h. The `release_expired_quarantines_v1()` RPC reads this per tenant in a loop.

**Rejection-with-reason is a two-step WhatsApp flow.** "Explain" → follow-up text → user reply stored → purchase rejected with note. The `pending_text_followups` table tracks multi-turn context.

**Dashboard layout order (top → bottom after changes):**
```
Row 1: MonthlyPerformance (8) + CommandCenter (4)
Row 2: FoodCostVarianceCard (8) + VarianceCalendar (4)
Row 3: OperatingMargin (4) + BudgetHealth (4) + AIInsights (reformatted, 4)
Row 4: Total Spent card (4) + MarketTrends (8)
Row 5: All Transactions (8, rowSpan 2) + Category Breakdown (4)
Row 6: Top Items / ItemAnalytics (12)
Row 7: QuarantineQueueCard (12, conditional — only when pending > 0)
```

---

### Success Criteria

- [ ] `pos_transaction_staging` has APPROVED rows with `theoretical_grams` populated
- [ ] `purchases` table has rows with `quarantine_status` correctly set (PENDING / APPROVED / REJECTED / AUTO_RELEASED)
- [ ] `purchase_anomaly_queue` entries trigger WhatsApp polls with 3 options (Approve/Reject/Explain)
- [ ] WhatsApp "Explain" → follow-up text → user reply → purchase rejected with `rejection_note` populated
- [ ] `release_expired_quarantines_v1()` reads `tenants.config.workflows.quarantine_alert.auto_release_hours` and releases expired quarantines
- [ ] Neo4j has `:Sale`→`[:ESTIMATES]`→`:ConsumptionEstimate`→`[:OF_INGREDIENT]`→`:Ingredient` with `location_id` on all nodes
- [ ] `/api/analytics/food-cost-variance` returns non-zero headline: revenue, theoretical COGS, actual spend
- [ ] Dashboard gap card shows a colored €X,XXX number as the primary metric
- [ ] Location selector works, filters all queries correctly
- [ ] `AIInsights` card text starts with a specific food cost number, not timing trivia
- [ ] `ItemAnalytics` has `tenant_id` filter (security bug fixed)
- [ ] `TeamAllocation` removed from dashboard
- [ ] `QuarantineQueueCard` appears only when pending quarantines exist
- [ ] `npm test` passes; `npm run build` clean; no new `: any` usages

---

*End of architecture document. This is a live design — update as decisions change.*
