-- ==========================================
-- Migration 34: Atomic outbox insert
-- Fixes ACID W-03 in notifyLargeInvoice
-- Replaces direct whatsapp_outbox.insert() with atomic RPC
-- ==========================================

CREATE OR REPLACE FUNCTION public.insert_whatsapp_outbox_v1(
  p_tenant_id UUID,
  p_recipient_phone TEXT,
  p_payload JSONB
)
RETURNS SETOF public.whatsapp_outbox
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.whatsapp_outbox (tenant_id, recipient_phone, payload, status)
  VALUES (p_tenant_id, p_recipient_phone, p_payload, 'PENDING')
  RETURNING *;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_whatsapp_outbox_v1 FROM public;
-- Server actions use session-based anon key (authenticated role)
GRANT EXECUTE ON FUNCTION public.insert_whatsapp_outbox_v1 TO authenticated;
