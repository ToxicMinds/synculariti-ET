-- Migration: 24_db_security_lockdown.sql
-- Purpose: Complete the public schema security hardening by revoking public permissions 
-- on transactions bulk saving & casting helpers, and cleaning up legacy unhardened functions.

-- 1. Complete public role revocation for Batch 1 target functions
REVOKE EXECUTE ON FUNCTION public.add_transactions_bulk_v1(jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.safe_cast_uuid(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.safe_cast_user_uuid(text) FROM public;

-- Explicitly re-grant execution permissions to verified secure application roles
GRANT EXECUTE ON FUNCTION public.add_transactions_bulk_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_transactions_bulk_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.safe_cast_uuid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_cast_uuid(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.safe_cast_user_uuid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_cast_user_uuid(text) TO service_role;

-- 2. Drop legacy unhardened landmine functions in public schema
DROP FUNCTION IF EXISTS public.verify_tenant_membership(uuid);
DROP FUNCTION IF EXISTS public.create_organization(text, text, text);
