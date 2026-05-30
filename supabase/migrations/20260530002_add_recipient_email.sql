-- ==========================================
-- Migration 20260530002: Add recipient_email to whatsapp_outbox
-- 
-- 1. Adds recipient_email column so we can filter by the current user
-- 2. Updates insert_whatsapp_outbox_v2 to store recipient_email
-- 3. Creates get_pending_approvals_v1 RPC that returns only the
--    current user's pending/SENT outbox records
-- ==========================================

-- Phase 1: Add recipient_email column
ALTER TABLE public.whatsapp_outbox
  ADD COLUMN IF NOT EXISTS recipient_email TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_recipient_email
  ON public.whatsapp_outbox(recipient_email);

-- Phase 2: Drop all existing overloads, then recreate with new param
DROP FUNCTION IF EXISTS public.insert_whatsapp_outbox_v2;
CREATE OR REPLACE FUNCTION public.insert_whatsapp_outbox_v2(
  p_tenant_id UUID,
  p_recipient_phone TEXT,
  p_payload JSONB,
  p_api_key_id UUID DEFAULT NULL,
  p_webhook_url TEXT DEFAULT NULL,
  p_webhook_secret TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_recipient_email TEXT DEFAULT NULL
)
RETURNS SETOF public.whatsapp_outbox
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.whatsapp_outbox
    (tenant_id, recipient_phone, payload, status, api_key_id, webhook_url, webhook_secret, idempotency_key, recipient_email)
  VALUES
    (p_tenant_id, p_recipient_phone, p_payload, 'PENDING', p_api_key_id, p_webhook_url, p_webhook_secret, p_idempotency_key, p_recipient_email)
  RETURNING *;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_whatsapp_outbox_v2 FROM public, anon;
GRANT EXECUTE ON FUNCTION public.insert_whatsapp_outbox_v2 TO authenticated, service_role;

-- Phase 3: Create per-user pending approvals RPC
CREATE OR REPLACE FUNCTION public.get_pending_approvals_v1()
RETURNS TABLE (
  id UUID,
  payload JSONB,
  recipient_phone TEXT,
  recipient_email TEXT,
  tenant_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT wo.id, wo.payload, wo.recipient_phone, wo.recipient_email,
         wo.tenant_id, wo.status, wo.created_at
  FROM public.whatsapp_outbox wo
  WHERE wo.tenant_id = public.get_my_tenant()
    AND wo.recipient_email = auth.jwt()->>'email'
    AND wo.status IN ('PENDING', 'SENT')
  ORDER BY wo.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_approvals_v1 FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_approvals_v1 TO authenticated;
