-- ========================================================
-- ARCHITECTURE STABILIZATION & CLEAN SLATE (DEV)
-- ========================================================

-- 1. Wipe existing test data (CLEAN SLATE)
TRUNCATE public.app_state CASCADE;
TRUNCATE public.app_users CASCADE;
TRUNCATE public.households CASCADE;

-- 2. Enhance Households with Creator Tracking
-- This is critical for fixing the 403 chicken-and-egg problem.
ALTER TABLE public.households 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 3. Reset RLS Policies for Households
DROP POLICY IF EXISTS "Users can see their household" ON households;
DROP POLICY IF EXISTS "Users can create households" ON households;

-- SELECT: Can see if you are in app_users OR if you created it
CREATE POLICY "Users can see their household" 
ON households FOR SELECT 
USING (
    created_by = auth.uid() 
    OR 
    id IN (SELECT household_id FROM app_users WHERE id = auth.uid())
);

-- INSERT: Anyone authenticated can create one, and we record the creator
CREATE POLICY "Users can create households" 
ON households FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- UPDATE: Same as SELECT
CREATE POLICY "Users can update their household" 
ON households FOR UPDATE 
USING (
    created_by = auth.uid() 
    OR 
    id IN (SELECT household_id FROM app_users WHERE id = auth.uid())
);

-- 4. Reset RLS Policies for App Users (Mappings)
DROP POLICY IF EXISTS "Users mapping management" ON app_users;
CREATE POLICY "Users mapping management" 
ON app_users FOR ALL 
USING (id = auth.uid())
WITH CHECK (true);

-- 5. Restore RLS for Expenses (Safety Check)
-- Ensure they use the same mapping logic
DROP POLICY IF EXISTS "Main expense isolation" ON expenses;
CREATE POLICY "Main expense isolation" 
ON expenses FOR ALL 
USING (household_id IN (SELECT household_id FROM app_users WHERE id = auth.uid()));

-- 6. Ensure Legacy Account can access EVERYTHING (Internal Bridge Support)
-- Note: 'legacy@et-tracker.com' will be handled via standard RLS as its UID will match its created households.
