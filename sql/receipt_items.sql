-- ==========================================
-- RECEIPT ITEMS TABLE (V2 ANALYTICS)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    category TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

-- Isolation Policy: Users can only see items belonging to their household
DROP POLICY IF EXISTS "Receipt items isolation" ON receipt_items;
CREATE POLICY "Receipt items isolation" ON receipt_items 
FOR ALL USING (household_id IN (SELECT household_id FROM app_users WHERE id = auth.uid()));

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_receipt_items_expense_id ON public.receipt_items(expense_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_household_id ON public.receipt_items(household_id);
