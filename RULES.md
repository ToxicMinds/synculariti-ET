# Synculariti-ET: Operational Rulebook

## 1. Core Architecture
- **Two Applications**: Synculariti-ET (this codebase — Expense Tracker) and IMS (Inventory Management System) are separate apps with separate databases. They communicate via HTTP APIs with `X-Api-Key` auth.
- **Root Directory**: `v2/`
- **Domain Isolation**: Every business domain (`identity`, `logistics`, `finance`) MUST live in `v2/src/modules/[domain]`.
- **Headless Logic**: Keep business logic in React hooks inside `modules/[domain]/hooks/`. UI components should be lean consumers of these hooks.
- **Shared Utilities**: Cross-domain helpers must live in `v2/src/lib/`. Shared UI components live in `v2/src/components/`.
- **Viewport Controller**: Use the headless `useNavigation` hook for all fiscal calendar and domain navigation logic. UI components must not manually generate month lists or manipulate routing parameters.
- **Static Safety**: Any component consuming URL-dependent hooks (e.g., `useNavigation`, `useSearchParams`) MUST be wrapped in a `<Suspense>` boundary and separated from static layout shells to prevent CSR bailouts during build-time static generation.
- **Shared Gestures**: Use the `useSwipeable` hook for all swipe-to-reveal or horizontal gesture logic.
- **Hardware/Intelligence Decoupling**: Complex components (like cameras/scanners) MUST decouple hardware logic (`useCamera`) from intelligence parsing (delegated to `scanner-client.ts` orchestrator via `processScannerInput()`, which routes to `scanner-cache.ts`, `scanner-ekasa.ts`, or `scanner-vision.ts`).
- **Fiscal Arithmetic**: Use the `useCalendarGrid` hook for all fiscal heatmap or calendar grid generation. Never perform date math or spend aggregation directly inside a UI component.

## 2. Coding Standards
- **TypeScript Only**: No `.js` files. **Zero** `: any` usages allowed. Use explicit return types for all functions.
- **No Direct DML**: Never use `supabase.from('transactions').insert(...)`. Use the canonical RPC `save_receipt_v4`.
- **One Error-to-String Function**: Always use `getErrorMessage(e)` from `@/lib/utils`. Never write `e instanceof Error ? e.message : String(e)` inline. This function is used across the entire codebase — new code must follow suit. `@synculariti/whatsapp-client` also exports it, but ET-internal code must use `@/lib/utils` to avoid cross-package chain issues during test resolution.
- **One Currency Format**: Always use `formatCurrency(amount, currency?)` from `@/lib/utils` for all monetary display. Never use `€{x.toFixed(2)}` or `x.toLocaleString('en-US', ...)` inline.
- **One Amount Parser**: Always use `safeAmount(val, fallback?)` from `@/lib/utils` for all `Number(x.amount)` conversions. Handles null/undefined/NaN internally with optional fallback (default 0). Replaces 28 inline `Number()` calls.
- **Factory for Service Clients**: Use `createServiceClient()` from `@/lib/supabase-server` for all `service_role` Supabase clients. Never `new createClient(URL, KEY)` inline — factory uses `autoRefreshToken: false, persistSession: false`.
- **Factory for OpenWA Client**: Use `createOpenWAClient()` from `@/lib/create-openwa-client` for all OpenWA gateway instantiations. Never `new OpenWAClient({...})` inline.
- **Route Auth Helper**: Always use `withTestHandler(handler)` from `@/lib/withTestHandler` in API route exports. Never write `process.env.NODE_ENV === 'test' ? handler : withAuth(handler)` inline. Routes with custom auth (webhook secrets, API keys) must use constant-time comparison (`timingSafeEqual`) — never `!==` or `===`.
- **Neo4j Ontology Helpers**: Use `buildMerchantId(name)` from `@/lib/neo4j-ontology` for merchant ID construction and `buildSyncPayload(txRow, items, opts?)` for sync payload building. Never inline the slug pattern or the mapping logic.
- **Shared Webhook Schemas**: Extend `BaseDecisionSchema` from `@/modules/whatsapp/lib/webhook-payloads` for all webhook callback payload schemas instead of writing `{ type, outboxId, recipientPhone, tenantId, timestamp }` from scratch.
- **Data Integrity Contracts**: All ledger mutations MUST maintain strict compliance with schema contracts, including propagating `updated_at` timestamps to prevent `42703 undefined_column` crashes.
- **Logger, not console**: NEVER use `console.log`, `console.warn`, or `console.error` in production code. Use `Logger.system()` for technical events and `Logger.user()` for business events. Use centralized `LogComponent` types.
- **User Activity**: EVERY mutation MUST call `Logger.user(tenantId, action, description, actorName)`.
- **API Route Standards**: Every API route handler must follow the `SecureHandler` signature and use `SecureContext`.
- **Validation & Washing**: Use Zod schemas from the shared registry for request parsing. Use the 'Washer' pattern (transforms + defaults) to guarantee type safety for nullable metadata.
- **Error Boundaries**: Every page-level component must be wrapped in an `ErrorBoundary`.

## 3. Security & Database Rules
- **Service Role Key Protection**: The `SUPABASE_SERVICE_ROLE_KEY` in `.env.*` grants full data access bypassing all RLS policies. This is a root-level credential. Mitigations:
  1. Never commit `.env.local` or `.env.prod` to version control (already in `.gitignore`).
  2. For CI/CD, use `supabase secrets set` or a secrets manager (GitHub Secrets, Vercel Environment Variables) — never plaintext `.env` files.
  3. Rotate the key if it may have been exposed to an untrusted context.
  4. Consider a secrets migration: replace `.env.local` with `supabase secrets set` for the service role key, and reference it via `process.env.SUPABASE_SERVICE_ROLE_KEY` at runtime only.
- **Tenant Isolation**: Every table has `FORCE ROW LEVEL SECURITY`. Policies must use `get_my_tenant()`.
- **Tenant Isolation**: Every table has `FORCE ROW LEVEL SECURITY`. Policies must use `get_my_tenant()`.
- **Server-Side Auth**: API routes use `createServerClient` from `@supabase/ssr`. Never trust `tenant_id` from a client payload.
- **DB Function Hardening**: Every `SECURITY DEFINER` function MUST:
    1. Include `SET search_path TO 'public'` (not `'pg_catalog', 'public'` — exception for functions that query pg_catalog directly).
    2. Include `REVOKE EXECUTE ON FUNCTION ... FROM anon`.
- **Anon Table Privilege Hardening**: Tables must NOT grant `ALL` to `anon`. Grant only the minimum privilege required:
  - `api_keys`, `graph_sync_queue`, `whatsapp_outbox`: zero anon access
  - `current_inventory`, `rate_limits`: SELECT only
  - `whatsapp_inbox`: SELECT+INSERT (webhook inbound)
  - `ALTER DEFAULT PRIVILEGES` must not grant INSERT to anon for future tables
- **Security Verification**: Critical RPCs must be registered in `v2/src/lib/db-security-contract.ts` for automated catalog contract testing.
- **Automated Catalog Contracts**: We validate database state in real-time with a live integration test suite (`db-security.test.ts`, `db-security-privileges.test.ts`) that queries the PostgreSQL catalog using the `get_function_security_state` oracle RPC and `get_table_privilege_state_v1` RPC. This ensures every critical function strictly enforces injection protection (`search_path=public`) and completely revokes execution privileges from `public` and `anon` roles.
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
- **Workspace dependency declaration**: Every `@synculariti/*` package from `packages/` MUST be declared explicitly in `v2/package.json` as a `"file:../packages/<name>"` dependency. CI runs `npm ci` from `v2/` and does not resolve workspace hoisting from the root.
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
- **Runtime Selection**: The `/api/whatsapp/notify` route and `/api/whatsapp/webhook` route use Edge Runtime. The `/api/whatsapp/process-outbox` and `/api/cron/process-outbox` routes use Serverless (Node.js) runtime — Edge blocks direct IP `fetch()` calls to the GCP sidecar.
- **Dual-Path Outbox Delivery** (`whatsapp_outbox` → delivery):
  1. **Primary**: Database Webhook → POST to `/api/whatsapp/process-outbox` (Serverless Runtime). Delivers within seconds.
  2. **Safety Net**: GCP Crontab every 60s → `GET /api/cron/process-outbox` → `claim_whatsapp_outbox_batch()` (SKIP LOCKED, max 5 retries). Auth via `x-cron-secret` header (not spoofable `x-vercel-cron`).
- **Supabase SSR Cookie Handling**: Always use `getAll()`/`setAll()` from `@supabase/ssr`. The legacy `get()`/`set()`/`remove()` API does not handle chunked JWT cookies and will cause auth failures in server actions.
- **SQL RETURNS TABLE Naming**: Function output column names MUST NOT collide with table column names used in `UPDATE ... RETURNING` or `SELECT ... INTO`. Always qualify with a table alias.
- **Stateless Verification**: Webhooks from the gateway must use native Web Crypto API (`globalThis.crypto.subtle`) to verify HMAC-SHA256 signatures before processing.
- **Type-Safe Errors**: Do not use `catch (e: any)`. Always treat caught errors as `unknown` and parse them safely using `getErrorMessage(e)` to enforce zero `: any` strictness.
- **Two-Way Workflow Services & LSP Compliance**: Interactive business decisions triggered via WhatsApp/Action Link (e.g., PO Approval, Finance Audit, POS Discrepancy) must be implemented behind a strictly typed interface/service contract, and tested in isolation by mocking Supabase client responses. These action services (e.g., `DefaultPOApprovalService`, `DefaultFinanceAuditService`, `DefaultPOSDiscrepancyService`) must be fully Liskov Substitution Principle (LSP) compliant: they must not raise raw exceptions for invalid decisions/payload states; instead, they must return standard failure structures (e.g., `{ success: false, resolution: 'Invalid decision' }`) to allow callers to handle execution results uniformly.
- **Shared Processor**: The core delivery logic lives in `modules/whatsapp/lib/processOutboxQueue.ts`. Used by BOTH the webhook route and the cron route — single code path, tested once, DRY.
- **Webhook SRP Split**: The webhook route (`webhook/route.ts`) is a thin orchestrator (55 lines). Core logic extracted into 4 utilities: `verify-webhook.ts` (HMAC check), `resolve-outbox.ts` (tenant/outbox context), `insert-inbox.ts` (inbox audit via RPC), `decision-router.ts` (DecisionHandler registry — OCP). New decision types added without modifying the router.
- **dispatchDecision SRP Split**: The server action (`dispatchDecision.ts`) is a thin orchestrator (52 lines). Core logic extracted into `complete-action.ts` (CompleteActionResult type + RPC wrapper) and `fire-webhook.ts` (webhook signing + dispatch).
- **Decision Router Pattern**: `decision-router.ts` uses a `DecisionHandler` interface with `canHandle()` and `process()` methods. Handlers register via `router.register(handler)`. The router iterates handlers to find the first match — no if-else chains, no switch statements. Service contracts inject dependencies via constructor (DIP).
- **Atomic Completion**: The `dispatchDecision` server action MUST use `complete_whatsapp_action_v1()` RPC to atomically mark COMPLETED and return webhook config in a single transaction.
- **Idempotency Shield**: External integrators SHOULD pass an `idempotencyKey`. The endpoint deduplicates via `whatsapp_outbox.idempotency_key`.
- **Security by Role**: Gateway routes use `service_role` Supabase client (server-to-server). User-facing routes use session-based Supabase SSR client (`authenticated` role). RPCs MUST only grant `EXECUTE` to the minimum required role — never `anon`.
- **Service-Level API Keys**: Shared API keys (`api_keys.tenant_id IS NULL`) allow multi-tenant apps (IMS, Login Service) to authenticate against any tenant. The caller passes `tenant_id` + `source` in the request body (POST) or query params (GET). `source` is injected into payload metadata for audit trail. Per-tenant keys (`tenant_id IS NOT NULL`) behave as before.
- **Programmatic Workflow Triggers**: The `triggerWorkflow(supabase, params)` utility in `modules/whatsapp/lib/triggerWorkflow.ts` reads per-tenant workflow config from `tenants.config.workflows`, checks thresholds, and queues `whatsapp_outbox` records. Supports `bill_approval` (poll), `low_stock_alert` (text), and `daily_summary` (text) workflows. Uses `service_role` client — no SSR/cookie dependency.
- **Read-Only Workflows Endpoint**: `GET /api/tenant/workflows` returns per-tenant workflow thresholds from `tenants.config.workflows`. Authenticates via `X-Api-Key`. Service keys require `tenant_id` query param. Used by IMS to display current thresholds in settings UI.
- **Workflow Config in tenents.config.workflows**: JSONB schema under `tenants.config.workflows.{workflow_key}`. Fields: `enabled`, `threshold` (bill_approval, default 100), `threshold_pct` (low_stock_alert, default 80), `time` (daily_summary), `recipients` (array of phone keys from `tenants.config.phones`). Written by central Login Service via `update_tenant_config_v1()` RPC.

## 9. POS Data Architecture & IMS/ET Boundary
- **Two Separate Apps**: The IMS and ET are separate applications with separate databases (separate Supabase projects, separate Neo4j instances). They do NOT share a database.
- **Cross-App Communication**: IMS ↔ ET communication MUST go through HTTP APIs with `X-Api-Key` auth. The `api_keys` table in each app stores service-level keys (`tenant_id IS NULL`) for the other app.
- **ET reads from IMS**: ET calls `GET /api/ims/pos-sales?tenant_id=X&from=Y&to=Z` and `GET /api/ims/recipes?tenant_id=X` to fetch POS data and recipes.
- **IMS sends WhatsApp**: IMS calls `POST /api/whatsapp/notify` (ET's endpoint) for all WhatsApp notifications — never writes to `whatsapp_outbox` directly, never calls `triggerWorkflow()`.
- **Workflow config**: The central Login Service writes to both systems via `update_tenant_config_v1`. Each app reads from its own `tenants.config`.
- **No shared tables**: IMS does NOT have access to ET's `graph_sync_queue`, `whatsapp_outbox`, or Neo4j. ET does NOT have access to IMS's `inventory_ledger`, `purchase_orders`, or POS raw data.
- **ET's pipeline**: POS data from IMS API → `pos_transaction_staging` (anomaly quarantine) → recipe resolution (from cached IMS recipes) → `graph_sync_queue` → Neo4j Sale + ConsumptionEstimate nodes → Food Cost Variance Report.

## 10. Code Quality Standards
- **Zero `: any`**: All TypeScript code MUST avoid the `: any` type annotation. Use proper typed interfaces for all variables, especially in database scripts (`rebuild-neo4j-graph.ts`, `seed_demo_2026.ts`, `trigger_workflow.ts`). TypeScript's `strict` mode enforces this.
- **No unused imports**: Every import in every file must be consumed. Remove `import React` from files using the modern JSX transform. The `tsc --noUnusedLocals` flag catches violations.
- **Constants in `@/lib/constants.ts`**: All hardcoded string literals that appear 2+ times across the codebase MUST be centralized in `@/lib/constants.ts`. This includes HTTP headers (`HEADER_CONTENT_TYPE`, `HEADER_API_KEY`), content types (`CONTENT_TYPE_JSON`), queue names (`QUEUE_SAVE_RECEIPT`), and environment variable names.
- **Hook SRP**: Hooks longer than 80 lines MUST be evaluated for extraction. Lifecycle management and state transitions should be extracted into sub-hooks.
- **Logger over console**: All production code MUST use `Logger.system()` / `Logger.user()` from `@/lib/logger`. Zero `console.log` / `console.warn` / `console.error` allowed outside the logger implementation itself.
- **Single `timingSafeEqual`**: The constant-time comparison function lives in `@/lib/utils.ts` as `timingSafeEqual(a, b)`. All routes requiring timing-safe comparison MUST import from there, not re-implement inline.
- **Deconstruction of Monolithic Files**: Monolithic utility/helper files (such as `finance.ts`) MUST be deconstructed when they accumulate too many independent calculations or responsibilities. Split them into highly cohesive sub-modules (e.g., `filters.ts`, `aggregation.ts`, `margins.ts`, `forecast.ts`) and optionally use the original file as a backward-compatible facade exporting those sub-modules.


## 11. FCV Lazy Enrichment (Non-Idempotent GET)
- The `GET /api/analytics/food-cost-variance` route performs a **read-through cache backfill** as a deliberate side-effect. Subsequent requests find `recipe_found IS NOT NULL` and behave as pure reads.
- Per-row isolation: a single corrupt ingredient mapping must NOT crash the dashboard. Each enrichment attempt is wrapped in `try/catch` with `ServerLogger.system('WARN', ...)` and marks the row `recipe_found = false` to prevent infinite re-enrichment loops.
- Use `recipe_found` flag for skip detection, not JSONB null check — boolean column is indexable and avoids JSONB parse overhead.
- `enrichStagingRow` is a **pure transformation** that reads from `cached_recipes` and returns an enriched row. It does NOT write to the database — the caller decides persistence.

## 12. Direct Purchase Resolution (Server Action)
- `resolvePurchaseAction(purchaseId, decision)` is a `'use server'` action that calls `resolve_purchase_quarantine_v1` RPC. It bypasses WhatsApp/Sidecar for direct dashboard approvals.
- The RPC performs a **bulk update on purchase_anomaly_queue** by `purchase_id`, not by individual row ID — because a single purchase can trigger multiple anomaly types.

## 13. Environment Variable CI Contract
- All env vars the application reads at runtime MUST be declared in `.env.example` with a default placeholder.
- A Jest test (`env-contract.test.ts`) asserts that every var in a centrally-maintained `REQUIRED_ENV_VARS` array has a corresponding entry in `.env.example`. This test runs in the `backend` project (node context) and must only use `fs` and `path`.

## 14. AI Insights Caching & Concurrency
- **Session Isolation**: Never share a Neo4j session across concurrent `session.run()` calls. Use separate sessions per query when running in parallel.
- **Caching**: Winning insight is cached in `tenants.config.ai_insight` with a 24-hour TTL. Bypass cache via `?force=1` query parameter.
- **Fallback**: If any part of the pipeline fails (Neo4j disconnect, LLM 503, malformed data), fall back gracefully to `articulateFinding()` and never throw a 500 to the client. Return the "still syncing" status until valid data is produced.

## 15. AI Insight Actionable Narration
- **Lead with the action, never with a day name**: The LLM system prompt must produce actionable advice, not raw statistics. Example: *"Biggest opportunity: weekend shopping costs 19% more than weekdays. Schedule purchases on Monday to save ~€23/trip."* Not: *"On Saturdays, the average spend is 141.54€."*
- **Temperature 0.7**: Use higher temperature for more natural, less robotic LLM output.
- **Trivial timing filter**: Timing-only findings with `impact < 50` skip LLM narration entirely — fall back to `articulateFinding()` to avoid wasting tokens on minor day-of-week variance.
- **Per-type format guidance**: Price, timing, and waste findings each have their own recommended phrasing in the prompt to ensure appropriate output structure.

## 16. Top Purchased Items Data Flow
- **Data source**: `ItemAnalytics` (`src/modules/finance/components/ItemAnalytics.tsx`) queries `supabase.from('receipt_items')` with a join on `transactions` via the browser-side Supabase client. NOT Neo4j.
- **No category filter**: The component queries ALL receipt items regardless of category. The `"(OPEX)"` label was removed from the BentoCard title because it was misleading — the card never filtered for OPEX items.
- **Aggregation**: Items grouped by UPPERCASED name, sorted by `total_amount DESC`, sliced to top 5. Includes `last_store` and `last_date` from the most recent transaction per item.

## 17. Event Log Architecture
- **Void Return Pattern**: Both `recordEvent()` (client) and `recordEventServer()` (server) return `Promise<void>`. Callers MUST use `void recordEvent(...)` for fire-and-forget semantics. Never await — the function never blocks and errors are logged internally.
- **Type-Safe Server Payload**: All service-role `recordEventServer()` calls MUST pass an explicit `tenantId` — enforced at compile time by `RecordEventServerPayload`. Client-side `recordEvent()` does NOT accept `tenantId` (resolved server-side by `record_event_v1` via `get_my_tenant()`).
- **Single ACTION_DISPLAY Registry**: All action-to-display mappings (label, color, icon) live in `src/lib/event-log-display.ts`. Never create a second registry in a component file.
- **No SQL CHECK on event_log.action**: The sole write path is `record_event_v1` (SECURITY DEFINER). TypeScript's compile-time `EVENT_ACTIONS` const is the real guard. The DB CHECK constraint was dropped in migration 46.
- **BDD Query Isolation**: All BDD queries against `event_log` MUST filter by `tenant_id`. Jest runs test files in parallel — queries without `tenant_id` filters double-count rows from concurrent test suites.

## 18. formatRelativeTime Sign Handling
- `formatRelativeTime(isoDate)` MUST NOT use `Math.abs()` directly in the `rtf.format()` call — it strips the sign, making future dates render as past.
- Track sign separately: `const sign = diffMs <= 0 ? 1 : -1; return rtf.format(sign * Math.floor(diff / unit), unit)`.
- Future dates correctly produce "in N minutes/hours/days". Past dates produce "N minutes/hours/days ago".

## 19. Date Format Standard
- All user-visible dates MUST use `formatDate()` from `@/lib/utils` with MM-DD-YYYY output.
- `formatDate(dateStr: string)` parses via `new Date(dateStr + 'T12:00:00')` to avoid timezone offset issues, and returns `MM-DD-YYYY`.
- Never render raw ISO date strings (`tx.date`) directly in JSX — always pass through `formatDate()`.
- Components maintaining dates: `TransactionRow`, `StatementScanner`, `ReceiptScanner`, `NeedsAttentionCard`, `VarianceSpikeDetail`, `ItemAnalytics`.

## 20. Transaction Sort Default
- `useTransactionFilter` defaults to `sortBy: 'created_at'` with `sortOrder: 'desc'` so newly added transactions appear at the top of the list.
- This overrides the previous `date DESC` default which buried recent manual entries under seed data.
- The `'created_at'` sort option must be declared in the `sortBy` union type in `useTransactionFilter.types.ts`.

## 21. Merchant Field Preservation
- The `transactions` table has no `merchant` column — the field is silently dropped by `add_transactions_bulk_v1` RPC.
- When saving a `ManualEntryPayload` with both `merchant` and `description`, `handleManualSave` in `page.tsx` MUST combine them as `"${merchant} - ${description}"` into the `description` field.
- The `ManualEntryPayload` type retains separate `merchant`/`description` fields for the form — the merge happens only at save time.



