-- Migration: 13_missing_rpcs
-- Purpose: Restore core runtime functionality for Finance and Logistics.
-- Enforces: ACID transactions and Tenant Isolation.

-- 1. add_transaction_v3
-- Canonical RPC for manual expense entry.
DROP FUNCTION IF EXISTS public.add_transaction_v3(JSONB);
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
    v_amount NUMERIC;
    v_date DATE;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    -- ROBUST VALIDATION: Use explicit casting with error handling
    BEGIN
        v_amount := (p_transaction->>'amount')::NUMERIC;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid numeric amount provided: %', p_transaction->>'amount';
    END;

    BEGIN
        v_date := (p_transaction->>'date')::DATE;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid date format provided: %', p_transaction->>'date';
    END;

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
        v_amount,
        COALESCE(p_transaction->>'currency', 'EUR'),
        v_date,
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
DROP FUNCTION IF EXISTS public.receive_purchase_order_v1(UUID);
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
    -- This update triggers trg_signal_procurement_finance which handles:
    -- a) Validation of quantity_received
    -- b) Insertion into inventory_ledger (with UOM conversion)
    -- c) Emission of PROCUREMENT_RECEIVED outbox event
    UPDATE purchase_orders 
    SET status = 'RECEIVED', updated_at = NOW() 
    WHERE id = p_po_id;

    RETURN jsonb_build_object('status', 'SUCCESS', 'po_id', p_po_id);
END;
$$;

-- 3. create_inventory_item_v1
-- Canonical SKU creation.
DROP FUNCTION IF EXISTS public.create_inventory_item_v1(JSONB);
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
    v_conversion_factor NUMERIC;
    v_category_id UUID;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- TYPE SAFETY: Handle broken payloads with clean error messages
    BEGIN
        v_conversion_factor := (p_item->>'conversion_factor')::NUMERIC;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Invalid conversion factor: %', p_item->>'conversion_factor';
    END;

    BEGIN
        v_category_id := (p_item->>'category_id')::UUID;
    EXCEPTION WHEN others THEN
        v_category_id := NULL; -- Allow NULL categories if explicitly pushed as invalid
    END;

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
        v_conversion_factor,
        v_category_id
    );

    RETURN v_new_id;
END;
$$;
