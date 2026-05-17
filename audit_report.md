# Synculariti-ET: Current System Audit & Backlog

**Status:** Infrastructure hardened (partial). 37 open issues — ordered and batched below.
**Last Update:** 2026-05-16

> **Agent Assessment:** I have reviewed the entirety of this audit report. I fully **AGREE** with the assessment of the issues and the vast majority of the proposed solutions. The focus on Test Integrity, Type Safety, and Observability aligns perfectly with the "Business-Grade Determinism" core tenet. I have noted one minor architectural adjustment for V-02 below, but otherwise endorse this roadmap completely.

---

## Sprint Roadmap

### Sprint 1: Fix the Lies (Tests That Pass Vacuously)

These are the highest priority because they provide false confidence — CI passes but the tests don't actually validate anything.

| ID | Severity | Principle | Location | Solution |
| :--- | :--- | :--- | :--- | :--- |
| V-01 | 🔴 CRITICAL | Test Integrity | `groq.test.ts` | Mock `global.fetch` (the real implementation uses raw fetch, not `groq-sdk`). Fix 2 expected error messages that don't match the code. |
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
| V-16 | 🟡 MEDIUM | `ai/parse-invoice/route.ts` | Unawaited `ServerLogger.user()` (line 81) | Add `await`. |
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

### Sprint 8: Cleanup

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

## Broken Contracts (Need Sprint 1)

| Contract | File | Status |
| :--- | :--- | :--- |
| DB Security | `db-security.test.ts` | ❌ Hardcoded mock — doesn't query real DB |
| Groq AI Client | `groq.test.ts` | ❌ Mocks `groq-sdk` but implementation uses `fetch` — passes vacuously |
