-- ==========================================
-- Migration 37: Extended outbox insert for notify route
-- Fixes ACID V-78 in notify/route.ts
-- Adds optional fields: api_key_id, webhook_url, webhook_secret, idempotency_key
-- ==========================================

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
