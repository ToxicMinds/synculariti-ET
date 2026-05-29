-- ==========================================
-- Phase 2: Recipe Cache Tables
-- Batch Ingestion & Food Cost Variance Pipeline
-- ==========================================
BEGIN;

-- ==========================================
-- 1. CACHED RECIPES
-- Populated from IMS API, 24h TTL
-- ==========================================
CREATE TABLE IF NOT EXISTS public.cached_recipes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    menu_item_id          TEXT NOT NULL,
    menu_item_name        TEXT NOT NULL,
    selling_price         NUMERIC,
    is_active             BOOLEAN DEFAULT true,
    ingredients           JSONB NOT NULL,
    total_ingredient_cost NUMERIC,
    food_cost_pct         NUMERIC,
    fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, menu_item_id)
);

ALTER TABLE public.cached_recipes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cached_recipes_lookup
    ON public.cached_recipes(tenant_id, menu_item_id);

-- ==========================================
-- 2. CACHED INGREDIENTS
-- Populated from IMS API, 24h TTL
-- ==========================================
CREATE TABLE IF NOT EXISTS public.cached_ingredients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    ingredient_id       TEXT NOT NULL,
    canonical_name      TEXT NOT NULL,
    category            TEXT,
    base_unit           TEXT,
    perishability_days  INTEGER,
    current_stock_grams NUMERIC,
    cost_per_gram       NUMERIC,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, ingredient_id)
);

ALTER TABLE public.cached_ingredients ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cached_ingredients_lookup
    ON public.cached_ingredients(tenant_id, ingredient_id);

-- ==========================================
-- 3. GRANT PERMISSIONS
-- ==========================================
GRANT ALL ON TABLE public.cached_recipes TO authenticated;
GRANT ALL ON TABLE public.cached_recipes TO service_role;

GRANT ALL ON TABLE public.cached_ingredients TO authenticated;
GRANT ALL ON TABLE public.cached_ingredients TO service_role;

COMMIT;
