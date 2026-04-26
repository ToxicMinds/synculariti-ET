-- ==========================================
-- AUTH HANDLES & PIN MIGRATION
-- ==========================================

-- 1. Add handle and access_pin to households
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS handle TEXT UNIQUE;
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS access_pin TEXT;

-- 2. Create a lookup table for PIN-to-Household aliases (Legacy support)
-- This allows "2026" to be a direct entry point.
CREATE TABLE IF NOT EXISTS public.household_aliases (
    alias TEXT PRIMARY KEY, -- e.g. "2026"
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.household_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read for aliases" ON public.household_aliases FOR SELECT USING (true);

-- 3. Seed Legacy Data for Nikhil & Zuzana
DO $$ 
DECLARE
  primary_id UUID;
BEGIN
  -- Find the primary household
  SELECT id INTO primary_id FROM households ORDER BY created_at ASC LIMIT 1;
  
  IF primary_id IS NOT NULL THEN
    -- Set handle and PIN for the primary house
    UPDATE households 
    SET handle = 'shanbhag-26', 
        access_pin = '2026' 
    WHERE id = primary_id;
    
    -- Create the legacy alias so typing "2026" still works instantly
    INSERT INTO household_aliases (alias, household_id)
    VALUES ('2026', primary_id)
    ON CONFLICT (alias) DO NOTHING;
  END IF;
END $$;

-- 4. Function to verify a PIN or Alias
-- This can be called via RPC to securely check a code before logging in.
CREATE OR REPLACE FUNCTION public.verify_household_access(input_code TEXT)
RETURNS TABLE (target_id UUID, is_alias BOOLEAN) AS $$
BEGIN
    -- Check aliases first (Legacy 2026 flow)
    RETURN QUERY 
    SELECT household_id, true FROM household_aliases WHERE alias = input_code
    UNION ALL
    -- Check handles (Case-insensitive)
    SELECT id, false FROM households WHERE LOWER(handle) = LOWER(input_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
