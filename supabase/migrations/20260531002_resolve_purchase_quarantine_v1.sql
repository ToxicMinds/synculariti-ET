-- Fix check constraints to accept RELEASED / RESOLVED values
-- Also implements the resolve_purchase_quarantine_v1 RPC

-- 1. Fix purchases.quarantine_status check constraint
ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_quarantine_status_check;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_quarantine_status_check
  CHECK (quarantine_status IN ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_RELEASED', 'RELEASED'));

-- 2. Fix purchase_anomaly_queue.status check constraint
ALTER TABLE public.purchase_anomaly_queue
  DROP CONSTRAINT IF EXISTS purchase_anomaly_queue_status_check;

ALTER TABLE public.purchase_anomaly_queue
  ADD CONSTRAINT purchase_anomaly_queue_status_check
  CHECK (status IN ('OPEN', 'DISMISSED', 'ESCALATED', 'RESOLVED'));

-- 3. Resolve purchase quarantine RPC
CREATE OR REPLACE FUNCTION public.resolve_purchase_quarantine_v1(
  p_purchase_id UUID,
  p_status TEXT
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
      reviewed_at = NOW()
  WHERE id = p_purchase_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE AS success, 'Purchase not found' AS message;
    RETURN;
  END IF;

  -- Bulk resolve all anomaly queue rows for this purchase
  UPDATE public.purchase_anomaly_queue
  SET status = 'RESOLVED',
      resolved_at = NOW()
  WHERE purchase_id = p_purchase_id AND status = 'OPEN';

  RETURN QUERY SELECT TRUE AS success, format('Purchase %s resolved to %s', p_purchase_id, p_status) AS message;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_purchase_quarantine_v1(UUID, TEXT) FROM anon, public;
