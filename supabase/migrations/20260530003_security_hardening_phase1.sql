-- Phase 1 Security Hardening
-- 1. Test-support RPCs for verifying anon privilege state
-- 2. Fix enqueue_graph_sync_internal (missing SECURITY DEFINER)
-- 3. Revoke excessive anon privileges on 6 tables
-- 4. Fix ALTER DEFAULT PRIVILEGES for anon
-- See AGENTS.md §8 for full audit context

-- ===== 1. Test-Support RPCs =====

-- Returns privilege state for a given table by role
CREATE OR REPLACE FUNCTION public.get_table_privilege_state_v1(
  p_table_name text
)
RETURNS TABLE(
  anon_has_select boolean,
  anon_has_insert boolean,
  anon_has_update boolean,
  anon_has_delete boolean,
  anon_has_references boolean,
  anon_has_trigger boolean,
  rls_enabled boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    has_table_privilege('anon', p_table_name, 'SELECT'),
    has_table_privilege('anon', p_table_name, 'INSERT'),
    has_table_privilege('anon', p_table_name, 'UPDATE'),
    has_table_privilege('anon', p_table_name, 'DELETE'),
    has_table_privilege('anon', p_table_name, 'REFERENCES'),
    has_table_privilege('anon', p_table_name, 'TRIGGER'),
    (SELECT relrowsecurity FROM pg_class WHERE oid = p_table_name::regclass);
END;
$$;

ALTER FUNCTION public.get_table_privilege_state_v1(text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.get_table_privilege_state_v1(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_table_privilege_state_v1(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_table_privilege_state_v1(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_table_privilege_state_v1(text) TO service_role;

-- Returns whether ALTER DEFAULT PRIVILEGES grants INSERT to anon for future tables
CREATE OR REPLACE FUNCTION public.check_default_privileges_v1()
RETURNS TABLE(anon_default_insert boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT COALESCE(bool_or(
    defaclacl::text LIKE '%anon%' AND defaclacl::text LIKE '%INSERT%'
  ), false)
  FROM pg_default_acl
  WHERE defaclnamespace = 'public'::regnamespace
    AND defaclobjtype = 'r';
END;
$$;

ALTER FUNCTION public.check_default_privileges_v1() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.check_default_privileges_v1() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_default_privileges_v1() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_default_privileges_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_default_privileges_v1() TO service_role;

-- ===== 2. Fix enqueue_graph_sync_internal =====
-- This function is called by 4 SECURITY DEFINER RPCs (add_transaction_v3,
-- add_transactions_bulk_v1, soft_delete_transaction_v1, update_transaction_v1).
-- Without its own SECURITY DEFINER, it inherits the caller's permissions,
-- creating a "security sandwich" vulnerability where the DEFINER caller
-- elevates privileges and then drops into INVOKER context for the INSERT.

CREATE OR REPLACE FUNCTION public.enqueue_graph_sync_internal(
  p_tenant_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_operation text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.graph_sync_queue (tenant_id, entity_type, entity_id, operation, payload)
  VALUES (p_tenant_id, p_entity_type, p_entity_id, p_operation, p_payload);
END;
$$;

ALTER FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) TO service_role;

-- ===== 3. Revoke Excessive Anon Privileges =====
-- GRANT ALL to anon on these tables is overly permissive. RLS mitigates
-- INSERT/UPDATE/DELETE, but REFERENCES and TRIGGER bypass RLS.
-- We revoke ALL and grant only the minimum required privilege.

-- api_keys: zero anon access (contains secrets)
REVOKE ALL ON TABLE public.api_keys FROM anon;

-- current_inventory: read-only for public stock view
REVOKE ALL ON TABLE public.current_inventory FROM anon;
GRANT SELECT ON TABLE public.current_inventory TO anon;

-- graph_sync_queue: internal queue, zero anon access
REVOKE ALL ON TABLE public.graph_sync_queue FROM anon;

-- rate_limits: read-only for rate limit checks
REVOKE ALL ON TABLE public.rate_limits FROM anon;
GRANT SELECT ON TABLE public.rate_limits TO anon;

-- whatsapp_inbox: needs SELECT+INSERT for webhook inbound
REVOKE ALL ON TABLE public.whatsapp_inbox FROM anon;
GRANT SELECT, INSERT ON TABLE public.whatsapp_inbox TO anon;

-- whatsapp_outbox: internal queue, zero anon access
REVOKE ALL ON TABLE public.whatsapp_outbox FROM anon;

-- ===== 4. Fix ALTER DEFAULT PRIVILEGES =====
-- Current: GRANT ALL ON TABLES TO anon for future tables
-- Fixed: Remove default, then grant SELECT only
-- This prevents future migrations from auto-granting ALL to anon on new tables.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- Also fix sequences: USAGE is sufficient for nextval()
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE ON SEQUENCES TO anon;
