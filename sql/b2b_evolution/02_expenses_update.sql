-- ==========================================
-- B2B EVOLUTION: PLATINUM LEDGER
-- ==========================================
-- Standard: Audit-proof at the line-item level.

-- 1. ENHANCE TABLES
ALTER TABLE public.expenses 
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR' CHECK (length(currency) = 3);

-- Propagate currency to items for independent reporting
ALTER TABLE public.receipt_items 
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'EUR' CHECK (length(currency) = 3);

-- 2. COMPOSITE PERFORMANCE INDEXING
CREATE INDEX IF NOT EXISTS idx_expenses_location_date ON public.expenses(location_id, date DESC);

-- 3. VERSIONED RPC: SAVE RECEIPT (V3)
CREATE OR REPLACE FUNCTION public.save_receipt_v3(
  p_expense JSONB,
  p_items JSONB
)
RETURNS UUID AS $$
DECLARE
  v_expense_id UUID;
  v_session_h_id UUID;
  v_loc_id UUID;
  v_currency TEXT;
BEGIN
  v_session_h_id := public.get_my_household();
  v_loc_id := (p_expense->>'location_id')::UUID;
  
  -- Robust Currency Defaulting
  v_currency := COALESCE(NULLIF(p_expense->>'currency', ''), 'EUR');

  -- SECURITY CHECK 1: Tenant Mismatch
  IF (p_expense->>'household_id')::UUID != v_session_h_id THEN
    RAISE EXCEPTION 'Security Violation: Tenant Mismatch.';
  END IF;

  -- SECURITY CHECK 2: Location Ownership
  IF v_loc_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.locations 
      WHERE id = v_loc_id AND household_id = v_session_h_id
    ) THEN
      RAISE EXCEPTION 'Security Violation: Location Ownership Mismatch.';
    END IF;
  END IF;

  -- Insert Main Expense
  INSERT INTO public.expenses (
    id, household_id, location_id, amount, currency, category, date, who, who_id, description
  ) VALUES (
    COALESCE((p_expense->>'id')::UUID, gen_random_uuid()),
    v_session_h_id,
    v_loc_id,
    (p_expense->>'amount')::NUMERIC,
    v_currency,
    p_expense->>'category',
    (p_expense->>'date')::DATE,
    p_expense->>'who',
    (p_expense->>'who_id')::UUID,
    p_expense->>'description'
  ) RETURNING id INTO v_expense_id;

  -- Bulk Insert Items with propagated currency
  INSERT INTO public.receipt_items (id, expense_id, household_id, name, amount, category, currency)
  SELECT 
    COALESCE(id, gen_random_uuid()), v_expense_id, v_session_h_id, name, amount, category, v_currency
  FROM jsonb_to_recordset(p_items) AS x(id UUID, name TEXT, amount NUMERIC, category TEXT);

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
