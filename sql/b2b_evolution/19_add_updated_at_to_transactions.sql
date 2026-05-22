-- Migration: 19_add_updated_at_to_transactions
-- Purpose: Fixes 42703 undefined_column in update_transaction_v1
-- Enforces: ACID audit trailing on ledger edits.

BEGIN;

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows safely
UPDATE public.transactions
SET updated_at = created_at
WHERE updated_at IS NULL;

COMMIT;
