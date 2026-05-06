# Synculariti-ET (B2B SaaS Primitive)

This document is the definitive guide for AI assistants and developers. It consolidates architecture, design principles, and operational rules for the **Synculariti-ET** platform—the B2B SaaS evolution of the ET Expense engine.

> For the full developer rulebook (stack, commands, conventions, what NOT to do), see **`RULES.md`**.

---

## 1. Project Overview
**Synculariti-ET** is the enterprise-grade evolution of ET Expense. While it shares the core v2 engine, its architectural focus is on **Multi-Location B2B primitives**, generalization for SMBs, and professional-grade financial auditing.
*   **Mission**: Business-Grade Determinism. Moving from household tracking to multi-location restaurant and SMB financial management.
*   **Core Stack**: Next.js 16.2 (App Router), TypeScript 5, Supabase (Postgres 17), Neo4j 6 (Graph), Groq AI (Llama 3.3 70B).
*   **Architecture**: "Shared-Nothing" Multi-Tenant Isolation.
*   **Supabase Project**: `Synculariti-B2B` (`xtquhajccuitutvbxisd`, region: `eu-west-1`)

---

## 2. Architecture Standards (The "Platinum" Rules)

### 2.1 Platinum Handshake (Initialization)
*   **Rule**: Use the `get_household_bundle` RPC for all frontend initialization.
*   **Structure**: Returns `{ household, locations, user, server_time }` in one atomic round-trip.
*   **Safety**: Must use `COALESCE` for arrays to prevent frontend `null` crashes.

### 2.2 Atomic Transactions & Ledger Guard
*   **Rule**: Use `save_receipt_v3` for all financial mutations. `save_receipt_v2` is **deprecated**.
*   **Why v3**: Adds dual-layer security (Tenant + Location Ownership), `location_id` field, and ISO-4217 currency propagation to both `expenses` and `receipt_items`.
*   **Code Status**: `useSync.ts` currently calls `save_receipt_v2` — this is a **known bug** that must be fixed before any new B2B feature ships. See `RULES.md` for the correct pattern.
*   **Validation**: Every RPC must perform a **Dual-Layer Check** (Tenant Mismatch + Location Ownership).
*   **Integrity**: Expenses must have an ISO-4217 currency (length=3) and amount >= 0.

### 2.3 Automatic Auditing (Black Site Standard)
*   **Rule**: All ledger mutations MUST be captured by the `activity_log`.
*   **Implementation**: Enforced via database triggers (`trg_audit_expenses`) to capture manual Dashboard edits and API calls alike.

### 2.4 Tenant Separation & RLS
*   **Standard**: Every table MUST have `FORCE ROW LEVEL SECURITY`.
*   **Isolation**: All policies must use the memoized `get_my_household()` helper.

### 2.5 Intelligence Strategy (Cloud-TTL)
AI Insights (Groq) are shared across the household to minimize cost and latency.
*   **TTL**: 24 hours (Cloud-backed).
*   **Determinism**: Cache is only invalidated if the `dataHash` (totals/count) changes.
*   **eKasa Engine**: Dual-Protocol (Online ID + OKP Raw Data). The scanner falls back to OKP metadata extraction if a standard ID is missing.
*   **Regionality**: eKasa requests are proxied via EU-Central (Paris/Frankfurt) to bypass regional IP blocks. Proxy config lives in `vercel.json`.
*   **Unified Categories**: Groq ALWAYS receives the household's master category list from `household.categories` (sourced from `v2/src/lib/constants.ts`). Never let Groq invent categories.

### 2.6 PWA Standards (2026)
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
*   **`/v2/src/app`**: Core routing and Page layouts. API routes live under `/api/`.
*   **`/v2/src/hooks`**: Specialized logic — `useTransactions` (read-only), `useSync` (write-only), `useHousehold` (types).
*   **`/v2/src/components`**: UI layer (Bento cards, Scanners, Charts, NavBar).
*   **`/v2/src/lib`**: Financial calculations, eKasa protocols, server utilities.
    *   `constants.ts` — Category & icon source of truth.
    *   `finance.ts` — Pure financial functions (tested via `finance.test.ts`).
    *   `ekasa-protocols.ts` — QR extraction (Baseline + OKP protocol).
    *   `logger.ts` — `Logger.system()` (telemetry) + `Logger.user()` (Business Feed).
    *   `neo4j.ts` — `normalizeAndLinkMerchant()` — graph sync after every expense save.
    *   `supabase.ts` — Client-side Supabase instance.
    *   `supabase-server.ts` — SSR-safe server-side Supabase instance.
*   **`/v2/src/context`**: `HouseholdContext.tsx` — global state, `fetchHouseholdState` (calls `get_household_bundle`).
*   **`/sql/b2b_evolution`**: Ordered DDL migrations (00–03). Never alter applied files; add new numbered files.
*   **`/sql/security_hardening_v2.sql`**: RLS policies and security enforcement.
*   **`/sql/observability_v2.sql`**: `system_telemetry` and `activity_log` table setup.
*   **`/vercel.json`**: eKasa proxy rewrite rules (do not remove).
*   **`/.agents/skills/`**: Agent skill library — read relevant SKILL.md before executing specialized tasks.

---

## 6. Resilience & Observability (The "Black Site" Standard)

To ensure the platform is reliable and observable without technical clutter, we enforce a **Dual-Channel Logging** strategy.

### 6.1 Dual-Channel Strategy
1.  **System Telemetry (Technical)**:
    *   **Purpose**: Debugging, performance tracking, and failure analysis.
    *   **Storage**: `system_telemetry` table.
    *   **Visibility**: Hidden from users. Mirror to local console during development.
    *   **Implementation**: `Logger.system(level, component, message, metadata, householdId)`
    *   **Use Case**: Groq API errors, Neo4j timeouts, Database locks.
2.  **Activity Log (User-Visible)**:
    *   **Purpose**: Transparency and business history.
    *   **Storage**: `activity_log` table.
    *   **Visibility**: Displayed in the **"Business Feed"** in the UI.
    *   **Implementation**: `Logger.user(householdId, action, description, actorName)`
    *   **Use Case**: "Nik added €50.00 at Lidl", "Monthly Insight generated".

### 6.2 Failure Protocol (ANY Failure)
1.  **Stage 1: Automatic Recovery**: Attempt 3-stage exponential backoff (1s → 2s → 4s) for all network/database operations. **Already implemented in `useSync.ts` `saveReceipt`.**
2.  **Stage 2: Technical Capture**: On final failure, log the full context (Payload + Stack) to `Logger.system('ERROR', ...)`.
3.  **Stage 3: User Notification**: Surface a non-technical, actionable message to the user. Never show raw database errors to the business user.

---

## 7. Known Issues & Technical Debt

| Issue | Severity | Location | Fix |
|-------|----------|----------|-----|
| ~~`useSync.ts` calls `save_receipt_v2`~~ | ~~🔴 HIGH~~ | ~~`v2/src/hooks/useSync.ts:107`~~ | ✅ **Fixed** — migrated to `save_receipt_v3` with `location_id` + `currency` |
| `session` typed as `any` in `HouseholdContext` | ~~🟡 MEDIUM~~ | ~~`HouseholdContext.tsx:9,23`~~ | ✅ **Fixed** — replaced with `Session` from `@supabase/supabase-js`; also fixed `console.error` → `Logger.system` |
| Neo4j errors swallowed with `console.error` | ~~🟡 MEDIUM~~ | ~~`useSync.ts:64,119,170`~~ | ✅ **Fixed** — replaced with `Logger.system('ERROR', 'Neo4j', ...)` |
