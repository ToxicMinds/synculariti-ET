# Synculariti-ET: Operational Rulebook

## 1. Core Architecture
- **Root Directory**: `v2/`
- **Domain Isolation**: Every business domain (`identity`, `logistics`, `finance`) MUST live in `v2/src/modules/[domain]`.
- **Headless Logic**: Keep business logic in React hooks inside `modules/[domain]/hooks/`. UI components should be lean consumers of these hooks.
- **Shared Utilities**: Cross-domain helpers must live in `v2/src/lib/`. Shared UI components live in `v2/src/components/`.
- **Viewport Controller**: Use the headless `useNavigation` hook for all fiscal calendar and domain navigation logic. UI components must not manually generate month lists or manipulate routing parameters.
- **Static Safety**: Any component consuming URL-dependent hooks (e.g., `useNavigation`, `useSearchParams`) MUST be wrapped in a `<Suspense>` boundary and separated from static layout shells to prevent CSR bailouts during build-time static generation.
- **Shared Gestures**: Use the `useSwipeable` hook for all swipe-to-reveal or horizontal gesture logic.
- **Hardware/Intelligence Decoupling**: Complex components (like cameras/scanners) MUST decouple hardware logic (`useCamera`) from intelligence/parsing logic (`useReceiptProcessor`).
- **Fiscal Arithmetic**: Use the `useCalendarGrid` hook for all fiscal heatmap or calendar grid generation. Never perform date math or spend aggregation directly inside a UI component.

## 2. Coding Standards
- **TypeScript Only**: No `.js` files. **Zero** `: any` usages allowed. Use explicit return types for all functions.
- **No Direct DML**: Never use `supabase.from('transactions').insert(...)`. Use the canonical RPC `save_receipt_v4`.
- **Logger, not console**: NEVER use `console.log`, `console.warn`, or `console.error` in production code. Use `Logger.system()` for technical events and `Logger.user()` for business events. Use centralized `LogComponent` types.
- **User Activity**: EVERY mutation MUST call `Logger.user(tenantId, action, description, actorName)`.
- **API Route Standards**: Every API route handler must follow the `SecureHandler` signature and use `SecureContext`.
- **Validation & Washing**: Use Zod schemas from the shared registry for request parsing. Use the 'Washer' pattern (transforms + defaults) to guarantee type safety for nullable metadata.
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
