-- ==========================================
-- Migration 33: Atomic outbox delivery result
-- Fixes ACID V-70 split-brain in processOutboxQueue
-- Atomically sets SENT/FAILED, increments retry, prevents split-brain
-- ==========================================

CREATE OR REPLACE FUNCTION public.set_outbox_delivery_result_v1(
  p_outbox_id UUID,
  p_success BOOLEAN
)
RETURNS SETOF public.whatsapp_outbox
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.whatsapp_outbox
  SET status = CASE WHEN p_success THEN 'SENT' ELSE 'FAILED' END,
      processed_at = NOW(),
      retry_count = CASE WHEN p_success THEN retry_count ELSE retry_count + 1 END
  WHERE id = p_outbox_id
  RETURNING *;
$$;

REVOKE EXECUTE ON FUNCTION public.set_outbox_delivery_result_v1 FROM public;
-- Processing routes use service_role (server-to-server, no session)
GRANT EXECUTE ON FUNCTION public.set_outbox_delivery_result_v1 TO service_role;
