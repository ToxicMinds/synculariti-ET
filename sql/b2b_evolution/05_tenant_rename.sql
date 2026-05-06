-- Migration: 05_tenant_rename
-- Purpose: B2B Evolution - Migrate DB terminology from Household to Tenant

BEGIN;

-- 1. Rename Tables
ALTER TABLE IF EXISTS public.app_state RENAME TO tenants;

-- 2. Rename Columns in 'tenants'
ALTER TABLE public.tenants RENAME COLUMN household_name TO name;

-- 3. Rename foreign keys across tables
ALTER TABLE public.app_users RENAME COLUMN household_id TO tenant_id;
ALTER TABLE public.expenses RENAME COLUMN household_id TO tenant_id;
ALTER TABLE public.receipt_items RENAME COLUMN household_id TO tenant_id;
ALTER TABLE public.activity_log RENAME COLUMN household_id TO tenant_id;
ALTER TABLE public.locations RENAME COLUMN household_id TO tenant_id;

-- 4. Recreate the session-resolution helper functions
DROP FUNCTION IF EXISTS public.get_my_household() CASCADE;

CREATE OR REPLACE FUNCTION public.get_my_tenant() 
RETURNS UUID AS $$
DECLARE
  v_t_id UUID;
BEGIN
  -- 1. Check if we already cached it in this transaction
  v_t_id := NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
  
  IF v_t_id IS NULL THEN
    -- 2. Not cached. Look it up.
    SELECT tenant_id INTO v_t_id FROM public.app_users WHERE id = auth.uid() LIMIT 1;
    
    -- 3. Cache it for the rest of the transaction
    IF v_t_id IS NOT NULL THEN
      PERFORM set_config('app.current_tenant_id', v_t_id::TEXT, true);
    END IF;
  END IF;

  RETURN v_t_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5. Recreate the Bundle RPC
DROP FUNCTION IF EXISTS public.get_household_bundle() CASCADE;

CREATE OR REPLACE FUNCTION public.get_tenant_bundle()
RETURNS JSONB AS $$
DECLARE
  v_session_t_id UUID;
  v_bundle JSONB;
BEGIN
  -- 1. Resolve Tenant
  v_session_t_id := public.get_my_tenant();
  
  IF v_session_t_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Construct unified JSON payload
  SELECT jsonb_build_object(
    'tenant', (
        SELECT row_to_json(t) FROM (
            SELECT id, name, handle, categories, total_budget, config, created_at 
            FROM public.tenants 
            WHERE id = v_session_t_id
        ) t
    ),
    'user', (
        SELECT row_to_json(u) FROM (
            SELECT id, full_name, created_at 
            FROM public.app_users 
            WHERE id = auth.uid() AND tenant_id = v_session_t_id
        ) u
    ),
    'locations', (
        SELECT COALESCE(json_agg(row_to_json(l)), '[]'::json) FROM (
            SELECT id, name, address, metadata 
            FROM public.locations 
            WHERE tenant_id = v_session_t_id
        ) l
    ),
    'server_time', now()
  ) INTO v_bundle;

  RETURN v_bundle;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Update the save_receipt_v3 RPC to use tenant_id
CREATE OR REPLACE FUNCTION public.save_receipt_v3(p_expense JSONB) 
RETURNS UUID AS $$
DECLARE
  v_expense_id UUID;
  v_item JSONB;
  v_session_t_id UUID;
  v_loc_id UUID;
BEGIN
  -- 1. Validate Identity & Tenant
  v_session_t_id := public.get_my_tenant();
  IF v_session_t_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not linked to any tenant.';
  END IF;

  -- 2. Cross-Tenant Payload Validation (The "Dual-Layer" Check)
  IF (p_expense->>'tenant_id')::UUID != v_session_t_id THEN
    RAISE EXCEPTION 'Unauthorized: Payload tenant_id does not match session tenant_id. Cross-tenant mutation rejected.';
  END IF;

  -- 3. Location Ownership Validation (B2B Requirement)
  v_loc_id := (p_expense->>'location_id')::UUID;
  IF v_loc_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.locations 
      WHERE id = v_loc_id AND tenant_id = v_session_t_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Location does not belong to the current tenant.';
    END IF;
  END IF;

  -- 4. Generate ID
  v_expense_id := COALESCE((p_expense->>'id')::UUID, gen_random_uuid());

  -- 5. Insert or Update Expense Header
  INSERT INTO public.expenses (
    id, tenant_id, location_id, amount, currency, category, date, who, who_id, description,
    ico, receipt_number, transacted_at, vat_detail
  )
  VALUES (
    v_expense_id,
    v_session_t_id,
    v_loc_id,
    (p_expense->>'amount')::NUMERIC,
    COALESCE(p_expense->>'currency', 'EUR'),
    p_expense->>'category',
    (p_expense->>'date')::DATE,
    p_expense->>'who',
    (p_expense->>'who_id')::UUID,
    p_expense->>'description',
    p_expense->>'ico',
    p_expense->>'receipt_number',
    (p_expense->>'transacted_at')::TIMESTAMPTZ,
    (p_expense->>'vat_detail')::JSONB
  )
  ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    category = EXCLUDED.category,
    date = EXCLUDED.date,
    who = EXCLUDED.who,
    description = EXCLUDED.description,
    location_id = EXCLUDED.location_id,
    ico = EXCLUDED.ico,
    receipt_number = EXCLUDED.receipt_number,
    transacted_at = EXCLUDED.transacted_at,
    vat_detail = EXCLUDED.vat_detail;

  -- 6. Wipe old items to prevent duplication on edit
  DELETE FROM public.receipt_items WHERE expense_id = v_expense_id;

  -- 7. Insert fresh items (propagating currency)
  IF p_expense->'items' IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_expense->'items')
    LOOP
      INSERT INTO public.receipt_items (id, expense_id, tenant_id, name, amount, category, currency)
      VALUES (
        gen_random_uuid(),
        v_expense_id,
        v_session_t_id,
        v_item->>'name',
        (v_item->>'amount')::NUMERIC,
        v_item->>'category',
        COALESCE(p_expense->>'currency', 'EUR')
      );
    END LOOP;
  END IF;

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. Recreate RLS Policies
DROP POLICY IF EXISTS "Tenant Isolation" ON public.tenants;
CREATE POLICY "Tenant Isolation" ON public.tenants 
USING (id = public.get_my_tenant()) 
WITH CHECK (id = public.get_my_tenant());

DROP POLICY IF EXISTS "Tenant Isolation" ON public.app_users;
CREATE POLICY "Tenant Isolation" ON public.app_users 
FOR SELECT TO authenticated 
USING (tenant_id = public.get_my_tenant());

DROP POLICY IF EXISTS "Tenant Isolation" ON public.expenses;
CREATE POLICY "Tenant Isolation" ON public.expenses 
USING (tenant_id = public.get_my_tenant())
WITH CHECK (tenant_id = public.get_my_tenant());

DROP POLICY IF EXISTS "Tenant Isolation" ON public.receipt_items;
CREATE POLICY "Tenant Isolation" ON public.receipt_items 
USING (tenant_id = public.get_my_tenant())
WITH CHECK (tenant_id = public.get_my_tenant());

DROP POLICY IF EXISTS "Tenant Isolation" ON public.activity_log;
CREATE POLICY "Tenant Isolation" ON public.activity_log 
FOR SELECT TO authenticated 
USING (tenant_id = public.get_my_tenant());

DROP POLICY IF EXISTS "Tenant Isolation" ON public.locations;
CREATE POLICY "Tenant Isolation" ON public.locations 
USING (tenant_id = public.get_my_tenant())
WITH CHECK (tenant_id = public.get_my_tenant());


-- 8. Recreate Audit Trigger (needs to reference tenant_id)
DROP TRIGGER IF EXISTS trg_audit_expenses ON public.expenses;
DROP FUNCTION IF EXISTS public.audit_expense_mutation() CASCADE;

CREATE OR REPLACE FUNCTION public.audit_expense_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (tenant_id, type, message, user_name)
    VALUES (NEW.tenant_id, 'EXPENSE_ADDED', 'Added ' || NEW.description || ' (€' || NEW.amount || ')', NEW.who);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (tenant_id, type, message, user_name)
    VALUES (OLD.tenant_id, 'EXPENSE_DELETED', 'Removed ' || OLD.description, OLD.who);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_expenses
AFTER INSERT OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.audit_expense_mutation();


COMMIT;
