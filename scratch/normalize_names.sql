-- Normalize 'Nik' to 'Nikhil' to fix spending totals
UPDATE expenses 
SET who = 'Nikhil' 
WHERE who = 'Nik' 
AND household_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

-- Verify the change
SELECT who, SUM(amount), COUNT(*) 
FROM expenses 
WHERE household_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d' 
GROUP BY who;
