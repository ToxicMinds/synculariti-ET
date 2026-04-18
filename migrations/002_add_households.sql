-- 1. Create the overarching households table
CREATE TABLE IF NOT EXISTS households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Insert the primary legacy household with a fixed deterministic UUID so the Vanilla JS client instantly maps to it.
INSERT INTO households (id, name) VALUES ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Shanbag Household') ON CONFLICT (id) DO NOTHING;

-- 3. Prepare expenses and invoices for multi-tenant data slicing
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id);

-- 4. Automatically retroactively assign all legacy records safely
UPDATE expenses SET household_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d' WHERE household_id IS NULL;
UPDATE invoices SET household_id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d' WHERE household_id IS NULL;

-- 5. Lock down the tables to prevent future data bleeding
ALTER TABLE expenses ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN household_id SET NOT NULL;

-- 6. Re-map the legacy global "app_state" configuration block to properly track against the specific Household ID
-- NOTE: If run multiple times, 'global' will no longer exist, making this safely idempotent.
UPDATE app_state SET id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d' WHERE id = 'global';

-- 7. Ensure API instantly reflects this newly added column across the REST layer
NOTIFY pgrst, 'reload schema';
