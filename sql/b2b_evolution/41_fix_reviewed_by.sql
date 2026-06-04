-- Migration 41: Wire p_user_id param on resolvePurchaseAction call sites
-- The resolve_purchase_quarantine_v1 RPC already has p_user_id UUID DEFAULT NULL.
-- The purchases table already has reviewed_by UUID and reviewed_at TIMESTAMPTZ.
-- This migration is a no-op at the DB level (schema already complete), but documents
-- the client-side contract change: resolvePurchaseAction.ts must pass p_user_id.
--
-- No SQL DDL needed — this is a call-site migration only.
-- See: src/modules/finance/actions/resolvePurchaseAction.ts

SELECT 'resolve_purchase_quarantine_v1 already accepts p_user_id' AS status;
