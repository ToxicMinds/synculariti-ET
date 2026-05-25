-- Add whatsapp_message_id to whatsapp_outbox so we can link replies
ALTER TABLE public.whatsapp_outbox 
  ADD COLUMN whatsapp_message_id TEXT UNIQUE;

-- Create whatsapp_inbox table
CREATE TABLE public.whatsapp_inbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  outbox_id       UUID REFERENCES public.whatsapp_outbox(id) ON DELETE SET NULL,
  sender_phone    TEXT NOT NULL,
  message_id      TEXT NOT NULL UNIQUE,
  message_type    TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_inbox FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation inbox" ON public.whatsapp_inbox
  USING (tenant_id = public.get_my_tenant());

GRANT ALL ON TABLE public.whatsapp_inbox TO authenticated;

-- Create purge logs function for retention policy (30 days)
CREATE OR REPLACE FUNCTION public.purge_expired_whatsapp_logs(days_to_keep INT DEFAULT 30)
RETURNS void AS $$
BEGIN
  DELETE FROM public.whatsapp_outbox 
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  DELETE FROM public.whatsapp_inbox 
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Revoke anon execution on the purge function
REVOKE EXECUTE ON FUNCTION public.purge_expired_whatsapp_logs(INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_expired_whatsapp_logs(INT) FROM public;
