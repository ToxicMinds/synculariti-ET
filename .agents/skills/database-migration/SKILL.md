---
name: database-migration
description: Guides safe SQL schema changes for Synculariti-ET on Supabase. Use when adding tables, columns, RLS policies, RPCs, or triggers. ALWAYS follow this before touching the database.
---

# Database Migration

## When to Use
Any time a schema, RLS policy, RPC function, or trigger needs to change.

## Migration File Location
```
/home/nik/synculariti-ET/sql/b2b_evolution/
├── 00_base_schema.sql       ← Core tables (tenants, app_users, expenses)
├── 01_locations.sql         ← B2B location primitives
├── 02_expenses_update.sql   ← Expense table B2B columns (location_id, currency)
└── 03_code_db_handshake.sql ← get_tenant_bundle RPC
```

## Naming Convention for New Files
Format: `NN_description_snake_case.sql`  
Example: `04_add_supplier_table.sql`

Always increment the number prefix to preserve execution order.

## Pre-Migration Checklist
Before writing any SQL:
- [ ] Does this table need `FORCE ROW LEVEL SECURITY`? (Answer: **YES, always**)
- [ ] Does every policy use `get_my_tenant()` for isolation?
- [ ] Are you adding a column to `expenses`? Check `save_receipt_v3` signature still matches.
- [ ] Does this break the `get_tenant_bundle` RPC return shape?
- [ ] Does the new table need an `activity_log` trigger?

## Mandatory Table Template
```sql
CREATE TABLE public.your_table (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.app_state(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- your columns here
);

ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.your_table FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.your_table
  USING (tenant_id = public.get_my_tenant());
```

## RPC Dual-Layer Security Template
Any RPC that mutates financial data MUST include both checks:
```sql
-- SECURITY CHECK 1: Tenant Mismatch
IF (p_expense->>'tenant_id')::UUID != v_session_h_id THEN
  RAISE EXCEPTION 'Security Violation: Tenant Mismatch.';
END IF;

-- SECURITY CHECK 2: Location Ownership (if location_id is involved)
IF v_loc_id IS NOT NULL THEN
  IF NOT EXISTS (
    SELECT 1 FROM public.locations 
    WHERE id = v_loc_id AND tenant_id = v_session_h_id
  ) THEN
    RAISE EXCEPTION 'Security Violation: Location Ownership Mismatch.';
  END IF;
END IF;
```

## Canonical RPCs — Do Not Rename or Drop
| RPC | Purpose | Status |
|-----|---------|--------|
| `get_tenant_bundle` | Platinum Handshake — frontend init | CANONICAL |
| `save_receipt_v3` | All financial write mutations | CANONICAL |
| `get_my_tenant()` | Helper — returns `tenant_id` from JWT | CANONICAL |
| `save_receipt_v2` | Deprecated — tenant era, no location/currency | DEPRECATED |

## How to Apply a Migration
1. Write the SQL in a new numbered file under `/sql/b2b_evolution/`
2. Use the Supabase MCP `apply_migration` tool OR paste into Supabase SQL Editor
3. Run `get_advisors` (security type) after every DDL change to catch missing RLS
4. Commit the `.sql` file with scope `schema`: `chore(schema): add supplier table`

## What NOT to Do
- **Never** `DROP TABLE` without a backup confirmation from the user.
- **Never** alter `expenses` columns without verifying `save_receipt_v3` still compiles.
- **Never** remove `FORCE ROW LEVEL SECURITY` — it's a hard architectural rule.
- **Never** hardcode `tenant_id` values in migrations — use `get_my_tenant()`.
