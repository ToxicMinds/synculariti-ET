-- 1. Fix missing default UUID for expenses table (Bug 1)
-- This allows V2 to insert records without providing a client-side ID.
ALTER TABLE public.expenses 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Audit & Hardening (Chinese Wall)
-- Ensure app_users has a strict mapping (One user, one household)
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_id_key;
ALTER TABLE public.app_users ADD CONSTRAINT app_users_id_key UNIQUE (id);

-- Ensure app_state RLS is bulletproof
DROP POLICY IF EXISTS "State management" ON app_state;
CREATE POLICY "State management" ON app_state 
FOR ALL USING (id IN (SELECT household_id FROM app_users WHERE id = auth.uid()));

-- Ensure expense isolation is absolute
DROP POLICY IF EXISTS "Main expense isolation" ON expenses;
CREATE POLICY "Main expense isolation" 
ON expenses FOR ALL 
USING (household_id IN (SELECT household_id FROM app_users WHERE id = auth.uid()));
