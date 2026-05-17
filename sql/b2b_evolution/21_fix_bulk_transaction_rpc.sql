-- Migration: 21_fix_bulk_transaction_rpc.sql
-- Purpose: Resolve PostgREST JSONB[] native array mapping crash (400 Bad Request) by standardizing to a single JSONB parameter.
-- Enforces: Atomic set-based double-write insertions to both public.transactions and public.graph_sync_queue.

-- Drop legacy signature
DROP FUNCTION IF EXISTS public.add_transactions_bulk_v1(JSONB[]);

-- Create modern standard signature
CREATE OR REPLACE FUNCTION public.add_transactions_bulk_v1(
  p_transactions JSONB
)
RETURNS UUID[] AS $$
DECLARE
  v_session_t_id UUID;
  v_results UUID[];
BEGIN
  -- 1. Resolve tenant context
  v_session_t_id := public.get_my_tenant();
  IF v_session_t_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Session tenant context missing.';
  END IF;

  -- 2. Security Validation: Ensure no rogue payloads bypass the session tenant
  IF EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(p_transactions) AS elem
    WHERE NULLIF(elem->>'tenant_id', '') IS NOT NULL 
      AND NULLIF(elem->>'tenant_id', '')::UUID != v_session_t_id
  ) THEN
    RAISE EXCEPTION 'Security Violation: Tenant Mismatch in bulk payload.';
  END IF;

  -- 3. High-Performance Atomic Set-Based Dual-Write (Transactions + Outbox)
  WITH prepared_elements AS (
    SELECT 
      COALESCE(NULLIF(elem->>'id', '')::UUID, gen_random_uuid()) AS id,
      v_session_t_id AS tenant_id,
      NULLIF(elem->>'amount', '')::NUMERIC AS amount,
      elem->>'category' AS category,
      NULLIF(elem->>'date', '')::DATE AS date,
      elem->>'who' AS who,
      NULLIF(elem->>'who_id', '')::UUID AS who_id,
      elem->>'description' AS description,
      COALESCE(NULLIF(elem->>'currency', ''), 'EUR') AS currency,
      NULLIF(elem->>'location_id', '')::UUID AS location_id,
      COALESCE(NULLIF(elem->>'transaction_type', ''), 'DEBIT') AS transaction_type,
      elem AS raw_payload
    FROM jsonb_array_elements(p_transactions) AS elem
  ),
  inserted_rows AS (
    INSERT INTO public.transactions (
      id, tenant_id, amount, category, date, who, who_id, description, currency, location_id, transaction_type
    )
    SELECT id, tenant_id, amount, category, date, who, who_id, description, currency, location_id, transaction_type
    FROM prepared_elements
    RETURNING id
  ),
  inserted_outbox AS (
    INSERT INTO public.graph_sync_queue (
      tenant_id, entity_type, entity_id, operation, payload
    )
    SELECT 
      tenant_id, 
      'transaction', 
      id, 
      'MERGE', 
      to_jsonb(p) - 'raw_payload' -- Converts the validated, clean prepared row straight into clean JSONB
    FROM prepared_elements p
  )
  SELECT array_agg(id) INTO v_results FROM inserted_rows;

  RETURN COALESCE(v_results, '{}');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Security lockdown
REVOKE EXECUTE ON FUNCTION public.add_transactions_bulk_v1(JSONB) FROM anon;
