---
name: deploy-to-staging
description: Guides safe deployment to Vercel staging/preview for Synculariti-ET. Use when the user wants to deploy, preview a branch, or push to production.
---

# Deploy to Staging

## When to Use
- User asks to deploy, preview, or push to production.
- After completing a feature that touches the database or API routes.
- Before telling the user "it's ready".

## Deployment Architecture
- **Hosting**: Vercel (auto-deploy on push to `main`)
- **Root Directory**: `v2/` (Next.js app — configured in Vercel project settings)
- **eKasa Proxy**: `vercel.json` at repo root rewrites `/ekasa-proxy/*` → Slovak FinSprva API
- **Environment**: Variables must be set in Vercel Dashboard, not in code

## Required Environment Variables (Vercel)
Verify these exist in the Vercel project before deploying:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
GROQ_API_KEY
NEO4J_URI
NEO4J_USER
NEO4J_PASSWORD
```

> **Never** put `GROQ_API_KEY`, `NEO4J_*` in `NEXT_PUBLIC_*` — server-side only.

## Pre-Deploy Checklist
- [ ] `cd v2 && npm run build` passes locally with zero TypeScript errors
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run test` passes (all Jest tests green)
- [ ] No `.env.local` values have leaked into source files (run `git grep "supabase.co"` to check)
- [ ] Any new SQL migration has been applied to the Supabase project
- [ ] `vercel.json` rewrite for eKasa proxy is intact if eKasa was touched
- [ ] `get_tenant_bundle` RPC still returns expected shape (test in Supabase SQL editor)

## Deploy Flow

### Preview (Staging)
```bash
# Push to a feature branch — Vercel auto-creates a preview URL
git push origin feature/your-branch-name
```
Vercel will post the preview URL in the deployment dashboard.

### Production
```bash
# Only after staging is verified
git checkout main
git merge feature/your-branch-name
git push origin main
```

## Post-Deploy Verification
1. Open the production URL and confirm the app loads (PWA install prompt should appear)
2. Check Supabase logs (`get_logs` for `api` and `auth` services) for 500 errors
3. Trigger a `get_tenant_bundle` call by logging in — confirm no null crashes
4. If eKasa was touched: scan a real receipt QR and confirm the proxy responds

## Rollback
If production breaks:
1. In Vercel Dashboard → Deployments → find last good deploy → "Promote to Production"
2. If DB migration caused it: use Supabase Dashboard to revert (point-in-time recovery)

## What NOT to Do
- **Never** push directly to `main` without a passing build
- **Never** deploy with TypeScript `any` suppression hacks left in (`@ts-ignore`)
- **Never** deploy if `save_receipt_v3` RPC signature has changed without updating `useSync.ts`
