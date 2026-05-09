-- ==========================================
-- B2B EVOLUTION: PHASE 2 - FINANCE SCHEMA
-- ==========================================
-- Renaming 'expenses' to 'transactions' and introducing the 'invoices' layer.
-- Introducing 'chart_of_accounts' to replace simple string categories.
-- Introducing the PostgreSQL Outbox pattern for cross-system events.

-- 1. CHART OF ACCOUNTS (CoA)
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, account_code)
);

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON public.chart_of_accounts FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant());

-- 2. INVOICES (Accounts Payable)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  vendor_id UUID, -- Virtual FK: Validated in Application/Edge layer against Neo4j
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PAID', 'CANCELLED')),
  due_date DATE,
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK (char_length(currency) = 3),
  raw_file_url TEXT, -- URL to Supabase Storage PDF/Image
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON public.invoices FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant());

CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- 2.5 INVOICE ITEMS (Line Items)
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  tax_rate NUMERIC DEFAULT 0,
  line_total NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON public.invoice_items FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant());

-- 3. RENAME EXPENSES TO TRANSACTIONS & UPGRADE
ALTER TABLE public.expenses RENAME TO transactions;

-- Add transaction_type (DEBIT/CREDIT)
ALTER TABLE public.transactions ADD COLUMN transaction_type TEXT DEFAULT 'DEBIT' CHECK (transaction_type IN ('DEBIT', 'CREDIT'));

-- Add invoice_id to transactions to link payments to AP
ALTER TABLE public.transactions ADD COLUMN invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON public.transactions(invoice_id);

-- Add account_id to link to the new Chart of Accounts
ALTER TABLE public.transactions ADD COLUMN account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

-- 4. OUTBOX EVENTS (The "Signal" Bus)
CREATE TABLE IF NOT EXISTS public.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation" ON public.outbox_events FOR ALL TO authenticated USING (tenant_id = public.get_my_tenant());

-- Trigger to NOTIFY subscribers when a new event arrives
CREATE OR REPLACE FUNCTION public.notify_outbox_event()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('synculariti_finance_events', json_build_object(
    'id', NEW.id,
    'event_type', NEW.event_type,
    'tenant_id', NEW.tenant_id
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_outbox
AFTER INSERT ON public.outbox_events
FOR EACH ROW EXECUTE FUNCTION public.notify_outbox_event();

-- 4.5 ATOMIC OUTBOX TRIGGER (Auto-signal on Invoice changes)
CREATE OR REPLACE FUNCTION public.auto_invoice_outbox_signal()
RETURNS TRIGGER AS $$
BEGIN
  -- If status changed to PAID, emit a signal automatically in the same transaction
  IF (TG_OP = 'UPDATE') AND NEW.status = 'PAID' AND OLD.status != 'PAID' THEN
    INSERT INTO public.outbox_events (tenant_id, event_type, payload)
    VALUES (NEW.tenant_id, 'INVOICE_PAID', jsonb_build_object('invoice_id', NEW.id, 'vendor_id', NEW.vendor_id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_outbox_invoice
AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.auto_invoice_outbox_signal();

-- 5. MIGRATION DATA: Migrate legacy categories to Chart of Accounts
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Loop through distinct categories in transactions
  FOR rec IN SELECT DISTINCT tenant_id, category FROM public.transactions WHERE category IS NOT NULL
  LOOP
    -- Insert into CoA if it doesn't exist
    INSERT INTO public.chart_of_accounts (tenant_id, account_code, account_name, account_type)
    VALUES (rec.tenant_id, upper(regexp_replace(rec.category, '\s+', '_', 'g')), rec.category, 'EXPENSE')
    ON CONFLICT (tenant_id, account_code) DO NOTHING;
    
    -- Update transactions to map to the new account_id
    UPDATE public.transactions t
    SET account_id = c.id
    FROM public.chart_of_accounts c
    WHERE t.tenant_id = rec.tenant_id 
      AND t.category = rec.category 
      AND c.tenant_id = rec.tenant_id
      AND c.account_name = rec.category;
  END LOOP;
END;
$$;
