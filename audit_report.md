# Synculariti-ET: Full Audit Report

**Last Update:** 2026-05-27
**Deep-dive:** Full codebase scan covering type safety, ACID, security, SOLID, DRY, observability, dead code, React hygiene.

---

## Fixed (W-01, V-34, V-38)

| ID | File | Issue | Fix Applied |
| :--- | :--- | :--- | :--- |
| W-01 | `webhook/route.ts:39` | Used session-based `createClient()` in HMAC-authenticated Edge route — no browser cookies exist in sidecar webhook POST → anon role → RLS blocked all outbox queries. `getAdminClient()` already existed but was only used post-resolution. | Replaced `createClient()` with `getAdminClient()` (service-role). Updated test mock from `@/lib/supabase-server` to `@supabase/supabase-js`. |
| V-34 | `MobileBottomNav.tsx` | Uses `usePathname()` without `<Suspense>` boundary — Next.js can throw on client navigation | Split into `MobileBottomNavContent` (consumes hook) wrapped in `<Suspense>` by `MobileBottomNav` shell. |
| V-38 | `useTransactionSync.ts:36,80` + `scanner-client.ts:276` | `typeof navigator !== 'undefined' && !navigator.onLine` repeated 3x across 2 files | Extracted `OfflineQueue.isOffline()` static method. All 3 call sites updated. |

---

## Critical (Runtime Risk)

| ID | File | Issue | Fix |
| :--- | :--- | :--- | :--- |
| V-37 | `logistics/page.tsx` | "Create PO" and "View History" buttons have no `onClick` — shipped inert | Either implement navigation or remove the buttons. |

## High

| ID | File | Issue | Fix |
| :--- | :--- | :--- | :--- |
| W-02 | `webhook/route.ts:43` | `let outboxRecord: any = null` — only `: any` remaining in production code | Type as `whatsapp_outbox` row interface (e.g. `OutboxRecord \| null`). |
| W-03 | `notifyLargeInvoice.ts:56` | Direct `supabase.from('whatsapp_outbox').insert({...})` instead of RPC. Also uses legacy `get(name)` cookie API without `getAll()`/`setAll()` (line 31) — breaks for chunked JWT cookies. | Use an RPC (`insert_whatsapp_outbox_v1`) for the insert. Migrate to `getAll()`/`setAll()` cookie pattern. |
| V-18 | `page.tsx` (Dashboard) | `DashboardContent` ~215 lines handling auth, data fetching, modals, demo mode, 13+ renders | Split orchestrator, extract `DemoDataProvider`, explicit `isDemo` flag from tenant config. |
| V-23 | `backfill-neo4j` + `sync-neo4j` | Two ~150-line files with near-identical structure | Consolidate to single param-driven route. |
| V-21 | `enablebanking/route.ts` | 5-action switch in one handler (SRP + OCP) | Extract each action to a named function; switch dispatches. |
| V-20 | `FinanceCharts.tsx` | "Adjustment" filtering inline in chart component | Lift filtering to hook layer. |
| W-04 | `useStatementScanner.ts` | 251-line hook mixing file parsing, chunked AI processing, reconciliation, and state machine (SRP) | Split into `useFileParser`, `useStatementAI`, `useReconciliation`. |
| W-05 | `InvoiceManager.tsx` | `switch (status)` at line 44 (OCP). Also `tenantId` passed as prop (same violation as V-32). | Replace switch with strategy map. Remove `tenantId` prop (RLS handles isolation). |

## Medium

| ID | File | Issue | Fix |
| :--- | :--- | :--- | :--- |
| V-22 | `BentoCard.tsx` | N instances = N resize listeners (unbounded) | Shared `useWindowSize` hook. |
| V-26 | 6+ components | `€ + Number(x).toFixed(2)` hardcoded | `formatCurrency()` utility. |
| V-35 | `useTransactionFilter.ts` | Dead `limit`, `offset`, `setLimit`, `setOffset` | Remove or implement pagination. |
| V-19 | `MonthlyPerformance.tsx` | Calc mixed with rendering (lines 41-56) | Extract pure function. |
| V-44 | 4 components | Missing `React.memo` on presentational components | Add `React.memo`. |

## Low

| ID | File | Issue | Fix |
| :--- | :--- | :--- | :--- |
| V-39 | `ManualEntryModal.tsx` + `ReceiptScanner.tsx` | `document.getElementById` instead of React refs | Shared `useAddCategory` hook. |

## Accepted (Deferred)

| ID | File | Issue | Reasoning |
| :--- | :--- | :--- | :--- |
| V-28 | `logger.ts` | Direct `supabase.from('system_telemetry').insert()` | Fire-and-forget; RPC overhead not worth it. |
| V-29 | `logger-server.ts` | Direct `supabase.from('activity_log').insert()` | Append-only audit tables; no security benefit from RPC. |

---

## Audit Scan Results

**Type Safety:** 1 `: any` remaining in production code (W-02). 0 `z.any()`. 0 `@ts-ignore`. 0 `@ts-expect-error`. Original 10 Sprint 2 violations all verified as fixed. V-34 (Runtime) fixed via Suspense wrapper.

**ACID:** W-03 is the only direct DML bypass in production code (besides deferred V-28/V-29). All ledger mutations use RPCs. No direct `update`/`delete` calls found.

**Security:** All 17 API routes secured. 6 without `withAuth` have alternative auth (HMAC, API key, cron secret, service-role). W-01 (wrong client type) was the only bug — fixed.

**SOLID:** 10 issues (5 original + 5 new W-02 through W-05). Switch statements found in 3 production files (`enablebanking`, `InvoiceManager`, `ekasa-protocols` — error mapper is acceptable).

**DRY:** 3 issues (V-23, V-26, V-39). `formatCurrency` missing, `getElementById` duplicated, Neo4j sync routes near-identical. V-38 (offline check) fixed via `OfflineQueue.isOffline()`.

**Observability:** All API routes have `ServerLogger`. Health endpoint catches without logger intentionally surface errors in HTTP response — acceptable. Utility libs let errors propagate to caller — correct by design.

**Dead Code / React Hygiene:** Clean. No orphaned files in `src/`. All `useEffect` hooks have cleanup returns or empty deps.

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
