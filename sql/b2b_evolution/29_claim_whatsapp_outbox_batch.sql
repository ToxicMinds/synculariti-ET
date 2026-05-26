-- ==========================================
-- Migration 29: Atomic batch claim for outbox
-- Used by Vercel Cron safety net
-- SKIP LOCKED prevents concurrent processor conflicts
-- ==========================================

CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbox_batch(
  p_batch_size INT DEFAULT 10
)
RETURNS SETOF public.whatsapp_outbox
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.whatsapp_outbox
  SET status = 'PROCESSING', processed_at = NOW()
  WHERE id IN (
    SELECT id FROM public.whatsapp_outbox
    WHERE status IN ('PENDING', 'FAILED')
      AND (
        status = 'PENDING'
        OR processed_at < NOW() - (COALESCE(retry_count, 0) * INTERVAL '5 minutes')
      )
      AND retry_count < 5
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_whatsapp_outbox_batch FROM public;
-- Vercel Edge routes use anon key for RPC calls
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_outbox_batch TO anon;
