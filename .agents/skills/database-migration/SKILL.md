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
├── 00_base_schema.sql       ← Legacy (Referential only)
├── 05_tenant_rename.sql     ← Terminal point for terminology (B2B SaaS)
└── NN_description.sql       ← Your new migration
```

## Naming Convention
Format: `NN_description_snake_case.sql`  
Example: `06_add_supplier_catalog.sql`

## Pre-Migration Checklist
- [ ] Does this table need `FORCE ROW LEVEL SECURITY`? (**YES**)
- [ ] Does every policy use `get_my_tenant()` for isolation?
- [ ] Are you adding a column to `expenses`? Check `save_receipt_v3` signature.
- [ ] Does the new table need an `activity_log` trigger?

## Mandatory Table Template
```sql
CREATE TABLE public.your_table (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- columns...
);

ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.your_table FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.your_table
  USING (tenant_id = public.get_my_tenant());
```

## Outbox Pattern (Asynchronous Resilience)
If this table needs to trigger an action in another module (e.g. Finance), use the **Outbox Pattern**:
```sql
INSERT INTO public.outbox_events (tenant_id, event_type, payload)
VALUES (v_tenant_id, 'PO_RECEIVED', jsonb_build_object('id', v_po_id));
```

## Canonical RPCs
| RPC | Purpose |
|-----|---------|
| `get_tenant_bundle` | Platinum Handshake — frontend init |
| `save_receipt_v3` | Financial write mutations (Location + Currency) |
| `get_my_tenant()` | Helper — returns `tenant_id` from JWT |
| `create_organization` | Bootstrap new B2B tenant |

## What NOT to Do
- ❌ **Never** use `household_id`. It is deprecated. Use `tenant_id`.
- ❌ **Never** insert directly into `invoices` if the data comes from `Logistics`. Use the Outbox.
- ❌ **Never** bypass RLS policies.
