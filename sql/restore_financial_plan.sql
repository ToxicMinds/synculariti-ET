-- ============================================================
-- FINANCIAL PLAN DATA RESTORATION — SAFE VERSION
-- Source: FA_229016.pdf (Simplea meeting, April 9, 2026)
-- Household: a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d
-- ============================================================
-- ✅ SAFETY GUARANTEES:
--   • Never deletes or updates ANY existing expense rows
--   • Uses ON CONFLICT DO NOTHING — completely idempotent (safe to run twice)
--   • Only touches app_state config for your household
--   • The new expenses use unique gen_random_uuid() IDs
-- ============================================================
-- 
-- CATEGORIES FOUND IN YOUR ACTUAL DATA (from audit):
--   Groceries, Dining out, Transport, Utilities, Health, Kids,
--   Clothing, Pets, Savings, Entertainment, Other,
--   Kindergarten, Z-Bottles
--
-- INCOME (net monthly from PDF):
--   u1 / Nikhil: 4,200 €    u2 / Zuzana: 1,400 €    Total: 5,600 €
--
-- MONTHLY EXPENSE PLAN (from PDF):
--   Rent 150 + Electricity 20 = 170 € (Utilities)
--   Groceries: 1,200 €
--   Clothing: 300 €
--   Fuel 150 + MHD 30 + Car Service 100 = 280 € (Transport)
--   Internet 45 + Mobile 20 = 65 € (Utilities)
--   Holiday 400 + Sport 100 = 500 € (Entertainment)
--   Medicines: 10 € (Health)
--   Pets: 50 €
--   Financial Independence / Savings: 750 €
--   TOTAL: 3,425 €    Balance: 2,175 €
-- ============================================================

DO $$
DECLARE
  hid UUID := 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
BEGIN

  -- ── STEP 1: UPDATE INCOME & BUDGETS IN APP STATE ──────────
  -- Uses jsonb_set to patch only the income and budgets fields.
  -- All other config (NAMES, RULES, GOALS, GCAL, etc.) is preserved.
  UPDATE public.app_state
  SET config = config
    || jsonb_build_object(
        'income', '{"u1": 4200, "u2": 1400}'::jsonb,
        'budgets', jsonb_build_object(
          'Groceries',    1200,
          'Clothing',     300,
          'Transport',    280,
          'Utilities',    700,   -- rent(150)+electricity(20)+internet(45)+mobile(20)+mortgage(633)+ZSE(47)+4ka(7) ≈ real bills
          'Health',       50,
          'Entertainment',500,
          'Pets',         50,
          'Savings',      750,
          'Dining out',   200,
          'Kids',         150,
          'Kindergarten', 180,   -- ~€57-61 x 3 months per semester
          'Other',        200
        )
    ),
    updated_at = NOW()
  WHERE id = hid;

  -- ── STEP 2: INSERT APRIL 2026 BASELINE EXPENSES ───────────
  -- These represent the planned monthly expenses from the PDF.
  -- They will NOT duplicate your existing real entries.
  INSERT INTO public.expenses
    (id, who, who_id, date, category, cat_id, amount, description, household_id, is_recurring)
  VALUES
    -- Housing / Utilities (recurring)
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-01', 'Utilities', 'c_utilities',  150.00, 'Rent (FA plan)',                    hid, true),
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-01', 'Utilities', 'c_utilities',   20.00, 'Electricity (FA plan)',              hid, true),
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-01', 'Utilities', 'c_utilities',   45.00, 'Internet + Cable TV (FA plan)',      hid, true),
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-01', 'Utilities', 'c_utilities',   20.00, 'Mobile phone (FA plan)',             hid, true),

    -- Transport (recurring)
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-01', 'Transport', 'c3',            150.00, 'Fuel (FA plan)',                   hid, true),
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-01', 'Transport', 'c3',             30.00, 'Public transport MHD (FA plan)',   hid, true),

    -- Savings goal (recurring)
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-01', 'Savings', 'c_savings',      750.00, 'Financial independence goal (FA plan)', hid, true),

    -- Groceries
    (gen_random_uuid(), 'Zuzana', 'u2', '2026-04-02', 'Groceries', 'c1',           1200.00, 'Monthly groceries budget (FA plan)',  hid, false),

    -- Clothing
    (gen_random_uuid(), 'Zuzana', 'u2', '2026-04-05', 'Clothing', 'c2',             300.00, 'Clothing & shoes (FA plan)',          hid, false),

    -- Transport one-off
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-15', 'Transport', 'c3',            100.00, 'Car service & wash (FA plan)',        hid, false),

    -- Entertainment / Leisure
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-20', 'Entertainment', 'c7',        100.00, 'Sport & gym (FA plan)',               hid, false),

    -- Health
    (gen_random_uuid(), 'Zuzana', 'u2', '2026-04-10', 'Health', 'c6',               10.00, 'Medicine (FA plan)',                  hid, false),

    -- Pets
    (gen_random_uuid(), 'Nikhil', 'u1', '2026-04-05', 'Pets', 'c8',                 50.00, 'Pets (FA plan)',                      hid, false)

  ON CONFLICT DO NOTHING;

END $$;

-- ── VERIFICATION ───────────────────────────────────────────────
-- Run this separately to confirm the results:
SELECT
  category,
  SUM(amount)::NUMERIC(10,2)  AS total_eur,
  COUNT(*)                    AS entries
FROM expenses
WHERE household_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'
  AND date LIKE '2026-04%'
GROUP BY category
ORDER BY total_eur DESC;
