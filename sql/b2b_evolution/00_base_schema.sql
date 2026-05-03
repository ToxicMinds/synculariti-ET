-- ==========================================
-- SYNCULARITI-ET: GOLD STANDARD SCHEMA
-- ==========================================
-- Status: Production-Ready (B2B SaaS)
-- Features: Auto-Auditing, Optimistic IDs, JWT Optimization.

-- 1. TENANT ISOLATION HELPER
CREATE OR REPLACE FUNCTION public.get_my_household() 
RETURNS UUID AS $$
DECLARE
  v_h_id UUID;
BEGIN
  -- Optimization: Try to get from session cache first
  v_h_id := NULLIF(current_setting('app.current_household_id', true), '')::UUID;
  
  IF v_h_id IS NULL THEN
    -- Scaling Tip: Use (auth.jwt() -> 'app_metadata' ->> 'household_id')::UUID 
    -- to avoid this DB hit once you implement Auth Metadata syncing.
    SELECT household_id INTO v_h_id FROM public.app_users WHERE id = auth.uid() LIMIT 1;
    PERFORM set_config('app.current_household_id', v_h_id::TEXT, true);
  END IF;
  
  RETURN v_h_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. CORE TABLES
CREATE TABLE IF NOT EXISTS public.app_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_name TEXT NOT NULL,
  categories JSONB DEFAULT '[]'::jsonb,
  total_budget NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES public.app_state(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.app_state(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  category TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  who TEXT,
  who_id UUID,
  description TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES public.app_state(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.app_state(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  user_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. INDEXING
CREATE INDEX IF NOT EXISTS idx_expenses_household ON public.expenses(household_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_expense ON public.receipt_items(expense_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_household ON public.activity_log(household_id);

-- 4. ROW LEVEL SECURITY
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant Isolation" ON public.app_state FOR ALL TO authenticated USING (id = public.get_my_household());
CREATE POLICY "Tenant Isolation" ON public.app_users FOR SELECT TO authenticated USING (household_id = public.get_my_household());
CREATE POLICY "Tenant Isolation" ON public.expenses FOR ALL TO authenticated USING (household_id = public.get_my_household());
CREATE POLICY "Tenant Isolation" ON public.receipt_items FOR ALL TO authenticated USING (household_id = public.get_my_household());
CREATE POLICY "Tenant Isolation" ON public.activity_log FOR SELECT TO authenticated USING (household_id = public.get_my_household());

-- 5. AUTO-AUDIT TRIGGER
CREATE OR REPLACE FUNCTION public.log_expense_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.activity_log (household_id, type, message, user_name)
    VALUES (NEW.household_id, 'EXPENSE_ADDED', 'Added ' || NEW.description || ' (€' || NEW.amount || ')', NEW.who);
  ELSIF (TG_OP = 'UPDATE') AND NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
    INSERT INTO public.activity_log (household_id, type, message, user_name)
    VALUES (NEW.household_id, 'EXPENSE_DELETED', 'Removed ' || OLD.description, NEW.who);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_expenses
AFTER INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.log_expense_activity();

-- 6. SECURE BULK RPC
CREATE OR REPLACE FUNCTION public.save_receipt_v2(
  p_expense JSONB,
  p_items JSONB
)
RETURNS UUID AS $$
DECLARE
  v_expense_id UUID;
  v_session_h_id UUID;
BEGIN
  v_session_h_id := public.get_my_household();
  
  -- Validation
  IF (p_expense->>'household_id')::UUID != v_session_h_id THEN
    RAISE EXCEPTION 'Security Violation: Tenant Mismatch.';
  END IF;

  -- Insert with Optimistic ID support
  INSERT INTO public.expenses (
    id, household_id, amount, category, date, who, who_id, description
  ) VALUES (
    COALESCE((p_expense->>'id')::UUID, gen_random_uuid()),
    v_session_h_id,
    (p_expense->>'amount')::NUMERIC,
    p_expense->>'category',
    (p_expense->>'date')::DATE,
    p_expense->>'who',
    (p_expense->>'who_id')::UUID,
    p_expense->>'description'
  ) RETURNING id INTO v_expense_id;

  -- Bulk Insert Items
  INSERT INTO public.receipt_items (id, expense_id, household_id, name, amount, category)
  SELECT 
    COALESCE(id, gen_random_uuid()), v_expense_id, v_session_h_id, name, amount, category
  FROM jsonb_to_recordset(p_items) AS x(id UUID, name TEXT, amount NUMERIC, category TEXT);

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
