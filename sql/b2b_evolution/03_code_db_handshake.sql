-- ==========================================
-- B2B EVOLUTION: BUG-FREE PLATINUM BUNDLE
-- ==========================================
-- Standard: Null-safe, Column-synced.

-- 1. Ensure columns exist
ALTER TABLE public.app_state 
  ADD COLUMN IF NOT EXISTS handle TEXT,
  ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- 2. CREATE BUG-FREE BUNDLE RPC
CREATE OR REPLACE FUNCTION public.get_household_bundle()
RETURNS JSONB AS $$
DECLARE
  v_session_h_id UUID;
  v_result JSONB;
BEGIN
  v_session_h_id := public.get_my_household();
  
  IF v_session_h_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_build_object(
    'household', (
      SELECT row_to_json(h) FROM (
        SELECT id, household_name, handle, categories, total_budget, config, created_at 
        FROM public.app_state 
        WHERE id = v_session_h_id
      ) h
    ),
    'locations', (
      -- Bug Fix: Ensure [] instead of NULL for new signups
      SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) FROM (
        SELECT id, name, address, metadata FROM public.locations 
        WHERE household_id = v_session_h_id
      ) l
    ),
    'user', (
      SELECT row_to_json(u) FROM (
        SELECT id, full_name, created_at 
        FROM public.app_users 
        WHERE id = auth.uid()
      ) u
    ),
    'server_time', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
