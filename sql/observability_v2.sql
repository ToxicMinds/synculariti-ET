-- Synculariti Observability Migration
-- Separates Technical Telemetry from User Activity

-- 1. System Telemetry (The "Black Box" for failures)
CREATE TABLE IF NOT EXISTS system_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    level TEXT NOT NULL, -- 'ERROR', 'WARN', 'INFO', 'PERF'
    component TEXT NOT NULL, -- 'API', 'Neo4j', 'Scanner', 'Auth'
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}', -- Stack traces, request IDs, error codes
    household_id UUID REFERENCES app_state(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Activity Log (The "Family Feed" for user-visible events)
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    household_id UUID REFERENCES app_state(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_name TEXT,
    action TEXT NOT NULL, -- 'EXPENSE_ADDED', 'INSIGHT_GENERATED', 'BUDGET_UPDATED'
    description TEXT NOT NULL, -- "Nik added €50.00 at Lidl"
    metadata JSONB DEFAULT '{}'
);

-- 3. Security (RLS)
ALTER TABLE system_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Telemetry is only visible to the household members (for debugging their own sessions)
-- OR strictly for system admins in the future.
CREATE POLICY "Household members can view their own telemetry"
ON system_telemetry FOR SELECT
USING (household_id = (SELECT get_my_household()));

-- Activity logs are visible to everyone in the household
CREATE POLICY "Household members can view activity"
ON activity_log FOR SELECT
USING (household_id = (SELECT get_my_household()));

-- Internal insert policy for both
CREATE POLICY "Enable insert for authenticated users"
ON system_telemetry FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users"
ON activity_log FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
