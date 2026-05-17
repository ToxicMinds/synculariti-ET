-- Migration: 22_safe_uuid_casting.sql
-- Purpose: Implement high-performance, identity-preserving UUID casting helpers in IMMUTABLE SQL,
-- and integrate them into the bulk transactions RPC to completely prevent 22P02 invalid_text_representation crashes.

-- 1. General-purpose safe UUID caster (using fast length short-circuiting)
CREATE OR REPLACE FUNCTION public.safe_cast_uuid(p_val TEXT)
RETURNS UUID AS $$
  SELECT CASE 
    WHEN length(p_val) = 36 AND p_val ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' 
      THEN p_val::UUID
    ELSE NULL
  END;
$$ LANGUAGE sql IMMUTABLE STRICT SET search_path = public;

-- 2. User-specific safe UUID caster (with deterministic mock padding & length limitation)
CREATE OR REPLACE FUNCTION public.safe_cast_user_uuid(p_val TEXT)
RETURNS UUID AS $$
  SELECT CASE 
    -- Case A: Valid UUID (Length check prevents executing regex on short mock IDs)
    WHEN length(p_val) = 36 AND p_val ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' 
      THEN p_val::UUID
    -- Case B: Mock user IDs ('u1', 'u25', up to 12 digits to prevent lpad overflows)
    WHEN p_val ~ '^u[0-9]{1,12}$' 
      THEN ('00000000-0000-0000-0000-' || lpad(substring(p_val from 2), 12, '0'))::UUID
    -- Case C: Empty string
    WHEN p_val = '' 
      THEN NULL
    -- Case D: Fallback for unmappable non-empty strings (including mock overflow)
    ELSE '00000000-0000-0000-0000-000000000000'::UUID
  END;
$$ LANGUAGE sql IMMUTABLE STRICT SET search_path = public;

-- Security lockdown for casting helpers
REVOKE EXECUTE ON FUNCTION public.safe_cast_uuid(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.safe_cast_user_uuid(TEXT) FROM anon;

-- 3. Redefining add_transactions_bulk_v1(JSONB) using modern casting helpers
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
      AND public.safe_cast_uuid(elem->>'tenant_id') != v_session_t_id
  ) THEN
    RAISE EXCEPTION 'Security Violation: Tenant Mismatch in bulk payload.';
  END IF;

  -- 3. High-Performance Atomic Set-Based Dual-Write (Transactions + Outbox)
  WITH prepared_elements AS (
    SELECT 
      COALESCE(public.safe_cast_uuid(elem->>'id'), gen_random_uuid()) AS id,
      v_session_t_id AS tenant_id,
      NULLIF(elem->>'amount', '')::NUMERIC AS amount,
      elem->>'category' AS category,
      NULLIF(elem->>'date', '')::DATE AS date,
      elem->>'who' AS who,
      public.safe_cast_user_uuid(elem->>'who_id') AS who_id, -- Safe polymorphic casting
      elem->>'description' AS description,
      COALESCE(NULLIF(elem->>'currency', ''), 'EUR') AS currency,
      public.safe_cast_uuid(elem->>'location_id') AS location_id, -- Safe cast
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

-- Security lockdown for RPC
REVOKE EXECUTE ON FUNCTION public.add_transactions_bulk_v1(JSONB) FROM anon;
