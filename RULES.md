# Project: Synculariti-ET

## What This Project Does
Synculariti-ET is a **B2B SaaS expense management platform** for multi-location SMBs and restaurant groups. Built on the ET Expense v2 engine, it provides multi-tenant financial tracking with fiscal receipt scanning (Slovak eKasa QR protocol), AI-powered categorization (Groq/Llama 3.3), and a merchant intelligence graph (Neo4j). It targets business owners who need deterministic, audit-grade financial records across multiple physical locations — not household budgeting.

---

## Stack
- **Frontend**: Next.js 16.2 (App Router), React 19, TypeScript 5
- **Styling**: Vanilla CSS (`globals.css`) — no Tailwind
- **Backend**: Next.js API Routes (serverless, Vercel)
- **Primary Database**: Supabase (PostgreSQL 17) — `xtquhajccuitutvbxisd`
- **Graph Database**: Neo4j 6 — merchant normalization and linking
- **AI**: Groq SDK (`groq-sdk`) — Llama 3.3 70B for categorization and insights
- **Auth**: Supabase Auth with `@supabase/ssr` (cookie-based, SSR-safe)
- **Deployment**: Vercel (auto-deploy on push to `main`, root dir: `v2/`)
- **Testing**: Jest 30 + ts-jest

---

## Key Commands
All commands run from `v2/`:
```bash
cd v2
npm run dev      # Start local dev server (Next.js)
npm run build    # Production build — must pass before any deploy
npm run lint     # ESLint check — must be zero errors
npm run test     # Run Jest test suite
npm run start    # Start production server locally
```

---

## Architecture

```
synculariti-ET/
├── AGENTS.md              ← AI agent rules (read this first)
├── RULES.md               ← This file — developer rulebook
├── vercel.json            ← eKasa proxy rewrite rules
├── sql/
│   └── b2b_evolution/     ← Ordered SQL migrations (00_ → 03_)
│       ├── 00_base_schema.sql
│       ├── 01_locations.sql
│       ├── 02_expenses_update.sql
│       └── 03_code_db_handshake.sql
└── v2/                    ← Next.js application root
    └── src/
        ├── app/           ← Next.js App Router pages + API routes
        │   ├── api/
        │   │   ├── ai/         ← AI insights endpoint
        │   │   ├── auth/       ← Auth helpers
        │   │   ├── ekasa/      ← eKasa receipt lookup
        │   │   ├── ekasa-proxy/← Slovak FinSprva proxy
        │   │   ├── enablebanking/ ← Bank sync (Enable Banking API)
        │   │   ├── export/     ← Data export endpoints
        │   │   ├── groq/       ← Groq AI categorization
        │   │   └── health/     ← Health check
        │   ├── settings/   ← Settings page
        │   ├── layout.tsx  ← Root layout (PWA metadata, fonts)
        │   └── page.tsx    ← Main dashboard
        ├── components/    ← Reusable UI components (Bento cards, scanner, charts)
        ├── context/
        │   └── TenantContext.tsx    ← Global app state provider
        ├── hooks/
        │   ├── useTenant.ts       ← Type definitions for app state
        │   ├── useTransactions.ts ← READ-ONLY: fetches expenses
        │   └── useSync.ts         ← WRITE-ONLY: financial mutations
        └── lib/
            ├── constants.ts       ← DEFAULT_CATEGORIES, CATEGORY_ICONS (source of truth)
            ├── ekasa-protocols.ts ← QR extraction (baseline + OKP protocol)
            ├── finance.ts         ← Pure financial calculation functions
            ├── finance.test.ts    ← Jest tests for finance.ts
            ├── logger.ts          ← Logger class (system telemetry + user activity)
            ├── neo4j.ts           ← Merchant graph operations
            ├── rules.ts           ← Business rule validations
            ├── supabase.ts        ← Client-side Supabase client
            ├── supabase-server.ts ← Server-side Supabase client (SSR)
            └── utils.ts           ← General utilities
```

---

## Coding Conventions

### TypeScript
- **TypeScript only.** No `.js` files in `src/`. No `require()`.
- All functions must have **explicit return types**. No implicit `any`.
- Use `async/await`. No raw `.then()/.catch()` chains.
- Use `as any` only as a last resort, always with a `// REASON:` comment.

### Hooks — Hard Separation
- `useTransactions` — **read-only**. Never put write logic here.
- `useSync` — **write-only**. Never put fetch/query logic here.
- Never mix these concerns in the same component or hook.

### Categories — Single Source of Truth
- Categories live in `v2/src/lib/constants.ts` (`DEFAULT_CATEGORIES`, `CATEGORY_ICONS`).
- At runtime, the live list comes from `tenant.categories` via `TenantContext`.
- **NEVER** hardcode a category string in a component. Always read from context.
- Groq MUST receive `tenant.categories` in every prompt — never let it invent categories.

### Financial Mutations
- All expense writes go through the `save_receipt_v3` Supabase RPC. No exceptions.
- `save_receipt_v2` is **deprecated** — it lacks location ownership checks and currency fields.
- Every mutation MUST: call `Logger.user(...)`, call `triggerRefresh()`, fire Neo4j sync.
- All network/DB writes MUST have 3-stage exponential backoff (1s → 2s → 4s).

### Logging
- **Technical errors** → `Logger.system('ERROR', component, message, metadata, tenantId)`
- **User-visible events** → `Logger.user(tenantId, action, description, actorName)`
- **NEVER** surface raw Supabase/PostgreSQL error messages to the user UI.
- Log component names: `'API' | 'Neo4j' | 'Scanner' | 'Auth' | 'Sync' | 'AI'`

### Supabase Clients
- **Client-side** (React components, hooks): `import { supabase } from '@/lib/supabase'`
- **Server-side** (API routes, middleware): `import { createServerClient } from '@/lib/supabase-server'`
- Never use `supabase-js` directly in API routes — must use `@supabase/ssr` for session mirroring.

### Styling
- Vanilla CSS only. No Tailwind, no CSS-in-JS.
- Global design tokens in `v2/src/app/globals.css`.
- Component-scoped styles via CSS Modules (`*.module.css`) where needed.

---

## Security Rules

1. **Tenant Isolation**: Every table has `FORCE ROW LEVEL SECURITY`. Every policy uses `get_my_tenant()`.
2. **No Client-Side IDs**: `tenant_id` is never passed as a URL param or client payload. The DB resolves it from `auth.uid()`.
3. **Server-Side Auth**: All API routes use `createServerClient` from `@supabase/ssr`. No client Supabase instances in API routes.
4. **Secrets**: `GROQ_API_KEY`, `NEO4J_*` credentials are server-side env vars only. Never in `NEXT_PUBLIC_*`.
5. **Dual-Layer Check**: Any RPC touching expenses must check both Tenant Mismatch AND Location Ownership.

---

## Database Rules

- **Canonical RPC for all writes**: `save_receipt_v3` — includes dual-layer security, location_id, ISO-4217 currency.
- **Initialization RPC**: `get_tenant_bundle` — returns `{ tenant, locations, user, server_time }` in one round-trip.
- **New table checklist**: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + policy using `get_my_tenant()`.
- SQL migrations are numbered files in `/sql/b2b_evolution/`. Never alter applied migrations — add a new file instead.
- After any DDL change: run Supabase security advisors to catch missing RLS.

---

## AI / Groq Rules

- Model: `llama-3.3-70b-versatile` (current canonical).
- Temperature: `0.1` for categorization, `0.3` for narrative insights.
- **Always** inject `tenant.categories` into categorization prompts.
- **Always** validate and sanitize Groq responses before storing to DB.
- Cache insights for 24h, keyed on `dataHash` (totals + expense count). Don't call Groq if hash unchanged.
- Groq calls are server-side only (API routes). Never in client components.

---

## eKasa Protocol Rules

- Dual-protocol extraction: try baseline Online ID (`O-[32 hex chars]`) first, fall back to OKP raw data.
- eKasa requests proxy through `vercel.json` rewrite → EU-Central to bypass Slovak government IP blocks.
- Error codes are mapped to human-readable messages in `ekasa-protocols.ts`. Never show raw HTTP status to user.

---

## What NOT to Do

| ❌ Don't | ✅ Do Instead |
|---------|-------------|
| `supabase.from('expenses').insert(...)` in app code | Use `save_receipt_v3` RPC |
| Call `save_receipt_v2` | Use `save_receipt_v3` |
| Hardcode categories like `'Groceries'` in components | Read from `tenant.categories` |
| Put `GROQ_API_KEY` in a `NEXT_PUBLIC_*` variable | Use server-side env var in API routes |
| Show raw DB errors to the user | Map to a friendly message |
| Mix read/write logic in one hook | Keep `useTransactions` and `useSync` separate |
| Add a new table without RLS | Always add `FORCE ROW LEVEL SECURITY` |
| Pass `tenant_id` in a URL param | Let the DB resolve it from `auth.uid()` |
| Call Groq without injecting the category list | Always pass `tenant.categories` to the prompt |
| Deploy without `npm run build` passing | Build must be clean before any push to `main` |
| Alter an applied SQL migration file | Add a new numbered migration file |
| Commit `.env.local` | It's in `.gitignore` — keep it there |

---

## MCP Recommendations

### Tier 1 — Install These Now

#### 1. Supabase MCP (already configured)
**Why**: Direct DB introspection, RPC execution, RLS verification, log access — all without leaving the IDE.  
**Token Strategy**: Never ask for "all tables" or "all data". Always scope:
```
# ✅ Efficient
"Check if save_receipt_v3 exists"
"Show me RLS policies on the expenses table"
"Get the last 10 error logs from the api service"

# ❌ Wasteful
"Show me all the data in the expenses table"
"List every function in the database"
```

#### 2. GitHub MCP
**Why**: PR creation, branch management, and code review without context-switching to browser.  
**Install**: `npx @modelcontextprotocol/server-github`  
**Token Strategy**: Use for targeted operations — create PR, check CI status, list open issues. Never "read the whole repo".

#### 3. Vercel MCP
**Why**: Trigger deploys, check build logs, promote previews to production — directly from the agent.  
**Install**: `npx @modelcontextprotocol/server-vercel` (requires Vercel token)  
**Token Strategy**: Use for deploy status and log tailing only. Don't ask it to inspect env vars.

### Tier 2 — Situational

#### 4. Playwright / Browser MCP
**Why**: End-to-end testing of the PWA scanner flow — verifying QR scan → receipt parse → save works.  
**When**: Only when testing UI flows, not for every task.  
**Token Strategy**: Write targeted test scripts. Never use for general browsing.

#### 5. Neo4j MCP
**Why**: Query the merchant graph (`MATCH (m:Merchant)-[:SOLD]->...`) when debugging sync failures.  
**When**: Only when `normalizeAndLinkMerchant` issues arise or graph analysis is needed.

### Universal Token Efficiency Rules
- Ask MCPs for **specific facts**, not open-ended exploration.
- Always provide context (table name, function name, error message) so the MCP doesn't have to search.
- Chain MCP calls: get schema → get logs → propose fix. Don't re-fetch what you already know.
- For Supabase: prefer `execute_sql` for pinpoint queries over `list_tables` for exploration.
