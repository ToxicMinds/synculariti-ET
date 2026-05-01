-- ==========================================
-- DATA CLEANUP: ORPHANED RECEIPT ITEMS
-- ==========================================

-- 1. Delete all receipt items from today (May 1st, 2026)
-- Use this if your recent scans created junk data.
DELETE FROM public.receipt_items 
WHERE created_at >= '2026-05-01'::date;

-- 2. Delete expenses that were created with the 'household_id' as the 'who_id' 
-- This was the bug where the person who paid was not recognized.
DELETE FROM public.expenses 
WHERE who_id = household_id::text;

-- 3. Safety Check: Find any items that don't have a valid parent
DELETE FROM public.receipt_items 
WHERE expense_id NOT IN (SELECT id FROM public.expenses);
