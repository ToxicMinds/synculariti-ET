-- Copy FCV seed data from @demo-2026 (e3b20277) to demo-2026 (f039714b) user tenant
-- The seed script stored data into handle '@demo-2026' but the user logs into 'demo-2026'
-- These are separate tenant records with different UUIDs.

-- Constants
DO $$
DECLARE
    src_tenant CONSTANT uuid := 'e3b20277-a2c2-4bee-a69d-aa9f945486d3';
    dst_tenant CONSTANT uuid := 'f039714b-8276-4733-8172-58b049bd9163';
BEGIN

-- 1. pos_transaction_staging (5221 rows)
INSERT INTO public.pos_transaction_staging
    (tenant_id, batch_id, location_id, line_number, raw_payload,
     transaction_time, receipt_number, item_sku, item_name,
     quantity, revenue, is_void, is_comp,
     recipe_found, theoretical_grams, anomaly_score, anomaly_reason, flag,
     created_at)
SELECT
    dst_tenant, batch_id, location_id, line_number, raw_payload,
    transaction_time, receipt_number, item_sku, item_name,
    quantity, revenue, is_void, is_comp,
    recipe_found, theoretical_grams, anomaly_score, anomaly_reason, flag,
    created_at
FROM public.pos_transaction_staging
WHERE tenant_id = src_tenant
ON CONFLICT DO NOTHING;

-- 2. purchases (210 rows)
INSERT INTO public.purchases
    (tenant_id, location_id, account_id, vendor_name, invoice_number,
     total_amount, currency, tax_amount, tax_rate,
     receipt_type, receipt_hash, source_image_url,
     purchase_date, created_at, updated_at,
     quarantine_status, reviewed_at, reviewed_by, rejection_reason, rejection_note,
     ingredient_id, ingredient_name)
SELECT
    dst_tenant, location_id, account_id, vendor_name, invoice_number,
    total_amount, currency, tax_amount, tax_rate,
    receipt_type, receipt_hash, source_image_url,
    purchase_date, created_at, updated_at,
    quarantine_status, reviewed_at, reviewed_by, rejection_reason, rejection_note,
    ingredient_id, ingredient_name
FROM public.purchases
WHERE tenant_id = src_tenant
ON CONFLICT DO NOTHING;

-- 3. purchase_anomaly_queue (linked to purchases by purchase_id)
INSERT INTO public.purchase_anomaly_queue
    (tenant_id, location_id, purchase_id, receipt_item_id,
     check_type, severity, anomaly_score, anomaly_detail,
     status, outbox_id, notification_sent_at,
     response_received_at, response_decision, created_at)
SELECT
    dst_tenant, location_id, purchase_id, receipt_item_id,
    check_type, severity, anomaly_score, anomaly_detail,
    status, outbox_id, notification_sent_at,
    response_received_at, response_decision, created_at
FROM public.purchase_anomaly_queue
WHERE tenant_id = src_tenant
ON CONFLICT DO NOTHING;

-- 4. cached_recipes (6 rows)
INSERT INTO public.cached_recipes
    (tenant_id, menu_item_id, menu_item_name, selling_price,
     is_active, ingredients, total_ingredient_cost, food_cost_pct, fetched_at)
SELECT
    dst_tenant, menu_item_id, menu_item_name, selling_price,
    is_active, ingredients, total_ingredient_cost, food_cost_pct, fetched_at
FROM public.cached_recipes
WHERE tenant_id = src_tenant
ON CONFLICT DO NOTHING;

-- 5. cached_ingredients (10 rows)
INSERT INTO public.cached_ingredients
    (tenant_id, ingredient_id, canonical_name, category,
     base_unit, perishability_days, current_stock_grams,
     cost_per_gram, fetched_at)
SELECT
    dst_tenant, ingredient_id, canonical_name, category,
    base_unit, perishability_days, current_stock_grams,
    cost_per_gram, fetched_at
FROM public.cached_ingredients
WHERE tenant_id = src_tenant
ON CONFLICT DO NOTHING;

-- 6. chart_of_accounts (14 rows — merge with existing 9)
INSERT INTO public.chart_of_accounts
    (tenant_id, account_code, account_name, account_type, created_at)
SELECT
    dst_tenant, account_code, account_name, account_type, created_at
FROM public.chart_of_accounts
WHERE tenant_id = src_tenant
ON CONFLICT DO NOTHING;

-- 7. locations (3 rows — merge with existing 1)
INSERT INTO public.locations
    (tenant_id, name, address, metadata, created_at, updated_at)
SELECT
    dst_tenant, name, address, metadata, created_at, updated_at
FROM public.locations
WHERE tenant_id = src_tenant
ON CONFLICT DO NOTHING;

-- 8. Clear stale AI insight cache so new prompt takes effect
UPDATE public.tenants
SET config = config - 'ai_insight'
WHERE id = dst_tenant;

END $$;
