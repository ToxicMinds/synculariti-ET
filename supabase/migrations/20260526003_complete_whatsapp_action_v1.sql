-- ==========================================
-- Migration 30: Atomic action completion RPC
-- Fixes ACID V-49 split-brain in dispatchDecision
-- Marks COMPLETED AND returns webhook config in one TX
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
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_webhook_url TEXT;
  v_webhook_secret TEXT;
  v_payload JSONB;
BEGIN
  UPDATE public.whatsapp_outbox
  SET status = 'COMPLETED', processed_at = NOW()
  WHERE id = p_outbox_id AND status IN ('PENDING', 'PROCESSING')
  RETURNING status, webhook_url, webhook_secret, payload
  INTO v_status, v_webhook_url, v_webhook_secret, v_payload;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'NOT_FOUND'::TEXT, NULL::TEXT, NULL::TEXT, NULL::JSONB;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_status, v_webhook_url, v_webhook_secret, v_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_whatsapp_action_v1 FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_whatsapp_action_v1 FROM authenticated;
