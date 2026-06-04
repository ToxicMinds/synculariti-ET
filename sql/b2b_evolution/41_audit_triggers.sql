-- ========================================================
-- MIGRATION: 41_audit_triggers.sql
-- PURPOSE: Fix resolve_purchase_quarantine_v1 and add direct DML triggers
-- ========================================================

BEGIN;

-- 1. Update event_log.action check constraint to include 'inventory_adjustment.logged'
ALTER TABLE public.event_log
  DROP CONSTRAINT IF EXISTS valid_event_action;

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
      'tenant_config.updated', 'tenant.switched', 'pin.verified',
      'inventory_adjustment.logged'
    )
  );

-- 2. Redefine resolve_purchase_quarantine_v1 with p_user_id DEFAULT NULL
-- and fix resolved_at to response_received_at on purchase_anomaly_queue
CREATE OR REPLACE FUNCTION public.resolve_purchase_quarantine_v1(
  p_purchase_id UUID,
  p_status TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Validate status
  IF p_status NOT IN ('RELEASED', 'REJECTED') THEN
    RETURN QUERY SELECT FALSE AS success, format('Invalid status: %s', p_status) AS message;
    RETURN;
  END IF;

  -- Update purchase
  UPDATE public.purchases
  SET quarantine_status = p_status,
      updated_at = NOW(),
      reviewed_at = NOW(),
      reviewed_by = p_user_id
  WHERE id = p_purchase_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE AS success, 'Purchase not found' AS message;
    RETURN;
  END IF;

  -- Bulk resolve all anomaly queue rows for this purchase
  UPDATE public.purchase_anomaly_queue
  SET status = 'RESOLVED',
      response_received_at = NOW(),
      response_decision = p_status
  WHERE purchase_id = p_purchase_id AND status = 'OPEN';

  RETURN QUERY SELECT TRUE AS success, format('Purchase %s resolved to %s', p_purchase_id, p_status) AS message;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_purchase_quarantine_v1(UUID, TEXT, UUID) FROM anon, public;

-- Also drop any old two-parameter function if it exists to clean up
DROP FUNCTION IF EXISTS public.resolve_purchase_quarantine_v1(UUID, TEXT);


-- 3. Triggers for public.transactions (insert / delete)
CREATE OR REPLACE FUNCTION public.trg_fn_audit_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT;
  v_entity_id TEXT;
  v_tenant_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'transaction.created';
    v_entity_id := NEW.id::text;
    v_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'transaction.deleted';
    v_entity_id := OLD.id::text;
    v_tenant_id := OLD.tenant_id;
  END IF;

  -- Perform direct record_event call bypassing client RLS
  INSERT INTO public.event_log (
    tenant_id,
    action,
    who_id,
    who_type,
    entity_type,
    entity_id,
    description,
    source
  ) VALUES (
    v_tenant_id,
    v_action,
    NULL,
    'system',
    'transaction',
    v_entity_id,
    'Direct DML ' || lower(TG_OP) || ' on transaction',
    'database'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS trg_audit_transactions ON public.transactions;
CREATE TRIGGER trg_audit_transactions
  AFTER INSERT OR DELETE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_audit_transactions();


-- 4. Triggers for public.inventory_ledger (insert only)
CREATE OR REPLACE FUNCTION public.trg_fn_audit_inventory_ledger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.event_log (
    tenant_id,
    action,
    who_id,
    who_type,
    entity_type,
    entity_id,
    description,
    source
  ) VALUES (
    NEW.tenant_id,
    'inventory_adjustment.logged',
    NULL,
    'system',
    'inventory_ledger',
    NEW.id::text,
    'Direct DML insert on inventory ledger',
    'database'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS trg_audit_inventory_ledger ON public.inventory_ledger;
CREATE TRIGGER trg_audit_inventory_ledger
  AFTER INSERT ON public.inventory_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_audit_inventory_ledger();

COMMIT;
