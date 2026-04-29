-- ============================================================
-- Explicit v1 who_id Backfill Migration
-- Purpose: Automatically populate who_id for legacy expenses 
--          by explicitly targeting known legacy strings
-- ============================================================

-- Fix Nikhil's who_id to always be u1 for his household
UPDATE expenses 
SET who_id = 'u1' 
WHERE who = 'Nikhil' AND household_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

-- Fix Zuzana's who_id to always be u2 for her household
UPDATE expenses 
SET who_id = 'u2' 
WHERE who = 'Zuzana' AND household_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

-- Fix the TOM's who_id to always be u1 for his household
UPDATE expenses 
SET who_id = 'u1' 
WHERE who = 'the TOM' AND household_id = '9b536bb3-3aac-4254-8f7a-0a4bbad0ccc8';

-- Fix Tatata's who_id to always be u1 for his household
UPDATE expenses 
SET who_id = 'u1' 
WHERE who = 'Tatata' AND household_id = '245fd178-a103-4c09-8244-d05f01c42811';

