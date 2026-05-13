# Synculariti-ET (B2B SaaS Primitive)

This document is the definitive guide for AI assistants and developers. It consolidates architecture, design principles, and operational rules for the **Synculariti-ET** platform—the B2B SaaS evolution of the ET Expense engine.

---

## 1. Project Overview
**Synculariti-ET** is the enterprise-grade evolution of ET Expense.
*   **Mission**: Business-Grade Determinism. Moving from household tracking to multi-location restaurant and SMB financial management.
*   **Core Stack**: Next.js 16.2 (App Router), TypeScript 5, Supabase (Postgres 17), Neo4j 6 (Graph), Groq AI (Llama 3.3 70B).
*   **Architecture**: "Shared-Nothing" Multi-Tenant Isolation.

---

## 2. Feature-by-Feature Baseline

### 2.1 Module: Identity & Access (The Gatekeeper)
*   **Purpose**: Secure entry and multi-tenant discovery.
*   **Logic**: Uses `tenant_members` table to find all organizations linked to a user's email. Supports auto-link for single-org users and a **Tenant Selector** for multi-org users.
*   **Gherkin Scenario**:
    *   **GIVEN** an admin has added "staff@acme.com" to the Acme Corp staff list
    *   **WHEN** the user logs in with "staff@acme.com"
    *   **THEN** the Identity Gate should skip the Access Code screen and auto-link them to Acme Corp.

### 2.2 Module: Logistics (IMS)
*   **Purpose**: SKU management and physical stock control.
*   **Architecture**: **Append-only Ledger**. Current stock is a calculated SUM of `inventory_ledger`.
*   **Gherkin Scenario**:
    *   **GIVEN** a Purchase Order with 10 units of "Coffee Beans" is marked as RECEIVED
    *   **WHEN** I check the Inventory Ledger
    *   **THEN** I should see a new 'RECEIPT' entry for 10 units, and the total stock should increase accordingly.

### 2.3 Module: Finance (Ledger Bridge)
*   **Purpose**: AP/AR tracking and Financial oversight.
*   **Logic**: Subscribes to the Outbox. When a PO is received, an `invoices` record is automatically generated.
*   **Gherkin Scenario**:
    *   **GIVEN** a 'PROCUREMENT_RECEIVED' event is emitted to the outbox
    *   **WHEN** the Bridge Trigger executes
    *   **THEN** a new 'PENDING' Invoice should appear in Finance matching the PO total and currency.

### 2.4 Module: Supplier Management
*   **Purpose**: Vendor tracking and pricing history.
*   **Logic**: Linked to POs and Invoices. Tracks IČO/DIČ for tax compliance.
*   **Gherkin Scenario**:
    *   **GIVEN** an invoice is saved with IČO "12345678"
    *   **WHEN** I view the Supplier Catalog
    *   **THEN** I should see a profile for that vendor with their total billing history.

### 2.5 Module: Intelligence Hub
*   **Purpose**: Predictive analytics and relationship mapping.
*   **Stack**: Groq (Llama 3.3) for forecasting + Neo4j for merchant graph resolution.
*   **Gherkin Scenario**:
    *   **GIVEN** 3 months of coffee purchases from 3 different vendors
    *   **WHEN** I run the Price Trend insight
    *   **THEN** the AI should identify the lowest-cost vendor and forecast next month's requirement.

### 2.6 Module: PWA Mobility
*   **Purpose**: High-performance mobile experience.
*   **Features**: Manifest v3, biometric-ready UI, and orientation-locked bento layouts.
*   **Gherkin Scenario**:
    *   **GIVEN** a user is in a basement with flaky signal
    *   **WHEN** they scan a receipt
    *   **THEN** the mutation should be queued locally and retried automatically until the outbox clears.

### 2.7 Module: Observability (Black Site)
*   **Purpose**: High-fidelity technical and business telemetry.
*   **Gherkin Scenario**:
    *   **GIVEN** an expense of €50 is added to the system
    *   **WHEN** I view the Activity Log
    *   **THEN** I should see a record 'EXPENSE_ADDED' with the description and actor name.

---

## 3. Principles Audit (The Scorecard)

*Last updated: 2026-05-13 — Post Phase 3 Re-Audit.*

| Principle | Status | Detail |
| :--- | :--- | :--- |
| **ACID** | 🟢 **Hardened** | `save_receipt_v4` & `add_transactions_bulk_v1` are atomic. `TenantContext.updateState()` has a non-atomic read-before-write — needs fixing in Phase 5. |
| **Security** | 🟠 **Partially Hardened** | 12/13 API routes protected with `withAuth`. **NEW**: 23 `SECURITY DEFINER` RPCs callable by `anon` role — Phase 4 remediation required. |
| **DRY** | 🟢 **Hardened** | AI category prompts, Neo4j Cypher loops, and Auth components unified. |
| **Type Safety** | 🟢 **Hardened** | **0** `: any` / `as any` usages in `v2/src`. 100% Type-Safe codebase. |
| **SOLID** | 🟢 **Hardened** | `useSync`, `TenantContext`, and `useLogistics` refactored into specialized hooks (SRP). |
| **Observability** | 🟢 **Hardened** | `ServerLogger.system()` logs to console. `ServerLogger.user()` has intentional silent `catch {}` to avoid crashing routes. `forecast/route.ts` catch has no `ServerLogger` — gap. |
| **Error Handling** | 🟢 **Hardened** | `unknown` catch blocks throughout. `forecast/route.ts` missing input validation (division-by-zero risk). |
| **Resilience** | 🟢 **Hardened** | `OfflineQueue` fully implemented and verified. |

---

## 4. Remediation Progress (V-Log)

| ID | Violation | File | Severity | Status |
| :--- | :--- | :--- | :--- | :--- |
| V-01 | PO Receipt column mismatch. | DB RPC | 🔴 CRITICAL | ✅ FIXED |
| V-02 | Dead Outbox Bridge. | DB Triggers | 🔴 CRITICAL | ✅ FIXED |
| V-04 | Stale 'expenses' table reference. | API Route | 🔴 CRITICAL | ✅ FIXED |
| V-05 | No auth guard on Export. | API Route | 🔴 SECURITY | ✅ FIXED |
| V-07 | `console.log` bypassing Logger. | Multiple | 🟡 WARNING | ✅ FIXED |
| V-09 | Zero `ErrorBoundary` components. | App-wide | 🔴 VIOLATION | ✅ FIXED |
| V-11 | Direct `.insert()` in `useSync`. | Finance Hook | 🔴 CRITICAL | ✅ FIXED |
| V-13 | Direct `.update()` in `useSync`. | Finance Hook | 🔴 CRITICAL | ✅ FIXED |
| V-16 | `withAuth` never applied. | API Auth | 🔴 SECURITY | ✅ FIXED |
| V-19 | `Logger` build error in API routes. | API Routes | 🔴 CRITICAL | ✅ FIXED (Phase 2.2) |
| V-20 | `tenant_id` user-hopping risk. | DB RPC | 🔴 SECURITY | ✅ FIXED (Phase 2.2) |
| V-21 | 25 `SECURITY DEFINER` RPCs callable by `anon`. | DB Functions | 🔴 SECURITY | ✅ FIXED (Phase 4) |
| V-22 | 16+ functions missing `SET search_path`. | DB Functions | 🟠 SECURITY | ✅ FIXED (Phase 4) |
| V-23 | `health/route.ts` uses browser Supabase client server-side. | API Route | 🟡 BUG | ✅ FIXED (Phase 5) |
| V-24 | `forecast/route.ts` no input validation — division by zero risk. | API Route | 🟡 BUG | ✅ FIXED (Phase 5) |
| V-25 | `AuthScreen` uses stale `upsert_app_user_v1` vs canonical `switch_tenant`. | Identity | 🟠 DIVERGENCE | ✅ FIXED (Phase 5) |
| V-26 | Stale model `llama-3.1-70b-versatile` in `forecast` & `statement` routes. | AI Routes | 🟡 WARNING | ✅ FIXED (Phase 5) |
| V-27 | Non-atomic read-before-write in `TenantContext.updateState()`. | Context | 🟡 ACID | ✅ FIXED (Phase 5) |
| V-28 | `useLogistics` mixes Read+Write (SRP violation). | Logistics Hook | 🟡 SOLID | 🟠 OPEN — Phase 6 |
| V-29 | `AuthScreen` + `IdentityAuth` DRY violation (75% identical). | Identity | 🟡 DRY | 🟠 OPEN — Phase 6 |

---

## 5. Priority Remediation Path (The "Platinum" Roadmap)

### ✅ Phase 0: Integrity & Security (COMPLETE)
1.  **Missing RPCs** ✅ (add_transaction_v3, receive_purchase_order_v1, create_inventory_item_v1)
2.  **Missing Tables** ✅ (tenant_members)
3.  **Schema Alignment** ✅ (expenses/transactions resolved)

### ✅ Phase 1: Security Hardening (COMPLETE)
1.  **Missing `withAuth`** ✅ (Applied to all sensitive routes)
2.  **Open Groq Proxy** ✅ (Closed & CORS hardened)
3.  **Hardcoded Secrets** ✅ (Moved to `SYNC_SECRET_KEY`)

### ✅ Phase 2: Structural Repair & Polish (COMPLETE)
1.  **Direct DML Regression Fixes** ✅
2.  **API Auth Realization** ✅
3.  **PWA Hardening** ✅ — `offlineQueue.ts` implemented.
4.  **SQL Refinements** ✅ — Security & Performance hardening.
5.  **Build Stabilization** ✅ — `ServerLogger.user()` implemented to fix Node.js crashes.
6.  **Hardened Finance RPCs** ✅ — `save_receipt_v4` & `bulk` implemented.
7.  **Type Safety Sweep** ✅ — **0** `: any` usages. 100% hardened.

### ✅ Phase 3: Behavioral Verification (COMPLETE)
1.  **Gherkin Step Definitions** ✅ — All 4 feature files have real assertions.
2.  **BDD Test Suite** ✅ — 15/15 tests passing (Identity, Finance, Logistics, Observability).
3.  **Identity RPCs** ✅ — `get_my_available_tenants`, `switch_tenant`, `verify_tenant_access` deployed.
4.  **Finance Core** ✅ — `finance.ts` calculation library restored and tested.

### ✅ Phase 4: DB Security Hardening (COMPLETE)
1.  **Revoke anon EXECUTE** ✅ — `REVOKE EXECUTE ON FUNCTION ... FROM anon` for all 25 non-public RPCs. (V-21)
2.  **Fix `search_path` mutable** ✅ — Add `SET search_path = public` to all functions. (V-22)
3.  **Drop `save_receipt_v2`** ✅ — Deprecated, anon-callable, zero app references.
4.  **Enable leaked password protection** 🟡 — Supabase Auth dashboard setting (User Action Required).

### ✅ Phase 5: Bug Fixes & AI Alignment (COMPLETE)
1.  **Fix `health/route.ts`** ✅ — Replace browser Supabase client with SSR client. (V-23)
2.  **Fix `forecast/route.ts`** ✅ — Add input validation + `ServerLogger` to catch. (V-24)
3.  **Align `AuthScreen` to use `switch_tenant`** ✅ — Remove stale `upsert_app_user_v1` call. (V-25)
4.  **Update stale Groq model** ✅ — `llama-3.1` → `llama-3.3-70b-versatile` in forecast & statement. (V-26)
5.  **Fix `TenantContext.updateState()`** ✅ — Remove non-atomic direct read. (V-27)

### ✅ Phase 6: Core DRY & SOLID Cleanup (COMPLETE)
1.  **Merge `AuthScreen` + `IdentityAuth`** ✅ — Unified into `OrgAccessForm`. (V-28, V-29)
2.  **Split `useLogistics`** ✅ — Refactored into `useInventory` (Read) + `useLogisticsSync` (Write).
3.  **Fix `useLogistics.ts:73`** ✅ — Type safety enforced with `catch (err: unknown)`.
4.  **Extract `<BrandHeader />`** ✅ — Created shared component to remove duplicate branding logic.

### ✅ Phase 7: Deep Architecture Polish (COMPLETE)
1.  **God-Hook Refactor (`useSync`)** ✅ — Split into specialized hooks for queue management, transaction mutations, and Neo4j sync to resolve SRP violation.
2.  **God-Context Refactor (`TenantContext`)** ✅ — Extract category/budget mutations into a separate hook from core state provider.
3.  **AI DRY Violations** ✅ — Extract prompt category mapping logic from `parse-invoice`, `parse-receipt`, and `statement` routes into `@/lib/ai-categories.ts`.
4.  **Neo4j Cypher DRY** ✅ — Extract shared `neo4jBulkMerge()` utility to unify `sync-neo4j` and `backfill-neo4j` loops.

---

## 6. Architecture Standards (The "Platinum" Rules)

### 6.1 Modular "Shared-Nothing" Isolation
*   **Rule**: The App is divided into three core modules: `Identity`, `Logistics`, and `Finance`.
*   **Encapsulation**: Each module must own its own hooks, components, and domain-specific types.

### 6.2 Standalone Identity
*   **Rule**: The App must be wrapped in `IdentityGate`. No business logic should run until `tenant_id` is resolved.

---

## 9. Hallucination Audit (Anti-Entropic Sweep)

To maintain **Business-Grade Determinism**, we must audit AI-claimed status against reality.

| Hallucination | Reality | Status |
| :--- | :--- | :--- |
| `withAuth` applied to all routes. | Verified: 12/13 routes protected (health intentionally public). | ✅ ACCURATE |
| "RPCs exist for all mutations" | Verified: All financial + logistics RPCs confirmed live in DB. | ✅ ACCURATE |
| "`tenant_members` exists" | Verified: Table exists with RLS (0 rows — needs seeding). | ✅ ACCURATE |
| "Gherkin Pipeline complete" | Verified: 15/15 BDD tests passing with real assertions. | ✅ FIXED (Phase 3) |
| "expenses renamed to transactions" | Verified: `transactions` table confirmed in DB with RLS. | ✅ ACCURATE |
| "0 `: any` usages" | Verified: Grep confirms zero `: any` / `as any` in `v2/src/`. | ✅ ACCURATE |
| "Security fully hardened" | Verified: Anon EXECUTE revoked, `search_path` fixed. | ✅ FIXED (Phase 4) |
| **SOLID hardened** | Verified: `useSync`, `TenantContext`, and `useLogistics` split into specialized hooks. | ✅ ACCURATE |
| **DRY hardened** | Verified: AI prompt prompts, Neo4j loops, and Auth components unified. | ✅ ACCURATE |

---

## 10. Intelligence Strategy: AI Invoice Pipeline
To achieve **Business-Grade Determinism**, we use a three-stage pipeline:
1.  **Stage 0: Triage (The Guard)**: Vision LLM verifies document relevancy.
2.  **Stage 1: Vision Extraction (The Eyes)**: High-fidelity transcription.
3.  **Stage 2: Reasoning Refinement (The Brain)**: Llama 3.3 70B maps to Tenant context.
