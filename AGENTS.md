# Synculariti-ET (SaaS Primitive Fork)

This document is the definitive guide for AI assistants and developers. It consolidates architecture, design principles, and operational rules for the **Synculariti-ET** platform—the B2B SaaS evolution of the ET Expense engine.

---

## 1. Project Overview
**Synculariti-ET** is the enterprise-grade evolution of ET Expense. While it shares the core v2 engine, its architectural focus is on **Multi-Location B2B primitives**, generalization for SMBs, and professional-grade financial auditing.
*   **Mission**: Business-Grade Determinism. Moving from household tracking to multi-location restaurant and SMB financial management.
*   **Core Stack**: Next.js 14 (App Router), TypeScript, Supabase (Postgres), Neo4j (Graph), Groq AI (Llama 3.3).

---

## 2. Architecture Standards (The "Must-Follow" Rules)

### 2.1 Atomic Transactions (ACID)
All mutations (Saves, Deletes, Updates) MUST be atomic.
*   **Rule**: Use the `save_receipt_v2` RPC for all receipt saves.
*   **Performance**: Bulk insert (O(1)) via `unnest` pattern. 
*   **Integrity**: Mathematical validation (Sum check) is enforced at the database level.
*   **Resilience**: 3-stage exponential backoff (1s -> 2s -> 4s) on all mutation hooks.

### 2.2 Intelligence Strategy (Cloud-TTL)
AI Insights (Groq) are shared across the household to minimize cost and latency.
*   **TTL**: 24 hours (Cloud-backed).
*   **Determinism**: Cache is only invalidated if the `dataHash` (totals/count) changes.
*   **eKasa Engine**: Dual-Protocol (Online ID + OKP Raw Data). The scanner falls back to OKP metadata extraction if a standard ID is missing.
*   **Regionality**: eKasa requests are proxied via EU-Central (Paris/Frankfurt) to bypass regional IP blocks.
*   **Unified Categories**: Groq always receives the household's master category list from `v2/src/lib/constants.ts`.

### 2.3 PWA Standards (2026)
*   **Identity**: Minimalist header. No logo text on mobile; personal circular avatar only.
*   **Safe Areas**: Adheres to modern mobile safe-area insets and orientation locking.

---

## 3. Principles Audit (Architecture Compliance)

### 3.1 Standards Enforced
1.  **DRY (Don't Repeat Yourself)**:
    *   **Status**: **ENFORCED**.
    *   **Solution**: Categories and Icons are centralized in `v2/src/lib/constants.ts` and managed via the `HouseholdContext`.
    *   **Rule**: NEVER hardcode categories in components. Always pull from `household.categories`.
2.  **Single Responsibility (SOLID)**:
    *   **Status**: **ENFORCED**.
    *   **Solution**: Fetch logic (`useTransactions`) and mutation logic (`useSync`) are strictly isolated.
    *   **Rule**: Keep read-only state and write-only transactions in separate hooks.
3.  **Least Privilege (Security)**:
    *   **Status**: **HARDENED**. RLS is enforced on all tables via `security_hardening_v2.sql`.
    *   **Vault Header Pattern**: All API routes use server-side session resolution. No sensitive IDs are passed in frontend code.

---

## 4. Tenant Separation Logic (Cross-Device Security)
To ensure absolute isolation between households:
1.  **JWT Claims**: Every request to Supabase must include the user's JWT.
2.  **SSR Auth**: All client-side clients MUST use cookie-based session mirroring (`@supabase/ssr`) to ensure the server can authorize API requests.
3.  **Server-Side Resolution**: The database uses `auth.uid()` to look up the `household_id` in `app_users` via the `get_my_household()` helper.
4.  **Memoized Resolution**: Uses `get_my_household()` server-side helper to isolate rows by `household_id`.

---

## 5. Operational File Map
*   **`/v2/src/app`**: Core routing and Page layouts.
*   **`/v2/src/hooks`**: Specialized logic (`useTransactions`, `useSync`, `useHousehold`).
*   **`/v2/src/components`**: UI layer (Bento cards, Scanners).
*   **`/v2/src/lib`**: Financial calculations, eKasa protocols, and server utilities.
*   **`/sql`**: Hardened security policies, RPC functions, and Observability.
---

## 6. Resilience & Observability (The "Black Site" Standard)

To ensure the platform is reliable and observable without technical clutter, we enforce a **Dual-Channel Logging** strategy.

### 6.1 Dual-Channel Strategy
1.  **System Telemetry (Technical)**:
    *   **Purpose**: Debugging, performance tracking, and failure analysis.
    *   **Storage**: `system_telemetry` table.
    *   **Visibility**: Hidden from users. Mirror to local console during development.
    *   **Use Case**: Groq API errors, Neo4j timeouts, Database locks.
2.  **Activity Log (User-Visible)**:
    *   **Purpose**: Transparency and household history.
    *   **Storage**: `activity_log` table.
    *   **Visibility**: Displayed in the "Family Feed" in the UI.
    *   **Use Case**: "Nik added €50.00 at Lidl", "Monthly Insight generated".

### 6.2 Failure Protocol (ANY Failure)
1.  **Stage 1: Automatic Recovery**: Attempt 3-stage exponential backoff (1s -> 2s -> 4s) for all network/database operations.
2.  **Stage 2: Technical Capture**: On final failure, log the full context (Payload + Stack) to `Logger.system('ERROR', ...)`.
3.  **Stage 3: User Notification**: Surface a non-technical, actionable message to the user. Never show raw database errors to the household.
