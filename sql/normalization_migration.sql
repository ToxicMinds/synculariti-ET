-- 1. Add stable ID columns to expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS who_id TEXT;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS cat_id TEXT;

-- 2. Add stable ID columns to recurring_expenses
ALTER TABLE public.recurring_expenses ADD COLUMN IF NOT EXISTS who_id TEXT;
ALTER TABLE public.recurring_expenses ADD COLUMN IF NOT EXISTS cat_id TEXT;

-- 3. Migrate User data to stable IDs (who -> who_id)
-- We map based on the current known names in the household
UPDATE public.expenses SET who_id = 'u1' WHERE who IN ('Nik', 'Nikhil');
UPDATE public.expenses SET who_id = 'u2' WHERE who = 'Zuzana';

-- 4. Migrate Category data to stable IDs (category -> cat_id)
-- This ensures that if a category is renamed in settings, the data follows.
UPDATE public.expenses SET cat_id = 'c1' WHERE category = 'Groceries';
UPDATE public.expenses SET cat_id = 'c2' WHERE category = 'Clothing';
UPDATE public.expenses SET cat_id = 'c3' WHERE category = 'Transport';
UPDATE public.expenses SET cat_id = 'c4' WHERE category = 'Utilities';
UPDATE public.expenses SET cat_id = 'c5' WHERE category = 'Dining out';
UPDATE public.expenses SET cat_id = 'c6' WHERE category = 'Health';
UPDATE public.expenses SET cat_id = 'c7' WHERE category = 'Entertainment';
UPDATE public.expenses SET cat_id = 'c8' WHERE category = 'Pets';
UPDATE public.expenses SET cat_id = 'c9' WHERE category = 'Kids';
UPDATE public.expenses SET cat_id = 'c10' WHERE category = 'Other';

-- Fallback for any missed categories (custom ones)
UPDATE public.expenses SET cat_id = 'c_custom_' || category WHERE cat_id IS NULL;

-- 5. Repeat for recurring_expenses
UPDATE public.recurring_expenses SET who_id = 'u1' WHERE who IN ('Nik', 'Nikhil');
UPDATE public.recurring_expenses SET who_id = 'u2' WHERE who = 'Zuzana';
UPDATE public.recurring_expenses SET cat_id = 'c_custom_' || category WHERE cat_id IS NULL;

-- 6. Verification
SELECT who_id, who, cat_id, category, COUNT(*) FROM expenses GROUP BY who_id, who, cat_id, category LIMIT 20;
