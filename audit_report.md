# Synculariti-ET: Full Audit Report

**Last Update:** 2026-05-27
**Deep-dive:** Full codebase scan covering type safety, ACID, security, SOLID, DRY, observability, dead code, React hygiene.

---

## Fixed (W-01, V-34, V-38, V-45, V-71, W-02, V-70, W-03, V-72)

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

---

## Critical (Runtime Risk)

| ID | File | Issue | Fix |
| :--- | :--- | :--- | :--- |
| V-37 | `logistics/page.tsx` | "Create PO" and "View History" buttons have no `onClick` — shipped inert | Implement navigation or remove buttons |

---

## High

| ID | File | Issue | Fix |
| :--- | :--- | :--- | :--- |
| V-73 | 44 matches across 18 files | `€{Number(x).toFixed(2)}` — hardcoded currency format. Extends V-26 to 44 occurrences | Shared `formatCurrency(amount, currency?)` utility |
| V-46 | 4 occurrences | `merchant-${name.toLowerCase().replace(...)}` merchant ID construction in `neo4j.ts:37`, `rebuild-neo4j-graph.ts:165`, `sync-neo4j:91`, `backfill-neo4j:74` | Extract `buildMerchantId(name): string` |
| V-47 | 3 blocks, 3 files | `ReceiptItemSyncPayload` + `TransactionSyncPayload` construction duplicated across `sync-neo4j`, `backfill-neo4j`, `rebuild-neo4j-graph` | Extract `buildSyncPayload(tx, items)` shared function |
| V-48 | 3 files | Near-identical `{ type, outboxId, recipientPhone, tenantId, decision, timestamp }` interfaces in `poApproval.ts`, `financeAudit.ts`, `posDiscrepancy.ts` | Extract shared `WebhookDecisionPayload` type |
| V-49 | 12 occurrences | `process.env.NODE_ENV === 'test' ? handler : withAuth(handler)` — identical guard pattern in every API route | Extract `withTestHandler(handler)` helper |
| V-54 | `webhook/route.ts` (159 lines) | 4 concerns in one handler: signature verification, outbox resolution (3 strategies), inbox insertion, business action routing | Split into `verifySignature`, `resolveOutbox`, `routeDecision` |

---

## Medium

| ID | File | Issue | Fix |
| :--- | :--- | :--- | :--- |
| V-22 | `BentoCard.tsx` | N instances = N resize listeners (unbounded) | Shared `useWindowSize` hook |
| V-35 | `useTransactionFilter.ts` | Dead `limit`, `offset`, `setLimit`, `setOffset` | Remove or implement pagination |
| V-19 | `MonthlyPerformance.tsx` | Calc mixed with rendering (lines 41-56) | Extract pure function |
| V-50 | `finance.ts` | `Number(e.amount) \|\| 0` repeated 12 times in 289-line mono-utility file | Extract `safeAmount(val): number` |
| V-51 | `scanner-client.ts` (317 lines) | 7 distinct concerns: hashing, base64, fetch wrapper, router, eKasa processing, raw gov extraction, AI vision, image preprocessing, confidence scoring, cache | Split into `hash-utils.ts`, `scanner-router.ts`, `ekasa-client.ts`, `vision-client.ts` |
| V-52 | `finance.ts` (289 lines) | 12+ independent calculation functions in one file: `isSavings`, `isAdjustment`, `calcTotals`, `calcForecast`, `calcPerUserSpend`, `calcNetSavings`, `calcBudgetStatus`, `calcMonthDelta`, `calcCategoryTotals`, `normalizeUserId`, `calcOperatingMargin`, `calcTimeBoundForecast` | Split into `filters.ts`, `aggregation.ts`, `forecast.ts`, `margins.ts` |
| V-53 | `BudgetHealth.tsx` | `useEffect` at line 26 makes its own `fetch('/api/ai/forecast')` — component mixes data fetching with rendering | Lift to `useForecast()` hook |
| V-57 | `finance.ts:270-279` | If-else chain for status tiers: `IN_DANGER` → `WARNING` → `STABLE` → `EXCELLENT`. New tier → modify chain | Replace with status threshold map |
| V-55 | `ekasa-protocols.ts:68-79` | `switch (status)` for eKasa HTTP error codes — identical logic to `scanner-client.ts:91-98` (also a DRY violation) | Extract shared `parseEkasaStatus(status, detail)` |
| V-56 | `processOutboxQueue.ts:63-70` | `if/else if` on `record.payload.type` (`'text'` vs `'poll'`). New message type → add branch | Replace with payload handler registry |
| V-58 | 3 action services | `DefaultPOApprovalService`, `DefaultFinanceAuditService`, `DefaultPOSDiscrepancyService` all throw `new Error('Invalid decision')` outside declared return contract `{ success, resolution }`. Callers must know about throw to handle it (LSP) | Return `{ success: false, resolution: 'Invalid decision' }` instead of throwing |
| V-65 | `ProfileMenu.tsx:16`, `login/page.tsx:12` | `useRouter()` without `<Suspense>` boundary — can trigger Next.js static bailout | Wrap consumers in `<Suspense>` |
| V-66 | 10+ candidate components, 0 memoized | Zero `React.memo` usage. `CategoryPill`, `TransactionRow`, `CalendarGrid`, `FilterBar`, `InfoTooltip`, `BrandHeader`, `UserAvatarToggle`, `ProcessingStep`, `BentoCard` are all pure presentational | Add `React.memo` to each |
| V-67 | `UserAvatarToggle.tsx`, `TenantSelector.tsx` | Exported but never imported anywhere in codebase | Remove or integrate |
| V-68 | 429 inline `style={{ }}` occurrences | Pervasive inline styles across 20+ files. Only `ReceiptScanner.tsx` and `NavBar.tsx` use CSS Modules properly | Migrate inline styles to CSS Modules systematically |
| V-44 | 4 components | Missing `React.memo` on presentational components (original V-44, pre-existing) | Add `React.memo` |
| V-26 | 6+ components | `€ + Number(x).toFixed(2)` hardcoded (original V-26, now expanded to V-73) | Shared `formatCurrency()` utility |

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
| V-69 | `finance.ts` | `Number(e.amount) \|\| 0` appears 12 times across 289-line file | Extract `safeAmount(val): number` |
| V-70b | `rebuild-neo4j-graph.ts:83-95` | Bulk insert with batch fallback — no transaction wrapping | Wrap batch in Supabase transaction |

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

**SOLID:** 18 issues (7 SRP, 8 OCP, 3 LSP, 3 ISP, 5 DIP). Top SRP: `scanner-client.ts` (317 lines, 7 concerns), `finance.ts` (289 lines, 12 functions). Top OCP: `webhook/route.ts` decision routing chain, `enablebanking` 5-action switch, `triggerWorkflow.ts` dual chains.

**DRY:** 11 issues. Top: `process.env.NODE_ENV === 'test'` guard (12 occurrences), merchant ID construction (4 occurrences), sync payload construction (3 near-identical blocks).

**Observability:** All API routes have `ServerLogger`. Health endpoint intentionally surfaces errors in HTTP response — acceptable.

**React Hygiene:** 2 missing Suspense boundaries. 429 inline style objects. 0 `React.memo` used. 2 dead exports. 0 missing `useEffect` cleanups.

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
