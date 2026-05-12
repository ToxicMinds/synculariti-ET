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

*Last updated: 2026-05-12 — Post Phase 0 execution.*

| Principle | Status | Detail |
| :--- | :--- | :--- |
| **ACID** | 🟡 **Partial** | Phase 0 fixed the Ghost PO and wired the outbox bridge. `save_receipt_v3` has 3 overloaded signatures (ambiguity risk). Manual `addTransaction` still does a direct insert on `transactions`. |
| **Security** | 🟡 **Hardened** | Phase 0 revoked direct DML from `anon`/`authenticated` on all ledger tables. Export route patched (auth + table name). Residual: `auth/pin` uses service role (legitimate but undocumented). |
| **DRY** | 🔴 **Violation** | 13 `console.log` calls bypass the Logger. API auth boilerplate copied across 5 routes. Duplicate trigger names existed (now cleaned). Two debug routes queried the stale `expenses` table name. |
| **Type Safety** | 🔴 **Violation** | 32 `: any` usages across modules. Heaviest offenders: `ReceiptScanner.tsx` (7), `StatementScanner.tsx` (4), `useIdentity.ts` (3). Breaks strict TypeScript contracts. |
| **SOLID** | 🟡 **Warning** | `useSync` mixes read, write, and Neo4j sync in one hook. `NavBar.tsx` is a 324-line God Component with 3 embedded sub-components. Identity module is a bottleneck — every module depends on it. |
| **Observability** | 🟡 **Warning** | `Logger.user` now added to Logistics mutations. But `useIdentity.ts` still uses `console.error`. No ErrorBoundary exists anywhere in the app — unhandled React errors are invisible to the audit trail. |
| **Error Handling** | 🔴 **Violation** | Zero `ErrorBoundary` components. Unhandled promise rejections in Neo4j fire-and-forget calls. `ReceiptScanner` silently ignores scan failures in `onScanFailure`. |
| **Resilience** | 🟡 **Partial** | `saveReceipt` has 3-attempt exponential backoff. `addTransaction` has none. PWA offline queue is documented but not implemented. |

---

## 4. Newly Surfaced Violations (Phase 0 Deep Scan)

These were **not in previous audits** and are documented here for the first time:

| ID | Violation | File | Severity |
| :--- | :--- | :--- | :--- |
| V-01 | `receive_purchase_order_v1` referenced `pli.quantity` — column doesn't exist. Silent crash on every PO receipt. | DB RPC | 🔴 CRITICAL — **Fixed Phase 0.2** |
| V-02 | Outbox trigger functions existed but were never attached to tables. Bridge was dead. | DB Triggers | 🔴 CRITICAL — **Fixed Phase 0.3** |
| V-03 | Duplicate triggers (`trg_consume_procurement` + `trg_signal_procurement_finance`) would fire twice, creating duplicate invoices. | DB Triggers | 🔴 CRITICAL — **Fixed Phase 0.3b** |
| V-04 | `export/route.ts` queried `FROM 'expenses'` (renamed table). All CSV exports returned errors. | API Route | 🔴 CRITICAL — **Fixed Phase 0.4** |
| V-05 | `export/route.ts` had no auth guard — any caller could exfiltrate any tenant's data via URL param. | API Route | 🔴 SECURITY — **Fixed Phase 0.4** |
| V-06 | `debug/sync-neo4j` and `debug/backfill-neo4j` still referenced `FROM 'expenses'`. | API Debug | 🟡 WARNING — **Fixed Phase 0.4** |
| V-07 | 13 `console.log/warn/error` calls bypass `Logger` — telemetry blackspot. | Multiple | 🟡 WARNING — **Phase 1** |
| V-08 | 32 `: any` TypeScript usages violate strict type contracts. | Multiple | 🟡 WARNING — **Phase 1** |
| V-09 | Zero `ErrorBoundary` components — React render crashes are invisible. | App-wide | 🔴 VIOLATION — **Phase 1** |
| V-10 | `save_receipt_v3` has 3 overloaded signatures — Postgres resolves by argument match, may call wrong version. | DB RPC | 🟡 WARNING — **Phase 1** |
| V-11 | `addTransaction` in `useSync` still does a direct client `.insert()` on `transactions` — bypasses RPC safety. | Finance Hook | 🟡 WARNING — **Phase 1** |
| V-12 | `auth/pin` route constructs virtual passwords as `pin_${pin}_${tenantId}` — deterministic and brute-forceable. | API Auth | 🔴 SECURITY — **Phase 1** |

---

## 5. Priority Remediation Path (The "Platinum" Roadmap)

### ✅ Phase 0: Integrity & Security (COMPLETE)
1.  **Hardened RLS** ✅ — Revoked direct DML from `anon`/`authenticated` on all ledger tables.
2.  **Atomic Logistics** ✅ — Fixed Ghost PO. `receive_purchase_order_v1` now atomically: updates PO, writes ledger, emits outbox, logs activity.
3.  **Outbox Activation** ✅ — Wired `trg_signal_procurement_to_finance` and `trg_consume_procurement_signal`. Bridge is live.
4.  **Export Route** ✅ — Auth guard added, stale table reference fixed, tenant isolation enforced via session.
5.  **Debug Routes** ✅ — Fixed stale `expenses` table reference in 2 debug routes.

### 🟡 Phase 1: Architectural Purity (Next)
1.  **Replace `console.log` with `Logger`** — 13 locations across modules and API routes.
2.  **Eliminate `: any` types** — 32 usages; prioritise `ReceiptScanner.tsx` and `useIdentity.ts`.
3.  **Add ErrorBoundary** — Wrap root and each module page to surface render crashes.
4.  **API Middleware** — Centralize auth/logging boilerplate into a shared `withAuth()` wrapper.
5.  **Harden `addTransaction`** — Route through `save_receipt_v3` or a new `add_transaction_v3` RPC.
6.  **Harden PIN auth** — Move to TOTP or cryptographic token, not a deterministic password.

### 🟢 Phase 2: Visual & UX Excellence (Polish)
1.  **Style Extraction** — Move `NavBar.tsx` and scanner inline styles into CSS Modules.
2.  **Branding Restoration** — Fix 404 assets and implement the premium Bento Module Switcher.
3.  **PWA Hardening** — Implement actual offline mutation queue (currently documented, not built).

---

## 6. Architecture Standards (The "Platinum" Rules)

### 6.1 Modular "Shared-Nothing" Isolation
*   **Rule**: The App is divided into three core modules: `Identity`, `Logistics`, and `Finance`.
*   **Encapsulation**: Each module must own its own hooks, components, and domain-specific types.
*   **Communication**: Modules must not have circular dependencies. Shared UI components reside in `@/components`.

### 6.2 Standalone Identity
*   **Rule**: The App must be wrapped in `IdentityGate`. No business logic should run until `tenant_id` is resolved.

---

## 7. Operational File Map

### 7.1 Module: Identity & Discovery
*   **Location**: `/v2/src/modules/identity`
*   **Responsibility**: Auth, Tenant Discovery, and Identity Gating.

### 7.2 Module: Logistics (IMS)
*   **Location**: `/v2/src/modules/logistics`
*   **Responsibility**: SKU Management, Stock Ledger, and Procurement.

### 7.3 Module: Finance (Ledger)
*   **Location**: `/v2/src/modules/finance`
*   **Responsibility**: Transactions, Receipt Scanning, and Financial Intelligence.

---

## 8. Resilience & Regression Baseline

### 8.1 Outbox Resilience
*   **Scenario**: `PROCUREMENT_RECEIVED` → `INVOICE_GENERATED`.
*   **Verification**: Run `scratch/test_outbox_resilience.sql`.
*   **Status**: ✅ Live as of Phase 0.

---

## 9. Technical Debt & Known Issues

| Issue | Severity | Fix Status |
| :--- | :--- | :--- |
| FIFO Batch Costing | 🟡 MEDIUM | **GAP** — Tracking quantity but not batch-specific dollar value. |
| Nested BOMs | 🟡 MEDIUM | **GAP** — Ingredients support 1:1 conversion, not complex recipes. |
| `save_receipt_v3` Overloads | 🟡 MEDIUM | **Phase 1** — 3 signatures; consolidate to 1 canonical form. |
| PIN Auth Security | 🔴 HIGH | **Phase 1** — Deterministic password construction is brute-forceable. |
| Zero ErrorBoundaries | 🔴 HIGH | **Phase 1** — React render crashes are invisible to operators. |

---

## 10. Intelligence Strategy: AI Invoice Pipeline
To achieve **Business-Grade Determinism** for arbitrary B2B invoices, we implement a three-stage pipeline:

1.  **Stage 0: Triage (The Guard)**: Vision LLM verifies document relevancy. Non-financial images are rejected immediately.
2.  **Stage 1: Vision Extraction (The Eyes)**: High-fidelity transcription of spatial relationships (Issuer IČO, Total, Date, Line Items).
3.  **Stage 2: Reasoning Refinement (The Brain)**: Llama 3.3 70B maps transcribed data to Tenant context, performs VAT validation, resolves Supplier Catalog entries.





## 5. Operational File Map

### 5.1 Module: Identity & Discovery
*   **Location**: `/v2/src/modules/identity`
*   **Responsibility**: Auth, Tenant Discovery, and Identity Gating.

### 5.2 Module: Logistics (IMS)
*   **Location**: `/v2/src/modules/logistics`
*   **Responsibility**: SKU Management, Stock Ledger, and Procurement.

### 5.3 Module: Finance (Ledger)
*   **Location**: `/v2/src/modules/finance`
*   **Responsibility**: Transactions, Receipt Scanning, and Financial Intelligence.

---

## 6. Resilience & Regression Baseline

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

## 7. Intelligence Strategy: AI Invoice Pipeline
To achieve **Business-Grade Determinism** for arbitrary B2B invoices, we implement a three-stage pipeline:

1.  **Stage 0: Triage (The Guard)**: Use a fast Vision LLM to verify document relevancy. If the image is not a receipt or invoice (e.g., a blank wall, a person), it is rejected immediately with professional user feedback. This prevents token wastage and hallucinations.
2.  **Stage 1: Vision Extraction (The Eyes)**: High-fidelity transcription of spatial relationships (Issuer IČO, Total, Date, Line Items).
3.  **Stage 2: Reasoning Refinement (The Brain)**: Reasoning LLM (Llama 3.3 70B) maps transcribed data to Tenant context, performs VAT validation, and resolves Supplier Catalog entries.

---

## 8. Operational File Map
*   **`/v2/src/modules/identity`**: Identity & Discovery Module (Standalone).
*   **`/v2/src/modules/logistics`**: Logistics & IMS Module (Standalone).
*   **`/v2/src/modules/finance`**: Financial Ledger & Intelligence Module (Standalone).
*   **`/v2/src/app`**: Core business routing.
*   **`/sql/b2b_evolution`**: Numbered DDL migrations.
