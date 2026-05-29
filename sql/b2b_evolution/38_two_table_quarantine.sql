-- ==========================================
-- B2B EVOLUTION: PHASE 0 - TWO-TABLE + QUARANTINE
-- ==========================================
-- Adds: purchases table (COGS), quarantine/reconciliation tables,
-- polymorphic receipt_items migration, chart_of_accounts seed,
-- and release/approve/reject RPCs.

BEGIN;

-- ==========================================
-- 1. PURCHASES TABLE (COGS Ledger)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.purchases (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id       UUID NOT NULL REFERENCES public.locations(id),
    account_id        UUID NOT NULL REFERENCES public.chart_of_accounts(id),

    vendor_name       TEXT,
    invoice_number    TEXT,

    total_amount      NUMERIC(12,2) NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'EUR',
    tax_amount        NUMERIC(12,2),
    tax_rate          NUMERIC(5,2),

    receipt_type      TEXT NOT NULL DEFAULT 'scanned'
                      CHECK (receipt_type IN ('scanned', 'ekasa', 'manual', 'imported')),
    receipt_hash      TEXT,
    source_image_url  TEXT,

    purchase_date     DATE NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    quarantine_status TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (quarantine_status IN ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_RELEASED')),
    reviewed_at       TIMESTAMPTZ,
    reviewed_by       UUID,  -- validated at app layer, no FK (auth.users is in auth schema)
    rejection_reason  TEXT,
    rejection_note    TEXT,

    UNIQUE (tenant_id, receipt_hash)
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.purchases
    FOR ALL TO authenticated
    USING (tenant_id = public.get_my_tenant())
    WITH CHECK (tenant_id = public.get_my_tenant());

CREATE INDEX IF NOT EXISTS idx_purchases_tenant_date ON public.purchases(tenant_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_location ON public.purchases(tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(tenant_id, quarantine_status);

DROP TRIGGER IF EXISTS trg_purchases_updated_at ON public.purchases;
CREATE TRIGGER trg_purchases_updated_at
    BEFORE UPDATE ON public.purchases
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


-- ==========================================
-- 2. PURCHASE ANOMALY QUEUE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.purchase_anomaly_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    location_id         UUID NOT NULL REFERENCES public.locations(id),

    purchase_id         UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    receipt_item_id     UUID REFERENCES public.receipt_items(id),

    check_type          TEXT NOT NULL
                        CHECK (check_type IN (
                            'price_spike',
                            'quantity_spike',
                            'new_vendor',
                            'duplicate',
                            'missing_receipt',
                            'vendor_mismatch'
                        )),
    severity            TEXT NOT NULL DEFAULT 'medium'
                        CHECK (severity IN ('low', 'medium', 'high')),
    anomaly_score       NUMERIC,
    anomaly_detail      TEXT,

    status              TEXT NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN', 'DISMISSED', 'ESCALATED')),
    outbox_id           UUID REFERENCES public.whatsapp_outbox(id),

    notification_sent_at    TIMESTAMPTZ,
    response_received_at    TIMESTAMPTZ,
    response_decision       TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.purchase_anomaly_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_anomaly_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.purchase_anomaly_queue
    FOR ALL TO authenticated
    USING (tenant_id = public.get_my_tenant())
    WITH CHECK (tenant_id = public.get_my_tenant());

CREATE INDEX IF NOT EXISTS idx_paq_tenant_status ON public.purchase_anomaly_queue(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_paq_purchase ON public.purchase_anomaly_queue(purchase_id);


-- ==========================================
-- 3. PENDING TEXT FOLLOWUPS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.pending_text_followups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    outbox_id       UUID NOT NULL REFERENCES public.whatsapp_outbox(id),

    entity_type     TEXT NOT NULL,
    entity_id       UUID NOT NULL,

    status          TEXT NOT NULL DEFAULT 'AWAITING_REPLY'
                    CHECK (status IN ('AWAITING_REPLY', 'COMPLETED', 'TIMEOUT')),
    prompt          TEXT NOT NULL,
    response        TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.pending_text_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_text_followups FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.pending_text_followups
    FOR ALL TO authenticated
    USING (tenant_id = public.get_my_tenant())
    WITH CHECK (tenant_id = public.get_my_tenant());

CREATE INDEX IF NOT EXISTS idx_ptf_status ON public.pending_text_followups(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ptf_outbox ON public.pending_text_followups(outbox_id);


-- ==========================================
-- 4. RECEIPT ITEMS: POLYMORPHIC FK MIGRATION
-- ==========================================
ALTER TABLE public.receipt_items
    ADD COLUMN IF NOT EXISTS source_type TEXT;

ALTER TABLE public.receipt_items
    ADD COLUMN IF NOT EXISTS source_id UUID;

-- Backfill existing rows: map transaction_id → source_type='transaction', source_id=transaction_id
UPDATE public.receipt_items
SET source_type = 'transaction', source_id = transaction_id
WHERE source_type IS NULL AND transaction_id IS NOT NULL;

-- Catch orphaned rows (no transaction_id) → system guest UUID
UPDATE public.receipt_items
SET source_type = 'transaction', source_id = '00000000-0000-0000-0000-000000000000'
WHERE source_type IS NULL;

ALTER TABLE public.receipt_items ALTER COLUMN source_type SET NOT NULL;
ALTER TABLE public.receipt_items ALTER COLUMN source_id SET NOT NULL;

ALTER TABLE public.receipt_items
    ADD CONSTRAINT receipt_items_source_type_check
    CHECK (source_type IN ('purchase', 'transaction'));

CREATE INDEX IF NOT EXISTS idx_receipt_items_source
    ON public.receipt_items(source_type, source_id);


-- ==========================================
-- 5. CHART OF ACCOUNTS: STANDARD SEED
-- ==========================================
-- Seed COGS account for every existing tenant
INSERT INTO public.chart_of_accounts (tenant_id, account_code, account_name, account_type)
SELECT t.id, 'COGS-001', 'Food & Beverage Cost', 'EXPENSE'
FROM public.tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts ca
    WHERE ca.tenant_id = t.id AND ca.account_code = 'COGS-001'
);

-- Seed 8 standard OPEX accounts per tenant
INSERT INTO public.chart_of_accounts (tenant_id, account_code, account_name, account_type)
SELECT t.id, codes.code, codes.name, 'EXPENSE'
FROM public.tenants t
CROSS JOIN (
    VALUES
        ('OPEX-001', 'Rent & Utilities'),
        ('OPEX-002', 'Salaries & Wages'),
        ('OPEX-003', 'Marketing & Advertising'),
        ('OPEX-004', 'Equipment & Maintenance'),
        ('OPEX-005', 'Professional Services'),
        ('OPEX-006', 'Insurance'),
        ('OPEX-007', 'Office & General'),
        ('OPEX-008', 'Travel & Entertainment')
) AS codes(code, name)
WHERE NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts ca
    WHERE ca.tenant_id = t.id AND ca.account_code = codes.code
);


-- ==========================================
-- 6. RELEASE EXPIRED QUARANTINES RPC
-- ==========================================
CREATE OR REPLACE FUNCTION public.release_expired_quarantines_v1()
RETURNS TABLE(released_purchases INTEGER, released_queue INTEGER)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    v_auto_release_hours INTEGER;
    v_tenant_record RECORD;
    v_released_purchases INTEGER := 0;
    v_released_queue INTEGER := 0;
BEGIN
    FOR v_tenant_record IN
        SELECT id, config FROM public.tenants
    LOOP
        v_auto_release_hours := COALESCE(
            (v_tenant_record.config -> 'workflows' -> 'quarantine_alert' -> 'auto_release_hours')::INTEGER,
            6
        );
        v_auto_release_hours := LEAST(v_auto_release_hours, 24);

        WITH expired_purchases AS (
            UPDATE public.purchases p
            SET quarantine_status = 'AUTO_RELEASED',
                reviewed_at = NOW()
            WHERE p.tenant_id = v_tenant_record.id
              AND p.quarantine_status = 'PENDING'
              AND p.created_at < NOW() - (v_auto_release_hours || ' hours')::INTERVAL
            RETURNING p.id
        )
        SELECT COUNT(*) INTO v_released_purchases FROM expired_purchases;

        IF v_released_purchases > 0 THEN
            WITH expired_queue AS (
                UPDATE public.purchase_anomaly_queue paq
                SET status = 'DISMISSED'
                FROM expired_purchases ep
                WHERE paq.purchase_id = ep.id
                  AND paq.status = 'OPEN'
                RETURNING paq.id
            )
            SELECT COUNT(*) INTO v_released_queue FROM expired_queue;
        END IF;
    END LOOP;

    RETURN QUERY SELECT v_released_purchases, v_released_queue;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_expired_quarantines_v1() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.release_expired_quarantines_v1() TO service_role;


-- ==========================================
-- 7. APPROVE PURCHASE RPC
-- ==========================================
CREATE OR REPLACE FUNCTION public.approve_purchase_v1(
    p_purchase_id UUID,
    p_queue_id UUID
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    UPDATE public.purchases
    SET quarantine_status = 'APPROVED', reviewed_at = NOW()
    WHERE id = p_purchase_id AND quarantine_status = 'PENDING';

    UPDATE public.purchase_anomaly_queue
    SET status = 'DISMISSED'
    WHERE id = p_queue_id AND status = 'OPEN';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_purchase_v1(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase_v1(UUID, UUID) TO service_role;


-- ==========================================
-- 8. REJECT PURCHASE RPC
-- ==========================================
CREATE OR REPLACE FUNCTION public.reject_purchase_v1(
    p_purchase_id UUID,
    p_queue_id UUID,
    p_rejection_note TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    UPDATE public.purchases
    SET quarantine_status = 'REJECTED',
        reviewed_at = NOW(),
        rejection_note = p_rejection_note
    WHERE id = p_purchase_id AND quarantine_status = 'PENDING';

    UPDATE public.purchase_anomaly_queue
    SET status = 'DISMISSED'
    WHERE id = p_queue_id AND status = 'OPEN';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_purchase_v1(UUID, UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_purchase_v1(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_purchase_v1(UUID, UUID, TEXT) TO service_role;


COMMIT;
