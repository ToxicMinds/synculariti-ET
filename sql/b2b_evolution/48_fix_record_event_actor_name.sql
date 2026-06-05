-- Resolve actor_name from auth.users into metadata at insert time.
-- This bypasses the app_users mismatch (app_users uses its own UUIDs,
-- not auth.uid()) so that resolveActorName has a name to display
-- for every user-type event, regardless of app_users having a row.

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
  v_actor_name TEXT;
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
  IF p_who_id IS NULL AND p_who_type = 'user' THEN
    p_who_id := auth.uid();
  END IF;

  -- Resolve actor_name from auth.users for user-type events.
  -- This ensures the name is embedded at insert time so
  -- resolveActorName can display it without joining to app_users
  -- (which uses different UUIDs than auth.users).
  IF p_who_id IS NOT NULL AND p_who_type = 'user' THEN
    SELECT COALESCE(
      raw_user_meta_data->>'full_name',
      email
    ) INTO v_actor_name FROM auth.users WHERE id = p_who_id;

    IF v_actor_name IS NOT NULL THEN
      p_metadata := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('actor_name', v_actor_name);
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.record_event_v1 FROM anon;
GRANT EXECUTE ON FUNCTION public.record_event_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_event_v1 TO service_role;
