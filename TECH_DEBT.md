# Technical Debt Log

## DEBT-001: No Data Validation Middleware
**Component**: `js/state.js`
**Issue**: Supabase CRUD assumes success; no validation on write.
**Risk**: Corrupted invoice-expense links if network fails mid-insert.
**Mitigation**: Add transaction-like wrapper for multi-insert operations.
**Priority**: HIGH (post-v1 critical)

## DEBT-002: No Audit Log for Data Changes
**Component**: Database
**Issue**: Can't trace who changed what when.
**Risk**: If data corruption occurs, no trail to investigate.
**Mitigation**: Add `audit_log` table with triggers on expenses/invoices.
**Priority**: MEDIUM (nice-to-have for compliance)

## DEBT-003: God File Pattern
**Component**: `js/ui.js`
**Issue**: File is 57KB and handles rendering, logic, and API calls.
**Risk**: High maintenance cost, difficult to debug, tight coupling.
**Mitigation**: Split into component-based modules (`render.js`, `handlers.js`).
**Priority**: HIGH

## DEBT-004: DRY Violation in Category Management
**Component**: `index.html`, `js/state.js`, `js/ui.js`
**Issue**: Category lists are hardcoded in multiple files.
**Risk**: UI inconsistency when adding/removing categories.
**Mitigation**: Centralize categories in `state.js` and populate UI dynamically.
**Priority**: MEDIUM

## DEBT-005: String-based HTML Template Injection
**Component**: `js/ui.js`
**Issue**: UI is built using string concatenation.
**Risk**: XSS vulnerabilities and difficult layout maintenance.
**Mitigation**: Move to a template-based system or use DocumentFragment.
**Priority**: MEDIUM
