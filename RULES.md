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

### Financial Mutations
- All expense writes go through the `save_receipt_v3` Supabase RPC. No exceptions.
- Every mutation MUST: call `Logger.user(...)`, call `triggerRefresh()`, fire Neo4j sync.
- All network/DB writes MUST have 3-stage exponential backoff (1s → 2s → 4s).

### TypeScript
- **TypeScript only.** No `.js` files in `src/`. No `require()`.
- All functions must have **explicit return types**. No implicit `any`.
- Use `async/await`. No raw `.then()/.catch()` chains.
- Use `as any` only as a last resort, always with a `// REASON:` comment.

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
| `supabase.from('expenses').insert(...)` in app code | Use `save_receipt_v3` RPC |
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
