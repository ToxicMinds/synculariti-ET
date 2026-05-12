# Synculariti-ET (B2B SaaS Primitive)

This document is the definitive guide for AI assistants and developers. It consolidates architecture, design principles, and operational rules for the **Synculariti-ET** platform—the B2B SaaS evolution of the ET Expense engine.

> For the full developer rulebook (stack, commands, conventions, what NOT to do), see **`RULES.md`**.

---

## 1. Project Overview
**Synculariti-ET** is the enterprise-grade evolution of ET Expense.
*   **Mission**: Business-Grade Determinism. Moving from household tracking to multi-location restaurant and SMB financial management.
*   **Core Stack**: Next.js 16.2 (App Router), TypeScript 5, Supabase (Postgres 17), Neo4j 6 (Graph), Groq AI (Llama 3.3 70B).
*   **Architecture**: "Shared-Nothing" Multi-Tenant Isolation.
*   **Supabase Project**: `Synculariti-B2B` (`xtquhajccuitutvbxisd`, region: `eu-west-1`)

---

## 2. Feature-by-Feature Baseline

### 2.1 Module: Identity & Onboarding (Identity Gatekeeper)
*   **Purpose**: Secure entry and tenant bootstrapping.
*   **Logic**: Users register via Email/Password. On first login, they MUST either `create_organization` or `verify_tenant_access` (Join via Code).
*   **Platinum Rule**: No user is allowed to bypass the "Join/Create" screen if `app_users.tenant_id` is null.
*   **Security**: Handled by `public.get_my_tenant()` RLS.

### 2.2 Module: Logistics (IMS)
*   **Purpose**: SKU management and physical stock control.
*   **Architecture**: **Append-only Ledger**. Current stock is a calculated SUM of `inventory_ledger`.
*   **Automation**: `PROCUREMENT_RECEIVED` trigger emits an event to the `outbox_events` table.
*   **Data Integrity**: `po_line_items` must include `tenant_id` for RLS enforcement.

### 2.3 Module: Finance (Ledger Bridge)
*   **Purpose**: AP/AR tracking and Financial oversight.
*   **Logic**: Subscribes to the Outbox. When a PO is received, an `invoices` record is automatically generated.
*   **Audit Trail**: Every invoice must reference a `po_id` if created via Logistics.

### 2.4 Module: Observability (Black Site)
*   **Purpose**: High-fidelity technical and business telemetry.
*   **Dual-Channel**: 
    *   `system_telemetry`: Technical errors (Developer visibility).
    *   `activity_log`: Business actions (User visibility in "Business Feed").

---

## 3. Principles Audit (The Scorecard)

| Principle | Status | Implementation Detail |
| :--- | :--- | :--- |
| **DRY** | 🟢 **Platinum** | `constants.ts` is the single source of truth for Restaurant Categories and Icons. No hardcoding in components. |
| **ACID** | 🔵 **Hardened** | Cross-module mutations use the **Postgres Outbox Pattern** to ensure consistency between Logistics and Finance. |
| **SOLID** | 🟢 **Platinum** | Hook-based architecture. `useTransactions` (Read) is decoupled from `useSync` (Write). |
| **ACID (Ledger)** | 💎 **Platinum** | Inventory state is derived, not stored. This prevents "Stock Drift" where the UI shows one value and the DB shows another. |

---

## 4. Architecture Standards (The "Platinum" Rules)

### 4.1 Platinum Handshake (Initialization)
*   **Rule**: Use the `get_tenant_bundle` RPC for all frontend initialization.
*   **Structure**: Returns `{ tenant, locations, user, server_time }` in one atomic round-trip.

### 4.2 Tenant Separation & RLS
*   **Standard**: Every table MUST have `FORCE ROW LEVEL SECURITY`.
*   **Isolation**: All policies must use the memoized `get_my_tenant()` helper.

### 4.3 Intelligence Strategy (Cloud-TTL)
AI Insights (Groq) are shared across the tenant organization to minimize cost and latency.
*   **TTL**: 24 hours (Cloud-backed).
*   **Determinism**: Cache is only invalidated if the `dataHash` (totals/count) changes.

---

## 5. Resilience & Regression Baseline

### 5.1 Outbox Resilience
*   **Failure Mode**: If the Finance module trigger fails, the `outbox_event` remains in the table for retry.
*   **Audit**: Check `SELECT * FROM outbox_events WHERE processed = false` to find stuck transactions.

### 5.2 Stock Regression
*   **Test Case**: `Actual Count - Expected Snapshot = Ledger Variance`. 
*   **Constraint**: A `change_amount` in the ledger must ALWAYS be triggered by a specific `reason` (SALE, RECEIPT, WASTE).

---

## 6. Technical Debt & Known Issues

| Issue | Severity | Fix Status |
| :--- | :--- | :--- |
| FIFO Batch Costing | 🟡 MEDIUM | **GAP** — Currently tracking quantity but not batch-specific dollar value. |
| Nested BOMs | 🟡 MEDIUM | **GAP** — Ingredients support 1:1 conversion, but not complex recipes (Prep items). |
| DRY Overlap | ⚪ LOW | `Settings` staff management and `AuthScreen` use separate validation logic. |

---

## 7. Operational File Map
*   **`/v2/src/app`**: Core routing.
*   **`/v2/src/hooks`**: `useLogistics` (IMS), `useSync` (Finance).
*   **`/v2/src/context`**: `TenantContext.tsx` — global state.
*   **`/sql/b2b_evolution`**: Numbered DDL migrations.
*   **`/From Yoki`**: Reference architecture for FIFO and BOM (High-Complexity IMS).
