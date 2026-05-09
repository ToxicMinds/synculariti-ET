-- ==========================================
-- B2B EVOLUTION: PHASE 4 - LOGISTICS SCHEMA
-- ==========================================
-- Implements the Inventory Management System (IMS) primitives.
-- Linked to Finance via the PostgreSQL Outbox pattern.

-- 1. INVENTORY CATEGORIES
CREATE TABLE IF NOT EXISTS public.inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON public.inventory_categories FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant());

-- 2. INVENTORY ITEMS (The Master Item List)
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.inventory_categories(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('RAW', 'PREP', 'SERVICE')),
  purchasing_uom TEXT NOT NULL, -- e.g., 'CASE', 'KG'
  inventory_uom TEXT NOT NULL,  -- e.g., 'EACH', 'GRAM'
  conversion_factor NUMERIC NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, sku)
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON public.inventory_items FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant());

-- 3. PROCUREMENT: PURCHASE ORDERS
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  vendor_id UUID, -- Virtual FK
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'RECEIVED', 'CANCELLED')),
  order_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (char_length(currency) = 3),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON public.purchase_orders FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant());

-- 4. PO LINE ITEMS
CREATE TABLE IF NOT EXISTS public.po_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity_ordered NUMERIC NOT NULL,
  quantity_received NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.po_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON public.po_line_items FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant());

-- 5. INVENTORY LEDGER (Append-only stock movements)
CREATE TABLE IF NOT EXISTS public.inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  change_amount NUMERIC NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('RECEIPT', 'SALE', 'WASTE', 'ADJUSTMENT', 'TRANSFER')),
  reference_id UUID, -- e.g., po_id
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON public.inventory_ledger FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant());

-- Performance Index for Ledger Aggregation
CREATE INDEX IF NOT EXISTS idx_ledger_lookup 
ON public.inventory_ledger(tenant_id, location_id, item_id);

-- 6. THE ECOSYSTEM WIRE (Cross-Module Signal)
-- Trigger: When PO status changes to RECEIVED, signal Finance to create an AP Invoice.
CREATE OR REPLACE FUNCTION public.signal_procurement_to_finance()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND NEW.status = 'RECEIVED' AND OLD.status != 'RECEIVED' THEN
    -- VALIDATION: Ensure all items have a received quantity > 0
    IF EXISTS (SELECT 1 FROM public.po_line_items WHERE po_id = NEW.id AND quantity_received <= 0) THEN
      RAISE EXCEPTION 'Cannot receive PO: Some line items have zero or missing received quantities.';
    END IF;

    -- Emit Outbox event
    INSERT INTO public.outbox_events (tenant_id, event_type, payload)
    VALUES (NEW.tenant_id, 'PROCUREMENT_RECEIVED', jsonb_build_object(
      'po_id', NEW.id,
      'location_id', NEW.location_id,
      'vendor_id', NEW.vendor_id,
      'total_amount', NEW.total_amount,
      'currency', NEW.currency
    ));
    
    -- Also: automatically record stock in ledger for all received items
    -- APPLY CONVERSION: quantity_received (Purchasing UOM) * conversion_factor = Stock Increase (Inventory UOM)
    -- SKIP: Service items (Delivery fees, etc.) do not affect physical stock
    INSERT INTO public.inventory_ledger (tenant_id, location_id, item_id, change_amount, reason, reference_id)
    SELECT 
      NEW.tenant_id, 
      NEW.location_id, 
      pli.item_id, 
      (pli.quantity_received * i.conversion_factor), 
      'RECEIPT', 
      NEW.id
    FROM public.po_line_items pli
    JOIN public.inventory_items i ON i.id = pli.item_id
    WHERE pli.po_id = NEW.id
      AND i.type != 'SERVICE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_signal_procurement_finance
AFTER UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.signal_procurement_to_finance();


-- 7. THE FINANCE CONSUMER (Outbox Listener)
-- When a 'PROCUREMENT_RECEIVED' event is inserted into the outbox, automatically create the Invoice.
CREATE OR REPLACE FUNCTION public.consume_procurement_signal()
RETURNS TRIGGER AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  IF NEW.event_type = 'PROCUREMENT_RECEIVED' THEN
    -- SAFE CAST: vendor_id (might be a virtual Neo4j string or NULL)
    BEGIN
      v_vendor_id := (NEW.payload->>'vendor_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_vendor_id := NULL; -- Fallback for virtual IDs that aren't valid Postgres UUIDs
    END;

    INSERT INTO public.invoices (tenant_id, location_id, vendor_id, total_amount, currency, status, invoice_number)
    VALUES (
      NEW.tenant_id, 
      (NEW.payload->>'location_id')::UUID, 
      v_vendor_id, 
      (NEW.payload->>'total_amount')::NUMERIC,
      COALESCE(NEW.payload->>'currency', 'EUR'),
      'PENDING',
      'PO-' || upper(substr(NEW.payload->>'po_id', 1, 8))
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_consume_procurement
AFTER INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION public.consume_procurement_signal();

-- 8. ANALYTICS: CURRENT INVENTORY VIEW
CREATE OR REPLACE VIEW public.current_inventory 
WITH (security_invoker = true) AS
SELECT 
  tenant_id,
  location_id,
  item_id,
  SUM(change_amount) as stock_level,
  MAX(created_at) as last_movement
FROM public.inventory_ledger
GROUP BY tenant_id, location_id, item_id;

COMMENT ON VIEW public.current_inventory IS 'Real-time stock levels derived from the append-only inventory ledger.';
