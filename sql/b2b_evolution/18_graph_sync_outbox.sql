-- Migration: 18_graph_sync_outbox
-- Purpose: Implement Outbox Pattern for Supabase-to-Neo4j consistency.
-- Enforces: ACID transactions for dual-writes.

-- 1. Create Outbox Table
CREATE TABLE IF NOT EXISTS public.graph_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction', 'merchant')),
    entity_id UUID NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('MERGE', 'DELETE')),
    payload JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Index for efficient consumer polling
CREATE INDEX IF NOT EXISTS idx_graph_sync_pending 
ON public.graph_sync_queue(status, created_at) 
WHERE status = 'PENDING';

-- RLS: Only accessible by service_role (consumer) or internal RPCs
ALTER TABLE public.graph_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Only" ON public.graph_sync_queue 
USING (auth.role() = 'service_role');

-- 2. Internal Enqueue Helper
-- Note: This is internal and doesn't need its own security layer beyond being called by SECURITY DEFINER RPCs.
CREATE OR REPLACE FUNCTION public.enqueue_graph_sync_internal(
    p_tenant_id UUID,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_operation TEXT,
    p_payload JSONB DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.graph_sync_queue (tenant_id, entity_type, entity_id, operation, payload)
    VALUES (p_tenant_id, p_entity_type, p_entity_id, p_operation, p_payload);
END;
$$;

-- 3. Update add_transaction_v3 (from 13_missing_rpcs.sql)
CREATE OR REPLACE FUNCTION public.add_transaction_v3(
    p_transaction JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_new_id UUID;
    v_amount NUMERIC;
    v_date DATE;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    BEGIN
        v_amount := (p_transaction->>'amount')::NUMERIC;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid numeric amount provided: %', p_transaction->>'amount';
    END;

    BEGIN
        v_date := (p_transaction->>'date')::DATE;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid date format provided: %', p_transaction->>'date';
    END;

    v_new_id := COALESCE((p_transaction->>'id')::UUID, gen_random_uuid());

    INSERT INTO transactions (
        id, tenant_id, location_id, who_id, who, category, amount, currency, date, description, ico, receipt_number, transacted_at, vat_detail, transaction_type
    ) VALUES (
        v_new_id, v_tenant_id, (p_transaction->>'location_id')::UUID, (p_transaction->>'who_id')::UUID, p_transaction->>'who', p_transaction->>'category', v_amount, COALESCE(p_transaction->>'currency', 'EUR'), v_date, p_transaction->>'description', p_transaction->>'ico', p_transaction->>'receipt_number', (p_transaction->>'transacted_at')::TIMESTAMP WITH TIME ZONE, p_transaction->'vat_detail', COALESCE(p_transaction->>'transaction_type', 'DEBIT')
    );

    -- ENQUEUE FOR GRAPH
    PERFORM public.enqueue_graph_sync_internal(v_tenant_id, 'transaction', v_new_id, 'MERGE', p_transaction);

    RETURN v_new_id;
END;
$$;

-- 4. Update save_receipt_v4 (from 14_hardened_finance_rpcs.sql)
CREATE OR REPLACE FUNCTION public.save_receipt_v4(
  p_transaction JSONB,
  p_items JSONB,
  p_location_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_session_t_id UUID;
  v_currency TEXT;
BEGIN
  v_session_t_id := public.get_my_tenant();
  IF v_session_t_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  
  IF (p_transaction->>'tenant_id')::UUID != v_session_t_id THEN RAISE EXCEPTION 'Security Violation'; END IF;

  v_currency := COALESCE(NULLIF(p_transaction->>'currency', ''), 'EUR');
  v_transaction_id := COALESCE((p_transaction->>'id')::UUID, gen_random_uuid());

  INSERT INTO public.transactions (
    id, tenant_id, location_id, amount, currency, category, date, who, who_id, description, ico, receipt_number, transacted_at, vat_detail, transaction_type
  ) VALUES (
    v_transaction_id, v_session_t_id, p_location_id, (p_transaction->>'amount')::NUMERIC, v_currency, p_transaction->>'category', (p_transaction->>'date')::DATE, p_transaction->>'who', (p_transaction->>'who_id')::UUID, p_transaction->>'description', p_transaction->>'ico', p_transaction->>'receipt_number', (p_transaction->>'transacted_at')::TIMESTAMPTZ, (p_transaction->>'vat_detail')::JSONB, COALESCE(p_transaction->>'transaction_type', 'DEBIT')
  ) ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();

  DELETE FROM public.receipt_items WHERE expense_id = v_transaction_id;
  INSERT INTO public.receipt_items (id, expense_id, tenant_id, name, amount, category, currency)
  SELECT COALESCE((item->>'id')::UUID, gen_random_uuid()), v_transaction_id, v_session_t_id, item->>'name', (item->>'amount')::NUMERIC, item->>'category', v_currency
  FROM jsonb_array_elements(p_items) AS item;

  -- ENQUEUE FOR GRAPH
  PERFORM public.enqueue_graph_sync_internal(v_session_t_id, 'transaction', v_transaction_id, 'MERGE', p_transaction);

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Update add_transactions_bulk_v1
CREATE OR REPLACE FUNCTION public.add_transactions_bulk_v1(
  p_transactions JSONB[]
)
RETURNS UUID[] AS $$
DECLARE
  v_session_t_id UUID;
  v_transaction JSONB;
  v_results UUID[] := '{}';
  v_new_id UUID;
BEGIN
  v_session_t_id := public.get_my_tenant();
  
  FOREACH v_transaction IN ARRAY p_transactions
  LOOP
    v_new_id := COALESCE((v_transaction->>'id')::UUID, gen_random_uuid());
    INSERT INTO public.transactions (
      id, tenant_id, amount, category, date, who, who_id, description, currency, location_id, transaction_type
    ) VALUES (
      v_new_id, v_session_t_id, (v_transaction->>'amount')::NUMERIC, v_transaction->>'category', (v_transaction->>'date')::DATE, v_transaction->>'who', (v_transaction->>'who_id')::UUID, v_transaction->>'description', COALESCE(v_transaction->>'currency', 'EUR'), (v_transaction->>'location_id')::UUID, COALESCE(v_transaction->>'transaction_type', 'DEBIT')
    ) RETURNING id INTO v_new_id;
    
    -- ENQUEUE FOR GRAPH
    PERFORM public.enqueue_graph_sync_internal(v_session_t_id, 'transaction', v_new_id, 'MERGE', v_transaction);
    
    v_results := array_append(v_results, v_new_id);
  END LOOP;

  RETURN v_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Update update_transaction_v1 (from 11_phase2_dml_rpcs.sql)
CREATE OR REPLACE FUNCTION public.update_transaction_v1(
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
    v_full_row JSONB;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    UPDATE transactions
    SET
        amount = COALESCE(NULLIF(p_transaction->>'amount', '')::NUMERIC, amount),
        category = COALESCE(p_transaction->>'category', category),
        date = COALESCE(NULLIF(p_transaction->>'date', '')::DATE, date),
        description = COALESCE(p_transaction->>'description', description),
        currency = COALESCE(p_transaction->>'currency', currency),
        vat_detail = COALESCE(p_transaction->'vat_detail', vat_detail),
        updated_at = NOW()
    WHERE id = p_id AND tenant_id = v_tenant_id
    RETURNING updated_at, to_jsonb(transactions.*) INTO v_updated_at, v_full_row;

    IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;

    -- ENQUEUE FOR GRAPH (Send full row to consumer)
    PERFORM public.enqueue_graph_sync_internal(v_tenant_id, 'transaction', p_id, 'MERGE', v_full_row);

    RETURN jsonb_build_object('id', p_id, 'updated_at', v_updated_at);
END;
$$;

-- 7. Update soft_delete_transaction_v1
CREATE OR REPLACE FUNCTION public.soft_delete_transaction_v1(
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
    IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    UPDATE transactions
    SET is_deleted = true, updated_at = NOW()
    WHERE id = p_id AND tenant_id = v_tenant_id
    RETURNING updated_at INTO v_updated_at;

    IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;

    -- ENQUEUE FOR GRAPH (DELETE operation)
    PERFORM public.enqueue_graph_sync_internal(v_tenant_id, 'transaction', p_id, 'DELETE', '{}'::JSONB);

    RETURN jsonb_build_object('id', p_id, 'updated_at', v_updated_at);
END;
$$;
