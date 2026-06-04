-- ========================================================
-- MIGRATION: 40_event_log.sql
-- PURPOSE: Create immutable event audit trail
-- ========================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  who_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  who_type TEXT NOT NULL CHECK (who_type IN ('user', 'service', 'api_key', 'system')),
  entity_type TEXT,
  entity_id TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Validate action constraint
ALTER TABLE public.event_log
ADD CONSTRAINT valid_event_action CHECK (
  action IN (
    'transaction.created', 'transaction.updated', 'transaction.deleted',
    'receipt.scanned', 'invoice.parsed', 'expense.created',
    'category.created', 'purchase_order.received', 'purchase_order.cancelled',
    'inventory_item.created', 'purchase_quarantine.released', 'purchase_quarantine.rejected',
    'purchase_quarantine.auto_released', 'ingestion.failed',
    'graph_sync.completed', 'graph_sync.backfilled', 'fcv.enriched',
    'whatsapp.notification.sent', 'whatsapp.delivered', 'whatsapp.delivery_failed',
    'whatsapp.response.received', 'whatsapp.decision.completed',
    'workflow.triggered', 'workflow.skipped',
    'tenant.data_exported', 'bank_sync.session_started',
    'anomaly.detected',
    'tenant_config.updated', 'tenant.switched', 'pin.verified'
  )
);

-- 3. Indexes for EventFeed and Entity timelines
CREATE INDEX IF NOT EXISTS idx_event_log_tenant_date ON public.event_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_entity ON public.event_log(tenant_id, entity_type, entity_id);

-- 4. RLS Policy (Read-Only for authenticated users)
ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_log FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant's events"
  ON public.event_log
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant());

-- Revoke all DML from public and anon
REVOKE INSERT, UPDATE, DELETE ON public.event_log FROM anon, public, authenticated;

-- 5. The SECURITY DEFINER RPC
CREATE OR REPLACE FUNCTION public.record_event_v1(
  p_action TEXT,
  p_who_type TEXT DEFAULT 'user',
  p_who_id UUID DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_source TEXT DEFAULT 'client',
  p_tenant_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
  v_inserted_id UUID;
BEGIN
  -- If server didn't explicitly pass tenant_id, derive from session
  IF p_tenant_id IS NULL THEN
    v_tenant_id := public.get_my_tenant();
  ELSE
    v_tenant_id := p_tenant_id;
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'event_log: No tenant_id resolved';
  END IF;

  INSERT INTO public.event_log (
    tenant_id, action, who_id, who_type, entity_type, entity_id, description, metadata, source
  ) VALUES (
    v_tenant_id, 
    p_action, 
    p_who_id, 
    p_who_type, 
    p_entity_type, 
    p_entity_id, 
    p_description, 
    COALESCE(p_metadata, '{}'::jsonb), 
    p_source
  ) RETURNING id INTO v_inserted_id;

  RETURN v_inserted_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Revoke execute from anon to prevent unauthorized direct logging
REVOKE EXECUTE ON FUNCTION public.record_event_v1 FROM anon;
