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

-- Optimization: Explicit index for RLS lookups and email-based discovery
CREATE INDEX IF NOT EXISTS idx_tenant_members_email ON public.tenant_members(email);

-- RLS
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members FORCE ROW LEVEL SECURITY;

-- BREAK RECIPROCAL LOOPS: Use the SECURITY DEFINER helper instead of querying app_users directly.
CREATE POLICY "Users can view their own memberships"
    ON public.tenant_members
    FOR SELECT
    USING (email = auth.jwt()->>'email');

CREATE POLICY "Tenant members can view other members"
    ON public.tenant_members
    FOR SELECT
    USING (tenant_id = public.get_my_tenant());

CREATE POLICY "Tenant owners can manage members"
    ON public.tenant_members
    FOR ALL
    USING (
        tenant_id = public.get_my_tenant() 
        AND EXISTS (
            -- Subquery evaluates against the same table but is scoped by get_my_tenant()
            SELECT 1 FROM public.tenant_members 
            WHERE email = auth.jwt()->>'email' 
            AND role IN ('OWNER', 'ADMIN')
        )
    );

-- Audit Column
CREATE TRIGGER trg_tenant_members_updated_at
    BEFORE UPDATE ON public.tenant_members
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
