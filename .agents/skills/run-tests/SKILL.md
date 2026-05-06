---
name: run-tests
description: Runs the Jest test suite for Synculariti-ET. Use when the user asks to run tests, add a test, or verify a change hasn't broken anything.
---

# Run Tests

## When to Use
- User asks to run tests or check if something is broken.
- After any change to `v2/src/lib/` (especially `finance.ts`).
- Before proposing a PR or deployment.
- When writing a new utility function.

## Test Command
```bash
cd /home/nik/synculariti-ET/v2
npm run test
```

This runs Jest via `ts-jest` (see `jest.config.js`).

## Existing Test Files
| File | What It Tests |
|------|---------------|
| `v2/src/lib/finance.test.ts` | Core financial calculation functions |

## How to Add a New Test
New tests live **alongside the source file** they test:
- Source: `v2/src/lib/utils.ts`
- Test:   `v2/src/lib/utils.test.ts`

```typescript
// v2/src/lib/yourmodule.test.ts
import { yourFunction } from './yourmodule';

describe('yourFunction', () => {
  it('should return X when given Y', () => {
    expect(yourFunction(input)).toBe(expected);
  });
});
```

## What MUST Have Tests
- Any new function in `v2/src/lib/`
- Financial calculation changes (amount, currency, rounding)
- eKasa protocol extraction logic (`ekasa-protocols.ts`)
- Any function that touches `tenant_id` or `location_id` validation

## What Does NOT Need Tests
- React components (test manually via browser)
- Next.js API routes (test via Postman or browser)
- Database triggers (test via Supabase SQL editor)

## Rules
- Never change `finance.test.ts` to make a failing test pass by weakening the assertion.
- Tests must be deterministic — no `Date.now()` or `Math.random()` without mocking.
- If a test fails after your change, fix the code, not the test (unless the test is genuinely wrong).

## TypeScript Config for Jest
`jest.config.js` uses `ts-jest`. If you get TypeScript errors in tests:
```bash
cd v2 && npx ts-jest config:show
```
