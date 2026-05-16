# Synculariti-ET (B2B SaaS Primitive)

This document is the definitive guide for AI assistants and developers. It consolidates the **current architecture**, design principles, and operational standards for the Synculariti-ET platform.

---

## 1. Project Overview
**Synculariti-ET** is an enterprise-grade financial management platform for multi-location SMBs.
*   **Mission**: Business-Grade Determinism.
*   **Core Stack**: Next.js 16.2 (App Router), TypeScript 5, Supabase (Postgres 17), Neo4j 6 (Graph), Groq AI (Llama 3.3 70B).
*   **Architecture**: "Shared-Nothing" Multi-Tenant Isolation.

---

## 2. Core Modules (The Baseline)

### 2.1 Identity & Access
- **Tenant Isolation**: Secure multi-tenant discovery via `tenant_members`.
- **Identity Gate**: All business logic is wrapped in an `IdentityGate` that requires a resolved `tenant_id`.

### 2.2 Logistics (IMS)
- **Append-only Ledger**: Physical stock is a calculated sum of the `inventory_ledger`.
- **Atomic Procurement**: `receive_purchase_order_v1` is the canonical entry point for inventory receipts.

### 2.3 Finance (Ledger Bridge)
- **Deterministic Tracking**: Fiscal receipt scanning via Slovak eKasa QR protocol.
- **Outbox Pattern**: Cross-domain signals flow through `graph_sync_queue` for eventual consistency with the Neo4j graph.

### 2.4 PWA Mobility
- **Offline-First**: `OfflineQueue` handles mutation resilience with cross-tab locking (`navigator.locks`).

---

## 3. Principles Scorecard (Current State)

| Principle | Status | Standard |
| :--- | :--- | :--- |
| **ACID** | 🟢 **Hardened** | All ledger mutations (Finance/Logistics) use atomic Postgres RPCs. |
| **Security** | 🟢 **Hardened** | RLS enforced on all tables. `search_path` and `REVOKE` policies verified via contract. |
| **DRY** | 🟢 **Hardened** | AI prompts, Neo4j utilities, and Auth components are unified in `@/lib`. |
| **Type Safety** | 🟢 **Hardened** | **0** `: any` usages. Full interface coverage for external data (eKasa, Groq, Web Locks). |
| **SOLID** | 🟢 **Hardened** | Domain logic is isolated in `modules/`. Business logic is decoupled from UI via headless hooks. |

---

## 4. Architecture Standards (The Rules)

### 4.1 Modular "Shared-Nothing" Isolation
- Every business domain MUST live in its own `modules/` subdirectory.
- Hooks, components, and domain-specific types must stay inside the module.

### 4.2 Security & API Governance
- **No Direct DML**: DB explicitly denies `INSERT/UPDATE/DELETE` to `authenticated` clients. Use canonical RPCs (e.g., `save_receipt_v4`).
- **Session-Based tenant_id**: `tenant_id` is resolved server-side from session via RLS — never passed as a param.
- **search_path Safety**: All DB functions must include `SET search_path = public`.
- **Auth Guard**: All sensitive API routes MUST be wrapped with `withAuth` middleware and use the `SecureContext` pattern for type-safe App Router compliance.
- **Input Validation**: All API routes MUST use Zod schemas from the unified validation registry for request sanitization.
- **Normalizing Washer**: Use the 'Washer' pattern (Zod transforms + defaults) for all routes handling external or nullable metadata to guarantee type safety without rejecting valid but incomplete data.

### 4.3 Intelligence Strategy
We use a deterministic AI pipeline for financial categorization:
1. **Stage 1 (Vision)**: LLM-based spatial transcription.
2. **Stage 2 (Reasoning)**: Llama 3.3 70B mapping to injected Tenant category contexts.

### 4.4 Headless Viewport Pattern
- All navigation, fiscal calendar generation, and module switching MUST be handled by the `useNavigation` hook.
- UI components (e.g., `NavBar`) MUST be stateless "View" shells that consume the hook.
- **Suspense Isolation**: Hook consumption MUST happen inside a sub-component wrapped in `<Suspense>` to ensure static-page safety (e.g. 404 pages).
- Never manually manipulate `URLSearchParams` for month or module selection; use the `actions` provided by the viewport hook.

---

## 5. Telemetry & Observability
- **Logger, not console**: Use `Logger.system()` for technical telemetry and `Logger.user()` for business audit trails. Use the centralized `LogComponent` type for all system logs.
- **API Telemetry**: API routes MUST use `ServerLogger` to avoid browser global conflicts.
- **Visibility**: If an action doesn't appear in the Activity Log, it didn't happen.
