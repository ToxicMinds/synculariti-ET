-- Service-level API keys: allow tenant_id to be NULL for shared keys
-- Used by external apps (IMS, Login Service) that trigger workflows across tenants
ALTER TABLE public.api_keys ALTER COLUMN tenant_id DROP NOT NULL;
