-- Migration: 19_explicit_grants_hardening
-- Purpose: Address Supabase security update (May 30/Oct 30) regarding default public schema grants.
-- See: https://supabase.com/blog/2024/05/13/data-api-default-grants

-- 1. Explicitly grant access to all current tables for authenticated users
GRANT ALL ON TABLE public.tenants TO authenticated;
GRANT ALL ON TABLE public.app_users TO authenticated;
GRANT ALL ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.receipt_items TO authenticated;
GRANT ALL ON TABLE public.locations TO authenticated;
GRANT ALL ON TABLE public.tenant_members TO authenticated;
GRANT ALL ON TABLE public.rate_limits TO authenticated;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoice_items TO authenticated;
GRANT ALL ON TABLE public.inventory_items TO authenticated;
GRANT ALL ON TABLE public.inventory_categories TO authenticated;
GRANT ALL ON TABLE public.inventory_ledger TO authenticated;
GRANT ALL ON TABLE public.purchase_orders TO authenticated;
GRANT ALL ON TABLE public.po_line_items TO authenticated;
GRANT ALL ON TABLE public.activity_log TO authenticated;
GRANT ALL ON TABLE public.system_telemetry TO authenticated;
GRANT ALL ON TABLE public.chart_of_accounts TO authenticated;
GRANT ALL ON TABLE public.outbox_events TO authenticated;

-- 2. Explicitly grant access to graph_sync_queue for service_role (already done by default, but good for defense-in-depth)
GRANT ALL ON TABLE public.graph_sync_queue TO service_role;

-- 3. Explicitly grant execute on all functions to authenticated users
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- 4. Set DEFAULT PRIVILEGES so that future tables and functions are automatically granted
-- This is the critical future-proofing step for new migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- Note: RLS still protects the actual data access. These grants only enable the Data API (PostgREST) 
-- to see and attempt to interact with the objects.
