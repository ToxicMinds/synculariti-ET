-- Phase 2: DML RPCs to fix Phase 0 regressions (Refined with ACID/SOLID best practices)
-- Author: Antigravity

-- 1. update_transaction_v1
CREATE OR REPLACE FUNCTION update_transaction_v1(
    p_id UUID,
    p_transaction JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_updated_at TIMESTAMP WITH TIME ZONE;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    -- Direct update using IF NOT FOUND (eliminates Double Querying)
    UPDATE transactions
    SET
        -- Note: Validation of numeric/date structure must be done at the application layer 
        -- prior to calling this RPC to prevent 500 errors from invalid casting.
        amount = COALESCE(NULLIF(p_transaction->>'amount', '')::NUMERIC, amount),
        category = COALESCE(p_transaction->>'category', category),
        date = COALESCE(NULLIF(p_transaction->>'date', '')::DATE, date),
        description = COALESCE(p_transaction->>'description', description),
        currency = COALESCE(p_transaction->>'currency', currency),
        vat_detail = COALESCE(p_transaction->'vat_detail', vat_detail),
        updated_at = NOW()
    WHERE id = p_id AND tenant_id = v_tenant_id
    RETURNING updated_at INTO v_updated_at;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found or access denied';
    END IF;

    -- Return minimal payload to save bandwidth
    RETURN jsonb_build_object('id', p_id, 'updated_at', v_updated_at);
END;
$$;

-- 2. soft_delete_transaction_v1
CREATE OR REPLACE FUNCTION soft_delete_transaction_v1(
    p_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_updated_at TIMESTAMP WITH TIME ZONE;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    UPDATE transactions
    SET is_deleted = true, updated_at = NOW()
    WHERE id = p_id AND tenant_id = v_tenant_id
    RETURNING updated_at INTO v_updated_at;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found or access denied';
    END IF;

    RETURN jsonb_build_object('id', p_id, 'updated_at', v_updated_at);
END;
$$;

-- 3. upsert_app_user_v1
CREATE OR REPLACE FUNCTION upsert_app_user_v1(
    p_tenant_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
BEGIN
    v_user_id := auth.uid();
    v_email := auth.jwt()->>'email';
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Security Check to prevent user hopping: Check if the user's email is invited/linked to this tenant
    IF NOT EXISTS (SELECT 1 FROM tenant_members WHERE tenant_id = p_tenant_id AND email = v_email) THEN
        RAISE EXCEPTION 'Access denied. Email % is not authorized for tenant %', v_email, p_tenant_id;
    END IF;

    -- The UI passes a tenant_id to link the user context
    INSERT INTO app_users (id, tenant_id)
    VALUES (v_user_id, p_tenant_id)
    ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, updated_at = NOW();
END;
$$;

-- 4. update_tenant_config_v1
CREATE OR REPLACE FUNCTION update_tenant_config_v1(
    p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_result JSONB;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    -- Deep Merge JSONB using || operator (allows patch updates)
    UPDATE tenants
    SET config = config || p_config, updated_at = NOW()
    WHERE id = v_tenant_id
    RETURNING jsonb_build_object('id', id, 'updated_at', updated_at) INTO v_result;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found or access denied';
    END IF;

    RETURN v_result;
END;
$$;
