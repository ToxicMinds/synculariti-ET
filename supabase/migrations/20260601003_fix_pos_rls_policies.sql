-- Fix: Add missing RLS policies for POS tables
-- pos_transaction_staging, pos_batch_uploads, and pos_data_gaps
-- all had RLS enabled but no policies, causing default-deny for authenticated users

-- ==========================================
-- 1. pos_transaction_staging
-- ==========================================
CREATE POLICY "Tenant isolation" ON public.pos_transaction_staging
    FOR ALL TO authenticated
    USING (tenant_id = public.get_my_tenant())
    WITH CHECK (tenant_id = public.get_my_tenant());

-- ==========================================
-- 2. pos_batch_uploads
-- ==========================================
CREATE POLICY "Tenant isolation" ON public.pos_batch_uploads
    FOR ALL TO authenticated
    USING (tenant_id = public.get_my_tenant())
    WITH CHECK (tenant_id = public.get_my_tenant());

-- ==========================================
-- 3. pos_data_gaps
-- ==========================================
CREATE POLICY "Tenant isolation" ON public.pos_data_gaps
    FOR ALL TO authenticated
    USING (tenant_id = public.get_my_tenant())
    WITH CHECK (tenant_id = public.get_my_tenant());
