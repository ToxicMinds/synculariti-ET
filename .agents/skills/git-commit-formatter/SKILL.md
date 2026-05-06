---
name: git-commit-formatter
description: Formats Git commit messages using Conventional Commits. Use when the user asks to commit changes or write a commit message for Synculariti-ET.
---

# Git Commit Formatter

## When to Use
Activate when the user asks to commit changes, stage files, or write a commit message.

## Format
Follow the Conventional Commits specification:
`<type>(<scope>): <description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `security`

## Scopes (Synculariti-ET specific)
Use these scopes to match the codebase structure:

| Scope | When to Use |
|-------|-------------|
| `rpc` | Supabase RPC changes (`save_receipt_v3`, `get_household_bundle`) |
| `rls` | Row Level Security policy changes |
| `schema` | SQL migration files in `/sql/` |
| `sync` | `useSync.ts` or financial write logic |
| `context` | `HouseholdContext.tsx` or `useHousehold.ts` |
| `scanner` | `ReceiptScanner.tsx`, `ekasa-protocols.ts` |
| `ai` | Groq integration, AI insights, prompt changes |
| `neo4j` | Graph database / merchant linking |
| `auth` | Authentication, PIN flow, OAuth, `@supabase/ssr` |
| `api` | Next.js API routes under `/v2/src/app/api/` |
| `ui` | Component-only visual changes |
| `pwa` | Manifest, service worker, mobile safe-areas |
| `deploy` | `vercel.json`, CI/CD pipeline |
| `logger` | `Logger.system()` or `Logger.user()` changes |
| `ekasa` | eKasa proxy or protocol changes |

## Rules
- Subject line: max 72 characters, imperative tense, no period at end.
- Body (optional): explain *why*, not *what*. Reference the architectural rule violated or fixed.
- **Always** propose the message for user approval before running `git commit`.
- Security-related changes MUST use `security` type or note in body.
- Never commit `.env.local` or secrets — check with `git status` first.

## Examples

```
feat(sync): migrate saveReceipt to save_receipt_v3 RPC

v3 adds dual-layer security (Tenant + Location Ownership checks)
and ISO-4217 currency propagation. v2 is deprecated per RULES.md.
```

```
fix(rls): add FORCE ROW LEVEL SECURITY to receipt_items table

Missing from initial migration. Required by Platinum Standard §2.4.
```

```
feat(scanner): add OKP fallback to eKasa QR extraction

Implements Dual-Protocol as per AGENTS.md §2.2 Intelligence Strategy.
```

```
chore(schema): add 03_code_db_handshake migration for B2B handshake
```

## Workflow
1. Run `git diff --staged` to see what's changing.
2. Identify the primary scope from the table above.
3. Draft the commit message.
4. Show it to the user: "Here's the proposed commit message: ..."
5. Wait for approval before running `git commit -m "..."`.
