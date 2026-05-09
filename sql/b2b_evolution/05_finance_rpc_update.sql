-- ==========================================
-- B2B EVOLUTION: PHASE 2 - RPC UPDATES
-- ==========================================
-- Updating the RPC to use 'transactions' instead of 'expenses'.

CREATE OR REPLACE FUNCTION public.save_receipt_v3(
  p_expense JSONB,
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
  
  -- 1. Dual-Layer Validation
  IF (p_expense->>'tenant_id')::UUID != v_session_t_id THEN
    RAISE EXCEPTION 'Security Violation: Tenant Mismatch.';
  END IF;

  IF p_location_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND tenant_id = v_session_t_id) THEN
      RAISE EXCEPTION 'Security Violation: Location does not belong to tenant.';
    END IF;
  END IF;

  -- 2. Currency Validation
  v_currency := COALESCE(p_expense->>'currency', 'EUR');
  IF char_length(v_currency) != 3 THEN
    RAISE EXCEPTION 'Validation Error: Currency must be a 3-letter ISO code.';
  END IF;

  -- 3. Insert Transaction (formerly Expense)
  INSERT INTO public.transactions (
    id, tenant_id, amount, category, date, who, who_id, description, currency, location_id, transaction_type
  ) VALUES (
    COALESCE((p_expense->>'id')::UUID, gen_random_uuid()),
    v_session_t_id,
    (p_expense->>'amount')::NUMERIC,
    p_expense->>'category',
    (p_expense->>'date')::DATE,
    p_expense->>'who',
    (p_expense->>'who_id')::UUID,
    p_expense->>'description',
    v_currency,
    p_location_id,
    COALESCE(p_expense->>'transaction_type', 'DEBIT')
  ) RETURNING id INTO v_transaction_id;

  -- 4. Bulk Insert Items
  -- Note: receipt_items column expense_id is still used for backward compatibility, 
  -- but it now points to the transactions table.
  INSERT INTO public.receipt_items (id, expense_id, tenant_id, name, amount, category, currency)
  SELECT 
    COALESCE(id, gen_random_uuid()), v_transaction_id, v_session_t_id, name, amount, category, v_currency
  FROM jsonb_to_recordset(p_items) AS x(id UUID, name TEXT, amount NUMERIC, category TEXT);

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
