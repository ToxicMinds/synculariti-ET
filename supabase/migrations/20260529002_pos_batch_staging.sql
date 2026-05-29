-- ==========================================
-- Phase 1: POS Batch Staging Tables
-- Batch Ingestion & Food Cost Variance Pipeline
-- ==========================================
BEGIN;

-- ==========================================
-- 1. POS BATCH UPLOADS (batch metadata)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.pos_batch_uploads (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id       UUID NOT NULL REFERENCES public.locations(id),
    batch_id          TEXT,
    source            TEXT,

    status            TEXT NOT NULL DEFAULT 'STAGED'
                      CHECK (status IN ('STAGED', 'PROCESSING', 'COMPLETED', 'FAILED')),

    total_receipts    INTEGER NOT NULL DEFAULT 0,
    approved_rows     INTEGER NOT NULL DEFAULT 0,
    quarantined_rows  INTEGER NOT NULL DEFAULT 0,

    period_start      DATE,
    period_end        DATE,

    received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at      TIMESTAMPTZ,
    error_detail      JSONB,

    UNIQUE (tenant_id, batch_id)
);

ALTER TABLE public.pos_batch_uploads ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2. POS TRANSACTION STAGING (item-level)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.pos_transaction_staging (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id          UUID NOT NULL REFERENCES public.pos_batch_uploads(id) ON DELETE CASCADE,
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id       UUID NOT NULL REFERENCES public.locations(id),
    line_number       INTEGER NOT NULL,

    raw_payload       JSONB NOT NULL,

    transaction_time  TIMESTAMPTZ NOT NULL,
    receipt_number    TEXT,

    item_sku          TEXT,
    item_name         TEXT,
    quantity          NUMERIC,
    revenue           NUMERIC,
    is_void           BOOLEAN DEFAULT false,
    is_comp           BOOLEAN DEFAULT false,

    recipe_found      BOOLEAN,
    theoretical_grams JSONB,

    anomaly_score     NUMERIC,
    anomaly_reason    TEXT,
    flag              TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (flag IN ('PENDING', 'APPROVED', 'QUARANTINED')),

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pos_transaction_staging ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_staging_batch
    ON public.pos_transaction_staging(batch_id, flag);
CREATE INDEX IF NOT EXISTS idx_staging_time
    ON public.pos_transaction_staging(tenant_id, transaction_time);
CREATE INDEX IF NOT EXISTS idx_staging_sku
    ON public.pos_transaction_staging(tenant_id, item_sku);

-- ==========================================
-- 3. POS DATA GAPS (expected-but-not-received)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.pos_data_gaps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id     UUID NOT NULL REFERENCES public.locations(id),
    gap_date        DATE NOT NULL,
    notified_at     TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,

    UNIQUE (tenant_id, location_id, gap_date)
);

ALTER TABLE public.pos_data_gaps ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 4. GRANT PERMISSIONS
-- ==========================================
GRANT ALL ON TABLE public.pos_batch_uploads TO authenticated;
GRANT ALL ON TABLE public.pos_batch_uploads TO service_role;

GRANT ALL ON TABLE public.pos_transaction_staging TO authenticated;
GRANT ALL ON TABLE public.pos_transaction_staging TO service_role;

GRANT ALL ON TABLE public.pos_data_gaps TO authenticated;
GRANT ALL ON TABLE public.pos_data_gaps TO service_role;

-- ==========================================
-- 5. QUARANTINE AUDIT VIEW
-- ==========================================
CREATE OR REPLACE VIEW public.v_quarantine_audit AS
SELECT
    b.id               AS batch_id,
    b.batch_id         AS ims_batch_id,
    b.received_at,
    s.line_number,
    s.transaction_time,
    s.item_sku,
    s.item_name,
    s.quantity,
    s.revenue,
    s.anomaly_score,
    s.anomaly_reason
FROM public.pos_transaction_staging s
JOIN public.pos_batch_uploads b ON b.id = s.batch_id
WHERE s.flag = 'QUARANTINED'
ORDER BY b.received_at DESC, s.line_number;

GRANT ALL ON TABLE public.v_quarantine_audit TO authenticated;
GRANT ALL ON TABLE public.v_quarantine_audit TO service_role;

-- ==========================================
-- 6. UTILITY RPCS FOR TESTING
-- ==========================================

-- Check if an index exists (used by test suite)
CREATE OR REPLACE FUNCTION public.get_index_exists(p_table TEXT, p_index TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SET search_path TO 'public'
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = p_table
    AND indexname = p_index
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_index_exists(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_index_exists(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_index_exists(TEXT, TEXT) TO service_role;

-- Check if RLS is enabled on a table (used by test suite)
CREATE OR REPLACE FUNCTION public.get_table_rls_status(p_table TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SET search_path TO 'public'
STABLE
AS $$
  SELECT relrowsecurity
  FROM pg_class
  WHERE relname = p_table
    AND relnamespace = 'public'::regnamespace;
$$;

REVOKE EXECUTE ON FUNCTION public.get_table_rls_status(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_table_rls_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_table_rls_status(TEXT) TO service_role;

-- ==========================================
-- 7. PROCESS BATCH V1 (anomaly detection)
-- ==========================================
CREATE OR REPLACE FUNCTION public.process_batch_v1(p_batch_id UUID)
RETURNS TABLE(total_rows INTEGER, approved INTEGER, quarantined INTEGER)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    v_tenant_id UUID;
    v_batch_status TEXT;
    v_approved INTEGER := 0;
    v_quarantined INTEGER := 0;
    r RECORD;
    b RECORD;
    z_price NUMERIC;
    z_qty NUMERIC;
    max_z NUMERIC;
    reason TEXT;
BEGIN
    SELECT tenant_id, status INTO v_tenant_id, v_batch_status
    FROM public.pos_batch_uploads WHERE id = p_batch_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;
    IF v_batch_status != 'STAGED' THEN
        RAISE EXCEPTION 'Batch % is in % state', p_batch_id, v_batch_status;
    END IF;

    UPDATE public.pos_batch_uploads SET status = 'PROCESSING', processed_at = NOW()
    WHERE id = p_batch_id;

    FOR r IN SELECT * FROM public.pos_transaction_staging
             WHERE batch_id = p_batch_id ORDER BY line_number
    LOOP
        max_z := 0;
        reason := NULL;

        SELECT
            COUNT(*) AS n,
            AVG(revenue) AS mean_rev,
            COALESCE(STDDEV(revenue), 0) AS stddev_rev,
            AVG(quantity) AS mean_qty,
            COALESCE(STDDEV(quantity), 0) AS stddev_qty
        INTO b
        FROM public.pos_transaction_staging
        WHERE tenant_id = v_tenant_id
          AND item_sku = r.item_sku
          AND flag = 'APPROVED'
          AND created_at >= NOW() - INTERVAL '90 days';

        IF b.n >= 5 THEN
            IF b.stddev_rev > 0 THEN
                z_price := ABS(r.revenue - b.mean_rev) / b.stddev_rev;
                IF z_price > 3 THEN
                    max_z := GREATEST(max_z, z_price);
                    reason := COALESCE(reason || '; ', '')
                        || format('revenue Z=%.1f (>3σ)', z_price);
                END IF;
            END IF;

            IF b.stddev_qty > 0 THEN
                z_qty := ABS(r.quantity - b.mean_qty) / b.stddev_qty;
                IF z_qty > 3 THEN
                    max_z := GREATEST(max_z, z_qty);
                    reason := COALESCE(reason || '; ', '')
                        || format('quantity Z=%.1f (>3σ)', z_qty);
                END IF;
            END IF;

            IF r.quantity < 0 AND NOT r.is_void THEN
                max_z := GREATEST(max_z, 99);
                reason := COALESCE(reason || '; ', '') || 'negative quantity without void flag';
            END IF;
            IF r.revenue < 0 THEN
                max_z := GREATEST(max_z, 99);
                reason := COALESCE(reason || '; ', '') || 'negative revenue';
            END IF;
        END IF;

        IF max_z >= 3 THEN
            v_quarantined := v_quarantined + 1;
            UPDATE public.pos_transaction_staging
            SET flag = 'QUARANTINED', anomaly_score = max_z, anomaly_reason = reason
            WHERE id = r.id;
        ELSE
            v_approved := v_approved + 1;
            UPDATE public.pos_transaction_staging
            SET flag = 'APPROVED', anomaly_score = max_z
            WHERE id = r.id;
        END IF;
    END LOOP;

    UPDATE public.pos_batch_uploads
    SET status = 'COMPLETED',
        approved_rows = v_approved,
        quarantined_rows = v_quarantined,
        total_receipts = v_approved + v_quarantined
    WHERE id = p_batch_id;

    RETURN QUERY SELECT v_approved + v_quarantined, v_approved, v_quarantined;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_batch_v1(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_batch_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_batch_v1(UUID) TO service_role;

COMMIT;
