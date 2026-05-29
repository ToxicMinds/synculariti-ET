-- Phase 0.5: Add ingredient columns to purchases
-- The FCV Report engine needs per-ingredient purchase granularity.
-- Each purchase row can optionally reference an ingredient_id for
-- food-cost-variance computation.

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS ingredient_id   TEXT,
  ADD COLUMN IF NOT EXISTS ingredient_name TEXT;

CREATE INDEX IF NOT EXISTS idx_purchases_ingredient
  ON public.purchases(tenant_id, ingredient_id);
