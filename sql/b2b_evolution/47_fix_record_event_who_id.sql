-- ========================================================
-- MIGRATION: 47_fix_record_event_who_id.sql
-- PURPOSE: Auto-capture who_id from the authenticated
--          session when p_who_id is NULL and who_type='user'
-- ========================================================

-- Rebuild record_event_v1 with auth.uid() fallback
CREATE OR REPLACE FUNCTION public.record_event_v1(
  p_action TEXT,
  p_who_type TEXT DEFAULT 'user',
  p_who_id UUID DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_source TEXT DEFAULT 'client',
  p_tenant_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
  v_inserted_id UUID;
BEGIN
  -- If server didn't explicitly pass tenant_id, derive from session
  IF p_tenant_id IS NULL THEN
    v_tenant_id := public.get_my_tenant();
  ELSE
    v_tenant_id := p_tenant_id;
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'event_log: No tenant_id resolved';
  END IF;

  -- Auto-capture who_id from the authenticated session when
  -- the caller expects a user identity but didn't provide one.
  -- This fixes 12 call sites that forget to pass whoId.
  -- Service-role callers (createServiceClient) have no session,
  -- so auth.uid() returns NULL — they must pass whoId explicitly.
  IF p_who_id IS NULL AND p_who_type = 'user' THEN
    p_who_id := auth.uid();
  END IF;

  INSERT INTO public.event_log (
    tenant_id, action, who_id, who_type, entity_type, entity_id, description, metadata, source
  ) VALUES (
    v_tenant_id,
    p_action,
    p_who_id,
    p_who_type,
    p_entity_type,
    p_entity_id,
    p_description,
    COALESCE(p_metadata, '{}'::jsonb),
    p_source
  ) RETURNING id INTO v_inserted_id;

  RETURN v_inserted_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Revoke execute from anon to prevent unauthorized direct logging
REVOKE EXECUTE ON FUNCTION public.record_event_v1 FROM anon;

-- Grant to authenticated (user sessions) and service_role (server-side)
GRANT EXECUTE ON FUNCTION public.record_event_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_v1 TO service_role;
