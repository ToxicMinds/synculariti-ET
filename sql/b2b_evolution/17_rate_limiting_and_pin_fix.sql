-- Migration: 17_rate_limiting_and_pin_fix
-- Purpose: Implement brute-force protection and restore missing PIN verification logic.

BEGIN;

-- 1. Create Rate Limits Table
CREATE TABLE IF NOT EXISTS public.rate_limits (
    ip_hash TEXT NOT NULL,
    action_type TEXT NOT NULL DEFAULT 'pin_auth',
    attempt_count INT DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    PRIMARY KEY (ip_hash, action_type)
);

-- 2. Create Rate Limit Check RPC
-- Returns JSON with allowed status and metadata
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_ip_hash TEXT,
    p_action TEXT,
    p_max_attempts INT DEFAULT 5,
    p_window_minutes INT DEFAULT 15,
    p_block_minutes INT DEFAULT 60
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_record public.rate_limits%ROWTYPE;
    v_now TIMESTAMPTZ := NOW();
    v_retry_after INT := 0;
BEGIN
    INSERT INTO public.rate_limits (ip_hash, action_type, attempt_count, window_start)
    VALUES (p_ip_hash, p_action, 1, v_now)
    ON CONFLICT (ip_hash, action_type) DO UPDATE SET
        attempt_count = CASE 
            WHEN rate_limits.window_start < v_now - (p_window_minutes || ' minutes')::INTERVAL 
            THEN 1 
            ELSE rate_limits.attempt_count + 1 
        END,
        window_start = CASE 
            WHEN rate_limits.window_start < v_now - (p_window_minutes || ' minutes')::INTERVAL 
            THEN v_now 
            ELSE rate_limits.window_start 
        END,
        blocked_until = CASE 
            -- Block if they hit the limit within the window OR they are already blocked
            WHEN (rate_limits.attempt_count + 1 >= p_max_attempts AND rate_limits.window_start >= v_now - (p_window_minutes || ' minutes')::INTERVAL)
                 OR (rate_limits.blocked_until > v_now)
            THEN GREATEST(COALESCE(rate_limits.blocked_until, v_now), v_now) + (p_block_minutes || ' minutes')::INTERVAL 
            ELSE NULL 
        END
    RETURNING * INTO v_record;
    
    IF v_record.blocked_until > v_now THEN
        v_retry_after := EXTRACT(EPOCH FROM (v_record.blocked_until - v_now))::INT;
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_record.blocked_until IS NULL OR v_record.blocked_until < v_now,
        'remaining_attempts', GREATEST(0, p_max_attempts - v_record.attempt_count),
        'retry_after_seconds', v_retry_after
    );
END;
$$;

-- 3. Restore check_tenant_pin
-- Verifies a PIN against the tenant's config
CREATE OR REPLACE FUNCTION public.check_tenant_pin(
    h_id UUID,
    input_pin TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.tenants 
        WHERE id = h_id 
          AND config->>'pin' = input_pin
    );
END;
$$;

-- 4. Revoke public access to these sensitive RPCs
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT, INT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_tenant_pin(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_tenant_pin(UUID, TEXT) TO service_role;

COMMIT;
