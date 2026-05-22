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
- **Data Integrity Contracts**: All ledger mutations MUST maintain strict compliance with schema contracts, including propagating `updated_at` timestamps to prevent `42703 undefined_column` crashes.
- **Session-Based tenant_id**: `tenant_id` is resolved server-side from session via RLS — never passed as a param.
- **search_path Safety**: All DB functions must include `SET search_path = public`.
- **Auth Guard**: All sensitive API routes MUST be wrapped with `withAuth` middleware and use the `SecureContext` pattern for type-safe App Router compliance.
- **Input Validation**: All API routes MUST use Zod schemas from the unified validation registry for request sanitization.
- **Normalizing Washer**: Use the 'Washer' pattern (Zod transforms + defaults) for all routes handling external or nullable metadata to guarantee type safety without rejecting valid but incomplete data.

### 4.3 Intelligence Strategy
We use a deterministic AI pipeline for financial categorization:
1. **Stage 1 (Vision)**: LLM-based spatial transcription.
2. **Stage 2 (Reasoning)**: Llama 3.3 70B mapping to injected Tenant category contexts.
- **Hardware/Intelligence Decoupling (SRP)**: Complex components (like Receipt Scanners) MUST separate hardware logic (`useCamera`) from intelligence parsing (`useReceiptProcessor`).
- **Idempotency Shield**: All intelligence parsing MUST be gated by an idempotency hash (e.g., SHA-256 of the image blob) to prevent redundant AI API calls and ensure graceful degradation timeouts.

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

---

## 6. Graph Sync & CI Standards

### 6.1 High-Performance Graph Ontology Sync (Neo4j)
- **3-Phase Lock-Safe Cypher Engine**: To prevent Cartesian products and thread write-locks on highly-shared global ingredients, bulk merges MUST execute in three isolated phases:
  1. *Phase 1 (Parents Ingest)*: UNWIND transactions, MERGE `:Merchant` and `:Transaction` nodes and link them.
  2. *Phase 2 (Eager Aggregation)*: Deduplicate global `:Ingredient` nodes **before** merging using `WITH DISTINCT item.canonicalIngredientId AS ingId, item`. This guarantees a single write-lock per unique ingredient across the entire batch context.
  3. *Phase 3 (SKU Construction)*: UNWIND flat items, MATCH parents/ingredients via unique constraints, and MERGE `:MerchantSKU` nodes, avoiding concurrent collisions.
- **Flat-Memory Cursor Sliding Loops**: Bulk outbox syncing MUST process queues using flat sliding loop index windows (`.slice(i, i + BATCH_SIZE)`) instead of mutating arrays via `.splice()`. This guarantees $O(1)$ memory allocation and prevents V8 garbage collection thrashing.
- **Outbox Integrity & Self-Healing**: Dynamic outbox queues (`graph_sync_queue`) record CRUD events in real-time. If a transaction SKU or ingredient arrives out-of-order, the engine MUST self-heal by merging missing parent transaction nodes before executing SKU connections.

### 6.2 CI Runner Hardening & Node.js 24 Compliance
- **Target Node 24**: All CI execution pipelines (GitHub Actions) MUST target Node.js 24 (`node-version: '24'`) and set the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` runner environment variable to suppress actions runner warnings and align with active deprecation deadlines.
  - **Engine Compliance**: Ensure `package.json` contains `"engines": { "node": ">=20" }` to prevent npm installer conflicts in modern Node runtimes.
- **Test boundaries**: Always match Jest-Cucumber BDD tests inside the `backend` node-based project to prevent jsdom context pollution.

### 6.3 Type-Safe Polymorphic Identity Casting (Postgres & TypeScript)
- **Zero-Crash Polymorphic Casting Gateways**: All UUID database columns MUST use type-safe SQL helper functions (`public.safe_cast_uuid(TEXT)` and `public.safe_cast_user_uuid(TEXT)`) inside bulk ingest operations. 
  - Standard UUID strings are successfully parsed and preserved as-is.
  - Lightweight mock staff user IDs (`'u1'`, `'u25'`) are deterministically padded to valid, type-safe UUID nodes (e.g., `'00000000-0000-0000-0000-000000000025'::uuid`) rather than nullified. This preserves user identity mapping for analytical queries and eventual graph ontology syncs.
  - Mock IDs exceeding 12 digits (e.g., `'u9999999999999'`) are intercepted by a length-constrained regex (`^u[0-9]{1,12}$`) and cleanly mapped to the generic guest fallback UUID to prevent integer or pad overflows.
  - Empty strings resolve to `NULL` to avoid serialization crash states. All other unmappable strings default safely to the system guest fallback UUID (`'00000000-0000-0000-0000-000000000000'::uuid`).
- **IMMUTABLE STRICT Performance**: In order to prevent procedural PL/pgSQL context switches and optimize planning throughput, casting helpers MUST be defined in `LANGUAGE sql` and marked `IMMUTABLE STRICT`. This enables the query planner to inline statements directly.

### 6.4 Live Database Security Catalog Verification Standard
- **The Security Oracle Pattern**: Security compliance must not rely on passive code reviews or mock test coverage. We enforce a live security test suite (`db-security.test.ts`) utilizing the superuser-privileged `get_function_security_state` database RPC.
- **Strict Verification Primitives**: The testing suite queries PostgreSQL's system catalog (`pg_proc`, `pg_namespace`, `has_function_privilege`) in real-time to guarantee:
  1. *Function Existence*: The function is correctly declared with target arguments signature mapping exactly (`pg_catalog.oidvectortypes`).
  2. *Injection Protection*: Strict search path hardening exists (`search_path=public` is present in `proconfig`).
  3. *Zero-Privilege Default*: The `EXECUTE` permission is completely revoked from both the `anon` and `public` roles to avoid inheritance vulnerabilities.
- **Landmine Detection**: The live security suite checks that legacy, insecure functions or parameter overloads do NOT exist in the public database schema, forcing active remediation.



