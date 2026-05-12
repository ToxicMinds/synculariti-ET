# Synculariti-ET (B2B SaaS Primitive)

This document is the definitive guide for AI assistants and developers. It consolidates architecture, design principles, and operational rules for the **Synculariti-ET** platform—the B2B SaaS evolution of the ET Expense engine.

> For the full developer rulebook (stack, commands, conventions, what NOT to do), see **`RULES.md`**.

---

## 1. Project Overview
**Synculariti-ET** is the enterprise-grade evolution of ET Expense.
*   **Mission**: Business-Grade Determinism. Moving from household tracking to multi-location restaurant and SMB financial management.
*   **Core Stack**: Next.js 16.2 (App Router), TypeScript 5, Supabase (Postgres 17), Neo4j 6 (Graph), Groq AI (Llama 3.3 70B).
*   **Architecture**: "Shared-Nothing" Multi-Tenant Isolation.
*   **Identity**: Standalone **Discovery & Selection** module.

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

### 2.4 Module: Observability (Black Site)
*   **Purpose**: High-fidelity technical and business telemetry.
*   **Gherkin Scenario**:
    *   **GIVEN** an expense of €50 is added to the system
    *   **WHEN** I view the Activity Log
    *   **THEN** I should see a record 'EXPENSE_ADDED' with the description and actor name.

---

## 3. Principles Audit (The Scorecard)

| Principle | Status | Implementation Detail |
| :--- | :--- | :--- |
| **DRY** | 🟢 **Platinum** | Identity logic centralized in `modules/identity`. Unified validation for staff and joining. |
| **ACID** | 🔵 **Hardened** | Cross-module mutations use the **Postgres Outbox Pattern** to ensure consistency. |
| **SOLID** | 🟢 **Platinum** | Hook-based architecture. Identity logic is decoupled from the main App Router. |
| **ACID (Ledger)** | 💎 **Platinum** | Inventory state is derived, not stored. This prevents "Stock Drift." |

---

## 4. Architecture Standards (The "Platinum" Rules)

### 4.1 Standalone Identity
*   **Rule**: The App must be wrapped in `IdentityGate`. No business logic should run until `tenant_id` is resolved.
*   **JWT Capability**: Module is designed to accept `tenant_id` scopes from the Global Login JWT.

### 4.2 Tenant Separation & RLS
*   **Standard**: Every table MUST have `FORCE ROW LEVEL SECURITY`.
*   **Isolation**: All policies must use the memoized `get_my_tenant()` helper.

---

## 5. Resilience & Regression Baseline

### 5.1 Outbox Resilience
*   **Scenario**: `PROCUREMENT_RECEIVED` -> `INVOICE_GENERATED`.
*   **Verification**: Run `scratch/test_outbox_resilience.sql`.

---

## 6. Technical Debt & Known Issues

| Issue | Severity | Fix Status |
| :--- | :--- | :--- |
| FIFO Batch Costing | 🟡 MEDIUM | **GAP** — Currently tracking quantity but not batch-specific dollar value. |
| Nested BOMs | 🟡 MEDIUM | **GAP** — Ingredients support 1:1 conversion, but not complex recipes (Prep items). |

---

## 7. Operational File Map
*   **`/v2/src/modules/identity`**: Identity & Discovery Module (Standalone).
*   **`/v2/src/app`**: Core business routing.
*   **`/v2/src/hooks`**: `useLogistics` (IMS), `useSync` (Finance).
*   **`/sql/b2b_evolution`**: Numbered DDL migrations.
