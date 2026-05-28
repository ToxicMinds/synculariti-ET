-- ==========================================
-- Migration 36: Service-Role Transaction RPCs
-- Fixes ACID V-74 in financeAudit.ts
-- Provides SECURITY DEFINER RPCs for service_role callers
-- (where get_my_tenant() returns NULL because auth.uid() is NULL)
-- ==========================================

-- RPC 1: Update transaction fields by explicit tenant_id
-- Used by webhook-based finance audit service (service_role client)
CREATE OR REPLACE FUNCTION public.service_update_transaction_v1(
  p_tenant_id UUID,
  p_id UUID,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
  v_full_row JSONB;
BEGIN
  UPDATE transactions
  SET
    vat_detail = COALESCE(p_updates->'vat_detail', vat_detail),
    updated_at = NOW()
  WHERE id = p_id AND tenant_id = p_tenant_id
  RETURNING updated_at, to_jsonb(transactions.*) INTO v_updated_at, v_full_row;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  PERFORM public.enqueue_graph_sync_internal(p_tenant_id, 'transaction', p_id, 'MERGE', v_full_row);

  RETURN jsonb_build_object('id', p_id, 'updated_at', v_updated_at);
END;
$$;

-- RPC 2: Soft-delete transaction by explicit tenant_id
-- Used by webhook-based finance audit service (service_role client)
CREATE OR REPLACE FUNCTION public.service_soft_delete_transaction_v1(
  p_tenant_id UUID,
  p_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_at TIMESTAMPTZ;
BEGIN
  UPDATE transactions
  SET is_deleted = true, updated_at = NOW()
  WHERE id = p_id AND tenant_id = p_tenant_id
  RETURNING updated_at INTO v_updated_at;

  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;

  PERFORM public.enqueue_graph_sync_internal(p_tenant_id, 'transaction', p_id, 'DELETE', '{}'::JSONB);

  RETURN jsonb_build_object('id', p_id, 'updated_at', v_updated_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.service_update_transaction_v1 FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_update_transaction_v1 TO service_role;

REVOKE EXECUTE ON FUNCTION public.service_soft_delete_transaction_v1 FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_soft_delete_transaction_v1 TO service_role;
