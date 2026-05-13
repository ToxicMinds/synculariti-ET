-- Migration: 12_tenant_members
-- Purpose: Define the tenant access control list for Identity discovery.
-- Enforces: Security Check in upsert_app_user_v1.

CREATE TABLE IF NOT EXISTS public.tenant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- RLS
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memberships"
    ON public.tenant_members
    FOR SELECT
    USING (email = auth.jwt()->>'email');

CREATE POLICY "Tenant owners can manage members"
    ON public.tenant_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.app_users 
            WHERE id = auth.uid() 
            AND tenant_id = tenant_members.tenant_id
        )
    );

-- Audit Column
CREATE TRIGGER trg_tenant_members_updated_at
    BEFORE UPDATE ON public.tenant_members
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
