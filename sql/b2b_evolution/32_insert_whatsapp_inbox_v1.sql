-- ==========================================
-- Migration 32: Atomic inbox insert RPC
-- Fixes V-71: replaces direct supabase.from('whatsapp_inbox').insert()
-- with an ACID-compliant SECURITY DEFINER function
-- ==========================================

CREATE OR REPLACE FUNCTION public.insert_whatsapp_inbox_v1(
  p_tenant_id UUID,
  p_outbox_id UUID,
  p_sender_phone TEXT,
  p_message_id TEXT,
  p_message_type TEXT,
  p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.whatsapp_inbox (tenant_id, outbox_id, sender_phone, message_id, message_type, content)
  VALUES (p_tenant_id, p_outbox_id, p_sender_phone, p_message_id, p_message_type, p_content)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_whatsapp_inbox_v1 FROM anon, public;
GRANT EXECUTE ON FUNCTION public.insert_whatsapp_inbox_v1 TO service_role;
