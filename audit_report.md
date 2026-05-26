# Synculariti-ET: Current System Audit & Backlog

**Status:** Infrastructure hardened (partial). **37 open issues** — ordered and batched below.
**Last Update:** 2026-05-26 (Phase 5: ACID Hardening & Production Bugfix)

> **Agent Assessment:** I have reviewed the entirety of this audit report. I fully **AGREE** with the assessment of the issues and the vast majority of the proposed solutions. The focus on Test Integrity, Type Safety, and Observability aligns perfectly with the "Business-Grade Determinism" core tenet. I have noted one minor architectural adjustment for V-02 below, but otherwise endorse this roadmap completely.

---

## WhatsApp Module — Phase 4 Findings (2026-05-25)

These issues were discovered and **resolved** during the Phase 4 cleanup of the WhatsApp Chunk 4 implementation.

| ID | Principle | Location | Severity | Finding | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| W-01 | **DRY** | `dispatchDecision.ts` + `sidecar.ts::WebhookDispatcher` | 🔴 HIGH | `signPayload` was implemented verbatim in two places — identical HMAC-SHA256 algorithm with no shared source of truth. A single algorithm change would require two coordinated updates. | ✅ **Fixed** — Extracted to `signHmacPayload()` in `@synculariti/whatsapp-client/hmac.ts`. Both consumers now import from the single canonical source. |
| W-02 | **Type Safety** | `dispatchDecision.ts` lines 41, 46 | 🔴 HIGH | `options: any` in Supabase cookie adapter callbacks — broke the zero-`:any` contract introduced in Sprint 2. | ✅ **Fixed** — Replaced with `CookieOptions` from `@supabase/ssr`. |
| W-03 | **Type Safety** | `sidecar.ts::dispatchSecureEvent` line 85 | 🔴 HIGH | `payload: any` — the method accepted untyped payloads, defeating runtime safety. | ✅ **Fixed** — Replaced with `Record<string, unknown>`. |
| W-04 | **Observability** | `supabase/functions/process-outbox/handler.ts` line 63 | 🟡 MEDIUM | `console.error(...)` used inside the Edge Function — violates the "Logger, not console" rule and makes failures invisible in production observability. | ✅ **Fixed** — Replaced with structured error metadata written into the `processed_at` field of the outbox update, keeping failures observable at the DB layer. |
| W-05 | **ACID** | `dispatchDecision.ts` — webhook dispatch before DB update | 🟡 MEDIUM | Split-brain risk: if the webhook fires successfully but the subsequent `UPDATE` to set `COMPLETED` fails (network partition, timeout), the outbox record stays `PENDING` and the action link can be submitted again, causing duplicate webhook delivery. | ⚠️ **Documented / Deferred** — A comment is added in the code. Full fix requires a Postgres RPC that atomically marks `COMPLETED` and returns the payload for the caller to dispatch. Tracked as **V-49** below. |

## WhatsApp Module — Phase 5 Findings (2026-05-26)

Issues discovered and **resolved** during the ACID hardening and production debugging of the WhatsApp action link flow.

| ID | Principle | Location | Severity | Finding | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| W-06 | **SQL Naming** | `complete_whatsapp_action_v1.sql` | 🔴 HIGH | Function declared `RETURNS TABLE (status TEXT, ...)` creating an output column named `status`. The `UPDATE ... RETURNING status` was ambiguous — PostgreSQL couldn't tell if `status` referred to `whatsapp_outbox.status` (table) or the `RETURNS TABLE` output column. Caused silent failure: RPC returned no rows, server action reported "not found". | ✅ **Fixed** — Qualified all RETURNING columns with table alias `wo.` (e.g., `RETURNING wo.status, ...`). |
| W-07 | **DRY** | `dispatchDecision.ts` vs `supabase-server.ts` | 🟡 MEDIUM | The Supabase SSR client creation (cookie handling with `getAll`/`setAll`) was duplicated verbatim in `dispatchDecision.ts`. | ✅ **Fixed** — Now imports `createClient()` from `@/lib/supabase-server`. |
| W-08 | **Documentation** | `AGENTS.md` §6.6 | 🟡 MEDIUM | Three documentation divergences from production reality: (1) Route runtime says "MUST enforce `runtime = 'edge'`" but process-outbox and cron routes must use Serverless (Edge blocks direct IP fetches); (2) Safety net says "Vercel Cron" but Hobby plan doesn't support it — actual deployment uses GCP crontab; (3) Cookie handling documented as `get`/`set`/`remove` but actual code uses `getAll`/`setAll`. | ✅ **Fixed** — AGENTS.md updated to match actual architecture. |
| W-09 | **Security** | RPC grants on `complete_whatsapp_action_v1`, `claim_whatsapp_outbox_batch` | 🟡 MEDIUM | Both RPCs granted `EXECUTE TO anon` — but one is called by authenticated user sessions and the other by service_role processing routes. The `anon` role should never have access to these functions. | ✅ **Fixed** — `complete_whatsapp_action_v1` → `authenticated`, `claim_whatsapp_outbox_batch` → `service_role`. Table-level `GRANT ALL TO anon` revoked on `api_keys`, `whatsapp_outbox`, `whatsapp_inbox`. |

### Fixed Backlog Item (formerly Sprint 8):

| ID | Severity | Principle | Location | Issue | Solution | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| V-49 | 🟡 MEDIUM | **ACID** | `dispatchDecision.ts` | Split-brain between webhook delivery and DB status update. | Created `complete_whatsapp_action_v1()` RPC that atomically marks `COMPLETED` and returns `webhook_url` + `webhook_secret`. Server Action dispatches the webhook *after* the atomic update. | ✅ **Fixed** |

---

## Project-Wide Violation Counts (as of 2026-05-26)

| Principle | Pre-WhatsApp | WhatsApp Introduced | WhatsApp Fixed | **Current Open** |
| :--- | :--- | :--- | :--- | :--- |
| **DRY** | 7 | 1 | 1 | **7** |
| **ACID** | 0 | 1 | 1 | **0** ✅ |
| **SOLID** | 8 | 0 | 0 | **8** |
| **Type Safety (`:any`)** | 9 | 2 | 2 | **9** |
| **Observability** | 7 | 1 | 1 | **7** |

> Phase 5 introduced **4 new violations** and resolved **all 4** of them. The ACID split-brain (V-49) is fully resolved. All documentation regressions (W-08) corrected. DRY cookie duplication (W-07) fixed via shared import.

---

## Sprint Roadmap

### Sprint 1: Fix the Lies (Tests That Pass Vacuously)

These are the highest priority because they provide false confidence — CI passes but the tests don't actually validate anything.

| ID | Severity | Principle | Location | Solution |
| :--- | :--- | :--- | :--- | :--- |
| V-01 | 🔴 CRITICAL | Test Integrity | `groq.test.ts` | **Partially fixed** — now mocks `global.fetch` correctly (line 4). One error message still uses substring match (`'GROQ_API_KEY is not configured'` vs actual `'GROQ_API_KEY is not configured in environment'`). Works via substring but should be exact. Tighten the expected message to match the implementation. |
| V-02 | 🔴 CRITICAL | Test Integrity | `db-security.test.ts` | Replace hardcoded mock with real queries against `information_schema.routines` via Supabase MCP or a dedicated integration test with a test DB.<br><br>**Agent Alternate Proposal:** Supabase MCP is an agent tool, not a Node package, so Jest cannot use it. Instead, the Jest test should either use the `pg` package to connect directly to the test DB, or we should create a secure Supabase RPC (e.g., `get_function_security_state`) that the test can call via the `@supabase/supabase-js` service-role client. |

### Sprint 2: Type Safety Lockdown

Fix all `: any` / `z.any()` escapes. These block strict TypeScript enforcement and have caused prior regressions.

| ID | Severity | Location | Line(s) | Current | Solution |
| :--- | :--- | :--- | :--- | :--- | :--- |
| V-03 | 🔴 HIGH | `ekasa-parser.ts` | 22-23, 37-39 | `receipt?: any`, `items?: any[]` | Replace with `Record<string, unknown>` as a starting point; gradually build discriminated unions for known Slovak Gov API shapes. |
| V-04 | 🔴 HIGH | `groq.ts` | 5 | `content: string \| any[]` | Replace with `content: string \| GroqVisionContent[]` where `GroqVisionContent = { type: 'text'; text: string } \| { type: 'image_url'; image_url: { url: string } }`. |
| V-05 | 🔴 HIGH | `withAuth.ts` | 17 | `params: Promise<any>` | Replace with `params: Promise<Record<string, string \| string[] \| undefined>>` — matches Next.js App Router convention. |
| V-06 | 🔴 HIGH | `validations/schemas.ts` | 70, 93, 108 | `z.any()` in 3 schemas | Replace with `z.unknown()` (forces consumer-side validation) or `z.record(z.unknown())`. Add a lint rule banning `z.any()`. |
| V-07 | 🔴 HIGH | `test-utils.ts` | 17 | `as any` on mocked User | Build a proper object matching Supabase's `User` type (only ~5 required fields). |
| V-08 | 🔴 HIGH | `db-security.test.ts` | 8 | `Record<string, any>` | Use the existing `FunctionSecurityRequirement` interface directly. |
| V-45 | 🔴 HIGH | `groq/route.ts` | 8 | `user: { email: 'test@example.com' } as any` (auth fallback) | Replace with proper `User` object or use non-null assertion since `withAuth` guarantees auth exists. Pattern: `context.auth!`. |
| V-46 | 🔴 HIGH | `enablebanking/route.ts` | 23 | `user: { email: 'test@example.com' } as any` (auth fallback) | Same fix as V-45. Since all routes using this pattern are wrapped in `withAuth`, use `context.auth!` instead of the `||` fallback. |
| V-47 | 🔴 HIGH | `enablebanking/route.ts` | 97 | `(await response.json()) as any` (upstream response) | Replace with `z.unknown().parse()` or a specific Zod schema for the Enable Banking response shape. Add a `Record<string, unknown>` intermediate cast as a stepping stone. |
| V-48 | 🔴 HIGH | `ai/parse-invoice/route.ts` | 11 | `user: { email: 'test@example.com' } as any` (auth fallback) | Same fix as V-45/V-46. Replace fallback with `context.auth!` — `withAuth` guarantees resolution. |

### Sprint 3: Observability Blind Spots

Every API route must log via ServerLogger. These are currently silent — if they fail in production, there's no trace.

| ID | Severity | Location | Issue | Solution |
| :--- | :--- | :--- | :--- | :--- |
| V-09 | 🔴 HIGH | `export/route.ts` | Zero logging | Add `ServerLogger.system()` for request start + completion. |
| V-10 | 🔴 HIGH | `ai/insight/route.ts` | Zero logging | Add `ServerLogger.system()` — especially important for AI API errors. |
| V-11 | 🔴 HIGH | `ai/statement/route.ts` | Zero logging | Add `ServerLogger.system()`. |
| V-12 | 🔴 HIGH | `ai/forecast/route.ts` | Zero logging | Add `ServerLogger.system()`. |
| V-13 | 🔴 HIGH | `ekasa/route.ts` | Zero logging + `context` not destructured | Add `ServerLogger.system()`. Also fix the handler signature to destructure `context` so `tenantId` is available for the audit trail. |
| V-14 | 🟡 MEDIUM | `auth/pin/route.ts` | 2 unawaited `ServerLogger` calls (lines 46, 149) | Add `await`. |
| V-15 | 🟡 MEDIUM | `ai/parse-receipt/route.ts` | Unawaited `ServerLogger` (line 77) | Add `await`. |
| V-17 | 🟡 MEDIUM | `settings/page.tsx` | Uses `alert()` for success/error feedback (lines 34-36) | Replace with `Logger.user()` + component-level message state (the component already has a `message` pattern). |

### Sprint 4: Security Hotfixes

Small, targeted fixes with security impact. No architectural changes needed.

| ID | Severity | Location | Issue | Solution |
| :--- | :--- | :--- | :--- | :--- |
| V-30 | 🟡 MEDIUM | `health/route.ts` | Neo4j session not closed on error path (resource leak) | Wrap `session.run()` in try/catch with `finally { await session.close() }`. |
| V-31 | 🟡 MEDIUM | `ekasa/route.ts` | `TIMEOUT_TRIGGER` magic string shipping in prod (line 31) | Gate with `if (process.env.NODE_ENV === 'test')` or remove and use jest mocking instead. |
| V-36 | 🟡 MEDIUM | `settings/page.tsx` | Unsafe `(e as Error).message` cast (line 35) | Replace with proper `e instanceof Error` narrowing (login/page.tsx does this correctly). |
| V-32 | 🟡 MEDIUM | `ItemAnalytics.tsx` | `tenantId` passed as prop (line 29) — violates "never passed as param" rule | Remove the prop; RLS already enforces tenant isolation on the `supabase.from().select()`. |

### Sprint 5: SOLID Refactoring (Architecture Debt)

| ID | Severity | Location | Issue | Solution |
| :--- | :--- | :--- | :--- | :--- |
| V-18 | 🟡 MEDIUM | `page.tsx` (Dashboard) | 251-line God Component doing auth, data, modals, demo mode, 13+ renders | Split into: (1) `DashboardContent` orchestrator (~60 lines), (2) `DemoDataProvider` extracted to `@/lib/demo-data.ts`, (3) explicit `isDemo` flag from tenant config, not inferred from empty transactions. |
| V-19 | 🟡 MEDIUM | `MonthlyPerformance.tsx` | Category comparison calculation (lines 39-54) mixed with rendering | Extract pure function to `lib/finance.ts` for testability. |
| V-20 | 🟡 MEDIUM | `FinanceCharts.tsx` | Business logic filtering ("Adjustment" exclusion, line 77) in a UI component | Lift filtering to the hook layer that feeds data to the chart. |
| V-21 | 🟡 MEDIUM | `enablebanking/route.ts` | 5-action switch statement in single handler (SRP + OCP) | Keep single file but extract each action to a named function (`handleInstitutions`, `handleStartSession`, etc.). Switch dispatches to the correct one. |
| V-22 | 🟡 MEDIUM | `BentoCard.tsx` | Each instance creates its own `resize` listener (N listeners) | Extract to shared `useWindowSize` hook with a single event listener. |
| V-37 | 🟡 MEDIUM | `logistics/page.tsx` | "Create PO" button has no `onClick` (inert) + "View History" also inert | Either implement the onClick (navigate to a PO creation flow) or remove the buttons. |

### Sprint 6: DRY Consolidation

| ID | Severity | Location | Issue | Solution |
| :--- | :--- | :--- | :--- | :--- |
| V-23 | 🟡 MEDIUM | `debug/backfill-neo4j/route.ts` + `debug/sync-neo4j/route.ts` | Two near-identical files (same handler, same admin check, same TODO placeholder) | Consolidate to `debug/neo4j/route.ts?action=sync\|backfill`. |
| V-24 | 🟡 MEDIUM | `ai/parse-invoice/route.ts` + `ai/statement/route.ts` | Markdown JSON cleanup logic duplicated verbatim | Extract `cleanMarkdownJsonBlock(input: string): string` to `@/lib/utils.ts`. |
| V-25 | 🟡 MEDIUM | `InvoiceManager.tsx` + `ChartOfAccounts.tsx` | Near-identical fetch/render/error patterns | Extract shared fetch logic to `useTableQuery(tableName: string)` hook. Leave rendering inline (columns differ). |
| V-26 | 🟡 MEDIUM | 6+ finance components | `€ + Number(x).toFixed(2)` hardcoded everywhere | Add `formatCurrency(amount: number, currency?: string)` to `@/lib/utils.ts`. |
| V-38 | 🟢 LOW | `useTransactionSync.ts` | Duplicate offline check pattern (`typeof navigator !== 'undefined' && !navigator.onLine`) | Extract to `isOffline()` helper in `@/lib/utils.ts` — but borderline, 2 occurrences may not justify abstraction. |
| V-39 | 🟢 LOW | `ManualEntryModal.tsx` + `ReceiptScanner.tsx` | `document.getElementById('scanner-new-cat')` pattern duplicated | Extract to `useAddCategory` hook using refs instead of direct DOM access. |

### Sprint 7: Architecture Compliance

| ID | Severity | Location | Issue | Solution |
| :--- | :--- | :--- | :--- | :--- |
| V-33 | 🟡 MEDIUM | `CalendarGrid.tsx` | Uses local `selectedDay` state instead of `useNavigation` URL params | Replace with URL-based selection via `useNavigation().setModule('/?day=...')`. |
| V-34 | 🟡 MEDIUM | `MobileBottomNav.tsx` | Uses `usePathname()` without `<Suspense>` boundary | Wrap content consuming the hook in `<Suspense>`. |
| V-35 | 🟡 MEDIUM | `useTransactionFilter.ts` | `limit`, `offset`, `setLimit`, `setOffset` declared but never consumed | Remove dead pagination state, or implement actual pagination on the filtered results. |
| V-44 | 🟢 LOW | `BentoCard.tsx`, `CategoryPill.tsx`, `InfoTooltip.tsx`, `BrandHeader.tsx` | Missing `React.memo` on stable presentational components; N resize listeners | Add `React.memo` to pure presentational components. Deduplicate resize listeners via shared `useWindowSize` hook. |

### Sprint 8: WhatsApp ACID Hardening ✅ (Completed)

| ID | Severity | Principle | Location | Issue | Solution | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| V-49 | 🟡 MEDIUM | **ACID** | `dispatchDecision.ts` | Split-brain between webhook delivery and DB status update. | Created `complete_whatsapp_action_v1()` RPC for atomic COMPLETED + webhook config return. | ✅ **Fixed** |

### Sprint 9: Cleanup

| ID | Severity | Location | Issue | Solution |
| :--- | :--- | :--- | :--- | :--- |
| V-27 | 🟢 LOW | `page.module.css` | 142 lines of unused CSS (orphaned Next.js scaffolding) | Delete the file. It has zero references in `page.tsx`. |
| V-40 | 🟢 LOW | `MarketTrends.tsx` | `isDemo` prop declared in types but never used in component body | Remove from type definition. |
| V-41 | 🟢 LOW | `StatementScanner.tsx` | `AppState` import never used | Remove the import. |
| V-42 | 🟢 LOW | `ItemCatalog.tsx` | `categories` prop declared but never referenced | Remove from props or implement showing category names in the table. |
| V-43 | 🟢 LOW | `IdentityGate.tsx` | `supabase` import never used | Remove the import. |

### Deferred (Low Priority)

| ID | Severity | Location | Issue | Reasoning |
| :--- | :--- | :--- | :--- | :--- |
| V-28 | 🟡 MEDIUM | `logger.ts` | Direct `supabase.from('system_telemetry').insert()` | **Accepted as-is.** The Logger is fire-and-forget telemetry, not business data. Creating RPCs for every telemetry table adds maintenance burden. Document an exception in RULES.md instead. |
| V-29 | 🟡 MEDIUM | `logger-server.ts` | Direct `supabase.from('activity_log').insert()` via service-role key | **Same as above.** These are append-only audit tables. RPCs would add ceremony without security benefit. |

---

## Verified Contracts (Passing)

| Contract | File | Status |
| :--- | :--- | :--- |
| NavBar SRP (Hollow Shell) | `NavBar.test.tsx` | ✅ |
| ExpenseList SRP (useSwipeable) | `useSwipeable.test.ts` | ✅ |
| ExpenseList SRP (useCalendarGrid) | `useCalendarGrid.test.ts` | ✅ |
| ReceiptScanner SRP (useCamera) | `useCamera.test.ts` | ✅ |
| Financial ACID (O(N)) | `finance.test.ts` | ✅ |
| API Validation | `schemas.test.ts` | ✅ |
| eKasa Timeout | `ekasa/route.test.ts` | ✅ |
| WhatsApp Inbound Webhook | `whatsapp.test.ts` | ✅ |
| WhatsApp Outbox Queue Processor | `processOutboxQueue` (dual-path) | ✅ |
| WhatsApp dispatchDecision (RPC-based) | `dispatchDecision.test.ts` | ✅ |
| WhatsApp Notify API Gateway | `notify/route.test.ts` | ✅ |
| WhatsApp Sidecar (SessionCache + WebhookDispatcher) | `sidecar.test.ts` | ✅ |
| WhatsApp OpenWAClient (sendText + sendPoll) | `client.test.ts` | ✅ |

## Broken Contracts (Sprint 1 Completed 🟢)

All Sprint 1 test integrity issues are now fully resolved, verified, and passing!

| Contract | File | Status | Description |
| :--- | :--- | :--- | :--- |
| DB Security | `db-security.test.ts` | ✅ **Resolved (GREEN)** | Connects to live database, calling the `get_function_security_state` catalog RPC to assert strict search_path and EXECUTE revocation. Dropped legacy landmine functions. |
| Groq AI Client | `groq.test.ts` | ✅ **Resolved (GREEN)** | Connects exact, character-perfect string constants (`GROQ_ERRORS.MISSING_API_KEY` and `GROQ_ERRORS.EMPTY_RESPONSE`) using precise assertions. |
