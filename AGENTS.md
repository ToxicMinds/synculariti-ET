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

*Last updated: 2026-05-13 — Post Phase 2 Refinement.*

| Principle | Status | Detail |
| :--- | :--- | :--- |
| **ACID** | 🟡 **Warning** | Hardened RPCs live. Non-atomic logic remains in `save_receipt_v3`. |
| **Security** | 🟡 **Warning** | API routes hardened with `withAuth`. Groq proxy closed. PWA biometrics pending. |
| **DRY** | 🟡 **Warning** | Extensive duplication between `AuthScreen` and `IdentityAuth`. `ServerLogger` centralized but flawed. |
| **Type Safety** | 🔴 **Critical Debt** | Actual count: **62** `: any` usages. RULES.md violated (JS files in src, no explicit returns). |
| **SOLID** | 🟡 **Warning** | `useSync` and `TenantContext` are God-objects. No Strategy pattern for AI parsing. |
| **Observability** | 🟡 **Flawed** | `ServerLogger` swallows errors in empty `catch` blocks. `health` route misconfigured. |
| **Error Handling** | 🟡 **Mixed** | ErrorBoundary exists, but many API routes lack catch-block telemetry. |
| **Resilience** | 🟢 **Hardened** | `OfflineQueue` implementation is the only fully verified success. |

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

---

## 5. Priority Remediation Path (The "Platinum" Roadmap)

### ✅ Phase 0: Integrity & Security (COMPLETE)
1.  **Missing RPCs** ✅ (add_transaction_v3, receive_purchase_order_v1, create_inventory_item_v1)
2.  **Missing Tables** ✅ (tenant_members)
3.  **Schema Alignment** ✅ (expenses/transactions resolved)

### ✅ Phase 1: Security Hardening (COMPLETE)
1.  **Missing `withAuth`** ✅ (Applied to 6 routes)
2.  **Open Groq Proxy** ✅ (Closed & CORS hardened)
3.  **Hardcoded Secrets** ✅ (Moved to `SYNC_SECRET_KEY`)

### ✅ Phase 2: Structural Repair & Polish (COMPLETE)
1.  **Direct DML Regression Fixes** ✅
2.  **API Auth Realization** ✅
3.  **PWA Hardening** ✅ — `offlineQueue.ts` implemented.
4.  **SQL Refinements** ✅ — Security & Performance hardening.
5.  **Build Stabilization** ✅ — `ServerLogger.user()` implemented to fix Node.js crashes.

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
| `withAuth` applied to all routes. | Verified: All 13 routes now protected (excluding health). | ✅ FIXED |
| "RPCs exist for all mutations" | Verified: RPCs were missing but are now CREATED and HARDENED. | ✅ FIXED |
| "`tenant_members` exists" | Verified: Table was missing but is now CREATED with RLS. | ✅ FIXED |
| Gherkin Pipeline completion. | Verified: Steps are empty `// TODO` blocks. | 🟠 REMEDIATING (Phase 3) |
| "expenses renamed to transactions" | Verified: Rename was applied but contradictory; now ALIGNED. | ✅ FIXED |
| "~30 `: any` usages" | Verified: Actual count is **62**. | 🟠 REMEDIATING (Phase 2) |

---

## 10. Intelligence Strategy: AI Invoice Pipeline
To achieve **Business-Grade Determinism**, we use a three-stage pipeline:
1.  **Stage 0: Triage (The Guard)**: Vision LLM verifies document relevancy.
2.  **Stage 1: Vision Extraction (The Eyes)**: High-fidelity transcription.
3.  **Stage 2: Reasoning Refinement (The Brain)**: Llama 3.3 70B maps to Tenant context.
