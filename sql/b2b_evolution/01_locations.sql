-- ==========================================
-- B2B PRIMITIVE: HARDENED LOCATIONS (V2)
-- ==========================================
-- Standard: Audit-ready, Metadata-searchable, Duplicate-proof.

-- 1. SYSTEM HARDENING: Add updated_at to existing tables
ALTER TABLE public.app_state ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. CREATE LOCATIONS TABLE
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.app_state(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Prevent duplicate branch names within the same tenant
  CONSTRAINT unique_location_name_per_household UNIQUE (household_id, name)
);

-- 3. INDEXING (O(1) Access)
CREATE INDEX IF NOT EXISTS idx_locations_household ON public.locations(household_id);
CREATE INDEX IF NOT EXISTS idx_locations_metadata ON public.locations USING GIN (metadata);

-- 4. FORCE RLS (Black Site Standard)
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations FORCE ROW LEVEL SECURITY;

-- Policy
DROP POLICY IF EXISTS "Tenant Isolation" ON public.locations;
CREATE POLICY "Tenant Isolation" ON public.locations
  FOR ALL TO authenticated
  USING (household_id = public.get_my_household())
  WITH CHECK (household_id = public.get_my_household());

-- 5. AUTOMATIC AUDITING TRIGGERS
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables
DROP TRIGGER IF EXISTS trg_update_app_state ON public.app_state;
CREATE TRIGGER trg_update_app_state BEFORE UPDATE ON public.app_state FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

DROP TRIGGER IF EXISTS trg_update_app_users ON public.app_users;
CREATE TRIGGER trg_update_app_users BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

DROP TRIGGER IF EXISTS trg_update_locations ON public.locations;
CREATE TRIGGER trg_update_locations BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
