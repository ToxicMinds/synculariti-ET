-- Migration: 20_harden_v4_rpcs.sql
-- Description: Harden v4 Finance RPCs and other sensitive functions missed by Phase 4.
-- Covers functions created/modified in migrations 11, 12, 14, and 18.

BEGIN;

-- =========================================================
-- 1. save_receipt_v4 (from 18_graph_sync_outbox.sql)
-- =========================================================
ALTER FUNCTION public.save_receipt_v4(JSONB, JSONB, UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.save_receipt_v4(JSONB, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_receipt_v4(JSONB, JSONB, UUID) TO authenticated, service_role;

-- =========================================================
-- 2. add_transactions_bulk_v1 (from 18_graph_sync_outbox.sql)
-- =========================================================
ALTER FUNCTION public.add_transactions_bulk_v1(JSONB[]) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.add_transactions_bulk_v1(JSONB[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_transactions_bulk_v1(JSONB[]) TO authenticated, service_role;

-- =========================================================
-- 3. update_tenant_config_v1 (from 11_phase2_dml_rpcs.sql)
-- =========================================================
ALTER FUNCTION public.update_tenant_config_v1(JSONB) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.update_tenant_config_v1(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_config_v1(JSONB) TO authenticated, service_role;

-- =========================================================
-- 4. is_tenant_management_privileged (from 12_tenant_members.sql)
-- =========================================================
ALTER FUNCTION public.is_tenant_management_privileged(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.is_tenant_management_privileged(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_management_privileged(UUID) TO authenticated, service_role;

COMMIT;
