-- Migration 46: Remove CHECK constraint on event_log.action
--
-- Rationale: The TypeScript EVENT_ACTIONS const provides compile-time
-- validation. Removing the DB CHECK eliminates the 4-way sync burden
-- (TS const + CHECK + ACTION_DISPLAY + getActionDisplay) while keeping
-- defense-in-depth via record_event_v1 (the sole write path, SECURITY DEFINER).

ALTER TABLE public.event_log DROP CONSTRAINT IF EXISTS valid_event_action;
