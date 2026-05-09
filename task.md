# Synculariti-ET: B2B Evolution Roadmap

## Phase 1: Infrastructure & Platinum Foundation
- [x] Create dedicated Supabase Project (`Synculariti-B2B`)
- [x] Create dedicated Groq Project
- [x] Create isolated Neo4j Aura Instance
- [x] Environment Handshake (`v2/.env.local` configured)
- [x] Hardened Base Schema (RLS, Auditing, Secure RPCs)
- [x] Multi-Location Primitives (Locations, Unique Constraints)
- [x] Ledger Evolution (V3 RPC, ISO Currency, Location-linking)
- [x] Platinum Bundle (Zero-Join Handshake RPC)
- [x] Context Transition (Location-aware AppState)

## Phase 2: Schema Realignment (Synculariti Finance) [DONE]
- [x] SQL Migration: Create `chart_of_accounts` and migrate existing categories.
- [x] SQL Migration: Rename `expenses` to `transactions`.
- [x] SQL Migration: Create `invoices` and `invoice_items`.
- [x] SQL Migration: Implement PostgreSQL Outbox pattern.
- [x] Codebase Update: Refactor `save_receipt_v3` and frontend types to match `transactions`/`invoices`.
- [x] Build Ledger UI (CoA + Invoices)

## Phase 3: Auth & Testing Unblock [DONE]
- [x] Setup Supabase Auth UI in the Next.js frontend (Email/Password).
- [x] Update `TenantContext` to bind logged-in user to a `tenant_id`.
- [x] Implement `/login` page with JWT support.

## Phase 4: Location-Aware UI & Logistics [/]
- [x] CSS Professionalization: Centralized utility system in `globals.css`.
- [x] Logistics Foundation: Adapted IMS schema with multi-tenant RLS.
    - [x] Hardened with UOM conversion and PO validation.
    - [x] Secured current_inventory view with security_invoker.
- [x] Ecosystem Handshake: PO receipt -> Auto-Invoice signal.
- [x] Module Switcher: Navigational integration in NavBar.
- [x] Logistics UI: Catalog management, Item registration, and Stock tracking.
- [ ] Dashboard: Location filtering & Branch switching.
- [ ] Expense Entry: Location selection.

## Phase 5: Production Readiness & Scale
- [ ] Analytics: Advanced burn-rate forecasting (Groq AI).
- [ ] Mobile: PWA push notifications for stock alerts.
- [ ] Resilience: Offline synchronization for stock counts.
