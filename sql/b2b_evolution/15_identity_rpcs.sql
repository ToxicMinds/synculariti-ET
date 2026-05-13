-- Migration: 15_identity_rpcs
-- Purpose: Implement the Identity discovery and switching logic for the B2B SaaS evolution.
-- Enforces: Secure tenant discovery and switching.

-- 1. get_my_available_tenants
-- Finds all organizations the current user is a member of.
CREATE OR REPLACE FUNCTION public.get_my_available_tenants()
RETURNS TABLE (
    tenant_id UUID,
    tenant_name TEXT,
    tenant_handle TEXT,
    user_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as tenant_id,
        t.name as tenant_name,
        t.handle as tenant_handle,
        tm.role as user_role
    FROM public.tenants t
    JOIN public.tenant_members tm ON t.id = tm.tenant_id
    WHERE tm.email = auth.jwt()->>'email';
END;
$$;

-- 2. switch_tenant
-- Links the user's active context to a specific tenant.
CREATE OR REPLACE FUNCTION public.switch_tenant(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
BEGIN
    v_email := auth.jwt()->>'email';
    
    -- Security Check: Ensure the user is actually a member
    IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = p_tenant_id AND email = v_email) THEN
        RAISE EXCEPTION 'Access denied. You are not a member of this organization.';
    END IF;

    -- Update or Insert into app_users to set the "active" tenant
    INSERT INTO public.app_users (id, tenant_id)
    VALUES (auth.uid(), p_tenant_id)
    ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, updated_at = NOW();
    
    -- Clear session cache for the helper function
    PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, true);
END;
$$;

-- 3. verify_tenant_access
-- Look up a tenant by its access code (handle).
CREATE OR REPLACE FUNCTION public.verify_tenant_access(input_code TEXT)
RETURNS TABLE (
    target_id UUID,
    target_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT id, name
    FROM public.tenants
    WHERE lower(handle) = lower(input_code);
END;
$$;

-- 4. create_organization
-- Creates a new tenant and adds the creator as OWNER.
CREATE OR REPLACE FUNCTION public.create_organization(p_name TEXT, p_handle TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_email TEXT;
BEGIN
    v_email := auth.jwt()->>'email';
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if handle already exists
    IF EXISTS (SELECT 1 FROM public.tenants WHERE lower(handle) = lower(p_handle)) THEN
        RAISE EXCEPTION 'Access code % is already taken.', p_handle;
    END IF;

    -- Create Tenant
    v_tenant_id := gen_random_uuid();
    INSERT INTO public.tenants (id, name, handle)
    VALUES (v_tenant_id, p_name, lower(p_handle));

    -- Add Creator as OWNER
    INSERT INTO public.tenant_members (tenant_id, email, role)
    VALUES (v_tenant_id, v_email, 'OWNER');

    -- Auto-switch to the new organization
    PERFORM public.switch_tenant(v_tenant_id);

    RETURN v_tenant_id;
END;
$$;
