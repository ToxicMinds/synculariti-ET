-- Migration: 16_function_hardening.sql
-- Description: Enterprise-grade security hardening for all RPCs.
-- 1. Sets schema-level default privileges to prevent public execution of new functions.
-- 2. Hardens existing functions with SET search_path = public.
-- 3. Revokes EXECUTE from PUBLIC/anon and grants back only to authenticated/service_role.
-- 4. Drops deprecated insecure assets.

BEGIN;

-- 1. SECURE SCHEMA BASELINE
-- Prevents future "CREATE OR REPLACE" from defaulting to PUBLIC execution
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- 2. HARDENING PATTERN: Financial Mutations
ALTER FUNCTION public.add_transaction_v3(JSONB) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.add_transaction_v3(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_transaction_v3(JSONB) TO authenticated, service_role;

ALTER FUNCTION public.update_transaction_v1(UUID, JSONB) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.update_transaction_v1(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_transaction_v1(UUID, JSONB) TO authenticated, service_role;

ALTER FUNCTION public.soft_delete_transaction_v1(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.soft_delete_transaction_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_transaction_v1(UUID) TO authenticated, service_role;

-- 3. HARDENING PATTERN: Logistics
ALTER FUNCTION public.receive_purchase_order_v1(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.receive_purchase_order_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_v1(UUID) TO authenticated, service_role;

ALTER FUNCTION public.create_inventory_item_v1(JSONB) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.create_inventory_item_v1(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_item_v1(JSONB) TO authenticated, service_role;

-- 4. HARDENING PATTERN: Identity & Access
ALTER FUNCTION public.get_my_tenant() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_my_tenant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant() TO authenticated, service_role;

ALTER FUNCTION public.get_tenant_bundle() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_tenant_bundle() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_bundle() TO authenticated, service_role;

ALTER FUNCTION public.get_my_available_tenants() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_my_available_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_available_tenants() TO authenticated, service_role;

ALTER FUNCTION public.switch_tenant(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.switch_tenant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_tenant(UUID) TO authenticated, service_role;

ALTER FUNCTION public.verify_tenant_access(TEXT) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.verify_tenant_access(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_tenant_access(TEXT) TO authenticated, service_role;

ALTER FUNCTION public.verify_tenant_membership(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.verify_tenant_membership(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_tenant_membership(UUID) TO authenticated, service_role;

ALTER FUNCTION public.create_organization(TEXT, TEXT) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT) TO authenticated, service_role;

ALTER FUNCTION public.create_organization(TEXT, TEXT, TEXT) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, TEXT) TO authenticated, service_role;

ALTER FUNCTION public.upsert_app_user_v1(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.upsert_app_user_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_app_user_v1(UUID) TO authenticated, service_role;

-- 5. HARDENING PATTERN: System & Hooks
ALTER FUNCTION public.notify_outbox_event() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.notify_outbox_event() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_outbox_event() TO authenticated, service_role;

ALTER FUNCTION public.auto_invoice_outbox_signal() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.auto_invoice_outbox_signal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_invoice_outbox_signal() TO authenticated, service_role;

ALTER FUNCTION public.audit_expense_mutation() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.audit_expense_mutation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_expense_mutation() TO authenticated, service_role;

ALTER FUNCTION public.log_expense_activity() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.log_expense_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_expense_activity() TO authenticated, service_role;

ALTER FUNCTION public.signal_procurement_to_finance() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.signal_procurement_to_finance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.signal_procurement_to_finance() TO authenticated, service_role;

ALTER FUNCTION public.consume_procurement_signal() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.consume_procurement_signal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_procurement_signal() TO authenticated, service_role;

ALTER FUNCTION public.rls_auto_enable() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO authenticated, service_role;

ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated, service_role;

ALTER FUNCTION public.update_modified_column() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.update_modified_column() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_modified_column() TO authenticated, service_role;

-- 6. LEGACY & OVERLOADS
ALTER FUNCTION public.save_receipt_v3(JSONB) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.save_receipt_v3(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_receipt_v3(JSONB) TO authenticated, service_role;

ALTER FUNCTION public.save_receipt_v3(JSONB, JSONB) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.save_receipt_v3(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_receipt_v3(JSONB, JSONB) TO authenticated, service_role;

ALTER FUNCTION public.save_receipt_v3(JSONB, JSONB, UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.save_receipt_v3(JSONB, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_receipt_v3(JSONB, JSONB, UUID) TO authenticated, service_role;

-- 7. CLEANUP
-- Drop deprecated and insecure assets
DROP FUNCTION IF EXISTS public.save_receipt_v2(JSONB, JSONB);

COMMIT;
