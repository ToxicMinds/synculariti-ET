-- Create api_keys table
CREATE TABLE public.api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key_value     TEXT NOT NULL UNIQUE,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation api_keys" ON public.api_keys
  USING (tenant_id = public.get_my_tenant());

-- The gateway uses service_role internally or specific authenticated context, but we grant ALL to authenticated per rules
GRANT ALL ON TABLE public.api_keys TO authenticated;

-- Create whatsapp_outbox table
CREATE TABLE public.whatsapp_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  api_key_id      UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  recipient_phone TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation outbox" ON public.whatsapp_outbox
  USING (tenant_id = public.get_my_tenant());

GRANT ALL ON TABLE public.whatsapp_outbox TO authenticated;
