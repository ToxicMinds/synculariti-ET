-- ==========================================
-- ET EXPENSE TRACKER: SAAS MIGRATION SCRIPT
-- ==========================================
-- This script transforms the single-user database into 
-- a multi-tenant SaaS with household isolation.

-- 1. Create Households Table
CREATE TABLE IF NOT EXISTS public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- 2. Create User-to-Household Mapping
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- 3. Create App State (Settings) Table
CREATE TABLE IF NOT EXISTS public.app_state (
    id UUID PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

-- 4. Create Recurring Expenses Table
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    category TEXT NOT NULL,
    day_of_month INTEGER NOT NULL CHECK (day_of_month >= 1 AND day_of_month <= 31),
    who TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

-- 5. Modify existing tables (Expenses / Invoices)
-- IMPORTANT: These MUST have a household_id column for isolation
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- NOTE: We allow authenticated users to initiate their own households during onboarding.

-- Households: users can see their own house and create new ones
CREATE POLICY "Users can see their household" ON households FOR SELECT USING (id IN (SELECT household_id FROM app_users WHERE id = auth.uid()));
CREATE POLICY "Users can create households" ON households FOR INSERT TO authenticated WITH CHECK (true);

-- App Users: self-service mapping
CREATE POLICY "Users mapping management" ON app_users FOR ALL USING (id = auth.uid());

-- App State: household isolation
CREATE POLICY "State management" ON app_state FOR ALL USING (id IN (SELECT household_id FROM app_users WHERE id = auth.uid()));

-- Recurring: household isolation
CREATE POLICY "Recurring management" ON recurring_expenses FOR ALL USING (household_id IN (SELECT household_id FROM app_users WHERE id = auth.uid()));

-- Main Expenses: THE MOST CRITICAL ISOLATION
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Main expense isolation" ON expenses FOR ALL USING (household_id IN (SELECT household_id FROM app_users WHERE id = auth.uid()));

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Main invoice isolation" ON invoices FOR ALL USING (household_id IN (SELECT household_id FROM app_users WHERE id = auth.uid()));

-- ========================================================
-- SEED LEGACY BRIDGE USER MAPPING
-- ========================================================
-- The PIN bridge logic requires the user legacy@et-tracker.com to have a mapping.
-- This script will map the legacy user to the oldest (original) household in your system.
-- NOTE: Ensure you manually create the legacy@et-tracker.com user in Supabase Auth first!
DO $$ 
DECLARE
  legacy_uid UUID;
  primary_house_id UUID;
BEGIN
  -- Find the legacy user's auth UID
  SELECT id INTO legacy_uid FROM auth.users WHERE email = 'legacy@et-tracker.com' LIMIT 1;
  
  -- Find your original primary household
  SELECT id INTO primary_house_id FROM households ORDER BY created_at ASC LIMIT 1;
  
  IF legacy_uid IS NOT NULL AND primary_house_id IS NOT NULL THEN
    INSERT INTO app_users (id, household_id)
    VALUES (legacy_uid, primary_house_id)
    ON CONFLICT (id) DO UPDATE SET household_id = EXCLUDED.household_id;
  END IF;
END $$;
