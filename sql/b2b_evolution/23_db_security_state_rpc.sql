-- Migration: 23_db_security_state_rpc.sql
-- Purpose: Implement the secure live function security catalog inspector
-- used by the integration test suite to verify search_path and EXECUTE privileges.

CREATE OR REPLACE FUNCTION public.get_function_security_state(
  p_func_name TEXT,
  p_args_signature TEXT
)
RETURNS TABLE (
  func_exists BOOLEAN,
  has_search_path_public BOOLEAN,
  is_revoked_from_public BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
  v_has_search_path BOOLEAN := FALSE;
  v_is_revoked BOOLEAN := FALSE;
  v_func_oid OID;
  v_proconfig TEXT[];
BEGIN
  -- 1. Check if the function exists in schema 'public' with the matching parameter type signature
  SELECT p.oid, p.proconfig INTO v_func_oid, v_proconfig
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = p_func_name
    AND pg_catalog.oidvectortypes(p.proargtypes) = p_args_signature;

  IF v_func_oid IS NOT NULL THEN
    v_exists := TRUE;

    -- 2. Check if search_path = public is strictly set in the function config
    IF v_proconfig IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 
        FROM unnest(v_proconfig) cfg 
        WHERE lower(replace(cfg, ' ', '')) = 'search_path=public'
      ) INTO v_has_search_path;
    END IF;

    -- 3. Check if both 'anon' and 'public' roles do NOT have execute privilege
    IF NOT pg_catalog.has_function_privilege('anon', v_func_oid, 'EXECUTE')
       AND NOT pg_catalog.has_function_privilege('public', v_func_oid, 'EXECUTE') THEN
      v_is_revoked := TRUE;
    END IF;
  END IF;

  RETURN QUERY SELECT v_exists, v_has_search_path, v_is_revoked;
END;
$$;

-- Enforce strict security lockdown
REVOKE EXECUTE ON FUNCTION public.get_function_security_state(TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_function_security_state(TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_function_security_state(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_function_security_state(TEXT, TEXT) TO service_role;
