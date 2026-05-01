-- ==========================================
-- PERFORMANCE OPTIMIZATION: BUNDLED FETCH
-- ==========================================
-- Consolidates app_users, households, and app_state into 
-- a single network round-trip.

CREATE OR REPLACE FUNCTION get_household_bundle()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_household_id UUID;
    v_house RECORD;
    v_state JSONB;
BEGIN
    -- Identify the caller
    v_user_id := auth.uid();
    
    -- 1. Get the household ID mapping
    SELECT household_id INTO v_household_id 
    FROM public.app_users 
    WHERE id = v_user_id;
    
    IF v_household_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 2. Get household metadata (handle, creation date)
    SELECT handle, created_at INTO v_house 
    FROM public.households 
    WHERE id = v_household_id;

    -- If the household itself is missing, the user is orphaned
    IF v_house.handle IS NULL THEN
        RETURN NULL;
    END IF;

    -- 3. Get app state configuration (budgets, names, etc.)
    SELECT config INTO v_state 
    FROM public.app_state 
    WHERE id = v_household_id;

    -- 4. Construct and return the unified bundle
    RETURN jsonb_build_object(
        'household_id', v_household_id,
        'handle', v_house.handle,
        'created_at', v_house.created_at,
        'config', COALESCE(v_state, '{}'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
