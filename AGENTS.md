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

| Principle | Status | Implementation Detail |
| :--- | :--- | :--- |
| **DRY** | 🟢 **Platinum** | Logic centralized in `modules/identity`, `modules/logistics`, and `modules/finance`. No cross-domain logic duplication. |
| **ACID** | 💎 **Platinum** | **Logistics**: Append-only ledger for stock. **Finance**: Atomic RPCs (`save_receipt_v3`) for multi-table transactions. |
| **SOLID** | 🟢 **Platinum** | Domain isolation via Physical Decoupling. Hooks are split by responsibility (e.g., Read vs Write in Finance). |
| **Security** | 💎 **Hardened** | **Force RLS** on every table. Tenant isolation enforced via `get_my_tenant()` at the DB level. |

---

## 4. Architecture Standards (The "Platinum" Rules)

### 4.1 Modular "Shared-Nothing" Isolation
*   **Rule**: The App is divided into three core modules: `Identity`, `Logistics`, and `Finance`.
*   **Encapsulation**: Each module must own its own hooks, components, and domain-specific types.
*   **Communication**: Modules must not have circular dependencies. Shared UI components reside in `@/components`.

### 4.2 Standalone Identity
*   **Rule**: The App must be wrapped in `IdentityGate`. No business logic should run until `tenant_id` is resolved.

---

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
To achieve **Business-Grade Determinism** for arbitrary B2B invoices, we implement a dual-stage pipeline:

1.  **Stage 1: Vision Extraction (The Eyes)**: Use a Vision LLM (e.g., Llama 3.2 Vision) to perform high-fidelity transcription of the invoice image. Focus: Spatial relationship of Total, Date, Issuer IČO/DIČ, and Line Items.
2.  **Stage 2: Reasoning Refinement (The Brain)**: Feed the transcription + Tenant Context into a Reasoning LLM (Llama 3.3 70B). Focus: Category mapping, VAT validation, and Supplier Catalog resolution.

---

## 8. Operational File Map
*   **`/v2/src/modules/identity`**: Identity & Discovery Module (Standalone).
*   **`/v2/src/modules/logistics`**: Logistics & IMS Module (Standalone).
*   **`/v2/src/modules/finance`**: Financial Ledger & Intelligence Module (Standalone).
*   **`/v2/src/app`**: Core business routing.
*   **`/sql/b2b_evolution`**: Numbered DDL migrations.
