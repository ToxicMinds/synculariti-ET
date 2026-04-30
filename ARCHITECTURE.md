# ET Expense v2 - Comprehensive System Architecture & Production Guide

This document is the definitive source of truth for the **ET Expense v2** SaaS platform. It details the architecture, tech stack, data flows, security model, and production operational procedures required to maintain a high-performance, multi-tenant financial tracking system.

---

## 1. Executive Summary
**Synculariti - Tracker (V2)** is a minimalist, high-performance financial management platform. It transitions the legacy V1 (Vanilla JS/LocalStorage) to a modern, server-side-rendered Next.js architecture. The core value proposition is **Multi-User Determinism**: ensuring that every household member sees the exact same data, insights, and state regardless of device (Mobile PWA or Desktop).

---

## 2. Technology Stack & Infrastructure

The application leverages a "Best-of-Breed" serverless stack designed for maximum performance within free-tier resource constraints.

### 2.1 Core Frameworks
- **Frontend/Backend:** Next.js 14 (App Router)
- **Runtime:** Node.js 18 (Vercel Serverless Functions)
- **Styling:** Premium Vanilla CSS. Employs modern CSS features like `:root` variables, glassmorphism (`backdrop-filter`), and Bento-grid layouts.
- **PWA:** Full Progressive Web App manifest (`manifest.json`) for standalone home-screen installation.

### 2.2 Data Layer (Dual-Engine)
- **Primary (Relational):** Supabase (PostgreSQL). 
  - Handles Auth, Transactions, and Config. 
  - Uses **Postgres Change Subscriptions** for real-time UI updates.
- **Analytical (Graph):** Neo4j Aura DB. 
  - Maps `Merchant` -> `Transaction` -> `Brand` nodes. 
  - Powers structural pattern recognition for AI.

### 2.3 Intelligence Layer
- **Model:** Llama 3.3 (70B) via **Groq API**.
- **Performance:** Sub-second inference latency.
- **Orchestration:** Custom prompt engineering located in `/src/app/api/ai/insight/route.ts`.

---

## 3. Data Architecture & Multi-Tenancy

Data integrity and privacy are enforced via structural isolation.

### 3.1 Structural Multi-Tenancy
1. **The Household Unit:** The primary entity is a `household`. Users are mapped to households via the `app_users` table.
2. **Row Level Security (RLS):** Every PostgreSQL table has a mandatory `household_id` column with a Supabase RLS policy:
   ```sql
   CREATE POLICY "User can only see their household data" ON expenses
   FOR ALL USING (household_id = (SELECT household_id FROM app_users WHERE id = auth.uid()));
   ```
3. **Graph Isolation:** Every node in Neo4j includes a `household_id` property. Every Cypher query is strictly parameterized to filter by this ID.

### 3.2 State Synchronization
V2 eliminates `localStorage` bugs by moving all configuration to the `app_state` table in Supabase.
- **Config JSONB:** Stores member names (`u1`, `u2`), budgets, goals, and smart rules.
- **Deterministic AI Caching:** AI insights are stored in `app_state.config.ai_insight`. The cache is only invalidated when the `expenseCount` changes, preventing redundant API costs and ensuring cross-device consistency.

---

## 4. Operational Workflows

### 4.1 Advanced Receipt Pipeline (eKasa + Groq)
1. **QR Capture:** `html5-qrcode` extracts the Slovak eKasa ID.
2. **Vercel Proxy:** The request is proxied through `/ekasa-proxy/*` to bypass CORS and Slovak Gov API IP restrictions.
3. **AI Itemization:** Groq parses the raw items, normalizes Slovak product names (e.g., "Kup. šunka" -> "Groceries"), and assigns categories.
4. **Graph Normalization:** Upon save, the store name is normalized in Neo4j to link fragmented merchant names to parent Brands (e.g., "Lidl #142" -> "Lidl").

### 4.2 Manual Entry & Data Quality
V2 features an improved **Store/Merchant vs. Description** separation.
- **Description:** Qualitative note about what was bought.
- **Store:** Quantitative merchant name used for Neo4j analytics. 
- If a manual entry lacks a store name, it falls back to the description to ensure graph connectivity.

---

## 5. Resilience & Observability

### 5.1 Fault Tolerance
- **Exponential Backoff:** The `fetchWithRetry` utility handles 5xx errors from Groq/eKasa with a 3-retry limit and 500ms starting backoff.
- **PIN Verification:** Uses a secure PostgreSQL RPC (`check_household_pin`) to verify bcrypt-hashed PINs without exposing them to the client.

### 5.2 Zero-Cost Monitoring
- **Health Check:** `/api/health` performs live pings to Postgres and Neo4j.
- **Audit Logs:** Postgres triggers log all table mutations.
- **System Logs:** The `systemLog` utility writes client-side JS errors directly into the `audit_logs` table for remote troubleshooting.

---

## 6. Deployment & Maintenance

### 6.1 Rollout Strategy
1. **Root Directory:** In Vercel Settings, change the root directory from `/` to `v2`.
2. **Env Vars:** Ensure `NEXT_PUBLIC_SUPABASE_URL`, `GROQ_API_KEY`, and `NEO4J_PASSWORD` are set in the Vercel dashboard.

### 6.2 Database Backfills
When migrating data or refining the graph, use the dedicated debug endpoints (secured via `key=et-secret-sync`):
- `/api/debug/sync-neo4j`: Performs a "Big Bang" sync of all Supabase transactions to the Graph.
- `/api/debug/backfill-neo4j`: Specifically stamps missing `household_id` properties onto existing graph nodes to enable multi-tenant isolation.

---

## 7. Known Tech Debt & Future Roadmap
- **TECH_DEBT-004:** Category DRY violation. Currently, categories are defined in `state.js` (v1) and `config` (v2). V2 transition should unify this.
- **ROADMAP:** Implementation of "Franchise-mode" for tracking multiple unrelated households under a single franchise owner.
- **ROADMAP:** Integration with Enable Banking API for direct bank account sync.
