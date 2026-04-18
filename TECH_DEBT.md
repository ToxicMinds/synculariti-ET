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
