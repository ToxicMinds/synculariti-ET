-- Migration 42: Add who_id update support to update_transaction_v1
-- Allows the client to propagate the user who last edited a transaction.

CREATE OR REPLACE FUNCTION public.update_transaction_v1(p_id uuid, p_transaction jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_tenant_id UUID;
    v_updated_at TIMESTAMP WITH TIME ZONE;
    v_full_row JSONB;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    UPDATE transactions
    SET
        amount      = COALESCE(NULLIF(p_transaction->>'amount', '')::NUMERIC, amount),
        category    = COALESCE(p_transaction->>'category', category),
        date        = COALESCE(NULLIF(p_transaction->>'date', '')::DATE, date),
        description = COALESCE(p_transaction->>'description', description),
        currency    = COALESCE(p_transaction->>'currency', currency),
        vat_detail  = COALESCE(p_transaction->'vat_detail', vat_detail),
        who_id      = COALESCE(NULLIF(p_transaction->>'who_id', '')::UUID, who_id),
        updated_at  = NOW()
    WHERE id = p_id AND tenant_id = v_tenant_id
    RETURNING updated_at, to_jsonb(transactions.*) INTO v_updated_at, v_full_row;

    IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;

    PERFORM public.enqueue_graph_sync_internal(v_tenant_id, 'transaction', p_id, 'MERGE', v_full_row);

    RETURN jsonb_build_object('id', p_id, 'updated_at', v_updated_at);
END;
$$;

-- Privilege grants unchanged — already set by migration 16
