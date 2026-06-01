-- Fix: replace CTE-COUNT pattern with GET DIAGNOSTICS ROW_COUNT
-- Previous version overwrote v_released_purchases per tenant instead of accumulating
CREATE OR REPLACE FUNCTION public.release_expired_quarantines_v1()
RETURNS TABLE(released_purchases BIGINT, released_pending BIGINT, errors TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_released_purchases BIGINT := 0;
  v_released_pending BIGINT := 0;
  v_count BIGINT;
  v_errors TEXT[] := '{}';
  v_tenant RECORD;
BEGIN
  FOR v_tenant IN
    SELECT DISTINCT p.tenant_id
    FROM public.purchases p
    WHERE p.quarantine_status IN ('PENDING', 'REJECTED')
      AND p.created_at < NOW() - INTERVAL '30 days'
  LOOP
    BEGIN
      UPDATE public.purchases
      SET quarantine_status = 'RELEASED',
          updated_at = NOW(),
          released_at = NOW()
      WHERE tenant_id = v_tenant.tenant_id
        AND quarantine_status IN ('PENDING', 'REJECTED')
        AND created_at < NOW() - INTERVAL '30 days';
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_released_purchases := v_released_purchases + v_count;

      UPDATE public.purchase_anomaly_queue
      SET status = 'RESOLVED',
          resolved_at = NOW()
      WHERE tenant_id = v_tenant.tenant_id
        AND status = 'OPEN'
        AND created_at < NOW() - INTERVAL '30 days';
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_released_pending := v_released_pending + v_count;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || format('Tenant %s: %s', v_tenant.tenant_id, SQLERRM);
    END;
  END LOOP;
  RETURN QUERY SELECT v_released_purchases, v_released_pending, v_errors;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_expired_quarantines_v1() FROM anon, public;
