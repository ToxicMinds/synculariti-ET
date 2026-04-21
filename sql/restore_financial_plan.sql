-- ============================================================
-- FINANCIAL PLAN DATA RESTORATION
-- Source: FA_229016.pdf (Simplea meeting, April 9, 2026)
-- Household: a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d
-- ============================================================
-- This script restores the income & expense baseline established
-- during the Simplea financial planning session.
--
-- INCOME (net monthly):
--   Nikhil (u1): 4,200 € / month
--   Zuzana (u2): 1,400 € / month
--   Total:        5,600 € / month
--
-- MONTHLY EXPENSE BUDGET (from PDF):
--   Housing:      170 € (Rent 150 + Electricity 20)
--   Groceries:  1,200 €
--   Clothing:     300 €
--   Transport:    280 € (Car 100 + MHD 30 + Fuel 150)
--   Utilities:     65 € (Internet 45 + Phone 20)
--   Leisure:      500 € (Holiday 400 + Sport 100)
--   Health:        10 €
--   Pets:          50 €
--   Savings:      750 € (Financial independence goal)
--   TOTAL:      3,425 €  |  Balance: 2,175 €
-- ============================================================

DO $$
DECLARE
  hid UUID := 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
  base_month TEXT := '2026-04'; -- April 2026 (month of the meeting)
BEGIN

  -- ── STEP 1: UPDATE INCOME IN APP STATE ─────────────────────
  -- This updates the config JSONB to set the correct net monthly income
  UPDATE public.app_state
  SET config = jsonb_set(
    jsonb_set(config, '{income}', '{"u1": 4200, "u2": 1400}'::jsonb),
    '{budgets}', '{
      "Groceries": 1200,
      "Clothing": 300,
      "Transport": 280,
      "Utilities": 65,
      "Health": 10,
      "Entertainment": 500,
      "Pets": 50,
      "Savings": 750,
      "Housing": 170,
      "Kids": 0,
      "Other": 100
    }'::jsonb
  )
  WHERE id = hid;

  -- ── STEP 2: INSERT APRIL 2026 RECURRING MONTHLY EXPENSES ───
  -- Housing
  INSERT INTO public.expenses (id, who, who_id, date, category, cat_id, amount, description, household_id, is_recurring)
  VALUES
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-01', 'Housing',   'c_housing',   150.00, 'Rent',                  hid, true),
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-01', 'Utilities', 'c_utilities',  20.00, 'Electricity',           hid, true),

  -- Groceries & Shopping
    (gen_random_uuid(), 'Zuzana', 'u2', base_month || '-05', 'Groceries', 'c1',         1200.00, 'Monthly groceries',     hid, false),
    (gen_random_uuid(), 'Zuzana', 'u2', base_month || '-10', 'Clothing',  'c2',          300.00, 'Clothing & shoes',      hid, false),

  -- Transport
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-01', 'Transport', 'c3',          150.00, 'Fuel',                  hid, true),
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-01', 'Transport', 'c3',           30.00, 'Public transport (MHD)',hid, true),
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-15', 'Transport', 'c3',          100.00, 'Car service & wash',    hid, false),

  -- Utilities / Communications
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-01', 'Utilities', 'c_utilities',  45.00, 'Internet + Cable TV',   hid, true),
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-01', 'Utilities', 'c_utilities',  20.00, 'Mobile phone',          hid, true),

  -- Leisure / Entertainment
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-20', 'Entertainment', 'c7',      100.00, 'Sport & gym',           hid, false),

  -- Health
    (gen_random_uuid(), 'Zuzana', 'u2', base_month || '-10', 'Health',    'c6',           10.00, 'Medicine',              hid, false),

  -- Pets
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-05', 'Pets',      'c8',           50.00, 'Pets',                  hid, false),

  -- Savings goal
    (gen_random_uuid(), 'Nikhil', 'u1', base_month || '-01', 'Savings',   'c_savings',   750.00, 'Financial independence (monthly)', hid, true)

  ON CONFLICT DO NOTHING;

END $$;

-- ── VERIFICATION ───────────────────────────────────────────────
SELECT category, SUM(amount) as total, COUNT(*) as entries
FROM expenses
WHERE household_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'
  AND date LIKE '2026-04%'
GROUP BY category
ORDER BY total DESC;
