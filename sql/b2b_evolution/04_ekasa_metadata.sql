-- Migration: 04_ekasa_metadata
-- Adds rich B2B eKasa metadata to the expenses table and updates save_receipt_v3

-- 1. Add Columns to expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS ico TEXT,
ADD COLUMN IF NOT EXISTS receipt_number TEXT,
ADD COLUMN IF NOT EXISTS transacted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS vat_detail JSONB;

-- 2. Update save_receipt_v3 to insert the new columns
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
    id, household_id, location_id, amount, currency, category, date, who, who_id, description,
    ico, receipt_number, transacted_at, vat_detail
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
    p_expense->>'description',
    p_expense->>'ico',
    p_expense->>'receipt_number',
    (p_expense->>'transacted_at')::TIMESTAMPTZ,
    (p_expense->>'vat_detail')::JSONB
  ) RETURNING id INTO v_expense_id;

  -- Bulk Insert Items with propagated currency
  INSERT INTO public.receipt_items (id, expense_id, household_id, name, amount, category, currency)
  SELECT 
    COALESCE(id, gen_random_uuid()), v_expense_id, v_session_h_id, name, amount, category, v_currency
  FROM jsonb_to_recordset(p_items) AS x(id UUID, name TEXT, amount NUMERIC, category TEXT);

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
