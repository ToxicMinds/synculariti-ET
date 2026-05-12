-- Migration: 06_bridge_trigger_fix
-- Purpose: Activate the Logistics-to-Finance Outbox consumer.
-- Enforces: Automatic invoice generation when a PO is marked as RECEIVED.

-- 1. THE FINANCE CONSUMER (Outbox Listener)
CREATE OR REPLACE FUNCTION public.consume_procurement_signal()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  IF NEW.event_type = 'PROCUREMENT_RECEIVED' THEN
    -- SAFE CAST: vendor_id
    BEGIN
      v_vendor_id := (NEW.payload->>'vendor_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_vendor_id := NULL; 
    END;

    INSERT INTO public.invoices (tenant_id, location_id, vendor_id, total_amount, currency, status, invoice_number)
    VALUES (
      NEW.tenant_id, 
      NULLIF(NEW.payload->>'location_id', '')::UUID, 
      v_vendor_id, 
      (NEW.payload->>'total_amount')::NUMERIC,
      COALESCE(NEW.payload->>'currency', 'EUR'),
      'PENDING',
      'PO-' || upper(substr(NEW.payload->>'po_id', 1, 8))
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_consume_procurement ON public.outbox_events;
CREATE TRIGGER trg_consume_procurement
AFTER INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION public.consume_procurement_signal();
