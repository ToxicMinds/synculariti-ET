-- New table — does NOT modify existing expenses
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  who TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  date DATE NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL,
  receipt_id TEXT UNIQUE NULL,
  google_calendar_event_id TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast calendar queries
CREATE INDEX idx_invoices_who_date ON invoices(who, date DESC);
CREATE INDEX idx_invoices_date ON invoices(date DESC);

-- Add invoice_id column to existing expenses (NULLABLE, backward compatible)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_id UUID NULL 
CONSTRAINT fk_expenses_invoices REFERENCES invoices(id) ON DELETE CASCADE;

-- Create index
CREATE INDEX IF NOT EXISTS idx_expenses_invoice_id ON expenses(invoice_id);

-- Backward compatibility: Existing expenses without invoice_id still work
-- New expenses CAN link to invoices, old ones stay standalone
