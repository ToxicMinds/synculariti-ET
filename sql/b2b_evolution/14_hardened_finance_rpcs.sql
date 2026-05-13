-- ==========================================
-- B2B EVOLUTION: PHASE 2 - ACID HARDENING
-- ==========================================

-- 1. HARDENED RECEIPT SAVING (v4)
-- Restores eKasa metadata and ensures atomic transaction creation.
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
  -- Security: Deriving tenant from session (RLS)
  v_session_t_id := public.get_my_tenant();
  IF v_session_t_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Session tenant context missing.';
  END IF;
  
  -- Dual-Layer Validation
  IF (p_transaction->>'tenant_id')::UUID != v_session_t_id THEN
    RAISE EXCEPTION 'Security Violation: Tenant Mismatch.';
  END IF;

  IF p_location_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND tenant_id = v_session_t_id) THEN
      RAISE EXCEPTION 'Security Violation: Location Ownership Mismatch.';
    END IF;
  END IF;

  -- Currency Sanitization
  v_currency := COALESCE(NULLIF(p_transaction->>'currency', ''), 'EUR');
  IF char_length(v_currency) != 3 THEN
    RAISE EXCEPTION 'Validation Error: Invalid currency ISO code.';
  END IF;

  -- Generate or preserve ID
  v_transaction_id := COALESCE((p_transaction->>'id')::UUID, gen_random_uuid());

  -- Step 1: Atomic Transaction Upsert
  INSERT INTO public.transactions (
    id, tenant_id, location_id, amount, currency, category, date, who, who_id, description,
    ico, receipt_number, transacted_at, vat_detail, transaction_type
  ) VALUES (
    v_transaction_id,
    v_session_t_id,
    p_location_id,
    (p_transaction->>'amount')::NUMERIC,
    v_currency,
    p_transaction->>'category',
    (p_transaction->>'date')::DATE,
    p_transaction->>'who',
    (p_transaction->>'who_id')::UUID,
    p_transaction->>'description',
    p_transaction->>'ico',
    p_transaction->>'receipt_number',
    (p_transaction->>'transacted_at')::TIMESTAMPTZ,
    (p_transaction->>'vat_detail')::JSONB,
    COALESCE(p_transaction->>'transaction_type', 'DEBIT')
  )
  ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    category = EXCLUDED.category,
    date = EXCLUDED.date,
    description = EXCLUDED.description,
    ico = EXCLUDED.ico,
    receipt_number = EXCLUDED.receipt_number,
    transacted_at = EXCLUDED.transacted_at,
    vat_detail = EXCLUDED.vat_detail,
    updated_at = now();

  -- Step 2: Atomic Item Re-sync (Clean & Insert)
  DELETE FROM public.receipt_items WHERE expense_id = v_transaction_id;
  
  INSERT INTO public.receipt_items (id, expense_id, tenant_id, name, amount, category, currency)
  SELECT 
    COALESCE((item->>'id')::UUID, gen_random_uuid()), 
    v_transaction_id, 
    v_session_t_id, 
    item->>'name', 
    (item->>'amount')::NUMERIC, 
    item->>'category', 
    v_currency
  FROM jsonb_array_elements(p_items) AS item;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. BULK TRANSACTION INSERT (v1)
-- Provides an atomic path for multi-row financial ingestion.
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
    -- Security: derived tenant must match payload
    IF (v_transaction->>'tenant_id')::UUID != v_session_t_id THEN
      RAISE EXCEPTION 'Security Violation: Tenant Mismatch in bulk payload.';
    END IF;

    INSERT INTO public.transactions (
      id, tenant_id, amount, category, date, who, who_id, description, currency, location_id, transaction_type
    ) VALUES (
      COALESCE((v_transaction->>'id')::UUID, gen_random_uuid()),
      v_session_t_id,
      (v_transaction->>'amount')::NUMERIC,
      v_transaction->>'category',
      (v_transaction->>'date')::DATE,
      v_transaction->>'who',
      (v_transaction->>'who_id')::UUID,
      v_transaction->>'description',
      COALESCE(v_transaction->>'currency', 'EUR'),
      (v_transaction->>'location_id')::UUID,
      COALESCE(v_transaction->>'transaction_type', 'DEBIT')
    ) RETURNING id INTO v_new_id;
    
    v_results := array_append(v_results, v_new_id);
  END LOOP;

  RETURN v_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
