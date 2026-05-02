-- ==========================================
-- FORT KNOX: SECURITY HARDENING (V2)
-- ==========================================
-- This script enforces strict tenant isolation and 
-- Least Privilege across all financial tables.

-- 1. SECURE HELPER FUNCTION (Memoized with Safe Casting)
CREATE OR REPLACE FUNCTION public.get_my_household() 
RETURNS UUID AS $$
DECLARE
  v_h_id UUID;
BEGIN
  -- NULLIF ensures we don't try to cast an empty string to UUID
  v_h_id := NULLIF(current_setting('app.current_household_id', true), '')::UUID;
  
  IF v_h_id IS NULL THEN
    SELECT household_id INTO v_h_id FROM public.app_users WHERE id = auth.uid() LIMIT 1;
    PERFORM set_config('app.current_household_id', v_h_id::TEXT, true);
  END IF;
  RETURN v_h_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. ENABLE & FORCE ROW LEVEL SECURITY
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_state FORCE ROW LEVEL SECURITY;

-- 3. EXPENSES POLICIES (Split for Syntax & Granular Control)
DROP POLICY IF EXISTS "Household Isolation" ON public.expenses;
DROP POLICY IF EXISTS "Household Delete Isolation" ON public.expenses;
DROP POLICY IF EXISTS "Household Select" ON public.expenses;
DROP POLICY IF EXISTS "Household Insert" ON public.expenses;
DROP POLICY IF EXISTS "Household Update" ON public.expenses;
DROP POLICY IF EXISTS "Household Delete" ON public.expenses;

-- Read
CREATE POLICY "Household Select" ON public.expenses
  FOR SELECT TO authenticated
  USING (household_id = public.get_my_household());

-- Create
CREATE POLICY "Household Insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (household_id = public.get_my_household());

-- Update
CREATE POLICY "Household Update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (household_id = public.get_my_household())
  WITH CHECK (household_id = public.get_my_household());

-- Delete (Standalone for future MFA hardening)
CREATE POLICY "Household Delete" ON public.expenses
  FOR DELETE TO authenticated
  USING (household_id = public.get_my_household());

-- 4. RECEIPT_ITEMS POLICY
DROP POLICY IF EXISTS "Household Isolation" ON public.receipt_items;
CREATE POLICY "Household Isolation" ON public.receipt_items
  FOR ALL TO authenticated
  USING (household_id = public.get_my_household())
  WITH CHECK (household_id = public.get_my_household());

-- 5. APP_STATE POLICY
DROP POLICY IF EXISTS "Household Isolation" ON public.app_state;
CREATE POLICY "Household Isolation" ON public.app_state
  FOR ALL TO authenticated
  USING (id = public.get_my_household())
  WITH CHECK (id = public.get_my_household());

-- 6. APP_USERS POLICY
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own mapping" ON public.app_users;
CREATE POLICY "Users see own mapping" ON public.app_users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 7. OPTIONAL: MFA ENFORCED DELETES (AAL2)
-- To enable, DROP 'Household Delete' and uncomment below
-- CREATE POLICY "MFA Delete Protection" ON public.expenses
--   FOR DELETE TO authenticated
--   USING (
--     household_id = public.get_my_household() 
--     AND auth.jwt()->>'aal' = 'aal2'
--   );
