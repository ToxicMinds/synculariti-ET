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
├── AGENTS.md              ← AI agent rules & principles audit
├── RULES.md               ← This file — developer rulebook
├── vercel.json            ← eKasa proxy rewrite rules
├── sql/
│   └── b2b_evolution/     ← Ordered SQL migrations (00_ → 03_)
└── v2/                    ← Next.js application root
    └── src/
        ├── app/           ← Next.js App Router pages + API routes
        ├── components/    ← SHARED UI components (Bento cards, generic inputs)
        ├── modules/       ← DOMAIN ISOLATION (Core Business Logic)
        │   ├── identity/  ← Auth, Tenant Discovery, Identity Gate
        │   ├── logistics/ ← SKU Catalog, Append-only Ledger, Procurement
        │   └── finance/   ← Ledger, AI Insights, Invoicing, Scanning
        ├── context/
        │   └── TenantContext.tsx    ← Global app state provider
        └── lib/           ← SHARED utilities (logger, supabase, types)
```

---

## Coding Conventions

### Modular "Shared-Nothing" Isolation
- **Rule**: Every business domain MUST live in its own `modules/` subdirectory.
- **Encapsulation**: Hooks, components, and domain-specific types must stay inside the module.
- **Communication**: Modules must never have circular dependencies. If logic is shared, it moves to `@/lib` or `@/components`.

### Hooks — Domain Separation
- **Finance**: `useTransactions` (Read) and `useSync` (Write) live in `modules/finance/hooks/`.
- **Logistics**: `useLogistics` lives in `modules/logistics/hooks/`.
- **Identity**: `useTenant` lives in `modules/identity/hooks/`.

### Intelligence Strategy: AI Invoice Pipeline
To achieve **Business-Grade Determinism** for arbitrary B2B invoices:
1. **Stage 1 (Vision)**: Use Vision LLM for spatial transcription (Total, Date, IČO, Items).
2. **Stage 2 (Reasoning)**: Use Reasoning LLM (Llama 3.3) for category mapping and VAT validation.

### Financial & Physical Ledger Mutations
- **Atomic Only**: Any mutation touching the ledger (Transactions or Inventory) MUST be atomic.
- **Logistics Rule**: `receive_purchase_order_v1` RPC is the canonical way to receive a PO. It atomically: marks RECEIVED, updates `inventory_ledger`, emits `PROCUREMENT_RECEIVED` to outbox, and logs to `activity_log`.
- **Canonical RPC**: Use `save_receipt_v3` for ALL financial writes. Manual client-side `.insert()` on `transactions` is forbidden outside development.
- **B2B Atomic Pattern**: Cross-domain signals (Logistics → Finance) MUST flow through `outbox_events`. Never call Finance logic directly from Logistics.
- **No Orphaned Functions**: Any trigger function MUST have a corresponding attached trigger. Verify with `information_schema.triggers` after every migration.

### Telemetry & Audit Trail
- **Logger, not console**: NEVER use `console.log`, `console.warn`, or `console.error` in production code. Use `Logger.system()` for technical events and `Logger.user()` for business events.
- **User Activity**: EVERY mutation MUST call `Logger.user(tenantId, action, description, actorName)`.
- **Visibility**: If an action doesn't appear in the Activity Log, it didn't happen.
- **API Telemetry**: API routes MUST use `ServerLogger.system()` or `ServerLogger.user()`. Never import the client-side `Logger` in `/api/*` routes as it depends on browser globals and will crash the production build.

### Error Handling
- **ErrorBoundary Required**: Every page-level component MUST be wrapped in an `ErrorBoundary`. React render crashes are a telemetry blackspot without them.
- **No Silent Failures**: Never swallow errors silently (e.g., empty `catch` blocks or `onScanFailure` that does nothing). Log with `Logger.system('ERROR', ...)`.
- **Fire-and-Forget Safety**: Neo4j `.catch()` calls are acceptable but MUST log to `Logger.system`.

### Security & API Governance
- **No Direct DML**: The database explicitly denies `INSERT/UPDATE/DELETE` on core tables (`transactions`, `tenants`, `app_users`) to `authenticated` clients. Client-side `.insert()`, `.update()`, or `.upsert()` WILL FAIL. Always use RPCs (e.g. `add_transaction_v3`).
- **Session-Based tenant_id**: `tenant_id` is NEVER passed as a URL param or client payload. Always derived server-side from session via RLS `get_my_tenant()`.
- **No Stale Table References**: The core financial table is `transactions` (not `expenses`). The rename was applied in migration `04_finance_schema.sql`. Any reference to `'expenses'` in app code is a bug.
- **Auth Guard on All Routes**: Every API route that reads or writes tenant data MUST verify the session. Use the `withAuth` middleware. Do not rely on copy-pasted `getSession()` logic.
- **Naked Tables**: Never grant `INSERT/UPDATE/DELETE` to `anon` or `authenticated` on ledger tables.

### Development Rigor (Anti-Hallucination)
- **Verify Implementation**: Writing a middleware or utility file does NOT mean it is implemented. You must verify that the utility is actively imported and used by the target files before marking a task complete (e.g. `withAuth` was written but not applied).

### Design System & UX
- **Zero Inline Styling**: Avoid ad-hoc `style={{...}}` in components. Use CSS Modules or `globals.css` tokens.
- **Component Patterns**: Centralize layout patterns (Loading states, Modals) to ensure UI consistency.
- **Branding Assets**: All module logos must be served from `@/public/brand/` and checked for 404 status before deployment.

### TypeScript
- **TypeScript only.** No `.js` files in `src/`. No `require()`.
- **No `: any`**: The **62** current usages are tracked debt. No new `any` types without a `// REASON:` comment.
- All functions must have **explicit return types**.
- Use `async/await`. No raw `.then()/.catch()` chains.

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

## What NOT to Do

| ❌ Don't | ✅ Do Instead |
|---------|-------------|
| Import a hook from `@/hooks` | Import from `@/modules/[domain]/hooks` |
| Import a component from `@/components` if it's domain-specific | Move it to `@/modules/[domain]/components` |
| Create circular dependencies between modules | Move shared logic to `@/lib` or `@/components` |
| `supabase.from('expenses').insert(...)` | The table is `transactions`. Use `save_receipt_v3` RPC |
| `supabase.from('purchase_orders').update({ status: 'RECEIVED' })` | Use `receive_purchase_order_v1` RPC — it's atomic |
| `console.log / console.error` | Use `Logger.system()` or `Logger.user()` |
| Pass `tenant_id` in a URL param | Derive it from session via RLS — never trust the client |
| Create a trigger function without attaching it | Always pair `CREATE FUNCTION` with `CREATE TRIGGER` |
| Call Groq without injecting the category list | Always pass `tenant.categories` to the prompt |
| Deploy without `npm run build` passing | Build must be clean before any push to `main` |
| Alter an applied SQL migration file | Add a new numbered migration file |
| Commit `.env.local` | It's in `.gitignore` — keep it there |

---

## MCP Recommendations

### Tier 1 — Install These Now

#### 1. Supabase MCP (already configured)
**Why**: Direct DB introspection, RPC execution, RLS verification, log access — all without leaving the IDE.  
**Token Strategy**: Never ask for "all tables" or "all data". Always scope.

#### 2. GitHub MCP
**Why**: PR creation, branch management, and code review without context-switching to browser.  
**Install**: `npx @modelcontextprotocol/server-github`  

#### 3. Vercel MCP
**Why**: Trigger deploys, check build logs, promote previews to production — directly from the agent.  
**Install**: `npx @modelcontextprotocol/server-vercel` (requires Vercel token)  

### Universal Token Efficiency Rules
- Ask MCPs for **specific facts**, not open-ended exploration.
- Chain MCP calls: get schema → get logs → propose fix. Don't re-fetch what you already know.
- For Supabase: prefer `execute_sql` for pinpoint queries over `list_tables` for exploration.
