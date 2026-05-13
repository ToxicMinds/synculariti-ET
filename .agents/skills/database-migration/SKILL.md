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
├── 05_tenant_rename.sql     ← Terminal point for terminology (B2B SaaS)
├── 07_identity_discovery.sql ← Identity & Discovery Foundation
└── NN_description.sql       ← Your new migration
```

## Mandatory Table Template (B2B Multi-Tenant)
```sql
CREATE TABLE public.your_table (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.your_table FORCE ROW LEVEL SECURITY;

-- Always isolate by the session-resolved tenant
CREATE POLICY "Tenant isolation" ON public.your_table
  USING (tenant_id = public.get_my_tenant());

-- CRITICAL: Explicit grants for Data API (Supabase Security Update May 30/Oct 30)
GRANT ALL ON TABLE public.your_table TO authenticated;
```

## Identity Standards
If you are adding an access control layer:
*   **Don't** use hardcoded emails in code.
*   **Do** use the `public.tenant_members` table.
*   **Do** use `get_my_available_tenants()` for discovery.

## What NOT to Do
- ❌ **Never** use `household_id`. It is deprecated.
- ❌ **Never** bypass RLS policies.
- ❌ **Never** assume a user only belongs to one tenant. Support the "Discovery" flow.
