# Data Preservation Strategy

## Pre-Migration State
- **Expense Count**: 40
- **Date Range**: 2026-04-06 to 2026-04-16
- **Categories**: Groceries, Health, Kids, Other, Pets, Clothing, Dining out, Z-Bottles, Utilities, Entertainment, Kindergarten
- **Users**: Nik, Zuzana
- **Total Tracked**: €1412.57
- **Backup Date**: 2026-04-18

## Migration Steps
1. Created `invoices` table (additive, no modifications to `expenses`)
2. Added `invoice_id` column to `expenses` (NULLABLE)
3. No backfill of existing expenses (kept as-is for safety)

## Post-Migration Validation
- [ ] Expense count unchanged
- [ ] All old expenses still queryable
- [ ] app_state config intact
- [ ] Budget calculations match pre-migration
- [ ] New invoices can be created
- [ ] Old expenses still appear in UI

## Rollback Plan
If critical issues found:
```sql
ALTER TABLE expenses DROP COLUMN invoice_id;
DROP TABLE invoices;
-- Revert code changes
-- All data untouched
```
