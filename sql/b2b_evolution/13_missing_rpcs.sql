-- Migration: 13_missing_rpcs
-- Purpose: Restore core runtime functionality for Finance and Logistics.
-- Enforces: ACID transactions and Tenant Isolation.

-- 1. add_transaction_v3
-- Canonical RPC for manual expense entry.
CREATE OR REPLACE FUNCTION public.add_transaction_v3(
    p_transaction JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_new_id UUID;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    -- SCHEMA VALIDATION: Prevent runtime casting errors
    IF p_transaction->>'amount' IS NULL OR NOT (p_transaction->>'amount' ~ '^-?\d+(\.\d+)?$') THEN
        RAISE EXCEPTION 'Invalid or missing amount: %', p_transaction->>'amount';
    END IF;

    IF p_transaction->>'date' IS NULL OR NOT (p_transaction->>'date' ~ '^\d{4}-\d{2}-\d{2}$') THEN
        RAISE EXCEPTION 'Invalid or missing date format: %', p_transaction->>'date';
    END IF;

    -- Extract or Generate ID
    v_new_id := COALESCE((p_transaction->>'id')::UUID, gen_random_uuid());

    INSERT INTO transactions (
        id,
        tenant_id,
        location_id,
        who_id,
        who,
        category,
        amount,
        currency,
        date,
        description,
        ico,
        receipt_number,
        transacted_at,
        vat_detail,
        transaction_type
    )
    VALUES (
        v_new_id,
        v_tenant_id,
        (p_transaction->>'location_id')::UUID,
        (p_transaction->>'who_id')::UUID,
        p_transaction->>'who',
        p_transaction->>'category',
        (p_transaction->>'amount')::NUMERIC,
        COALESCE(p_transaction->>'currency', 'EUR'),
        (p_transaction->>'date')::DATE,
        p_transaction->>'description',
        p_transaction->>'ico',
        p_transaction->>'receipt_number',
        (p_transaction->>'transacted_at')::TIMESTAMP WITH TIME ZONE,
        p_transaction->'vat_detail',
        COALESCE(p_transaction->>'transaction_type', 'DEBIT')
    );

    RETURN v_new_id;
END;
$$;

-- 2. receive_purchase_order_v1
-- Atomic logistics-to-finance bridge.
CREATE OR REPLACE FUNCTION public.receive_purchase_order_v1(
    p_po_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_po RECORD;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- CONCURRENCY LOCKING: Prevent double-processing via FOR UPDATE
    SELECT * INTO v_po FROM purchase_orders 
    WHERE id = p_po_id AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase Order not found';
    END IF;

    IF v_po.status = 'RECEIVED' THEN
        RETURN jsonb_build_object('status', 'ALREADY_RECEIVED');
    END IF;

    -- 3. Update PO Status
    UPDATE purchase_orders 
    SET status = 'RECEIVED', updated_at = NOW() 
    WHERE id = p_po_id;

    -- 4. SET-BASED INVENTORY UPDATE: High-performance bulk insert
    INSERT INTO inventory_ledger (
        tenant_id, 
        item_id, 
        location_id, 
        quantity, 
        uom, 
        entry_type, 
        reference_id
    )
    SELECT 
        v_tenant_id,
        item_id,
        v_po.location_id,
        quantity,
        uom,
        'RECEIPT',
        p_po_id
    FROM po_line_items 
    WHERE po_id = p_po_id;

    -- 5. Emit to Outbox (Triggers Finance Invoice)
    INSERT INTO outbox_events (tenant_id, event_type, payload)
    VALUES (
        v_tenant_id,
        'PROCUREMENT_RECEIVED',
        jsonb_build_object(
            'po_id', p_po_id,
            'vendor_id', v_po.vendor_id,
            'total_amount', v_po.total_amount,
            'currency', v_po.currency,
            'location_id', v_po.location_id
        )
    );

    RETURN jsonb_build_object('status', 'SUCCESS', 'po_id', p_po_id);
END;
$$;

-- 3. create_inventory_item_v1
-- Canonical SKU creation.
CREATE OR REPLACE FUNCTION public.create_inventory_item_v1(
    p_item JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_new_id UUID;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    v_new_id := gen_random_uuid();

    INSERT INTO inventory_items (
        id,
        tenant_id,
        name,
        sku,
        type,
        purchasing_uom,
        inventory_uom,
        conversion_factor,
        category_id
    )
    VALUES (
        v_new_id,
        v_tenant_id,
        p_item->>'name',
        p_item->>'sku',
        p_item->>'type',
        p_item->>'purchasing_uom',
        p_item->>'inventory_uom',
        (p_item->>'conversion_factor')::NUMERIC,
        (p_item->>'category_id')::UUID
    );

    RETURN v_new_id;
END;
$$;
