-- ============================================================
-- v1 who_id Backfill Migration
-- Purpose: Populate who_id on legacy expenses that only have
--          a `who` name string, matching names to app_state config.
-- Safe: Read-only lookup, only updates rows where who_id IS NULL
-- Run in: Supabase SQL Editor (or psql)
-- ============================================================

-- Step 1: Preview which expenses will be affected
-- Run this SELECT first to verify before doing the UPDATE
SELECT 
  e.id,
  e.who,
  e.who_id,
  e.household_id,
  e.date,
  e.amount
FROM expenses e
WHERE e.who_id IS NULL 
  AND e.who IS NOT NULL
  AND e.is_deleted = false
ORDER BY e.date DESC
LIMIT 50;

-- Step 2: Inspect your app_state config to find name->id mapping
-- This shows you the names object from each household
SELECT 
  id as household_id,
  config->'names' as names_map
FROM app_state;

-- Step 3: Manual backfill — replace the name->id pairs below with YOUR actual data
-- Example: Nikhil -> u1, Zuzana -> u2 (check Step 2 output first!)
-- Replace 'Nikhil' and 'u1' etc. with your actual names and IDs

UPDATE expenses
SET who_id = CASE
  WHEN who ILIKE 'Nikhil'  THEN 'u1'
  WHEN who ILIKE 'Zuzana'  THEN 'u2'
  WHEN who ILIKE 'Tom'     THEN 'u3'
  WHEN who ILIKE 'Jur'     THEN 'u4'
  ELSE who_id  -- leave unchanged if no match
END
WHERE who_id IS NULL
  AND who IS NOT NULL
  AND is_deleted = false;

-- Step 4: Verify the fix — should return 0 rows with who_id IS NULL
SELECT COUNT(*) as unmatched_count
FROM expenses
WHERE who_id IS NULL 
  AND who IS NOT NULL
  AND is_deleted = false;
