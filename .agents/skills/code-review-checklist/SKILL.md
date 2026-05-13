---
name: code-review-checklist
description: Runs a structured code review against Synculariti-ET architectural standards. Use when the user asks for a PR review, code audit, or "does this look right?" on a diff.
---

# Code Review Checklist

## When to Use
- User asks to review a diff, PR, or new file.
- Before approving any merge to `main`.
- After a significant refactor.

## How to Run
Read the changed files. Work through each section below. Report pass/fail per item.

---

## 1. Security (Hard Failures — Block Merge)
- [ ] No `tenant_id` passed as a URL param or query string (must be server-resolved)
- [ ] No raw `supabase.from('expenses').insert()` without `tenant_id` — use `save_receipt_v4` RPC
- [ ] No new table without `FORCE ROW LEVEL SECURITY` + policy using `get_my_tenant()`
- [ ] No secrets, `.env` values, or API keys in source code
- [ ] `@supabase/ssr` used for all server-side auth — no plain `supabase-js` in API routes
- [ ] JWT is never decoded or inspected client-side for access decisions
- [ ] No new `SECURITY DEFINER` function without `REVOKE EXECUTE ON FUNCTION ... FROM anon` in the same migration
- [ ] No new DB function without `SET search_path = public` in the function header

## 2. Financial Integrity (Hard Failures — Block Merge)
- [ ] All financial mutations go through `save_receipt_v4`, not `v3`, `v2` or raw inserts
- [ ] Currency field is ISO-4217 (3-char string). No bare numbers, no `"€"` symbols
- [ ] Amount is `>= 0`. No negative amounts without explicit `Adjustment` category
- [ ] `location_id` is passed when the expense belongs to a business location

## 3. Data Layer
- [ ] Read hooks (`useTransactions`) and write hooks (`useSync`) are NOT mixed in the same component
- [ ] `get_tenant_bundle` is used for initialization — not individual table queries
- [ ] `COALESCE` used for any array returned from Supabase RPC (prevents null crashes)
- [ ] No direct `.from('app_state')` mutations outside of `updateState()` in `TenantContext`

## 4. Observability
- [ ] Any `catch` block either calls `Logger.system('ERROR', ...)` or rethrows
- [ ] User-facing activity uses `Logger.user(...)` (not just `console.log`)
- [ ] No raw database error messages are surfaced to the user
- [ ] Retry logic (3-stage exponential backoff) exists for all network/DB write operations

## 5. DRY & Constants
- [ ] No hardcoded category strings in components — must come from `tenant.categories`
- [ ] No hardcoded category icons — must come from `CATEGORY_ICONS` in `constants.ts`
- [ ] No duplicated Supabase client instantiation — use `@/lib/supabase` or `@/lib/supabase-server`

## 6. TypeScript Quality
- [ ] All functions have explicit return types (no implicit `any` return)
- [ ] No `as any` casts without a comment explaining why
- [ ] Interfaces defined for all API request/response shapes
- [ ] No `.js` files — TypeScript only (`*.ts`, `*.tsx`)

## 7. AI / Groq
- [ ] Groq calls include the tenant's category list from `tenant.categories`
- [ ] AI responses are validated before being stored (no raw LLM output to DB)
- [ ] Cache TTL logic checks `dataHash` (totals + count) before calling Groq
- [ ] No Groq API key in client-side code — only in server API routes

## 8. PWA / UX
- [ ] Mobile safe-area insets respected for any new layout changes
- [ ] No logo text added to mobile header (minimalist rule)
- [ ] New interactive elements have unique, descriptive `id` attributes

## Reporting Format
After review, report:
```
✅ PASS: [item]
❌ FAIL: [item] — [why it fails and what to fix]
⚠️  WARN: [item] — [not blocking but should be addressed]
```
