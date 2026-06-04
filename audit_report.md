# Synculariti-ET: Full Audit Report

**Last Update:** 2026-06-04
**Deep-dive:** Full codebase scan covering type safety, ACID, security, SOLID, DRY, observability, dead code, React hygiene.

---

### Fixed (W-01, V-34, V-38, V-45, V-71, W-02, V-70, W-03, V-72, V-49, V-46, V-48, V-47, V-73, V-52, V-58, C1, C2, C3, B1, B2a, A1, A3, D1)

| ID | File | Issue | Fix Applied |
| :--- | :--- | :--- | :--- |
| W-01 | `webhook/route.ts:39` | Used session-based `createClient()` in HMAC-authenticated Edge route — no browser cookies exist in sidecar webhook POST → anon role → RLS blocked all outbox queries | Replaced with `getAdminClient()` (service-role) |
| V-34 | `MobileBottomNav.tsx` | `usePathname()` without `<Suspense>` boundary — crashes client navigation | Split into `MobileBottomNavContent` + Suspense-wrapped shell |
| V-38 | `useTransactionSync.ts`, `scanner-client.ts` | `typeof navigator !== 'undefined' && !navigator.onLine` repeated 3x | Extracted `OfflineQueue.isOffline()` static method |
| V-45 | 31 occurrences in 21 files | `e instanceof Error ? e.message : String(e)` repeated everywhere | Exported `getErrorMessage()` to `@/lib/utils`, replaced all 31+ inline checks across 22 files |
| V-71 | `webhook/route.ts:95-134` | 3-step non-atomic: inserts `whatsapp_inbox`, updates `whatsapp_outbox`, processes business logic. If step 2/3 fails, inbox record is orphaned | Replaced with `insert_whatsapp_inbox_v1` + `complete_whatsapp_action_v1` RPCs |
| W-02 | `webhook/route.ts:43` | `let outboxRecord: any = null` — last `:any` in production code | Typed as `OutboxRecord \| null` |
| V-70 | `processOutboxQueue.ts:59-88` | Direct `supabase.from('whatsapp_outbox').update()` — bypasses RPC. Send + status update not atomic: if `.update()` fails after successful send, outbox shows wrong status | Replaced with `set_outbox_delivery_result_v1` RPC (migration 33). Status + processed_at + retry_count set atomically |
| W-03 | `notifyLargeInvoice.ts:32-66` | Legacy `get(name)` cookie API breaks chunked JWTs + direct `whatsapp_outbox.insert()` bypasses RPC | Fixed: `getAll()/setAll()` cookie API + replaced insert with `insert_whatsapp_outbox_v1` RPC (migration 34) |
| V-72 | `seed_demo_2026.ts:138-147` | Direct `.insert()` on `transactions` + `receipt_items` with no rollback. Items insert failure orphans transactions | Wrapped in rollback — items fail → transactions deleted. Batches skip on error |
| V-49 | 12 API route files | `process.env.NODE_ENV === 'test' ? handler : withAuth(handler)` — identical guard pattern repeated | Extracted `withTestHandler(handler)` in `src/lib/withTestHandler.ts` |
| V-46 | `neo4j.ts:37`, `rebuild-neo4j-graph.ts:165`, `sync-neo4j:91`, `backfill-neo4j:74` | `merchant-${name.toLowerCase().replace(...)}` merchant ID construction in 4 locations | Extracted `buildMerchantId(name)` to `src/lib/neo4j-ontology.ts` |
| V-48 | `poApproval.ts`, `financeAudit.ts`, `posDiscrepancy.ts` | Near-identical `{ type, outboxId, recipientPhone, tenantId, decision, timestamp }` Zod schemas in 3 files | Extracted `BaseDecisionSchema` to `src/modules/whatsapp/lib/webhook-payloads.ts` |
| V-47 | `sync-neo4j`, `backfill-neo4j`, `rebuild-neo4j-graph` | `ReceiptItemSyncPayload` + `TransactionSyncPayload` construction duplicated across 3 files | Extracted `buildSyncPayload(txRow, items, opts?)` to `src/lib/neo4j-ontology.ts` |
| V-73 | ~33 occurrences across 17 files | `€{Number(x).toFixed(2)}` / `€{x.toLocaleString('en-US', ...)}` — hardcoded currency formatting | Replaced with `formatCurrency(amount, currency?)` from `@/lib/utils` |
| V-37 | `logistics/page.tsx` | "Create PO" and "View History" buttons have no `onClick` — shipped inert | Implemented navigation routing |
| V-54 | `webhook/route.ts` | 4 concerns in one handler: signature verification, outbox resolution, inbox insertion, business action routing | Split into `verifySignature`, `resolveOutbox`, `routeDecision` via `DecisionRouter` |
| V-51 | `scanner-client.ts` | 7 distinct concerns in one large file | Split into domain-specific files (`scanner-cache`, `scanner-ekasa`, `scanner-vision`, etc.) |
| V-55 | `ekasa-protocols.ts` | `switch (status)` for eKasa HTTP error codes — identical logic duplicated in `scanner-client.ts` | Duplication removed; `scanner-client.ts` uses unified errors |
| V-50 | `finance.ts` | `Number(e.amount) \|\| 0` repeated multiple times (also V-69) | Extracted and used `safeAmount(val): number` |
| V-69 | `finance.ts` | `Number(e.amount) \|\| 0` appears 12 times | Fixed via `safeAmount(val)` extraction |
| V-65 | `login/page.tsx` | `useRouter()` without `<Suspense>` boundary | Wrapped consumers in `<Suspense>` |
| V-67 | `UserAvatarToggle.tsx`, `TenantSelector.tsx` | Exported but never imported anywhere | Removed unused file; integrated `TenantSelector.tsx` |
| V-52 | `finance.ts` | God File of 289 lines containing 12+ independent calculation functions | Deconstructed into `filters.ts`, `aggregation.ts`, `margins.ts`, and `forecast.ts` with `finance.ts` acting as a backward-compatible facade |
| V-58 | 3 action services | `DefaultPOApprovalService`, `DefaultFinanceAuditService`, `DefaultPOSDiscrepancyService` threw raw exceptions rather than returning `{ success: false }` | Redefined interfaces and service implementations to return formatted failure objects gracefully (LSP compliant) |
| **C1** | `event-log.ts` | Mixed read (`useEventLog` hook) + write (`recordEvent`) in one file — SRP violation | Split into `event-log.ts` (write) + `event-log-read.ts` (read) |
| **C2** | `event-log-types.ts` | `RecordEventPayload` had optional `tenantId` — server callers had no compile-time enforcement — ISP violation | Split into `BaseEventPayload` + `RecordEventPayload` (no tenantId) + `RecordEventServerPayload` (requires tenantId) |
| **C3** | `event-log.ts`, `event-log-server.ts` | `recordEvent`/`recordEventServer` returned unused `boolean` — all callers ignored it | Changed to `Promise<void>` with `void` call pattern |
| **B1** | `EventTimeline.tsx`, `EventFeed.tsx` | `resolveActorName` duplicated in both components — DRY violation | Extracted to `event-log-display.ts`, both import from shared source |
| **B2a** | `EventTimeline.tsx`, `EventFeed.tsx` | Display registry duplicated as `ACTION_DISPLAY` (label+color) + `ACTION_ICON` — 2 registries | Merged into single `ACTION_DISPLAY` in `event-log-display.ts` with 3 fields per action |
| **A1** | `useTransactionSync.ts` | `ingestion.failed` event never emitted on retry exhaustion | Added `void recordEvent({ action: 'ingestion.failed', ... })` alongside Logger |
| **A3** | `src/lib/utils.ts` | `formatRelativeTime` used `Math.abs(diff)` which stripped sign — future dates incorrectly rendered as past | Changed to `sign = diffMs <= 0 ? 1 : -1` — future dates now show "in N hours" |
| **D1** | `40_event_log.sql` | SQL CHECK constraint on `event_log.action` duplicated TypeScript enforcement | Migration 46 drops the redundant constraint |

---

## Critical (Runtime Risk)

---

## High

None at this time.

---

## Medium

| ID | File | Issue | Fix |
| :--- | :--- | :--- | :--- |
| V-22 | `BentoCard.tsx` | N instances = N resize listeners (unbounded) | Shared `useWindowSize` hook |
| V-35 | `useTransactionFilter.ts` | Dead `limit`, `offset`, `setLimit`, `setOffset` | Remove or implement pagination |
| V-19 | `MonthlyPerformance.tsx` | Calc mixed with rendering (lines 41-56) | Extract pure function |
| V-53 | `BudgetHealth.tsx` | `useEffect` at line 26 makes its own `fetch('/api/ai/forecast')` — component mixes data fetching with rendering | Lift to `useForecast()` hook |
| V-57 | `finance.ts:270-279` | If-else chain for status tiers: `IN_DANGER` → `WARNING` → `STABLE` → `EXCELLENT`. New tier → modify chain | Replace with status threshold map |
| V-56 | `processOutboxQueue.ts:63-70` | `if/else if` on `record.payload.type` (`'text'` vs `'poll'`). New message type → add branch | Replace with payload handler registry |
| V-66 | 10+ candidate components, 0 memoized | Zero `React.memo` usage. `CategoryPill`, `TransactionRow`, `CalendarGrid`, `FilterBar`, `InfoTooltip`, `BrandHeader`, `ProcessingStep`, `BentoCard` are all pure presentational | Add `React.memo` to each |
| V-68 | 429 inline `style={{ }}` occurrences | Pervasive inline styles across 20+ files. Only `ReceiptScanner.tsx` and `NavBar.tsx` use CSS Modules properly | Migrate inline styles to CSS Modules systematically |
| V-44 | 4 components | Missing `React.memo` on presentational components (original V-44, pre-existing) | Add `React.memo` |
| V-26 | 6+ components | `€ + Number(x).toFixed(2)` hardcoded (original V-26, now expanded to V-73) | Shared `formatCurrency()` utility |
| B2b | `event-log-display.ts` | `ACTION_COLORS` object can be derived from `ACTION_DISPLAY` — minor DRY gap | Deferred — 3-field object compact enough, deriving adds runtime overhead |

---

## Low

| ID | File | Issue | Fix |
| :--- | :--- | :--- | :--- |
| V-39 | `ManualEntryModal.tsx`, `ReceiptScanner.tsx` | `document.getElementById` instead of React refs for "add category" input | Shared `useAddCategory` hook with `useRef` |
| V-59 | `finance.ts:3-22` — `Transaction` | 20 fields, 15 optional — fat interface. Every consuming function receives all 20 but uses 2-4 | Split into `TransactionCore`, `TransactionMeta`, `TransactionAudit` |
| V-60 | `useTenant.ts:23-37` — `AppState` | 14 fields passed wholesale to components that only need 1-2 (`ManualEntryModal` only uses `.names` and `.categories`) | Split into `TenantConfig`, `TenantMeta`, `TenantPreferences` |
| V-61 | `webhook/route.ts:120-128` | Hard-coded `new DefaultPOApprovalService(adminClient)` — depends on concretions, not abstractions (DIP) | Inject via service factory |
| V-62 | 3 action services | `constructor(private supabaseClient = supabase)` — defaults to module-level concrete import at load time (DIP) | Accept client via injection only, no default |
| V-63 | `InvoiceManager.tsx:4` | Directly imports `supabase` from `@/lib/supabase` and calls it inline (lines 29-35) | Accept data/callbacks via props |
| V-64 | `ReceiptScanner.tsx:57` | `new Html5QrcodeScanner(...)` instantiated directly inside `ScanStep` — no interface abstraction for scanner hardware | Accept scanner factory via prop or DI |
| V-70b | `rebuild-neo4j-graph.ts:83-95` | Bulk insert with batch fallback — no transaction wrapping | Wrap batch in Supabase transaction |
| D2 | `event_log` RPC params | Same `tenant_id` param named differently across event action RPCs (`p_tenant_id` vs `p_tenant`) | Accepted — minor inconsistency, not worth breaking change |
| C4 | `event-log.ts`, `event-log-server.ts` | No abstraction interface between Logger and ServerLogger | Accepted — only 4 call sites, stable dependency, interface adds no value |

---

## Accepted (Deferred)

| ID | File | Issue | Reasoning |
| :--- | :--- | :--- | :--- |
| V-28 | `logger.ts` | Direct `supabase.from('system_telemetry').insert()` | Fire-and-forget; RPC overhead not worth it |
| V-29 | `logger-server.ts` | Direct `supabase.from('activity_log').insert()` | Append-only audit tables; no security benefit from RPC |

---

## Audit Scan Results

**Type Safety:** 0 `:any` remaining in production code. 0 `z.any()`. 0 `@ts-ignore`. 0 `@ts-expect-error`. 61 `as any` casts in test files only.

**ACID:** 0 direct DML bypasses remain in production code (V-70, W-03, V-72 fixed). 2 deferred (V-28, V-29).

**Security:** All 17 API routes secured. 6 without `withAuth` use documented alternative auth (HMAC, API key, cron secret). No `localStorage` outside OfflineQueue.

**SOLID:** 16 issues → 13 after Phase 5 (C1 SRP, C2 ISP fixed). Top SRP: `finance.ts` (289 lines, 12 functions). Top OCP: `enablebanking` 5-action switch, `triggerWorkflow.ts` dual chains.

**DRY:** 3 issues → 1 after Phase 5 (B1, B2a fixed). Residual: B2b — ACTION_COLORS derivation from ACTION_DISPLAY (deferred).

**Observability:** All API routes have `ServerLogger`. Health endpoint intentionally surfaces errors in HTTP response — acceptable. `ingestion.failed` event now emitted on retry exhaustion (A1 fix).

**React Hygiene:** 1 missing Suspense boundary (`ProfileMenu.tsx` usage of `useRouter` is safe without params but noted). 429 inline style objects. 0 `React.memo` used. 0 dead exports. 0 missing `useEffect` cleanups.

---

## Verified Contracts (15/15)

| Contract | File | Status |
| :--- | :--- | :--- |
| NavBar SRP | `NavBar.test.tsx` | ✅ |
| ExpenseList SRP (useSwipeable) | `useSwipeable.test.ts` | ✅ |
| ExpenseList SRP (useCalendarGrid) | `useCalendarGrid.test.ts` | ✅ |
| ReceiptScanner SRP (useCamera) | `useCamera.test.ts` | ✅ |
| Financial ACID (O(N)) | `finance.test.ts` | ✅ |
| API Validation | `schemas.test.ts` | ✅ |
| eKasa Timeout | `ekasa/route.test.ts` | ✅ |
| WhatsApp Inbound Webhook | `whatsapp.test.ts` | ✅ |
| WhatsApp Outbox Queue (dual-path) | `processOutboxQueue` | ✅ |
| WhatsApp dispatchDecision (RPC) | `dispatchDecision.test.ts` | ✅ |
| WhatsApp Notify API Gateway | `notify/route.test.ts` | ✅ |
| WhatsApp Sidecar | `sidecar.test.ts` | ✅ |
| WhatsApp OpenWAClient | `client.test.ts` | ✅ |
| DB Security (live catalog) | `db-security.test.ts` | ✅ |
| Groq AI Client | `groq.test.ts` | ✅ |
