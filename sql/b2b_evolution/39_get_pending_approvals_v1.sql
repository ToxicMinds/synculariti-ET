-- ==========================================
-- Migration 39: Per-user pending approvals RPC
-- Returns only the current user's PENDING/SENT
-- outbox records, filtered by auth email.
-- SECURITY DEFINER to bypass RLS tenant scope,
-- with explicit email match against recipient_email.
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_pending_approvals_v1()
RETURNS TABLE (
  id UUID,
  payload JSONB,
  recipient_phone TEXT,
  recipient_email TEXT,
  tenant_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT wo.id, wo.payload, wo.recipient_phone, wo.recipient_email,
         wo.tenant_id, wo.status, wo.created_at
  FROM public.whatsapp_outbox wo
  WHERE wo.tenant_id = public.get_my_tenant()
    AND wo.recipient_email = auth.jwt()->>'email'
    AND wo.status IN ('PENDING', 'SENT')
  ORDER BY wo.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_approvals_v1 FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_approvals_v1 TO authenticated;
