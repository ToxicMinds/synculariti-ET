# Synculariti-ET (B2B SaaS Primitive)

This document is the definitive guide for AI assistants and developers. It consolidates the **current architecture**, design principles, and operational standards for the Synculariti-ET platform.

---

## 1. Project Overview
**Synculariti-ET** is an enterprise-grade financial management platform for multi-location SMBs.
*   **Mission**: Business-Grade Determinism.
*   **Core Stack**: Next.js 16.2 (App Router), TypeScript 5, Supabase (Postgres 17), Neo4j 6 (Graph), Groq AI (Llama 3.3 70B).
*   **Architecture**: "Shared-Nothing" Multi-Tenant Isolation.

### 1.1 Two-Application Architecture

Synculariti consists of two separate applications. They do NOT share a database. They communicate exclusively through HTTP APIs with `X-Api-Key` authentication (see `api_keys` table).

| Application | Owns | Does NOT share |
|-------------|------|----------------|
| **IMS** (Inventory Management System) | Inventory items, stock ledger, purchase orders, POS data processing, recipe engine, UoM conversions | Its database, its schema, its data — ET reads via IMS API |
| **ET** (Expense Tracker — this codebase) | Expense tracking, receipt scanning, WhatsApp service, Neo4j graph, AI insights, Food Cost Variance reporting | Its database, its schema, Neo4j instance — IMS calls via ET API |

**Data flows across the boundary:**

| What | Direction | How |
|------|-----------|-----|
| POS processed sales | IMS → ET | ET calls `GET /api/ims/pos-sales?tenant_id=X&from=Y&to=Z` |
| Recipe data | IMS → ET | ET calls `GET /api/ims/recipes?tenant_id=X` |
| WhatsApp notifications | IMS → ET | IMS calls `POST /api/whatsapp/notify` (existing endpoint) |
| Workflow config | Tenant → ET (write) → IMS (read) | Login Service writes via `update_tenant_config_v1`, both read from their own instances |
| Target customers | Shared | Same customers across both apps — data correlates via shared `tenant_id` UUIDs |

**Each app has its own:**
- Supabase project (separate Postgres, separate auth)
- Neo4j instance (ET only — IMS doesn't use Neo4j)
- Deployment pipeline
- API keys table for cross-app auth
- `api_keys` table with service-level keys (`tenant_id IS NULL`) for IMS↔ET communication

---

## 2. Core Modules (The Baseline)

### 2.1 Identity & Access
- **Tenant Isolation**: Secure multi-tenant discovery via `tenant_members`.
- **Identity Gate**: All business logic is wrapped in an `IdentityGate` that requires a resolved `tenant_id`.

### 2.2 Logistics (IMS)
- **Append-only Ledger**: Physical stock is a calculated sum of the `inventory_ledger`.
- **Atomic Procurement**: `receive_purchase_order_v1` is the canonical entry point for inventory receipts.

### 2.3 Finance (Ledger Bridge)
- **Deterministic Tracking**: Fiscal receipt scanning via Slovak eKasa QR protocol.
- **Outbox Pattern**: Cross-domain signals flow through `graph_sync_queue` for eventual consistency with the Neo4j graph.

### 2.4 PWA Mobility
- **Offline-First**: `OfflineQueue` handles mutation resilience with cross-tab locking (`navigator.locks`).

---

## 3. Principles Scorecard (Current State)

| Principle | Status | Standard |
| :--- | :--- | :--- |
| **ACID** | 🟢 **Hardened** | All ledger mutations (Finance/Logistics) use atomic Postgres RPCs. |
| **Security** | 🟢 **Hardened** | Phase 1: enqueue_graph_sync_internal hardened (SECURITY DEFINER + search_path), anon privilege lockdown on 6 tables, ALTER DEFAULT PRIVILEGES fixed, health endpoint simplified to static liveness, CRON_SECRET uses timingSafeEqual. Verified via 10 new automated tests (db-security-privileges, health, cron). Phase 4: resolve_purchase_quarantine_v1 hardened (SECURITY DEFINER + search_path, REVOKE FROM anon/public), cron/release-quarantines uses timingSafeEqual. |
| **DRY** | 🟢 **Hardened** | AI prompts, Neo4j utilities, Auth components, `safeAmount()`, `createServiceClient()`, `createOpenWAClient()`, and error handling unified in `@/lib`. Strategy maps replace if-else chains (financeAudit, triggerWorkflow). Hardcoded strings centralized in `@/lib/constants.ts` (41 occurrences across 14 files replaced). |
| **Type Safety** | 🟢 **Hardened** | **0** `: any` usages. Full interface coverage for external data (eKasa, Groq, Web Locks). All catch blocks typed `unknown` with `getErrorMessage()`. 100% route test coverage (21/21 routes). |
| **SOLID** | 🟢 **Hardened** | Domain logic isolated in `modules/`. Business logic decoupled from UI via headless hooks. SRP extractions: scanner-client split into 3 (V-88), insight-queries types extracted (V-89), dispatchDecision split into 2 (V-90), webhook/route split into 4 utilities (V-54). OCP: decision-router accepts new handlers via registry (V-87). DIP: services injected via constructor pattern (V-85). Factory pattern for Supabase clients enforced across all server actions. Phase 4: computeFCVReport split into computeAggregates/computePerIngredient/computeTemporalAnalysis (V-8). |

---

## 4. Architecture Standards (The Rules)

### 4.1 Modular "Shared-Nothing" Isolation
- Every business domain MUST live in its own `modules/` subdirectory.
- Hooks, components, and domain-specific types must stay inside the module.

### 4.2 Security & API Governance
- **No Direct DML**: DB explicitly denies `INSERT/UPDATE/DELETE` to `authenticated` clients. Use canonical RPCs (e.g., `save_receipt_v4`).
- **Data Integrity Contracts**: All ledger mutations MUST maintain strict compliance with schema contracts, including propagating `updated_at` timestamps to prevent `42703 undefined_column` crashes.
- **Session-Based tenant_id**: `tenant_id` is resolved server-side from session via RLS — never passed as a param.
- **search_path Safety**: All `SECURITY DEFINER` DB functions must include `SET search_path TO 'public'` (not `'pg_catalog', 'public'` — exception only for functions that query pg_catalog directly).
- **Auth Guard**: All sensitive API routes MUST be wrapped with `withAuth` middleware and use the `SecureContext` pattern for type-safe App Router compliance.
- **Input Validation**: All API routes MUST use Zod schemas from the unified validation registry for request sanitization.
- **Route Auth Pattern**: All internal API routes MUST use `withTestHandler(handler)` from `@/lib/withTestHandler` instead of the inline `process.env.NODE_ENV === 'test' ? handler : withAuth(handler)` pattern.
- **Normalizing Washer**: Use the 'Washer' pattern (Zod transforms + defaults) for all routes handling external or nullable metadata to guarantee type safety without rejecting valid but incomplete data.
- **Factory Pattern for Service Clients**: Use `createServiceClient()` from `@/lib/supabase-server` for all `service_role` Supabase clients. Uses `@supabase/supabase-js` `createClient` with `autoRefreshToken: false, persistSession: false`. Never instantiate `new createClient(URL, SERVICE_KEY)` inline.
- **Timing-Safe Secret Comparison**: All secret/API-key comparisons in API routes MUST use constant-time comparison (`timingSafeEqual` — custom function or `crypto.timingSafeEqual`) to prevent timing side-channel attacks. Never use `!==` or `===` for secrets.
- **Health Endpoint**: Health/liveness checks MUST be static `{ status: 'ok' }` with no database sessions, Neo4j queries, or infrastructure details. Health endpoints must not create connections or leak configuration.

### 4.3 Intelligence Strategy
We use a deterministic AI pipeline for financial categorization:
1. **Stage 1 (Vision)**: LLM-based spatial transcription.
2. **Stage 2 (Reasoning)**: Llama 3.3 70B mapping to injected Tenant category contexts.
- **Hardware/Intelligence Decoupling (SRP)**: Complex components (like Receipt Scanners) MUST separate hardware logic (camera, compression — see `scanner-vision.ts`) from intelligence parsing (delegated to `scanner-client.ts`).
- **Factory Pattern for External Dependencies**: Use `createServiceClient()` for Supabase service clients and `createOpenWAClient()` for OpenWA gateway clients. Never instantiate `new OpenWAClient()` or `createClient(URL, KEY)` inline — these factories centralize config and enable test injection.
- **Idempotency Shield**: All intelligence parsing MUST be gated by an idempotency hash (e.g., SHA-256 of the image blob) to prevent redundant AI API calls and ensure graceful degradation timeouts.

### 4.4 Unified Scanner Pipeline
Receipt/invoice scanning uses a **single `process(input)` entry point** with internal routing:

1. **Input routing**: String → eKasa QR pathway (`/api/ekasa` + enrichment via `parse-receipt`). File → AI Vision pathway (`/api/ai/preprocess-image` + `/api/ai/parse-invoice`).
2. **Idempotency**: `processScannerInput()` computes SHA-256 of the input and caches the result in a `Map<string, ScannerResult>` (`resultCache`). Duplicate scans return immediately without network calls.
3. **Timeout**: All `fetch()` calls use `AbortController` with a 15s default timeout. Aborted requests return an error suggesting manual entry.
4. **Offline resilience**: When `navigator.onLine === false`, the input is queued to `OfflineQueue.enqueue('SAVE_RECEIPT', ...)` and returns status `QUEUED`.
5. **Image preprocessing**: Before sending to `/api/ai/parse-invoice`, the image is resized to max 2000px and transcoded to WebP quality 80 via `GET /api/ai/preprocess-image` using `sharp`. If preprocessing fails, the original image is used (graceful degradation).
6. **eKasa enrichment**: After fetching raw Gov data from `/api/ekasa`, the scanner calls `/api/ai/parse-receipt` to add AI-assigned categories. If enrichment fails, raw Gov data is returned (graceful degradation).
7. **Confidence scoring**: AI-extracted items carry a `confidence` field (`'high' | 'medium' | 'low'`) from the LLM response. Items with name < 3 characters or amount === 0 are auto-downgraded to `'low'`. eKasa Gov items are always `'high'`.
8. **UI badges**: Low/medium confidence items display a colored badge (`status-danger` / `status-warning`) in the review step. Verified eKasa receipts show a `Verified eKasa` green badge.

**Key files**: `src/lib/scanner-client.ts` (orchestrator), `src/lib/scanner-cache.ts` (idempotency cache), `src/lib/scanner-ekasa.ts` (eKasa QR pipeline), `src/lib/scanner-vision.ts` (AI vision pipeline), `src/modules/finance/hooks/useScannerState.ts` (simplified hook — single `process()` method, state-only), `src/modules/finance/components/ReceiptScanner.tsx` (two buttons, one pipeline), `src/lib/image-preprocessor.ts` (sharp resize→WebP), `src/app/api/ai/preprocess-image/route.ts` (POST endpoint).

### 4.5 Analytical Insight Pipeline (Graph Intelligence)
The AI Insights card uses a **Structured Query → LLM Narration** pipeline, NOT an open-ended LLM prompt:

1. **3 Parallel Analytical Cypher Queries** (each on its own Neo4j session):
   - **Price Intelligence**: Compares avg unit price per ingredient across merchants. Detects which vendor is cheaper for the same item.
   - **Timing Analysis**: Day-of-week / weekend vs weekday spending patterns.
   - **Waste Prediction**: Perishability + purchase day + holiday proximity → spoilage risk score.
2. **Impact Scoring**: Each finding is scored by severity (price diff %, timing delta %, risk score). The highest-impact finding wins.
3. **LLM as Narrator**: Only the winning finding's structured data is fed to `llama-3.3-70b-versatile` with a prompt to articulate naturally. The LLM does NOT guess or invent — it summarizes real numbers.
4. **Template Fallback**: If LLM is unavailable, findings are articulated programmatically via `articulateFinding()`.
5. **Caching**: The winning insight is cached in `tenants.config.ai_insight` with a 24h TTL.

### 4.6 Enriched Graph Model (Neo4j)
Every `:Transaction` node now stores temporal enrichment derived from its `date`:
- `day_of_week` (0=Sun..6=Sat), `is_weekend` (boolean), `month` (1-12), `quarter` (1-4)
- `is_holiday` (Slovak holiday), `holiday_name`, `days_to_next_holiday`, `is_before_holiday`

Every `:MerchantSKU` node and `CONTAINS` relationship stores:
- `unit_price` (price per unit), `quantity` (units purchased)

A **Slovak holiday calendar** (`lib/holidays.ts`) covers 2025-2026 and provides `enrichDate()` for any transaction date.

### 4.7 Ingredient Mapping Ontology (`neo4j-ontology.ts`)
The `mapToOntologyItem(name, merchantId, currency)` function maps raw receipt item names to canonical ingredients:
- **Keyword matching**: `mliek`/`milk` → Milk, `masl`/`butter` → Butter, `kur`/`chick`/`hydin` → Chicken Breast, `múk`/`muka`/`flour` → Flour, `kofol`/`cola`/`pepsi` → Cola Beverage, `piv`/`beer`/`bažant`/`keg` → Draft Beer, `zemiak`/`potat` → Potatoes
- **Fallthrough**: Items not matching any keyword get `canonicalName = raw name`, `baseUnit` = parsed from name, `perishability` = 30
- **SKU ID**: `sku-{merchantId}-{lowercased-item-name-with-special-chars-as-hyphens}`
- **Ingredient ID**: `ing-{lowercased-canonical-name-with-special-chars-as-hyphens}`
- **Two items mapping to the same Ingredient ID (via keyword) across different merchants enable Price Intelligence comparisons**, verifying the price of that ingredient at each merchant.

Related helpers in the same module:
- `buildMerchantId(name: string)`: Slugifies a merchant name into a deterministic merchant ID (`merchant-{lowercase-hyphenated}`). Replaces 4 inline duplications.
- `buildSyncPayload(txRow, items, options?)`: Constructs a `TransactionSyncPayload` from a DB row + receipt items. Handles vendor name extraction, merchant ID building, item ontology mapping, date enrichment, and optional category inference. Replaces 3 near-identical blocks.

### 4.8 Seed Data Insight Requirements
All 3 analytical insight queries require specific seed data patterns:

| Query | Requirement | Example |
|-------|-------------|---------|
| **Price Intel** | Same ingredient sold by 2+ merchants with >=2 purchases each | Mlieko 1L at Metro + LUNYS → ing-milk |
| **Timing** | Spend variance >10% across days or >15% weekend vs weekday | Model weekend 2x multiplier in Neo4j |
| **Waste** | Ingredients with perilability_days < 14 purchased on weekend/before-holiday | Mlieko 1L (7d), Kuracie prsia 1kg (5d at LUNYS + Kura chladené voľné at Bidfood → same ing-chicken-breast) |

- Multi-merchant items MUST share keyword-matching canonical ingredient IDs per `mapToOntologyItem()`
- Perishable items MUST have perilability_days < 14 (Milk=7, Chicken Breast=5 from keyword rules)
- For timing: apply a 2x multiplier to weekend transaction amounts directly in Neo4j if seed data is too uniform

### 4.9 POS Data Architecture

The `graph_sync_queue.entity_type` CHECK constraint now supports `'sale'`, `'menu_item'`, `'inventory_adjustment'` in addition to `'transaction'` and `'merchant'`. When POS data flows in from the IMS, the ET follows this pipeline:

1. **ET polls IMS API**: ET calls `GET /api/ims/pos-sales?tenant_id=X&from=Y&to=Z` to fetch processed POS data.
2. **Staging + quarantine**: Raw payload lands in `pos_transaction_staging` for anomaly detection (90-day rolling baseline per item_sku).
3. **Recipe resolution**: ET fetches recipes from IMS via `GET /api/ims/recipes?tenant_id=X` (cached locally 24h) to compute theoretical consumption.
4. **Graph sync**: Approved rows enqueue `entity_type = 'sale'` to `graph_sync_queue`. Sync runner creates `:Sale` and `:ConsumptionEstimate` nodes in Neo4j.
5. **Report**: Food Cost Variance Report compares theoretical consumption (from POS × recipes) against actual spend (from purchase transactions).

**Key boundary**: The IMS owns the raw POS processing and recipe engine. The ET owns the analytics, graph, and reporting. The IMS does NOT write directly to any ET table, and the ET does NOT write directly to any IMS table.

### 4.10 Headless Viewport Pattern
- All navigation, fiscal calendar generation, and module switching MUST be handled by the `useNavigation` hook.
- UI components (e.g., `NavBar`) MUST be stateless "View" shells that consume the hook.
- **Suspense Isolation**: Hook consumption MUST happen inside a sub-component wrapped in `<Suspense>` to ensure static-page safety (e.g. 404 pages).
- Never manually manipulate `URLSearchParams` for month or module selection; use the `actions` provided by the viewport hook.

---

## 5. Telemetry & Observability
- **Logger, not console**: Use `Logger.system()` for technical telemetry and `Logger.user()` for business audit trails. Use the centralized `LogComponent` type for all system logs.
- **API Telemetry**: API routes MUST use `ServerLogger` to avoid browser global conflicts.
- **Visibility**: If an action doesn't appear in the Activity Log, it didn't happen.

---

## 6. Graph Sync & CI Standards

### 6.1 High-Performance Graph Ontology Sync (Neo4j)
- **3-Phase Lock-Safe Cypher Engine**: To prevent Cartesian products and thread write-locks on highly-shared global ingredients, bulk merges MUST execute in three isolated phases:
  1. *Phase 1 (Parents Ingest)*: UNWIND transactions, MERGE `:Merchant` and `:Transaction` nodes and link them.
  2. *Phase 2 (Eager Aggregation)*: Deduplicate global `:Ingredient` nodes **before** merging using `WITH DISTINCT item.canonicalIngredientId AS ingId, item`. This guarantees a single write-lock per unique ingredient across the entire batch context.
  3. *Phase 3 (SKU Construction)*: UNWIND flat items, MATCH parents/ingredients via unique constraints, and MERGE `:MerchantSKU` nodes, avoiding concurrent collisions.
  - **Idempotent Property Propagation**: Every `MERGE` in all 3 phases MUST include BOTH `ON CREATE SET` and `ON MATCH SET` for all properties. Without `ON MATCH SET`, re-running backfill on existing nodes/relationships silently skips property updates, leaving stale nulls (e.g., `unit_price` on `[:CONTAINS]`).
- **Flat-Memory Cursor Sliding Loops**: Bulk outbox syncing MUST process queues using flat sliding loop index windows (`.slice(i, i + BATCH_SIZE)`) instead of mutating arrays via `.splice()`. This guarantees $O(1)$ memory allocation and prevents V8 garbage collection thrashing.
- **Items Array Required for Phases 2+3**: `neo4jBulkMerge` checks each payload for an `items` field. Legacy `Transaction` objects (without `items`) only trigger Phase 1 (Merchant+Transaction nodes). Phases 2+3 (Ingredient, SKU, CONTAINS) only run when payloads carry the full `ReceiptItemSyncPayload[]`. The seed script (`seed_demo_2026.ts`) passes `Transaction` objects → only Phase 1 runs during seeding. Use `rebuild-neo4j-graph.ts` or the `backfill-neo4j` API route to rebuild the full graph from Postgres receipt_items.
- **Outbox Integrity & Self-Healing**: Dynamic outbox queues (`graph_sync_queue`) record CRUD events in real-time. If a transaction SKU or ingredient arrives out-of-order, the engine MUST self-heal by merging missing parent transaction nodes before executing SKU connections.
- **Neo4j Free Tier Memory Limits**: AuraDB free tier has ~2.2GB transaction memory limit. When syncing 10K+ transactions with items, use MAX_BATCH_SIZE=100 in `neo4jBulkMerge` calls to avoid `MemoryPoolOutOfMemoryError`. The `rebuild-neo4j-graph.ts` script uses a sliding window of 100.

### 6.2 CI Runner Hardening & Node.js 24 Compliance
- **Target Node 24**: All CI execution pipelines (GitHub Actions) MUST target Node.js 24 (`node-version: '24'`) and set the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` runner environment variable to suppress actions runner warnings and align with active deprecation deadlines.
  - **Engine Compliance**: Ensure `package.json` contains `"engines": { "node": ">=20" }` to prevent npm installer conflicts in modern Node runtimes.
- **Local workspace dependencies**: `@synculariti/*` packages under `packages/` are resolved locally via npm workspace hoisting. CI runs `npm ci` from `v2/`, so every workspace dependency MUST be declared explicitly in `v2/package.json` (`"@synculariti/whatsapp-client": "file:../packages/whatsapp-client"`). Without this, `MODULE_NOT_FOUND` crashes in CI.
- **Test boundaries**: Always match Jest-Cucumber BDD tests inside the `backend` node-based project to prevent jsdom context pollution.
- **Nightly Gherkin workflow** (`.github/workflows/nightly-gherkin.yml`): Runs at 2:00 AM UTC daily on Node.js 24. Executes `npx jest --testPathPatterns=features` from `v2/`. Requires `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` secrets.

### 6.3 Type-Safe Polymorphic Identity Casting (Postgres & TypeScript)
- **Zero-Crash Polymorphic Casting Gateways**: All UUID database columns MUST use type-safe SQL helper functions (`public.safe_cast_uuid(TEXT)` and `public.safe_cast_user_uuid(TEXT)`) inside bulk ingest operations. 
  - Standard UUID strings are successfully parsed and preserved as-is.
  - Lightweight mock staff user IDs (`'u1'`, `'u25'`) are deterministically padded to valid, type-safe UUID nodes (e.g., `'00000000-0000-0000-0000-000000000025'::uuid`) rather than nullified. This preserves user identity mapping for analytical queries and eventual graph ontology syncs.
  - Mock IDs exceeding 12 digits (e.g., `'u9999999999999'`) are intercepted by a length-constrained regex (`^u[0-9]{1,12}$`) and cleanly mapped to the generic guest fallback UUID to prevent integer or pad overflows.
  - Empty strings resolve to `NULL` to avoid serialization crash states. All other unmappable strings default safely to the system guest fallback UUID (`'00000000-0000-0000-0000-000000000000'::uuid`).
- **IMMUTABLE STRICT Performance**: In order to prevent procedural PL/pgSQL context switches and optimize planning throughput, casting helpers MUST be defined in `LANGUAGE sql` and marked `IMMUTABLE STRICT`. This enables the query planner to inline statements directly.

### 6.4 Live Database Security Catalog Verification Standard
- **The Security Oracle Pattern**: Security compliance must not rely on passive code reviews or mock test coverage. We enforce a live security test suite (`db-security.test.ts`) utilizing the superuser-privileged `get_function_security_state` database RPC.
- **Strict Verification Primitives**: The testing suite queries PostgreSQL's system catalog (`pg_proc`, `pg_namespace`, `has_function_privilege`) in real-time to guarantee:
  1. *Function Existence*: The function is correctly declared with target arguments signature mapping exactly (`pg_catalog.oidvectortypes`).
  2. *Injection Protection*: Strict search path hardening exists (`search_path=public` is present in `proconfig`).
  3. *Zero-Privilege Default*: The `EXECUTE` permission is completely revoked from both the `anon` and `public` roles to avoid inheritance vulnerabilities.
- **Landmine Detection**: The live security suite checks that legacy, insecure functions or parameter overloads do NOT exist in the public database schema, forcing active remediation.

### 6.5 Supabase Pagination (1000-Row Default Limit)
- **Default Limit**: Supabase `.select()` silently caps at 1000 rows. Any query on tables that may exceed 1000 rows MUST paginate with `.range(start, end)` or `.limit(N)`.
- **Pagination Pattern**: Use `PAGE_SIZE = 1000` with a `while` loop:
  ```typescript
  let allRows: any[] = [], page = 0;
  while (true) {
    const { data: chunk } = await supabase
      .from('transactions').select('*')
      .eq('tenant_id', tenantId)
      .order('id')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!chunk || chunk.length === 0) break;
    allRows = allRows.concat(chunk);
    if (chunk.length < 1000) break;
    page++;
  }
  ```
- **Why not `.limit()` alone**: `.limit(N)` only caps the client-side limit. Without `.order()`, the data order is undefined across pages. Always combine `.order('id')` with `.range()`.
- **Applies to**: `backfill-neo4j`, scripts that bulk-export data, analytics queries, and any ETL pipeline reading from Supabase.

### 6.6 WhatsApp Sidecar & Gateway Architecture
- **Third-Party API Gateway**: External applications must NOT communicate directly with the sidecar. All external requests must route through the Next.js Shared Endpoint (`/api/whatsapp/notify`) using a Tenant API Key (`X-Api-Key` verified against `public.api_keys`).
- **Runtime Selection**: The `/api/whatsapp/notify` route and `/api/whatsapp/webhook` route use Edge Runtime (`export const runtime = 'edge'`). The `/api/whatsapp/process-outbox` and `/api/cron/process-outbox` routes use Serverless (Node.js) runtime because Edge blocks direct IP `fetch()` calls to the GCP sidecar at `http://34.66.35.89:2785`. Serverless routes bypass the 10s timeout and support raw TCP/IP outbound connections.
- **Dual-Path Outbox Delivery** (`whatsapp_outbox` → delivery):
  1. **Primary: Database Webhook → Serverless Route** — On INSERT, Supabase fires an HTTP POST to `/api/whatsapp/process-outbox` (Node.js Serverless runtime). Delivers within seconds.
  2. **Safety Net: GCP Crontab → `/api/cron/process-outbox`** — Vercel Hobby plan does not support CRON jobs. Instead, a GCP VM (`openwa-gateway`) runs a crontab that `GET`s `/api/cron/process-outbox` every 60 seconds. The route authenticates via `x-cron-secret` header matching the `CRON_SECRET` env var (not the spoofable `x-vercel-cron` header). It claims PENDING/FAILED records using `claim_whatsapp_outbox_batch()` (SKIP LOCKED, max 5 retries). This catches messages the webhook missed or that need retry.
- **Supabase SSR Cookie Handling**: All server-side Supabase clients (`dispatchDecision` server action, `supabase-server.ts` page loader) MUST use the `getAll()`/`setAll()` API from `@supabase/ssr`. The legacy `get()`/`set()`/`remove()` API does not handle chunked JWT cookies (Supabase splits large JWTs across `.0`, `.1` suffixes). Using the batch API is **required** for server actions to correctly parse the user's session and call RPCs with the `authenticated` role.
- **SQL RETURNS TABLE Naming**: When writing Postgres functions with `RETURNS TABLE (col_name TYPE, ...)`, the output column names MUST NOT collide with table column names used in `UPDATE ... RETURNING` or `SELECT ... INTO` statements. Always qualify column references with a table alias (e.g., `RETURNING wo.status` not `RETURNING status`) to avoid ambiguous column reference errors.
- **Stateless Verification**: Webhooks from the gateway must use native Web Crypto API (`globalThis.crypto.subtle`) to verify HMAC-SHA256 signatures before processing.
- **Type-Safe Errors**: Do not use `catch (e: any)`. Always treat caught errors as `unknown` and parse them safely using `getErrorMessage(e)` to enforce zero `: any` strictness.
- **Shared HMAC Primitive**: All signing operations (sidecar dispatch AND server action dispatch) MUST use `signHmacPayload()` exported from `@synculariti/whatsapp-client`. Never re-implement the algorithm inline.
- **Two-Way Workflow Services**: Interactive business decisions triggered via WhatsApp/Action Link (e.g., PO Approval, Finance Audit, POS Discrepancy) must be implemented behind a strictly typed interface/service contract, and tested in isolation by mocking Supabase client responses.
- **Atomic Action Completion**: The `dispatchDecision` server action MUST use the RPC `complete_whatsapp_action_v1()` to atomically mark the outbox COMPLETED and return webhook config in a single transaction (§4.2 ACID).
- **Idempotency Shield**: External integrators SHOULD pass an `idempotencyKey` (UUID). The endpoint deduplicates via `whatsapp_outbox.idempotency_key` unique constraint.
- **Shared Processor**: The core logic lives in `modules/whatsapp/lib/processOutboxQueue.ts`. This function is used by BOTH the webhook route and the cron route — single code path, tested once, DRY.
- **Webhook SRP Split**: The webhook route (`webhook/route.ts`) is a thin orchestrator (55 lines). Core logic extracted into 4 utilities: `verify-webhook.ts` (HMAC check), `resolve-outbox.ts` (tenant/outbox context), `insert-inbox.ts` (inbox audit via RPC), `decision-router.ts` (DecisionHandler registry — OCP). New decision types added without modifying the router.
- **dispatchDecision SRP Split**: The server action (`dispatchDecision.ts`) is a thin orchestrator (52 lines). Core logic extracted into `complete-action.ts` (CompleteActionResult type + RPC wrapper) and `fire-webhook.ts` (webhook signing + dispatch).
- **Decision Router Pattern**: `decision-router.ts` uses a `DecisionHandler` interface with `canHandle()` and `process()` methods. Handlers register via `router.register(handler)`. The router iterates handlers to find the first match — no if-else chains, no switch statements. Service contracts inject dependencies via constructor (DIP).
- **Security by Role**: External gateway routes (notify, process-outbox, cron, webhook) use `service_role` Supabase client (server-to-server, no user session). User-facing routes (action page, `dispatchDecision` server action) use session-based Supabase SSR client with `authenticated` role. RPCs MUST only grant `EXECUTE` to the minimum required role — never `anon`.

### 6.7 Integrating External Applications with the WhatsApp Sidecar

Any internal module or external application (e.g., an ERP, a POS system, a third-party SaaS) can trigger a WhatsApp workflow that collects a user decision back via an Action Link. The protocol is as follows:

**Step 0 — Provision Access**
Contact the Synculariti admin. They create an API key for your tenant:
```sql
INSERT INTO public.api_keys (tenant_id, key_value, description)
VALUES ('<your-tenant-uuid>', '<high-entropy-secret>', 'ERP Integration - ACME Corp');
```
You receive: a `tenant_id`, an `api_key`, and the base URL `https://synculariti-et.vercel.app`.

**Step 1 — Send a One-Way Notification (Text)**
```bash
curl -s -X POST https://synculariti-et.vercel.app/api/whatsapp/notify \
  -H "X-Api-Key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientPhone": "421901234567",
    "payload": {
      "type": "text",
      "text": "🚨 Stock alert: Item #ABC-042 has fallen below reorder point (12 units remaining)."
    }
  }'
```
Response: `202 { "success": true }`

The message is queued in `whatsapp_outbox` and delivered within seconds via the primary webhook path (or within 60s via the cron safety net).

**Step 2 — Insert into the Outbox via the Shared Endpoint (Two-Way Poll)**
POST to `https://<your-domain>/api/whatsapp/notify` with:
```json
{
  "recipientPhone": "421900123456",
  "payload": {
    "type": "poll",
    "name": "Approve Invoice #INV-042",
    "options": ["Approve", "Reject", "Request Changes"],
    "metadata": {
      "invoiceId": "a1b2c3d4-...",
      "amount": 1250,
      "currency": "EUR"
    }
  },
  "webhookUrl": "https://your-app.com/api/whatsapp-callback",
  "webhookSecret": "<a-secret-you-generate>",
  "idempotencyKey": "a-unique-uuid-you-generate"
}
```
Header: `X-Api-Key: <your-tenant-api-key>`

The endpoint atomically inserts a `whatsapp_outbox` record with `status: PENDING`. The outbox record stores your `webhookUrl`, `webhookSecret`, and `idempotencyKey`. If the same `idempotencyKey` is sent twice, the endpoint returns the existing outbox ID (`200 { existing: true, outboxId: "..." }`) without inserting a duplicate.

**Step 3 — The Sidecar Delivers the Message (Automatic)**
Two delivery paths compete to serve the message:
1. **Primary**: Supabase Database Webhook fires on INSERT → POST to `/api/whatsapp/process-outbox` (Vercel Serverless Runtime) → delivers within seconds.
2. **Safety Net**: GCP Crontab every 60s → `GET /api/cron/process-outbox` → claims and delivers any PENDING/FAILED records missed by the webhook.

The user receives the WhatsApp poll with interactive buttons. For action-link flows, the message includes a URL of the form `https://<your-domain>/action/<outbox-id>`.

**Step 4 — Your App Receives the Webhook**
When the recipient responds (either via WhatsApp natively OR via the Action Link web page), Synculariti fires a POST to your `webhookUrl` with:
```json
{
  "type": "poll_vote",
  "outboxId": "<uuid>",
  "recipientPhone": "421900123456",
  "tenantId": "<uuid>",
  "decision": "Approve",
  "timestamp": 1748167200000
}
```
Header: `X-OpenWA-Signature: <hmac-sha256-hex>`

**Step 5 — Verify the Signature**
Use `signHmacPayload(body, webhookSecret)` and compare to the header value, or use `verifyWebhookSignature(body, signature, webhookSecret)` from `@synculariti/whatsapp-client`. Only process payloads that pass verification.

```typescript
import { verifyWebhookSignature } from '@synculariti/whatsapp-client';

const signature = request.headers.get('X-OpenWA-Signature');
const body = await request.text();
const isValid = await verifyWebhookSignature(body, signature, '<your-webhook-secret>');
if (!isValid) return Response.json({ error: 'Invalid signature' }, { status: 403 });
```

Or in Python:
```python
import hmac, hashlib

def verify(payload: str, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

**Step 6 — Act on the Decision (Your Module's Responsibility)**
The WhatsApp module's responsibility ends at delivery. Your webhook handler is fully responsible for updating invoice status, triggering procurement flows, or any other business logic. This ensures strict SRP between the messaging layer and domain logic.

**Step 7 — Handle Idempotency**
Supabase webhooks are at-least-once. You may receive the same decision twice. Use the `outboxId` as your idempotency key:
```sql
INSERT INTO invoice_decisions (outbox_id, decision, received_at)
VALUES ('<outboxId>', '<decision>', NOW())
ON CONFLICT (outbox_id) DO NOTHING;
```

**Error States:**
| HTTP Status | Meaning | What to do |
|-------------|---------|------------|
| `202` | Queued successfully | Wait for webhook delivery |
| `200` | Duplicate idempotencyKey | Existing outboxId in response body |
| `400` | Bad payload | Check Zod schema contract |
| `401` | Invalid/missing API key | Check your `X-Api-Key` header |
| No webhook after 5 min | Delivery delayed | Check `whatsapp_outbox` in Supabase or contact support |

**Reference Implementation (Node.js/Express):**
```javascript
const app = require('express')();

app.post('/send-approval', async (req, res) => {
  const response = await fetch('https://synculariti-et.vercel.app/api/whatsapp/notify', {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.SYNCULARITI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipientPhone: '421901234567',
      payload: {
        type: 'poll',
        name: `Approve ${req.body.invoiceId}?`,
        options: ['Approve', 'Reject'],
        metadata: { invoiceId: req.body.invoiceId },
      },
      webhookUrl: 'https://my-app.com/webhook/whatsapp-decision',
      webhookSecret: process.env.WEBHOOK_SECRET,
      idempotencyKey: crypto.randomUUID(),
    }),
  });
  res.status(response.status).json(await response.json());
});

app.post('/webhook/whatsapp-decision', async (req, res) => {
  const signature = req.headers['x-openwa-signature'];
  const raw = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(raw).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Invalid signature' });
  }
  const { outboxId, decision } = req.body;
  await pool.query(
    `INSERT INTO decisions (outbox_id, decision) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [outboxId, decision]
  );
  await pool.query(`UPDATE invoices SET status = $1 WHERE id = $2`, [
    decision === 'Approve' ? 'APPROVED' : 'REJECTED', req.body.metadata.invoiceId
  ]);
  res.json({ received: true });
});
```

**Security Checklist for External Integrators:**
- [ ] Generate a high-entropy `webhookSecret` (≥ 32 random bytes, hex-encoded)
- [ ] Verify `X-OpenWA-Signature` on every inbound webhook before processing
- [ ] Your `webhookUrl` must be HTTPS
- [ ] Store the `outboxId` to correlate responses to your original request
- [ ] Handle idempotency — a network retry may deliver the same webhook twice

### 6.8 WhatsApp Test Coverage & Mock Patterns

#### Coverage Map (249 tests, all green)
| Test File | Location | What It Covers |
|-----------|----------|----------------|
| `processOutboxQueue.test.ts` | `src/modules/whatsapp/lib/` | 12 tests: RPC claiming, direct SELECT fallback, text/poll delivery, empty queue, sendText failure (false + throw), unknown payload type, missing text/name/options, partial batch failure |
| `hmac.test.ts` | `packages/whatsapp-client/src/` | 13 tests: real crypto round-trips for sign/verify, secret isolation, payload tamper detection, malformed sig, empty payload/secret, unicode |
| `notify/route.test.ts` | `src/app/api/whatsapp/notify/` | 11 tests: missing key, invalid key, valid poll, valid text, bad phone, unknown type, malformed JSON, idempotency key collision, service key valid/invalid/missing tenant |
| `triggerWorkflow.test.ts` | `src/modules/whatsapp/lib/` | 11 tests: bill approval (fire, below threshold, disabled, no amount), low stock (below/above), daily summary, error handling (tenant not found, missing phone, default threshold, insert errors) |
| `workflows/route.test.ts` | `src/app/api/tenant/workflows/` | 6 tests: missing/malformed API key, per-tenant key returns config, service key missing/valid tenant_id, tenant not found |
| `whatsapp.feature` (+ BDD) | `tests/features/` | 4 BDD scenarios: invalid sig, missing sig header, valid poll vote, unknown outbox |
| `dispatchDecision.test.ts` | `src/modules/whatsapp/actions/` | Tests server action with RPC pattern, session-based auth |

#### The `processOutboxQueue` Dual-Use Pattern
`processOutboxQueue(supabase, client, baseUrl, records?)` accepts an OPTIONAL explicit `records` array:
- **No records?** → Claims via RPC `claim_whatsapp_outbox_batch()` → falls back to direct SELECT
- **Records passed?** → Processes them directly (used by webhook route pre-filtering)
- Tests pass `makeClient()` (`{ sendText: mockSendText }`) instead of `null as any` to avoid `TypeError` calling `null.sendText()`

#### Critical Mock Pattern: `mockReset()` After `jest.clearAllMocks()`
`jest.clearAllMocks()` calls `mockClear()` which does NOT clear the persistent default implementation set by `mockResolvedValue()` or `mockResolvedValueOnce()`. This causes test pollution — a mock's return value from a previous test persists across suites.

**Always add explicit `mockReset()` for mocks captured in `jest.mock()` closures:**
```typescript
beforeEach(() => {
  jest.clearAllMocks();
  // These mocks persist across clearAllMocks — must reset explicitly
  mockMaybeSingle.mockReset();
  mockInsert.mockReset();
  mockSingle.mockReset();
});
```

#### Test Runtime Architecture
- **Two Jest projects**: `frontend` (jsdom, components/hooks) and `backend` (node, API/lib/actions)
- WhatsApp tests run in the **backend** project — no jsdom context pollution
- Gherkin BDD scenarios match `tests/features/*.feature` in the backend project
- `jest.mock('@supabase/supabase-js')` targets `@supabase/supabase-js` NOT `@/lib/supabase-server` — webhook routes use `createClient()` directly, not the SSR wrapper

### 6.9 Programmatic Workflow Integration (Internal & External)

The platform supports configurable per-tenant WhatsApp workflows for automated notifications and approvals. Workflows are configured per tenant in `tenants.config.workflows` (JSONB) and can be read by external apps or triggered internally.

#### Architecture

| Component | Location | Purpose |
|-----------|----------|---------|
| **Types** | `src/modules/whatsapp/types.ts` | `WorkflowConfig`, `WorkflowKey`, `TriggerParams`, `TriggerResult`, `TenantConfig` |
| **Trigger utility** | `src/modules/whatsapp/lib/triggerWorkflow.ts` | Reads config, checks thresholds, queues WhatsApp outbox records |
| **Notify endpoint** | `src/app/api/whatsapp/notify/route.ts` | External API gateway — supports service-level + per-tenant keys |
| **Workflows endpoint** | `src/app/api/tenant/workflows/route.ts` | GET endpoint for IMS to read per-tenant thresholds |

#### Service-Level vs Per-Tenant API Keys

**Per-Tenant Key** (`api_keys.tenant_id IS NOT NULL`):
- The key is bound to a specific tenant. No `tenant_id` param needed.
- Used by single-tenant apps (e.g., a specific restaurant's integration).

**Service-Level Key** (`api_keys.tenant_id IS NULL`):
- Shared across tenants. `tenant_id` + `source` must be in the request body (POST) or query params (GET).
- Used by multi-tenant apps (IMS, central Login Service).
- `source` field identifies the caller: `'ims'`, `'login_service'`, etc. — injected into payload metadata for audit.

#### Workflow Configuration Schema (`tenants.config.workflows`)

```json
{
  "bill_approval": {
    "enabled": true,
    "threshold": 150,
    "recipients": ["owner"]
  },
  "low_stock_alert": {
    "enabled": true,
    "threshold_pct": 80,
    "recipients": ["manager"]
  },
  "daily_summary": {
    "enabled": true,
    "time": "21:00",
    "recipients": ["owner", "manager"]
  }
}
```

- `bill_approval.threshold`: Amount in EUR above which approval is required (default: 100)
- `low_stock_alert.threshold_pct`: Stock level % below which alert fires (default: 80)
- `daily_summary.time`: Scheduled time for summary (not yet implemented for cron)
- `recipients`: Array of phone keys from `tenants.config.phones` (e.g., `"owner"`, `"manager"`)

#### Reading Workflow Config (External App — IMS)

IMS calls the read-only endpoint to display current thresholds in its settings UI:

```bash
# Per-tenant key (no tenant_id needed)
curl -s -X GET https://synculariti-et.vercel.app/api/tenant/workflows \
  -H "X-Api-Key: <per-tenant-api-key>"

# Service-level key (tenant_id required as query param)
curl -s -X GET "https://synculariti-et.vercel.app/api/tenant/workflows?tenant_id=<tenant-uuid>" \
  -H "X-Api-Key: <service-api-key>"
```

Response:
```json
{
  "workflows": {
    "bill_approval": { "enabled": true, "threshold": 150, "recipients": ["owner"] },
    "low_stock_alert": { "enabled": true, "threshold_pct": 80, "recipients": ["manager"] }
  }
}
```

#### Writing Workflow Config

There is no custom write endpoint. The central Login Service configures workflow thresholds by calling the existing `update_tenant_config_v1` RPC with its service-role Supabase client:

```sql
SELECT public.update_tenant_config_v1(
  p_tenant_id := '<tenant-uuid>',
  p_config := '{
    "phones": { "owner": "421901234567", "manager": "421909876543" },
    "workflows": {
      "bill_approval": { "enabled": true, "threshold": 150, "recipients": ["owner"] },
      "low_stock_alert": { "enabled": true, "threshold_pct": 80, "recipients": ["manager"] },
      "daily_summary": { "enabled": true, "time": "21:00", "recipients": ["owner"] }
    }
  }'::jsonb
);
```

#### Triggering Workflows Programmatically (ET Internal Only)

Any internal ET module (server action, cron, webhook, RPC trigger) can fire a workflow using the `triggerWorkflow` utility. The IMS must NOT call `triggerWorkflow` — it must use the notify endpoint instead.

```typescript
import { triggerWorkflow } from '@/modules/whatsapp/lib/triggerWorkflow'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Bill approval — sends poll to owner if amount > threshold
const result = await triggerWorkflow(supabase, {
  tenantId: 'f039714b-...',
  workflowKey: 'bill_approval',
  amount: 1250,
  metadata: { billId: 'bill-001', vendor: 'Bidfood' },
})
// result: { fired: true, outboxIds: ['uuid-1'] }

// Low stock alert — sends text to manager if stock < threshold_pct
const result2 = await triggerWorkflow(supabase, {
  tenantId: 'f039714b-...',
  workflowKey: 'low_stock_alert',
  stockLevel: 65,
  metadata: { item: 'Flour 25kg', currentStock: 16, reorderPoint: 25 },
})

// Daily summary — sends text to all recipients (no threshold check)
const result3 = await triggerWorkflow(supabase, {
  tenantId: 'f039714b-...',
  workflowKey: 'daily_summary',
  metadata: {},
})
```

- The utility reads `tenants.config` to check thresholds and resolve recipient phone numbers.
- Uses `service_role` Supabase client — no SSR/cookie dependency.
- Creates `whatsapp_outbox` records that are delivered via the existing Sidecar pipeline.
- Returns `{ fired: boolean, reason?: string, outboxIds: string[] }`.

#### Sending Custom Messages from Internal Apps (IMS)

The IMS (separate application, own database) sends messages via the ET's notify endpoint — the only allowed path:

```bash
curl -s -X POST https://synculariti-et.vercel.app/api/whatsapp/notify \
  -H "X-Api-Key: <service-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<tenant-uuid>",
    "source": "ims",
    "recipientPhone": "421901234567",
    "payload": {
      "type": "text",
      "text": "🚨 Stock alert: Item #ABC-042 has fallen below reorder point (12 units remaining)."
    }
  }'
```

- The IMS uses a service-level key (`api_keys.tenant_id IS NULL`) provisioned for cross-app communication.
- `source: "ims"` is injected into payload metadata for audit trail.
- The IMS does NOT write directly to `whatsapp_outbox` or call `triggerWorkflow()` — those are ET-internal functions.
- The IMS does NOT need its own `@synculariti/whatsapp-client` package — the HTTP endpoint is the contract.

#### Supported Workflow Types

| Workflow | Payload Type | Threshold Check | Recipients |
|----------|-------------|-----------------|------------|
| `bill_approval` | `poll` (Approve/Reject) | `amount >= threshold` | owner |
| `low_stock_alert` | `text` | `stockLevel <= threshold_pct` | manager |
| `daily_summary` | `text` | None (always fires) | owner, manager |

#### Test Patterns

| File | Tests | What It Covers |
|------|-------|----------------|
| `triggerWorkflow.test.ts` | 11 | Threshold checks, recipient resolution, error handling, edge cases |
| `notify/route.test.ts` | 11 | API key auth, body validation, service-key tenant resolution, idempotency |
| `workflows/route.test.ts` | 6 | API key auth, per-tenant vs service-key access, missing tenant_id, 404 |

### 6.10 Food Cost Variance Formula Reference

All FCV formulas, thresholds, and financial logic are documented in:
`docs/finance/food-cost-variance.md`

Key formulas captured there:
- **Core gap**: `Actual Spend − Theoretical COGS`
- **Direction logic**: BLEEDING/PROFITABLE/NEUTRAL based on gap > 5% of revenue
- **Variance spikes**: HIGH_VARIANCE when actual > theoretical × 1.3, NEGATIVE_VARIANCE when actual < theoretical × 0.7
- **Data coverage**: Uncertainty bands widen as POS coverage drops below 100%
- **Per-ingredient share**: Each ingredient's gap as % of total gap

Read this file before modifying any FCV logic to maintain formula consistency.

### 6.11 Unified Error Message Extraction

- **One function, zero duplication**: All error-to-string conversions MUST use `getErrorMessage(e)` from `@/lib/utils`. No inline `e instanceof Error ? e.message : String(e)` anywhere.
- **Definition** (`src/lib/utils.ts`):
  ```typescript
  export function getErrorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }
  ```
- **Import**: `import { getErrorMessage } from '@/lib/utils'`
- **Coverage**: The entire codebase (lib/, API routes, modules, actions) uses this single function. Any new code must follow suit.
- **Why not `@synculariti/whatsapp-client`**: `getErrorMessage` also exists in the shared package, but ET-internal code must use `@/lib/utils` to avoid cross-package dependency chains during test resolution.

---

## 7. Phase 1 Security Hardening

This section documents the Phase 1 security hardening campaign. All 4 issues have been fixed and verified via automated tests.

### 7.1 Issues Found & Fixed

| # | Issue | Severity | File/Location | Fix |
|---|-------|----------|---------------|-----|
| 1 | `enqueue_graph_sync_internal` missing SECURITY DEFINER | **CRITICAL** | `remote_schema.sql:400` | Added SECURITY DEFINER + `SET search_path TO 'public'` + REVOKE EXECUTE FROM anon |
| 2 | `/api/health` created Supabase SSR + Neo4j sessions | **HIGH** | `health/route.ts` | Simplified to static `{ status: 'ok' }` |
| 3 | CRON_SECRET compared with `!==` (timing attack) | **HIGH** | `cron/process-outbox/route.ts:10` | Replaced with constant-time `timingSafeEqual()` |
| 4 | GRANT ALL TO anon on 6 tables + ALTER DEFAULT PRIVILEGES | **HIGH** | `remote_schema.sql:2525-2683` | REVOKE ALL, GRANT minimal (SELECT-only/zero), fixed default privileges |

### 7.2 Migration Files

| File | Purpose |
|------|---------|
| `20260530003_security_hardening_phase1.sql` | Test RPCs + enqueue fix + anon grants fix + default privileges fix |
| `20260530004_fix_enqueue_searchpath.sql` | Corrected enqueue search_path syntax to `SET search_path TO 'public'` |

### 7.3 New Test Files

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `src/lib/db-security-privileges.test.ts` | 7 | 6 table privilege assertions + ALTER DEFAULT PRIVILEGES check |
| `src/app/api/health/route.test.ts` | 1 | Static liveness response, no infrastructure details |
| `src/app/api/cron/process-outbox/route.test.ts` | 2 | Timing-safe comparison + CRON_SECRET missing gate |

### 7.4 Verification

- All 4 hardening issues fixed and verified via 10 new automated tests
- 503 total tests passing, 3 pre-existing failures (pipeline-schema.test.ts — unrelated)
- Zero regressions introduced

---

## 8. Phase 2: Route Standardization

### 8.1 Issues Found & Fixed

| # | Issue | Severity | File/Location | Fix |
|---|-------|----------|---------------|-----|
| 5 | `whatsapp/session/route.ts` uses `withAuth()` directly instead of `withTestHandler()` | **HIGH** | `session/route.ts:9` | Refactored to `const handler: SecureHandler; export const GET = withTestHandler(handler)` |
| 6 | `whatsapp/process-outbox/route.ts` compares webhook secret with `!==` (timing attack) | **HIGH** | `process-outbox/route.ts:13` | Replaced with constant-time `timingSafeEqual()` |

### 8.2 New Test Files

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `src/app/api/whatsapp/session/route.test.ts` | 2 | Session status success + gateway failure |
| `src/app/api/whatsapp/process-outbox/route.test.ts` | 5 | Valid INSERT, missing auth, wrong token, non-INSERT skip, exception handling |
| `src/app/api/whatsapp/webhook/route.test.ts` | 4 | Invalid HMAC (403), missing HMAC (401), valid poll vote (200), missing outbox context (400) |
| `src/app/api/analytics/food-cost-variance/route.test.ts` | 3 | Report generation, query param parsing, error handling |

### 8.3 Coverage Improvement

- **Before Phase 2**: 9/21 routes had tests (43%)
- **After Phase 2**: 13/21 routes have tests (62%)
- Net new tests: 14 (517 total passing, same 3 pre-existing failures)
- Zero regressions

---

## 9. Phase 3: Code Quality Hardening

### 9.1 Issues Found & Fixed

| # | Issue | Severity | File/Location | Fix |
|---|-------|----------|---------------|-----|
| 7 | 6 `: any` type annotations in scripts | **HIGH** | `rebuild-neo4j-graph.ts` (3), `trigger_workflow.ts` (1), `seed_demo_2026.ts` (2) | Replaced with typed interfaces (`Transaction`, `TransactionSyncPayload`, `ReceiptItemInsert`, `WorkflowPayload`) |
| 8 | 4 unused `import React` | **LOW** | `BrandHeader.tsx`, `ExpenseList.tsx`, `ManualEntryModal.tsx`, `ActionClient.tsx` | Removed unused imports |
| 9 | `console.warn` instead of Logger | **LOW** | `ActionClient.tsx:37` | Replaced with `Logger.system()` |
| 10 | `notifyLargeInvoice.ts` uses `createServerClient` directly | **MED** | `notifyLargeInvoice.ts` | Refactored to use `createClient()` from `@/lib/supabase-server` |
| 11 | `timingSafeEqual` duplicated in 2 routes | **LOW** | `cron/process-outbox/route.ts`, `whatsapp/process-outbox/route.ts` | Extracted to `@/lib/utils.ts`, both routes import it |
| 12 | 4 groups of hardcoded strings (41 occurrences, 14 files) | **MED** | 14 files across `lib/`, `modules/`, `app/` | Centralized in `@/lib/constants.ts` as `CONTENT_TYPE_JSON`, `HEADER_CONTENT_TYPE`, `HEADER_API_KEY`, `QUEUE_SAVE_RECEIPT` |
| 13 | 8 routes with zero test coverage | **HIGH** | `auth/pin`, `groq`, `debug/backfill-neo4j`, `debug/sync-neo4j`, `ai/statement`, `ai/parse-receipt`, `ai/parse-invoice`, `ai/forecast` | Added 38 tests across 8 route test files |

### 9.2 New Test Files (Phase 3)

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `src/app/api/auth/pin/route.test.ts` | 7 | Invalid PIN format (2), rate limit RPC failure (503), rate limited (429), tenant lookup failure (401), PIN verification failure (401), successful auth (200) |
| `src/app/api/groq/route.test.ts` | 6 | Missing messages (400), non-array messages (400), valid response (200), default model (200), Groq failure (500), empty model string (200) |
| `src/app/api/debug/backfill-neo4j/route.test.ts` | 4 | No session (401), driver not initialized (500), no transactions (200), Neo4j merge failure (500) |
| `src/app/api/debug/sync-neo4j/route.test.ts` | 3 | No session (401), driver not initialized (500), no pending events (200) |
| `src/app/api/ai/statement/route.test.ts` | 4 | Missing text (400), non-string text (400), successful parse (200), Groq failure (500) |
| `src/app/api/ai/parse-receipt/route.test.ts` | 4 | Missing ekasaData (400), AI-enriched receipt (200), known store bypass (200), Groq failure (500) |
| `src/app/api/ai/parse-invoice/route.test.ts` | 4 | Missing image (400), non-string image (400), rejected triage (200), successful parse (200), Groq failure (500) |
| `src/app/api/ai/forecast/route.test.ts` | 5 | Missing spent (400), zero daysElapsed early return (200), negative daysElapsed validation (400), AI forecast (200), Groq failure (500) |

### 9.3 Coverage Improvement

- **Before Phase 3**: 13/21 routes had tests (62%)
- **After Phase 3**: 21/21 routes have tests (100%)
- Zero `: any` in production code
- Zero `import React` unused imports
- Zero hardcoded `'application/json'` / `'Content-Type'` / `'X-Api-Key'` / `'SAVE_RECEIPT'` strings
- `timingSafeEqual` defined once in `@/lib/utils.ts`, both routes import it
- All server action factory violations fixed
- Net new tests: 38 (555 total passing, same 3 pre-existing failures)
- Zero regressions

## 10. Phase 4: Production Readiness Sprint (FCV Pipeline)

### 10.1 Issues Found & Fixed

| # | Issue | Severity | File/Location | Fix |
|---|-------|----------|---------------|-----|
| 14 | `purchases.quarantine_status` check constraint missing `'RELEASED'` | **CRITICAL** | `20260529001_two_table_quarantine.sql:37` | Added `'RELEASED'` via migration `20260531002` |
| 15 | `purchase_anomaly_queue.status` check constraint missing `'RESOLVED'` | **CRITICAL** | `20260529001_two_table_quarantine.sql:90` | Added `'RESOLVED'` via migration `20260531002` |
| 16 | `release_expired_quarantines_v1` RPC overwrites per-tenant count instead of accumulating | **HIGH** | `20260529001_two_table_quarantine.sql:244` | Replaced CTE-COUNT with `GET DIAGNOSTICS ROW_COUNT` (migration `20260531001`) |
| 17 | `resolve_purchase_quarantine_v1` RPC does not exist | **CRITICAL** | `resolvePurchaseAction.ts:15` | Created RPC with SECURITY DEFINER + search_path + REVOKE FROM anon/public (migration `20260531002`) |
| 18 | `vercel.json` crons block missing | **HIGH** | `vercel.json` | Added crons block in root `vercel.json` for `/api/cron/release-quarantines` |
| 19 | FCV route returns `theoreticalCOGS: 0` because `enrichStagingRow` never writes to DB | **HIGH** | `food-cost-variance/route.ts` | Added lazy enrichment loop: calls `refreshRecipeCache`, per-row `enrichStagingRow` + write-back of `theoretical_grams` and `recipe_found` flag |
| 20 | NeedsAttentionCard pendingPurchases chip is non-clickable | **LOW** | `NeedsAttentionCard.tsx` | Wired click to open review modal with approve/reject buttons calling `resolvePurchaseAction` |
| 21 | FoodCostVarianceCard has dead `spikeCount` variable | **LOW** | `FoodCostVarianceCard.tsx:66` | Removed (superseded by VarianceSpikeDetail) |
| 22 | `VarianceSpikeDetail` component has zero tests | **MED** | `VarianceSpikeDetail.tsx` | Added 4 tests (empty/normal, spike indicator, dip indicator, 3-item limit) |
| 23 | `ims-client-enrich.test.ts` has only 2 tests | **MED** | `ims-client-enrich.test.ts` | Added 3 tests (empty ingredients, zero quantity, null quantity) |
| 24 | `pipeline-schema.test.ts` references renamed RPC return field `released_queue` | **MED** | `pipeline-schema.test.ts:7` | Updated to `released_pending` (5 occurrences), added `'RELEASED'` to valid statuses |
| 25 | No Gherkin tests for FCV quarantine flow | **MED** | `tests/features/` | Added `fcv_quarantine.feature` + `fcv_quarantine.test.ts` with 2 scenarios |

### 10.2 Architecture Rules Added

- **FCV Lazy Enrichment (GET Side-Effect)**: The `GET /api/analytics/food-cost-variance` route performs a read-through cache backfill. On execution, it calls `refreshRecipeCache` (gracefully if IMS offline), then iterates staging rows where `recipe_found IS NULL`, enriches via `enrichStagingRow`, and writes back `theoretical_grams` + `recipe_found` flag. This is a deliberate non-idempotency trade-off — subsequent requests for the same period find cached data and behave as pure reads. Per-row `try/catch` prevents a single corrupt row from crashing the dashboard.
- **`enrichStagingRow` Pattern**: A pure transformation function (not a DB writer) in `ims-client.ts`. It reads from `cached_recipes`, maps `menu_item_id` + `quantity` → theoretical ingredient grams and costs. Returns the enriched row. The CALLER (FCV route) decides whether to persist.
- **Direct Purchase Resolution**: The `resolvePurchaseAction` server action calls `resolve_purchase_quarantine_v1` RPC to bypass WhatsApp/Sidecar for purchase quarantine approvals. Used by the NeedsAttentionCard modal and the `/action/[actionId]` page's "Direct" button.
- **Bulk Anomaly Resolution**: `resolve_purchase_quarantine_v1` updates ALL anomaly queue rows matching `purchase_id` (not just one) — because a single purchase can trigger multiple anomaly types (price spike + new vendor).
- **`recipe_found` Indexing Flag**: When enriching staging rows, the FCV route writes `recipe_found = true` (if mapping succeeded) or `recipe_found = false` (if mapping failed or ingredient list empty). Subsequent FCV requests skip rows where `recipe_found IS NOT NULL` — avoiding JSONB parse on every request.

### 10.3 New Test Files (Phase 4)

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `src/modules/finance/components/__tests__/VarianceSpikeDetail.test.tsx` | 4 | Empty/normal spikes (null render), spike indicator, dip indicator, 3-item limit |
| `tests/features/fcv_quarantine.feature` | 2 scenarios | Gherkin BDD: quarantine release cron, POS enrichment (tagged `@skip-until-ims`) |
| `tests/features/fcv_quarantine.test.ts` | 2 scenarios | Step definitions for quarantine release + POS enrichment |

### 10.4 Existing Test Files Extended (Phase 4)

| Test File | New Tests | Change |
|-----------|-----------|--------|
| `src/lib/ims-client-enrich.test.ts` | 3 | Empty ingredients → null, zero quantity → zero grams/cost, null quantity → treated as zero |
| `src/lib/pipeline-schema.test.ts` | — | `released_queue` → `released_pending` (5 occurrences), added `'RELEASED'` to `validStatuses` |

### 10.5 Coverage Improvement

- **Before Phase 4**: 555 passing, 3 pre-existing failures (pipeline-schema)
- **After Phase 4**: 576 passing, 0 failures
- **Net new tests**: 20 (VarianceSpikeDetail: 4, enrich: 3, BDD: 2 scenarios, pipeline-schema fixes: 2 failures → 0)
- **Database migrations applied**: `20260531001` (ROW_COUNT fix) + `20260531002` (check constraints + resolve RPC)
- **Check constraints fixed**: `purchases.quarantine_status` + `purchase_anomaly_queue.status` now accept `RELEASED` / `RESOLVED`
- **Zero regressions**
