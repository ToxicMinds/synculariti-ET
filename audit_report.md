# Synculariti-ET: Current System Audit & Backlog

**Status:** Infrastructure hardened. Batches A-E complete. 35 open issues remaining.
**Last Update:** 2026-05-16

---

## 1. Verified Infrastructure State (Batches A-D)

The core infrastructure has been remediated. The following standards are now active and verified:
- **DB Security**: All v4 RPCs are hardened with `search_path=public` and `REVOKE anon`. Verified via `db-security.test.ts`.
- **Dead Code**: Legacy graph sync and unreachable helpers have been purged.
- **Type Safety**: **0** `: any` usages in `v2/src`. Native types for Web Locks and eKasa are active.
- **ACID Performance**: Financial calculation loops optimized to $O(N)$.

---

## 2. Priority Backlog (Batches E-O)

### Batch E: API Route Validation [FIXED]
- **Goal**: Standardize error handling and add Zod validation to all routes.
- **Remediated**: `forecast`, `statement`, `insight`, `parse-invoice`, `parse-receipt`, `ekasa`.
- **Verified**: Via `db-security.test.ts` and new unit tests for schemas/routes.

### Batch F-I: SRP Decomposition (UI)
- **Goal**: Decompose monolithic components into headless hooks.
- **Targets**: `NavBar`, `ExpenseList`, `ReceiptScanner`, and the Finance God-Page.

### Batch J-K: Shared Components & Styles
- **Goal**: Eliminate duplicate UI code for category selection, modals, and input styles.

### Batch L-M: Performance & OCP
- **Goal**: Optimize React render cycles and clean up remaining code smells.

---

## 3. Open Violation Registry (Consolidated)

| ID | Severity | Principle | Location | Status |
| :--- | :--- | :--- | :--- | :--- |
| N-04 | 🔴 HIGH | Observability | `groq/route.ts` | CLOSED |
| N-07 | 🔴 HIGH | Security | API Routes (Validation) | CLOSED |
| V-28 | 🟡 MEDIUM | SOLID | `useLogistics` | OPEN |
| ... | ... | ... | ... | ... |

---

## 4. Verification Contracts
- **Security**: [db-security.test.ts](file:///home/nik/synculariti-ET/v2/src/lib/db-security.test.ts)
- **Financial ACID**: [finance.test.ts](file:///home/nik/synculariti-ET/v2/src/modules/finance/lib/finance.test.ts) (Verified O(N))
- **API Validation**: [schemas.test.ts](file:///home/nik/synculariti-ET/v2/src/lib/validations/schemas.test.ts) & [route.test.ts](file:///home/nik/synculariti-ET/v2/src/app/api/ekasa/route.test.ts)
- **Logic**: Gherkin/Jest suite (`npm run test`)
