-- Phase 2: DML RPCs to fix Phase 0 regressions
-- Author: Antigravity

-- 1. update_transaction_v1
CREATE OR REPLACE FUNCTION update_transaction_v1(
    p_id UUID,
    p_transaction JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_result JSONB;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    -- Ensure the transaction belongs to the current tenant before updating
    IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = p_id AND tenant_id = v_tenant_id) THEN
        RAISE EXCEPTION 'Transaction not found or access denied';
    END IF;

    UPDATE transactions
    SET
        amount = COALESCE((p_transaction->>'amount')::NUMERIC, amount),
        category = COALESCE(p_transaction->>'category', category),
        date = COALESCE((p_transaction->>'date')::DATE, date),
        description = COALESCE(p_transaction->>'description', description),
        currency = COALESCE(p_transaction->>'currency', currency),
        vat_detail = COALESCE(p_transaction->'vat_detail', vat_detail),
        updated_at = NOW()
    WHERE id = p_id AND tenant_id = v_tenant_id
    RETURNING row_to_json(transactions) INTO v_result;

    RETURN v_result;
END;
$$;

-- 2. soft_delete_transaction_v1
CREATE OR REPLACE FUNCTION soft_delete_transaction_v1(
    p_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_result JSONB;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    UPDATE transactions
    SET is_deleted = true, updated_at = NOW()
    WHERE id = p_id AND tenant_id = v_tenant_id
    RETURNING row_to_json(transactions) INTO v_result;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Transaction not found or access denied';
    END IF;

    RETURN v_result;
END;
$$;

-- 3. upsert_app_user_v1
CREATE OR REPLACE FUNCTION upsert_app_user_v1(
    p_tenant_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
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
AS $$
DECLARE
    v_tenant_id UUID;
    v_result JSONB;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    UPDATE tenants
    SET config = COALESCE(p_config, config), updated_at = NOW()
    WHERE id = v_tenant_id
    RETURNING row_to_json(tenants) INTO v_result;

    RETURN v_result;
END;
$$;
