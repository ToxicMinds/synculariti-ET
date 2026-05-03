-- ==========================================
-- B2B EVOLUTION: TOTAL PLATINUM BUNDLE
-- ==========================================
-- Standard: Zero-Join Frontend Initialization (Inc. Locations)

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
      SELECT jsonb_agg(l) FROM (
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
