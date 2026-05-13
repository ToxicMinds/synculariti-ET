# Comprehensive Codebase Audit: Synculariti-ET

**Date**: 2026-05-13
**Scope**: DRY, ACID, SOLID, Security, Type Safety, Observability, Project Hygiene

---

## Executive Summary

The AGENTS.md documents progressive remediation across 3 phases, claiming ACID/Security hardening. **Significant gaps remain** between claimed status and reality. 3 critical RPCs referenced by production code don't exist in any SQL migration file. The `transactions` table the code queries doesn't exist — only `expenses` does. And 46% of API routes lack authentication.

---

## Part 1: AGENTS.md Scorecard vs Reality

| AGENTS.md Claim | Reality | Verdict |
|---|---|---|
| ACID 🟢 Hardened | Atomic RPCs exist, but **3 of 5 RPCs referenced by app code don't exist in SQL** (`add_transaction_v3`, `receive_purchase_order_v1`, `create_inventory_item_v1`) | 🔴 **Hallucinated** |
| Security 🟢 Hardened — "withAuth applied to all routes" | **6/13 routes (46%) lack withAuth** — groq, enablebanking, auth/pin, health, both debug routes | 🔴 **False** |
| DRY 🟡 Warning — "Category mapping duplicated" | True, but misses bigger DRY violations: `AuthScreen` vs `IdentityAuth` (80% identical), duplicate Cypher queries in debug routes | 🟡 **Understated** |
| Type Safety 🟡 Warning — "~30 `: any`" | **62 `: any` usages** — nearly double the claim | 🔴 **Understated** |
| SOLID 🟡 Warning — "useSync God-hook" | True. But also `TenantContext.tsx` is a God-context, `NavBar.tsx` claimed as "refactored into CSS Modules" yet still has inline styles | 🟡 **Partial** |
| Observability 🟢 Hardened | Dual Logger/ServerLogger works. But **`ServerLogger` has empty `catch {}` blocks** swallowing errors silently | 🟡 **Flawed** |
| Error Handling 🟢 Hardened | ErrorBoundary wraps app ✅. But `forecast/route.ts` has no ServerLogger in catch, and `health/route.ts` uses browser Supabase client on server | 🟡 **Mixed** |
| Resilience 🟢 Hardened — "OfflineQueue implemented" | ✅ **Confirmed — fully working** | 🟢 **Accurate** |

---

## Part 2: Critical Issues Never Surfaced Before

### 🔴 CRITICAL: Missing Database RPCs

The app code calls RPCs that **do not exist in any SQL migration file**:

| RPC | Referenced In | Exists? |
|---|---|---|
| `add_transaction_v3` | `v2/src/modules/finance/hooks/useSync.ts:89` | ❌ |
| `receive_purchase_order_v1` | `v2/src/modules/logistics/hooks/useLogistics.ts:92` | ❌ |
| `create_inventory_item_v1` | `v2/src/modules/logistics/hooks/useLogistics.ts:116` | ❌ |
| `update_transaction_v1` | `useSync.ts:210` | ✅ (`11_phase2_dml_rpcs.sql`) |
| `soft_delete_transaction_v1` | `useSync.ts:194` | ✅ (`11_phase2_dml_rpcs.sql`) |
| `save_receipt_v3` | `useSync.ts:159` | ✅ (`05_tenant_rename.sql`) |

**Impact**: These 3 missing RPCs will throw "function does not exist" at runtime. All Logistics mutations (receivePO, addItem) and manual expense additions (addTransaction) are broken. The app will crash on any write operation.

### 🔴 CRITICAL: `transactions` Table Doesn't Exist

- `05_tenant_rename.sql` renames `app_state` → `tenants` and renames columns `household_id` → `tenant_id`
- It **never renames `expenses` → `transactions`**
- Yet `11_phase2_dml_rpcs.sql` does `UPDATE transactions SET ...`, `export/route.ts` queries `.from('transactions')`, and both debug routes query `.from('transactions')`
- No `CREATE TABLE public.transactions` exists anywhere

### 🔴 CRITICAL: Missing `tenant_members` Table

- `upsert_app_user_v1` RPC (`11_phase2_dml_rpcs.sql:99`) queries `tenant_members` table
- **No `CREATE TABLE public.tenant_members` exists in any SQL file**
- The RPC's security check (`SELECT 1 FROM tenant_members WHERE email = v_email`) will always throw "relation does not exist"

### 🟠 SECURITY: Open Proxies

| Route | Issue |
|---|---|
| `/api/groq` | **Open proxy to Groq API** — no auth, CORS `Access-Control-Allow-Origin: *`. Anyone who finds this endpoint can use your Groq API key. |
| `/api/enablebanking` | **Open proxy to banking API** — no auth, no rate limiting |
| `/api/auth/pin` | Uses `SUPABASE_SERVICE_ROLE_KEY` (most powerful key in Supabase) with predictable passwords (`pin_${pin}_${tenantId.substring(0, 8)}`) |

### 🟠 SECURITY: Debug Routes Use Hardcoded Secret

- Both `/api/debug/backfill-neo4j` and `/api/debug/sync-neo4j` use `key !== 'et-secret-sync'` — **hardcoded string, not an environment variable**

### 🟠 SECURITY: `health/route.ts` Uses Browser Client Server-Side

- Imports `supabase` from `@/lib/supabase` (browser `createBrowserClient`) instead of `createClient` from `@/lib/supabase-server`
- Will attempt to use browser APIs in a serverless Node.js environment

---

## Part 3: ACID Violations

| Issue | Location | Detail |
|---|---|---|
| `save_receipt_v3` non-atomic item wipe | `sql/b2b_evolution/05_tenant_rename.sql:160-177` | Deletes old items then inserts new ones in **separate statements** without a `BEGIN/EXCEPTION` block. If item delete succeeds but insert fails, **receipt items are permanently lost** |
| `update_tenant_config_v1` no exception handling | `sql/b2b_evolution/11_phase2_dml_rpcs.sql` | Raw JSONB operations could throw on invalid data — no error handling |
| Competing trigger definitions | `05_logistics_schema.sql` AND `06_bridge_trigger_fix.sql` | Both create `trg_consume_procurement` / `consume_procurement_signal()`. If both run, the second will overwrite the first, but the function definitions are identical so this is benign — still, it indicates migration sequencing confusion |
| `ServerLogger` silent error swallowing | `v2/src/lib/logger-server.ts:51-53`, `:75-77` | Empty `catch {}` blocks — telemetry failures vanish without trace, violating the "No Silent Failures" rule in RULES.md |

---

## Part 4: DRY Violations

| Duplication | Files | Est. Overlap |
|---|---|---|
| Join/Create org flow | `v2/src/components/AuthScreen.tsx` vs `v2/src/modules/identity/IdentityAuth.tsx` | ~80% — same state vars, same RPC calls (`verify_tenant_access`, `create_organization`), same UI structure, same error handling |
| Cypher MERGE queries | `v2/src/app/api/debug/backfill-neo4j/route.ts` vs `v2/src/app/api/debug/sync-neo4j/route.ts` | ~90% — nearly identical loops with same Cypher patterns |
| Category mapping strategies (×3) | `parse-invoice/route.ts`, `parse-receipt/route.ts`, `statement/route.ts` | Each defines inline category handling with different approaches |
| Offline queue flush duplicates mutation logic | `v2/src/modules/finance/hooks/useSync.ts:44-56` | The flush loop reimplements the same `addTransaction`/`saveReceipt` call paths |

---

## Part 5: SOLID Violations

| Principle | Violation | Detail |
|---|---|---|
| **SRP** | `useSync.ts` God-hook | 5 responsibilities: addTransaction, saveReceipt, softDelete, updateTransaction, offline queue management, Neo4j linking |
| **SRP** | `TenantContext.tsx` God-context | ~7 responsibilities: session management, tenant state, config updates, category management, identity resolution, whoId resolution, sync token management |
| **OCP** | Document parsing API routes | Adding a new document type (e.g., PDF invoice, CSV statement) requires duplicating the route pattern — no Strategy/Adapter pattern |
| **ISP** | `useSync` return value | Returns 6 functions + 3 aliases. Most consumers only need 1-2 functions but get everything |
| **DIP** | `useSync` depends on concrete `supabase` client | Direct import of `@/lib/supabase` instead of depending on an abstraction |

---

## Part 6: Type Safety & Code Hygiene

| Metric | Found | Claimed | Gap |
|---|---|---|---|
| `: any` usages | **62** | ~30 | **2× the claim** |
| `.js` files in `src/` | **2** (`benchmark_performance.js`, `find_households.js`) | "No .js files" | Violation of RULES.md |
| Inline `style={}` props | Extensive in `AuthScreen.tsx`, `IdentityAuth.tsx`, `IdentityGate.tsx` | "Zero Inline Styling" | RULES.md violated |
| Catch `(e: any)` | 25 occurrences across codebase | N/A | Should use `unknown` |
| Unused code | `systemLog()` in `utils.ts` (marked "Redundant"), `fetchWithRetry` used in only 2 places | N/A | Dead code |
| `// REASON:` comments on `any` | **0** | Required by RULES.md | Violation |

### Breakdown of 62 `: any` usages

```
25×  catch (e: any)
8×   component props (session: any, tenant: any, etc.)
6×   Logger metadata parameters
5×   data mapping (.map((it: any) => ...))
4×   ReceiptData fields (vatDetail: any)
3×   withAuth user param
3×   OfflineQueue payload: any
2×   Neo4j Cypher results
2×   Googles goals: any
2×   useSync cast hacks ((item as any).merchant)
2×   === TOTAL: 62 ===
```

---

## Part 7: Gherkin / BDD Tests — Paper-Thin

- **4 `.feature` files exist** at `v2/tests/features/`
- **Zero step definition files exist** (no `v2/tests/features/steps/` directory)
- The `jest-cucumber` dependency is in `package.json` but has no configuration binding it to the feature files
- The nightly workflow (`nightly-gherkin.yml`) references `--testPathPatterns=features` which is not a valid Jest CLI option (should be `--testPathPattern`)
- **These tests would either fail to compile or pass vacuously** with zero actual assertions

### Feature Files Without Step Definitions

| File | Line Count | Steps Covered |
|---|---|---|
| `finance.feature` | 10 | 0 |
| `identity.feature` | 10 | 0 |
| `logistics.feature` | 10 | 0 |
| `observability.feature` | 9 | 0 |

---

## Part 8: SQL Migration Gaps

| Gap | Detail | Risk |
|---|---|---|
| Skipped migration numbers | Jumps from `06` → `11` (no 07, 08, 09, 10) | Possible rebase issue or missing migrations |
| `security_hardening_v2.sql` references old schema | Uses `get_my_household()` and `household_id` — contradicts `05_tenant_rename.sql` which renamed both | If applied after 05, would DROP the new function and recreate the old one |
| `system_telemetry` table creation | In `observability_v2.sql` (outside numbered migrations) | May not get applied during deployment |
| `FORCE ROW LEVEL SECURITY` missing on logistics tables | `inventory_ledger`, `purchase_orders`, `po_line_items` lack `ALTER TABLE ... FORCE ROW LEVEL SECURITY` | Weaker isolation on logistics tables vs finance tables |
| `invoices` table no RLS policy in its own migration | `04_finance_schema.sql` creates `invoices` but RLS policies aren't re-verified after 05_tenant_rename | Policies may reference old column names |

---

## Part 9: API Route Audit

| Route | `withAuth` | Logger | Notes |
|---|---|---|---|
| `GET /api/health` | ❌ | ❌ | Uses browser supabase client server-side |
| `POST /api/groq` | ❌ | ❌ | Open proxy, CORS `*`, no rate limit |
| `POST /api/enablebanking` | ❌ | ❌ | Open proxy to banking API |
| `POST /api/auth/pin` | ❌ | ✅ ServerLogger | Uses service_role_key directly |
| `GET /api/export` | ✅ | ❌ (no catch logging) | ✅ Good |
| `POST /api/ekasa` | ✅ | ✅ | ✅ Good |
| `POST /api/ai/forecast` | ✅ | ❌ (no catch logging) | Uses raw fetch, not groq-sdk SDK |
| `GET /api/ai/insight` | ✅ | ✅ | ✅ Good (session safely closed in finally) |
| `POST /api/ai/parse-invoice` | ✅ | ✅ | ✅ Good |
| `POST /api/ai/parse-receipt` | ✅ | ✅ | ✅ Good |
| `POST /api/ai/statement` | ✅ | ✅ | ✅ Good |
| `GET /api/debug/backfill-neo4j` | ❌ (shared secret) | ❌ | Hardcoded `et-secret-sync` |
| `GET /api/debug/sync-neo4j` | ❌ (shared secret) | ❌ | Hardcoded `et-secret-sync` |

---

## Part 10: All Hallucinations Documented

| # | Hallucination | Source | Reality |
|---|---|---|---|
| H-01 | "RPCs exist for all mutations" | AGENTS.md §3 | `add_transaction_v3`, `receive_purchase_order_v1`, `create_inventory_item_v1` don't exist in any SQL file |
| H-02 | "`expenses` table was renamed to `transactions`" | AGENTS.md V-04, RULES.md | No migration performs this rename. `expenses` is still the table name |
| H-03 | "`tenant_members` table exists" | `11_phase2_dml_rpcs.sql` (assumes it) | No `CREATE TABLE` for `tenant_members` in any migration |
| H-04 | "Gherkin pipeline works / is verified" | AGENTS.md Hallucination Audit, nightly-gherkin.yml | No step definitions exist — pipeline will crash |
| H-05 | "`withAuth` applied to all routes" | AGENTS.md §3 Scorecard | Only 7/13 routes (54%) |
| H-06 | "~30 `: any` usages remain" | AGENTS.md §3 Scorecard | Actual count: **62** |
| H-07 | "Phase 2 eliminated all direct client DML" | AGENTS.md §5 | `useLogistics` still uses direct table `.select('*')` and direct `.from(...)` |
| H-08 | "Outbox bridge is verified and live" | AGENTS.md §3 Scorecard | No verification evidence. Two files create competing trigger definitions |
| H-09 | "Zero Inline Styling" | RULES.md §Coding Conventions | Extensive `style={}` props in AuthScreen, IdentityAuth, IdentityGate |
| H-10 | "No `.js` files in `src/`" | RULES.md §TypeScript | 2 `.js` files exist: `benchmark_performance.js`, `find_households.js` |
| H-11 | "Explicit return types on all functions" | RULES.md §TypeScript | `useSync` hook returns no explicit type, many component functions lack return types |
| H-12 | "No `any` without `// REASON:` comment" | RULES.md §TypeScript | Zero `// REASON:` comments found across 62 `any` usages |

---

## Part 11: Project Environment Hygiene

| Issue | Detail |
|---|---|
| `vacation` file at project root | Non-standard artifact — likely a temp file that was committed |
| `From Yoki/` directory at root | Non-standard artifact |
| `scratch/` directory at root | Non-standard artifact |
| Duplicate eKasa proxy implementation | `vercel.json` rewrites AND `api/ekasa/route.ts` both proxy to the same gov API |
| No `.env.example` or `.env.local.template` | Missing — new developers can't know what env vars are needed |
| `package.json` next version `16.2.4` | Extremely new — may have undocumented breaking changes. Production risk without thorough testing |
| Missing tsconfig path verification | Code uses `@/` imports — relies on `tsconfig.json` `paths` being correct |
| `rules.ts` in `lib/` | Unread file that may contain additional governance rules not in AGENTS.md or RULES.md |

---

## Suggested Priority Remediation Path

### Phase 0 — Runtime-Blocking (Do First)
1. Create missing RPCs: `add_transaction_v3`, `receive_purchase_order_v1`, `create_inventory_item_v1`
2. Create missing table: `tenant_members` with proper RLS
3. Create migration to rename `expenses` → `transactions` (align DB with code)
4. Resolve competing trigger definitions (pick one file, remove the other)

### Phase 1 — Security
5. Add `withAuth` to `groq`, `enablebanking`, `auth/pin` routes (or add rate limiting + remove CORS `*`)
6. Replace hardcoded `et-secret-sync` with `process.env.SYNC_SECRET_KEY`
7. Remove `SUPABASE_SERVICE_ROLE_KEY` usage from API route handlers — use `withAuth` + RLS instead
8. Fix `health/route.ts` to use `createClient` from `@/lib/supabase-server`

### Phase 2 — ACID & Data Integrity
9. Wrap `save_receipt_v3` item delete+insert in `BEGIN/EXCEPTION/END` block
10. Add error handling to `update_tenant_config_v1`
11. Replace empty `catch {}` in `ServerLogger` with at least `console.error`
12. Add `FORCE ROW LEVEL SECURITY` to all logistics tables

### Phase 3 — Code Quality
13. Consolidate `AuthScreen.tsx` + `IdentityAuth.tsx` → one component in `modules/identity/`
14. Refactor `useSync` into smaller domain hooks (useAddTransaction, useSaveReceipt, useOfflineQueue)
15. Refactor `TenantContext.tsx`
16. Fix 62 `: any` usages
17. Add Gherkin step definitions or remove feature files and workflow
18. Remove dead code (`systemLog`, unused imports)
19. Remove inline styles — use CSS Modules
20. Remove `.js` files or convert to `.ts`

---

## File Reference Index

| File | Lines | Purpose |
|---|---|---|
| `AGENTS.md` | 158 | AI agent rules & principles audit |
| `RULES.md` | 185 | Developer rulebook |
| `v2/src/modules/finance/hooks/useSync.ts` | 236 | God-hook with offline queue integration |
| `v2/src/modules/logistics/hooks/useLogistics.ts` | 142 | Logistics mutations (calls non-existent RPCs) |
| `v2/src/context/TenantContext.tsx` | 182 | God-context |
| `v2/src/components/AuthScreen.tsx` | 174 | Auth + join/create (duplicated) |
| `v2/src/modules/identity/IdentityAuth.tsx` | 153 | Auth + join/create (duplicated) |
| `v2/src/lib/withAuth.ts` | 61 | Auth middleware (used 7/13 routes) |
| `v2/src/lib/logger.ts` | 69 | Client-side Logger |
| `v2/src/lib/logger-server.ts` | 79 | Server-side Logger (empty catch blocks) |
| `v2/src/lib/offlineQueue.ts` | 55 | Offline queue (fully working ✅) |
| `v2/src/lib/neo4j.ts` | 70 | Neo4j singleton (hardcoded Lidl check) |
| `v2/src/app/api/groq/route.ts` | 38 | Open proxy (CORS `*`, no auth) |
| `v2/src/app/api/enablebanking/route.ts` | 69 | Open proxy (no auth) |
| `v2/src/app/api/auth/pin/route.ts` | 72 | Uses service_role_key, predictable passwords |
| `v2/src/app/api/health/route.ts` | 44 | Uses browser client server-side |
| `sql/b2b_evolution/05_tenant_rename.sql` | 239 | Renamed app_state→tenants but NOT expenses→transactions |
| `sql/b2b_evolution/11_phase2_dml_rpcs.sql` | 140 | References `transactions` table (doesn't exist) and `tenant_members` (doesn't exist) |
| `sql/security_hardening_v2.sql` | 92 | References old `get_my_household()` function |
| `sql/observability_v2.sql` | 50 | Creates `system_telemetry` (outside numbered migrations) |
