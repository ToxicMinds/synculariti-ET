# Synculariti-ET: Operational Rulebook

## 1. Core Architecture
- **Root Directory**: `v2/`
- **Domain Isolation**: Every business domain (`identity`, `logistics`, `finance`) MUST live in `v2/src/modules/[domain]`.
- **Headless Logic**: Keep business logic in React hooks inside `modules/[domain]/hooks/`. UI components should be lean consumers of these hooks.
- **Shared Utilities**: Cross-domain helpers must live in `v2/src/lib/`. Shared UI components live in `v2/src/components/`.
- **Viewport Controller**: Use the headless `useNavigation` hook for all fiscal calendar and domain navigation logic. UI components must not manually generate month lists or manipulate routing parameters.
- **Static Safety**: Any component consuming URL-dependent hooks (e.g., `useNavigation`, `useSearchParams`) MUST be wrapped in a `<Suspense>` boundary and separated from static layout shells to prevent CSR bailouts during build-time static generation.
- **Shared Gestures**: Use the `useSwipeable` hook for all swipe-to-reveal or horizontal gesture logic.
- **Hardware/Intelligence Decoupling**: Complex components (like cameras/scanners) MUST decouple hardware logic (`useCamera`) from intelligence/parsing logic (`useReceiptProcessor`).
- **Fiscal Arithmetic**: Use the `useCalendarGrid` hook for all fiscal heatmap or calendar grid generation. Never perform date math or spend aggregation directly inside a UI component.

## 2. Coding Standards
- **TypeScript Only**: No `.js` files. **Zero** `: any` usages allowed. Use explicit return types for all functions.
- **No Direct DML**: Never use `supabase.from('transactions').insert(...)`. Use the canonical RPC `save_receipt_v4`.
- **Data Integrity Contracts**: All ledger mutations MUST maintain strict compliance with schema contracts, including propagating `updated_at` timestamps to prevent `42703 undefined_column` crashes.
- **Logger, not console**: NEVER use `console.log`, `console.warn`, or `console.error` in production code. Use `Logger.system()` for technical events and `Logger.user()` for business events. Use centralized `LogComponent` types.
- **User Activity**: EVERY mutation MUST call `Logger.user(tenantId, action, description, actorName)`.
- **API Route Standards**: Every API route handler must follow the `SecureHandler` signature and use `SecureContext`.
- **Validation & Washing**: Use Zod schemas from the shared registry for request parsing. Use the 'Washer' pattern (transforms + defaults) to guarantee type safety for nullable metadata.
- **Error Boundaries**: Every page-level component must be wrapped in an `ErrorBoundary`.

## 3. Security & Database Rules
- **Tenant Isolation**: Every table has `FORCE ROW LEVEL SECURITY`. Policies must use `get_my_tenant()`.
- **Server-Side Auth**: API routes use `createServerClient` from `@supabase/ssr`. Never trust `tenant_id` from a client payload.
- **DB Function Hardening**: Every `SECURITY DEFINER` function MUST:
    1. Include `SET search_path = public`.
    2. Include `REVOKE EXECUTE ON FUNCTION ... FROM anon`.
- **Security Verification**: Critical RPCs must be registered in `v2/src/lib/db-security-contract.ts` for automated catalog contract testing.
- **Automated Catalog Contracts**: We validate database state in real-time with a live integration test suite (`db-security.test.ts`) that queries the PostgreSQL catalog using the `get_function_security_state` oracle RPC. This ensures every critical function strictly enforces injection protection (`search_path=public`) and completely revokes execution privileges from `public` and `anon` roles.
- **Migration Protocol**: Add new numbered files to `sql/b2b_evolution/`. Never alter applied migrations.
- **Supabase Pagination**: Supabase `.select()` defaults to 1000 rows minimum. Any query on tables that may exceed 1000 rows MUST paginate with `.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)` using `PAGE_SIZE = 1000` and `.order('id')`. This applies to ETL scripts, backfill routes, and analytics queries.

## 4. AI & Groq Strategy
- **Model**: `llama-3.3-70b-versatile`
- **Categorization**: Always pass the `tenant.categories` list to categorization prompts.
- **Validation**: Sanitize and validate LLM outputs before database persistence.
- **Insights Pipeline**: Use the Structured Query → LLM Narration pattern:
  1. Run 3 parallel analytical Cypher queries (Price Intelligence, Timing Patterns, Waste Risk) on separate Neo4j sessions
  2. Score each finding by impact; pick the highest-impact winner
  3. LLM receives only the winning finding's structured data — it narrates, never guesses
  4. Fall back to `articulateFinding()` template if LLM is unavailable
  5. Cache result in `tenants.config.ai_insight` with 24h TTL
- **Graph Enrichment**: Every `:Transaction` node must store temporal fields (`day_of_week`, `is_weekend`, `month`, `quarter`, `is_holiday`, `holiday_name`, `days_to_next_holiday`, `is_before_holiday`). Every `:MerchantSKU` and `[:CONTAINS]` must store `unit_price` and `quantity`.
- **Date Utility**: Use `enrichDate()` from `lib/holidays.ts` (covers 2025–2026 Slovak holidays) for all temporal enrichment.
- **Seed Data Requirements**: For all 3 queries to produce non-null findings:
  - *Price Intel*: Need the same ingredient sold by 2+ merchants with >=2 purchases each. Items MUST share keyword-matching canonical ingredient IDs per `mapToOntologyItem()`.
  - *Waste*: Need ingredients with `perishability_days < 14` (Milk=7, Chicken Breast=5).
  - *Timing*: If seed data is too uniform, apply a 2x weekend multiplier directly in Neo4j (< 10% day-of-week variance or < 15% weekend vs weekday = null).

## 5. Deployment & Testing
- **Build First**: `npm run build` must pass locally before any push to `main`.
- **Zero Lint Errors**: Maintain zero ESLint warnings/errors.
- **Contract Tests**: Run `npm run test` to verify database security compliance after schema changes.

## 6. Neo4j Ontological Syncing & CI Hardening
- **3-Phase Lock-Safe Cypher Engine**: Bulk graph merges MUST execute in three isolated phases:
  1. *Phase 1 (Parents Ingest)*: UNWIND transactions, MERGE `:Merchant` and `:Transaction` nodes and link them.
  2. *Phase 2 (Eager Aggregation)*: Deduplicate global `:Ingredient` nodes **before** merging using `WITH DISTINCT item.canonicalIngredientId AS ingId, item`. This guarantees a single write-lock per unique ingredient across the entire batch context.
  3. *Phase 3 (SKU Construction)*: UNWIND flat items, MATCH parents/ingredients via unique constraints, and MERGE `:MerchantSKU` nodes, avoiding concurrent collisions.
- **Flat-Memory Cursor Sliding Loops**: Bulk outbox syncing MUST process queues using flat sliding loop index windows (`.slice(i, i + BATCH_SIZE)`) instead of mutating arrays via `.splice()`. This guarantees $O(1)$ memory allocation and prevents V8 garbage collection thrashing.
- **CI Node 24 Hardening**: All workflow pipelines (GitHub Actions) MUST target Node.js 24 and set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to suppress deprecation warnings and align runner execution early.
- **Engine Compliance**: Ensure `package.json` contains `"engines": { "node": ">=20" }` to prevent npm installer conflicts in modern Node runtimes.
- **Test boundaries**: Always match Jest-Cucumber BDD tests inside the `backend` node-based project to prevent jsdom context pollution.
- **Temporal Enrichment**: Every sync payload must call `enrichDate(date)` from `lib/holidays.ts` and pass the 8 temporal fields (`dayOfWeek`...`isBeforeHoliday`) through Phase 1 of the Cypher engine. The `category` field must also be propagated to `:Transaction` nodes.
- **Unit Price / Quantity**: Every `ReceiptItemSyncPayload` must carry `itemQuantity` and `itemUnitPrice`; Phase 3 stores these on `[:CONTAINS]` edges and `:MerchantSKU` nodes. Default to `1` / total amount when explicit data is unavailable.
- **ON MATCH SET on all Phases**: Every `MERGE` that sets properties MUST include BOTH `ON CREATE SET` and `ON MATCH SET`. Without `ON MATCH SET`, re-running the backfill on existing nodes/relationships silently skips property updates, leaving stale/null values. This applies to Phase 1 (Transaction/Merchant), Phase 2 (Ingredient), and Phase 3 (MerchantSKU/CONTAINS).
- **Idempotent Backfill**: Re-running `backfill-neo4j` must always converge the graph to the correct state. `ON MATCH SET` guarantees idempotency.
- **Items Array Required**: `neo4jBulkMerge` only runs Phases 2+3 when payloads carry an `items` field with `ReceiptItemSyncPayload[]`. Legacy `Transaction` objects (without `items`) only trigger Phase 1. Use `rebuild-neo4j-graph.ts` or the `backfill-neo4j` API route to build the full graph from Postgres receipt_items.
- **Neo4j Free Tier Memory**: AuraDB free tier has ~2.2GB transaction memory. Batch with MAX_BATCH_SIZE=100 for 10K+ transactions with items to avoid `MemoryPoolOutOfMemoryError`.

## 7. Type-Safe Polymorphic Identity Casting
- **Polymorphic Caster Gateways**: All UUID database columns MUST use type-safe SQL helper functions (`public.safe_cast_uuid(TEXT)` and `public.safe_cast_user_uuid(TEXT)`) inside bulk ingest operations:
    1. `public.safe_cast_uuid(TEXT)`: General-purpose helper returning UUID if valid, or `NULL` if invalid/empty.
    2. `public.safe_cast_user_uuid(TEXT)`: Preserves lightweight mock user string identities (e.g. `'u1'`, `'u25'`) by mapping them deterministically to padded UUID blocks (e.g. `'00000000-0000-0000-0000-000000000001'::uuid`).
- **Overflow and Fallback Guards**: Mock user IDs MUST be constrained to 12 digits max (`^u[0-9]{1,12}$`) to prevent padding overflows. Arbitrary invalid strings must fall back safely to the system guest UUID (`'00000000-0000-0000-0000-000000000000'::uuid`). Empty strings must map to `NULL` to avoid serialization crash states.
- **Language and Performance**: Casting helper functions must be written in `LANGUAGE sql` and marked `IMMUTABLE STRICT` to allow the Postgres query optimizer to inline statements directly, eliminating PL/pgSQL procedural overhead.
- **TypeScript Parity**: Match database-level casting behaviors with `safeCastUuid` and `safeCastUserUuid` in `v2/src/lib/uuid-helpers.ts` for clean unit testing and client-side formatting.

## 8. WhatsApp Sidecar & Gateway Architecture
- **Third-Party API Gateway**: External applications must NOT communicate directly with the sidecar. All external requests must route through the Next.js Shared Endpoint (`/api/whatsapp/notify`) using a Tenant API Key (`X-Api-Key` verified against `public.api_keys`).
- **Edge Runtime Isolation**: Any API route interacting with the OpenWA gateway MUST enforce `export const runtime = 'edge'`. This bypasses the Vercel 10s Serverless timeout.
- **Dual-Path Outbox Delivery** (`whatsapp_outbox` → delivery):
  1. **Primary**: Database Webhook → POST to `/api/whatsapp/process-outbox` (Vercel Edge Route). Delivers within seconds.
  2. **Safety Net**: Vercel Cron every 60s → `GET /api/cron/process-outbox` → `claim_whatsapp_outbox_batch()` (SKIP LOCKED). Catches messages the webhook missed or that need retry.
- **Stateless Verification**: Webhooks from the gateway must use native Web Crypto API (`globalThis.crypto.subtle`) to verify HMAC-SHA256 signatures before processing.
- **Type-Safe Errors**: Do not use `catch (e: any)`. Always treat caught errors as `unknown` and parse them safely using `getErrorMessage(e)` to enforce zero `: any` strictness.
- **Two-Way Workflow Services**: Interactive business decisions triggered via WhatsApp/Action Link (e.g., PO Approval, Finance Audit, POS Discrepancy) must be implemented behind a strictly typed interface/service contract, and tested in isolation by mocking Supabase client responses.
- **Shared Processor**: The core delivery logic lives in `modules/whatsapp/lib/processOutboxQueue.ts`. Used by BOTH the webhook route and the cron route — single code path, tested once, DRY.
- **Atomic Completion**: The `dispatchDecision` server action MUST use `complete_whatsapp_action_v1()` RPC to atomically mark COMPLETED and return webhook config in a single transaction.
- **Idempotency Shield**: External integrators SHOULD pass an `idempotencyKey`. The endpoint deduplicates via `whatsapp_outbox.idempotency_key`.

## 9. POS Data Architecture (Future)
- **Outbox Reuse**: POS sales will flow through the same `graph_sync_queue` pattern. The `entity_type` CHECK constraint already accepts `'sale'`, `'menu_item'`, `'inventory_adjustment'`.
- **Flow**: POS system writes to `pos_sales` table via RPC → RPC enqueues `entity_type='sale'` → Sync runner MATCHes purchased ingredients → menu items → sales for margin analysis.
- **No Schema Changes Needed**: The architecture is prepared; implement the `pos_sales` table RPC when POS data integration begins.

## 10. AI Insights Caching & Concurrency
- **Session Isolation**: Never share a Neo4j session across concurrent `session.run()` calls. Use separate sessions per query when running in parallel.
- **Caching**: Winning insight is cached in `tenants.config.ai_insight` with a 24-hour TTL. Bypass cache via `?force=1` query parameter.
- **Fallback**: If any part of the pipeline fails (Neo4j disconnect, LLM 503, malformed data), fall back gracefully to `articulateFinding()` and never throw a 500 to the client. Return the "still syncing" status until valid data is produced.



