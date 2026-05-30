-- ==========================================
-- Migration 31/20260530: Fix dispatchDecision cross-tenant bug
-- Adds SECURITY DEFINER + explicit tenant_members check to
-- complete_whatsapp_action_v1.
-- 
-- The RLS policy on whatsapp_outbox scopes by get_my_tenant() which may
-- not match the outbox's tenant (user is member of multiple tenants).
-- SECURITY DEFINER bypasses this scope filter; membership is verified
-- explicitly via auth.jwt()->>'email' — same pattern as
-- is_tenant_management_privileged().
-- ==========================================

CREATE OR REPLACE FUNCTION public.complete_whatsapp_action_v1(
  p_outbox_id UUID,
  p_decision TEXT
)
RETURNS TABLE (
  status TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  payload JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_status TEXT;
  v_webhook_url TEXT;
  v_webhook_secret TEXT;
  v_payload JSONB;
BEGIN
  -- 1. Read the outbox's tenant (SECURITY DEFINER bypasses RLS scope filter)
  SELECT wo.tenant_id INTO v_tenant_id
  FROM public.whatsapp_outbox wo
  WHERE wo.id = p_outbox_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  -- 2. Verify caller is a member of this tenant (explicit auth, not RLS)
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.email = auth.jwt()->>'email'
  ) THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  -- 3. Atomically mark COMPLETED (only if still pending/sent)
  UPDATE public.whatsapp_outbox AS wo
  SET status = 'COMPLETED', processed_at = NOW(),
      payload = jsonb_set(COALESCE(wo.payload, '{}'::jsonb), '{completed_decision}', to_jsonb(p_decision))
  WHERE wo.id = p_outbox_id AND wo.status IN ('PENDING', 'PROCESSING', 'SENT')
  RETURNING wo.status, wo.webhook_url, wo.webhook_secret, wo.payload
  INTO v_status, v_webhook_url, v_webhook_secret, v_payload;

  IF NOT FOUND THEN
    -- Already completed by sidecar/webhook race — return success without re-firing
    SELECT wo.status, wo.webhook_url, wo.webhook_secret, wo.payload
    INTO v_status, v_webhook_url, v_webhook_secret, v_payload
    FROM public.whatsapp_outbox wo
    WHERE wo.id = p_outbox_id;
    RETURN QUERY SELECT 'COMPLETED_SKIP_WEBHOOK'::TEXT, v_webhook_url, v_webhook_secret, v_payload;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_status, v_webhook_url, v_webhook_secret, v_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_whatsapp_action_v1 FROM public;
-- Server actions use session-based anon key (authenticated role)
GRANT EXECUTE ON FUNCTION public.complete_whatsapp_action_v1 TO authenticated;
