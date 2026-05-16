# Synculariti-ET: Operational Rulebook

## 1. Core Architecture
- **Root Directory**: `v2/`
- **Domain Isolation**: Every business domain (`identity`, `logistics`, `finance`) MUST live in `v2/src/modules/[domain]`.
- **Headless Logic**: Keep business logic in React hooks inside `modules/[domain]/hooks/`. UI components should be lean consumers of these hooks.
- **Shared Utilities**: Cross-domain helpers must live in `v2/src/lib/`. Shared UI components live in `v2/src/components/`.

## 2. Coding Standards
- **TypeScript Only**: No `.js` files. **Zero** `: any` usages allowed. Use explicit return types for all functions.
- **No Direct DML**: Never use `supabase.from('transactions').insert(...)`. Use the canonical RPC `save_receipt_v4`.
- **Logger over Console**: Use `Logger.system()` (technical) or `Logger.user()` (business) in client code. Use `ServerLogger` in API routes.
- **Error Boundaries**: Every page-level component must be wrapped in an `ErrorBoundary`.

## 3. Security & Database Rules
- **Tenant Isolation**: Every table has `FORCE ROW LEVEL SECURITY`. Policies must use `get_my_tenant()`.
- **Server-Side Auth**: API routes use `createServerClient` from `@supabase/ssr`. Never trust `tenant_id` from a client payload.
- **DB Function Hardening**: Every `SECURITY DEFINER` function MUST:
    1. Include `SET search_path = public`.
    2. Include `REVOKE EXECUTE ON FUNCTION ... FROM anon`.
- **Security Verification**: Critical RPCs must be registered in `v2/src/lib/db-security-contract.ts` for automated contract testing.
- **Migration Protocol**: Add new numbered files to `sql/b2b_evolution/`. Never alter applied migrations.

## 4. AI & Groq Strategy
- **Model**: `llama-3.3-70b-versatile`
- **Context Injection**: Always pass the `tenant.categories` list to categorization prompts.
- **Validation**: Sanitize and validate LLM outputs before database persistence.

## 5. Deployment & Testing
- **Build First**: `npm run build` must pass locally before any push to `main`.
- **Zero Lint Errors**: Maintain zero ESLint warnings/errors.
- **Contract Tests**: Run `npm run test` to verify database security compliance after schema changes.
