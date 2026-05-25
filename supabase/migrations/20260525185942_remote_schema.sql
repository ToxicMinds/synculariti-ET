


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_transaction_v3"("p_transaction" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

    v_new_id := COALESCE((p_transaction->>'id')::UUID, gen_random_uuid());

    INSERT INTO transactions (
        id, tenant_id, location_id, who_id, who, category, amount, currency, date, description, ico, receipt_number, transacted_at, vat_detail, transaction_type
    ) VALUES (
        v_new_id, v_tenant_id, (p_transaction->>'location_id')::UUID, (p_transaction->>'who_id')::UUID, p_transaction->>'who', p_transaction->>'category', v_amount, COALESCE(p_transaction->>'currency', 'EUR'), v_date, p_transaction->>'description', p_transaction->>'ico', p_transaction->>'receipt_number', (p_transaction->>'transacted_at')::TIMESTAMP WITH TIME ZONE, p_transaction->'vat_detail', COALESCE(p_transaction->>'transaction_type', 'DEBIT')
    );

    PERFORM public.enqueue_graph_sync_internal(v_tenant_id, 'transaction', v_new_id, 'MERGE', p_transaction);

    RETURN v_new_id;
END;
$$;


ALTER FUNCTION "public"."add_transaction_v3"("p_transaction" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_transactions_bulk_v1"("p_transactions" "jsonb") RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_session_t_id UUID;
  v_results UUID[];
BEGIN
  -- 1. Resolve tenant context
  v_session_t_id := public.get_my_tenant();
  IF v_session_t_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Session tenant context missing.';
  END IF;

  -- 2. Security Validation: Ensure no rogue payloads bypass the session tenant
  IF EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(p_transactions) AS elem
    WHERE NULLIF(elem->>'tenant_id', '') IS NOT NULL 
      AND public.safe_cast_uuid(elem->>'tenant_id') != v_session_t_id
  ) THEN
    RAISE EXCEPTION 'Security Violation: Tenant Mismatch in bulk payload.';
  END IF;

  -- 3. High-Performance Atomic Set-Based Dual-Write (Transactions + Outbox)
  WITH prepared_elements AS (
    SELECT 
      COALESCE(public.safe_cast_uuid(elem->>'id'), gen_random_uuid()) AS id,
      v_session_t_id AS tenant_id,
      NULLIF(elem->>'amount', '')::NUMERIC AS amount,
      elem->>'category' AS category,
      NULLIF(elem->>'date', '')::DATE AS date,
      elem->>'who' AS who,
      public.safe_cast_user_uuid(elem->>'who_id') AS who_id, -- Safe polymorphic casting
      elem->>'description' AS description,
      COALESCE(NULLIF(elem->>'currency', ''), 'EUR') AS currency,
      public.safe_cast_uuid(elem->>'location_id') AS location_id, -- Safe cast
      COALESCE(NULLIF(elem->>'transaction_type', ''), 'DEBIT') AS transaction_type,
      elem AS raw_payload
    FROM jsonb_array_elements(p_transactions) AS elem
  ),
  inserted_rows AS (
    INSERT INTO public.transactions (
      id, tenant_id, amount, category, date, who, who_id, description, currency, location_id, transaction_type
    )
    SELECT id, tenant_id, amount, category, date, who, who_id, description, currency, location_id, transaction_type
    FROM prepared_elements
    RETURNING id
  ),
  inserted_outbox AS (
    INSERT INTO public.graph_sync_queue (
      tenant_id, entity_type, entity_id, operation, payload
    )
    SELECT 
      tenant_id, 
      'transaction', 
      id, 
      'MERGE', 
      to_jsonb(p) - 'raw_payload' -- Converts the validated, clean prepared row straight into clean JSONB
    FROM prepared_elements p
  )
  SELECT array_agg(id) INTO v_results FROM inserted_rows;

  RETURN COALESCE(v_results, '{}');
END;
$$;


ALTER FUNCTION "public"."add_transactions_bulk_v1"("p_transactions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_expense_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (tenant_id, action, description, actor_name)
    VALUES (NEW.tenant_id, 'EXPENSE_ADDED', 'Added ' || NEW.description || ' (€' || NEW.amount || ')', NEW.who);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.activity_log (tenant_id, action, description, actor_name)
    VALUES (OLD.tenant_id, 'EXPENSE_DELETED', 'Removed ' || OLD.description, OLD.who);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."audit_expense_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_invoice_outbox_signal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- If status changed to PAID, emit a signal automatically in the same transaction
  IF (TG_OP = 'UPDATE') AND NEW.status = 'PAID' AND OLD.status != 'PAID' THEN
    INSERT INTO public.outbox_events (tenant_id, event_type, payload)
    VALUES (NEW.tenant_id, 'INVOICE_PAID', jsonb_build_object('invoice_id', NEW.id, 'vendor_id', NEW.vendor_id));
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_invoice_outbox_signal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_ip_hash" "text", "p_action" "text", "p_max_attempts" integer DEFAULT 5, "p_window_minutes" integer DEFAULT 15, "p_block_minutes" integer DEFAULT 60) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_record public.rate_limits%ROWTYPE;
    v_now TIMESTAMPTZ := NOW();
    v_retry_after INT := 0;
BEGIN
    INSERT INTO public.rate_limits (ip_hash, action_type, attempt_count, window_start)
    VALUES (p_ip_hash, p_action, 1, v_now)
    ON CONFLICT (ip_hash, action_type) DO UPDATE SET
        attempt_count = CASE 
            WHEN rate_limits.window_start < v_now - (p_window_minutes || ' minutes')::INTERVAL 
            THEN 1 
            ELSE rate_limits.attempt_count + 1 
        END,
        window_start = CASE 
            WHEN rate_limits.window_start < v_now - (p_window_minutes || ' minutes')::INTERVAL 
            THEN v_now 
            ELSE rate_limits.window_start 
        END,
        blocked_until = CASE 
            -- Block if they hit the limit within the window OR they are already blocked
            WHEN (rate_limits.attempt_count + 1 >= p_max_attempts AND rate_limits.window_start >= v_now - (p_window_minutes || ' minutes')::INTERVAL)
                 OR (rate_limits.blocked_until > v_now)
            THEN GREATEST(COALESCE(rate_limits.blocked_until, v_now), v_now) + (p_block_minutes || ' minutes')::INTERVAL 
            ELSE NULL 
        END
    RETURNING * INTO v_record;
    
    IF v_record.blocked_until > v_now THEN
        v_retry_after := EXTRACT(EPOCH FROM (v_record.blocked_until - v_now))::INT;
    END IF;

    RETURN jsonb_build_object(
        'allowed', v_record.blocked_until IS NULL OR v_record.blocked_until < v_now,
        'remaining_attempts', GREATEST(0, p_max_attempts - v_record.attempt_count),
        'retry_after_seconds', v_retry_after
    );
END;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_ip_hash" "text", "p_action" "text", "p_max_attempts" integer, "p_window_minutes" integer, "p_block_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_tenant_pin"("h_id" "uuid", "input_pin" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.tenants 
        WHERE id = h_id 
          AND config->>'pin' = input_pin
    );
END;
$$;


ALTER FUNCTION "public"."check_tenant_pin"("h_id" "uuid", "input_pin" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_procurement_signal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  IF NEW.event_type = 'PROCUREMENT_RECEIVED' THEN
    -- SAFE CAST: vendor_id
    BEGIN
      v_vendor_id := (NEW.payload->>'vendor_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_vendor_id := NULL; 
    END;

    INSERT INTO public.invoices (tenant_id, location_id, vendor_id, total_amount, currency, status, invoice_number)
    VALUES (
      NEW.tenant_id, 
      NULLIF(NEW.payload->>'location_id', '')::UUID, 
      v_vendor_id, 
      (NEW.payload->>'total_amount')::NUMERIC,
      COALESCE(NEW.payload->>'currency', 'EUR'),
      'PENDING',
      'PO-' || upper(substr(NEW.payload->>'po_id', 1, 8))
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."consume_procurement_signal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_inventory_item_v1"("p_item" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_inventory_item_v1"("p_item" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization"("p_name" "text", "p_handle" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_tenant_id UUID;
    v_email TEXT;
BEGIN
    v_email := auth.jwt()->>'email';
    IF v_email IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if handle already exists
    IF EXISTS (SELECT 1 FROM public.tenants WHERE lower(handle) = lower(p_handle)) THEN
        RAISE EXCEPTION 'Access code % is already taken.', p_handle;
    END IF;

    -- Create Tenant
    v_tenant_id := gen_random_uuid();
    INSERT INTO public.tenants (id, name, handle)
    VALUES (v_tenant_id, p_name, lower(p_handle));

    -- Add Creator as OWNER
    INSERT INTO public.tenant_members (tenant_id, email, role)
    VALUES (v_tenant_id, v_email, 'OWNER');

    -- Auto-switch to the new organization
    PERFORM public.switch_tenant(v_tenant_id);

    RETURN v_tenant_id;
END;
$$;


ALTER FUNCTION "public"."create_organization"("p_name" "text", "p_handle" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_graph_sync_internal"("p_tenant_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_operation" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO public.graph_sync_queue (tenant_id, entity_type, entity_id, operation, payload)
    VALUES (p_tenant_id, p_entity_type, p_entity_id, p_operation, p_payload);
END;
$$;


ALTER FUNCTION "public"."enqueue_graph_sync_internal"("p_tenant_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_operation" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_function_security_state"("p_func_name" "text", "p_args_signature" "text") RETURNS TABLE("func_exists" boolean, "has_search_path_public" boolean, "is_revoked_from_public" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
  v_has_search_path BOOLEAN := FALSE;
  v_is_revoked BOOLEAN := FALSE;
  v_func_oid OID;
  v_proconfig TEXT[];
BEGIN
  -- 1. Check if the function exists in schema 'public' with the matching parameter type signature
  SELECT p.oid, p.proconfig INTO v_func_oid, v_proconfig
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = p_func_name
    AND pg_catalog.oidvectortypes(p.proargtypes) = p_args_signature;

  IF v_func_oid IS NOT NULL THEN
    v_exists := TRUE;

    -- 2. Check if search_path = public is strictly set in the function config
    IF v_proconfig IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 
        FROM unnest(v_proconfig) cfg 
        WHERE lower(replace(cfg, ' ', '')) = 'search_path=public'
      ) INTO v_has_search_path;
    END IF;

    -- 3. Check if both 'anon' and 'public' roles do NOT have execute privilege
    IF NOT pg_catalog.has_function_privilege('anon', v_func_oid, 'EXECUTE')
       AND NOT pg_catalog.has_function_privilege('public', v_func_oid, 'EXECUTE') THEN
      v_is_revoked := TRUE;
    END IF;
  END IF;

  RETURN QUERY SELECT v_exists, v_has_search_path, v_is_revoked;
END;
$$;


ALTER FUNCTION "public"."get_function_security_state"("p_func_name" "text", "p_args_signature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_available_tenants"() RETURNS TABLE("tenant_id" "uuid", "tenant_name" "text", "tenant_handle" "text", "user_role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as tenant_id,
        t.name as tenant_name,
        t.handle as tenant_handle,
        tm.role as user_role
    FROM public.tenants t
    JOIN public.tenant_members tm ON t.id = tm.tenant_id
    WHERE tm.email = auth.jwt()->>'email';
END;
$$;


ALTER FUNCTION "public"."get_my_available_tenants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_tenant"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_t_id UUID;
BEGIN
  -- Check if we already cached it in this transaction
  v_t_id := NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
  
  IF v_t_id IS NULL THEN
    -- Look it up
    SELECT tenant_id INTO v_t_id FROM public.app_users WHERE id = auth.uid() LIMIT 1;
    
    -- Cache it for the rest of the transaction
    IF v_t_id IS NOT NULL THEN
      PERFORM set_config('app.current_tenant_id', v_t_id::TEXT, true);
    END IF;
  END IF;

  RETURN v_t_id;
END;
$$;


ALTER FUNCTION "public"."get_my_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_bundle"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_tenant_bundle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tenant_management_privileged"("p_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.tenant_members 
        WHERE tenant_id = p_tenant_id
          AND email = auth.jwt()->>'email' 
          AND role IN ('OWNER', 'ADMIN')
    );
END;
$$;


ALTER FUNCTION "public"."is_tenant_management_privileged"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_expense_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.activity_log (household_id, type, message, user_name)
    VALUES (NEW.household_id, 'EXPENSE_ADDED', 'Added ' || NEW.description || ' (€' || NEW.amount || ')', NEW.who);
  ELSIF (TG_OP = 'UPDATE') AND NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
    INSERT INTO public.activity_log (household_id, type, message, user_name)
    VALUES (NEW.household_id, 'EXPENSE_DELETED', 'Removed ' || OLD.description, NEW.who);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_expense_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_outbox_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM pg_notify('synculariti_finance_events', json_build_object(
    'id', NEW.id,
    'event_type', NEW.event_type,
    'tenant_id', NEW.tenant_id
  )::text);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_outbox_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_expired_whatsapp_logs"("days_to_keep" integer DEFAULT 30) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.whatsapp_outbox 
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  DELETE FROM public.whatsapp_inbox 
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
END;
$$;


ALTER FUNCTION "public"."purge_expired_whatsapp_logs"("days_to_keep" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_purchase_order_v1"("p_po_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

    -- Update PO Status
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


ALTER FUNCTION "public"."receive_purchase_order_v1"("p_po_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_cast_user_uuid"("p_val" "text") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'public'
    AS $_$
  SELECT CASE 
    -- Case A: Valid UUID (Length check prevents executing regex on short mock IDs)
    WHEN length(p_val) = 36 AND p_val ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' 
      THEN p_val::UUID
    -- Case B: Mock user IDs ('u1', 'u25', up to 12 digits to prevent lpad overflows)
    WHEN p_val ~ '^u[0-9]{1,12}$' 
      THEN ('00000000-0000-0000-0000-' || lpad(substring(p_val from 2), 12, '0'))::UUID
    -- Case C: Empty string
    WHEN p_val = '' 
      THEN NULL
    -- Case D: Fallback for unmappable non-empty strings (including mock overflow)
    ELSE '00000000-0000-0000-0000-000000000000'::UUID
  END;
$_$;


ALTER FUNCTION "public"."safe_cast_user_uuid"("p_val" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_cast_uuid"("p_val" "text") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'public'
    AS $_$
  SELECT CASE 
    WHEN length(p_val) = 36 AND p_val ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' 
      THEN p_val::UUID
    ELSE NULL
  END;
$_$;


ALTER FUNCTION "public"."safe_cast_uuid"("p_val" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.save_receipt_v3(p_expense, p_expense->'items', (p_expense->>'location_id')::UUID);
END;
$$;


ALTER FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.save_receipt_v3(p_expense, p_items, (p_expense->>'location_id')::UUID);
END;
$$;


ALTER FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_transaction_id UUID;
  v_session_t_id UUID;
  v_currency TEXT;
BEGIN
  v_session_t_id := public.get_my_tenant();
  
  -- 1. Dual-Layer Validation
  IF (p_expense->>'tenant_id')::UUID != v_session_t_id THEN
    RAISE EXCEPTION 'Security Violation: Tenant Mismatch.';
  END IF;

  IF p_location_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND tenant_id = v_session_t_id) THEN
      RAISE EXCEPTION 'Security Violation: Location does not belong to tenant.';
    END IF;
  END IF;

  -- 2. Currency Validation
  v_currency := COALESCE(p_expense->>'currency', 'EUR');
  IF char_length(v_currency) != 3 THEN
    RAISE EXCEPTION 'Validation Error: Currency must be a 3-letter ISO code.';
  END IF;

  -- 3. Insert Transaction
  INSERT INTO public.transactions (
    id, tenant_id, amount, category, date, who, who_id, description, currency, location_id, transaction_type
  ) VALUES (
    COALESCE((p_expense->>'id')::UUID, gen_random_uuid()),
    v_session_t_id,
    (p_expense->>'amount')::NUMERIC,
    p_expense->>'category',
    (p_expense->>'date')::DATE,
    p_expense->>'who',
    (p_expense->>'who_id')::UUID,
    p_expense->>'description',
    v_currency,
    p_location_id,
    COALESCE(p_expense->>'transaction_type', 'DEBIT')
  ) ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    category = EXCLUDED.category,
    date = EXCLUDED.date,
    who = EXCLUDED.who,
    description = EXCLUDED.description,
    location_id = EXCLUDED.location_id,
    currency = EXCLUDED.currency
  RETURNING id INTO v_transaction_id;

  -- 4. Wipe old items to prevent duplication
  DELETE FROM public.receipt_items WHERE transaction_id = v_transaction_id;

  -- 5. Bulk Insert Items
  INSERT INTO public.receipt_items (id, transaction_id, tenant_id, name, amount, category, currency)
  SELECT 
    COALESCE(id, gen_random_uuid()), v_transaction_id, v_session_t_id, name, amount, category, v_currency
  FROM jsonb_to_recordset(p_items) AS x(id UUID, name TEXT, amount NUMERIC, category TEXT);

  RETURN v_transaction_id;
END;
$$;


ALTER FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_receipt_v4"("p_transaction" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_transaction_id UUID;
  v_session_t_id UUID;
  v_currency TEXT;
BEGIN
  -- Security: Deriving tenant from session (RLS)
  v_session_t_id := public.get_my_tenant();
  IF v_session_t_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Session tenant context missing.';
  END IF;
  
  -- Dual-Layer Validation
  IF (p_transaction->>'tenant_id')::UUID != v_session_t_id THEN
    RAISE EXCEPTION 'Security Violation: Tenant Mismatch.';
  END IF;

  IF p_location_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND tenant_id = v_session_t_id) THEN
      RAISE EXCEPTION 'Security Violation: Location Ownership Mismatch.';
    END IF;
  END IF;

  -- Currency Sanitization
  v_currency := COALESCE(NULLIF(p_transaction->>'currency', ''), 'EUR');
  IF char_length(v_currency) != 3 THEN
    RAISE EXCEPTION 'Validation Error: Invalid currency ISO code.';
  END IF;

  -- Generate or preserve ID
  v_transaction_id := COALESCE((p_transaction->>'id')::UUID, gen_random_uuid());

  -- Step 1: Atomic Transaction Upsert
  INSERT INTO public.transactions (
    id, tenant_id, location_id, amount, currency, category, date, who, who_id, description,
    ico, receipt_number, transacted_at, vat_detail, transaction_type
  ) VALUES (
    v_transaction_id,
    v_session_t_id,
    p_location_id,
    (p_transaction->>'amount')::NUMERIC,
    v_currency,
    p_transaction->>'category',
    (p_transaction->>'date')::DATE,
    p_transaction->>'who',
    public.safe_cast_user_uuid(p_transaction->>'who_id'), -- Safe polymorphic user uuid casting
    p_transaction->>'description',
    p_transaction->>'ico',
    p_transaction->>'receipt_number',
    (p_transaction->>'transacted_at')::TIMESTAMPTZ,
    (p_transaction->>'vat_detail')::JSONB,
    COALESCE(p_transaction->>'transaction_type', 'DEBIT')
  )
  ON CONFLICT (id) DO UPDATE SET
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    category = EXCLUDED.category,
    date = EXCLUDED.date,
    description = EXCLUDED.description,
    ico = EXCLUDED.ico,
    receipt_number = EXCLUDED.receipt_number,
    transacted_at = EXCLUDED.transacted_at,
    vat_detail = EXCLUDED.vat_detail,
    updated_at = now();

  -- Step 2: Atomic Item Re-sync (Clean & Insert using the correct transaction_id column)
  DELETE FROM public.receipt_items WHERE transaction_id = v_transaction_id;
  
  INSERT INTO public.receipt_items (id, transaction_id, tenant_id, name, amount, category, currency)
  SELECT 
    COALESCE((item->>'id')::UUID, gen_random_uuid()), 
    v_transaction_id, 
    v_session_t_id, 
    item->>'name', 
    (item->>'amount')::NUMERIC, 
    item->>'category', 
    v_currency
  FROM jsonb_array_elements(p_items) AS item;

  -- ENQUEUE FOR GRAPH
  PERFORM public.enqueue_graph_sync_internal(v_session_t_id, 'transaction', v_transaction_id, 'MERGE', p_transaction);

  RETURN v_transaction_id;
END;
$$;


ALTER FUNCTION "public"."save_receipt_v4"("p_transaction" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."signal_procurement_to_finance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND NEW.status = 'RECEIVED' AND OLD.status != 'RECEIVED' THEN
    INSERT INTO public.outbox_events (tenant_id, event_type, payload)
    VALUES (NEW.tenant_id, 'PROCUREMENT_RECEIVED', jsonb_build_object(
      'po_id', NEW.id,
      'location_id', NEW.location_id,
      'vendor_id', NEW.vendor_id,
      'total_amount', NEW.total_amount,
      'currency', NEW.currency
    ));
    
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
$$;


ALTER FUNCTION "public"."signal_procurement_to_finance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."soft_delete_transaction_v1"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_tenant_id UUID;
    v_updated_at TIMESTAMP WITH TIME ZONE;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    UPDATE transactions
    SET is_deleted = true, updated_at = NOW()
    WHERE id = p_id AND tenant_id = v_tenant_id
    RETURNING updated_at INTO v_updated_at;

    IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;

    PERFORM public.enqueue_graph_sync_internal(v_tenant_id, 'transaction', p_id, 'DELETE', '{}'::JSONB);

    RETURN jsonb_build_object('id', p_id, 'updated_at', v_updated_at);
END;
$$;


ALTER FUNCTION "public"."soft_delete_transaction_v1"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_email TEXT;
BEGIN
    v_email := auth.jwt()->>'email';
    
    -- Security Check: Ensure the user is actually a member
    IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = p_tenant_id AND email = v_email) THEN
        RAISE EXCEPTION 'Access denied. You are not a member of this organization.';
    END IF;

    -- Update or Insert into app_users to set the "active" tenant
    INSERT INTO public.app_users (id, tenant_id)
    VALUES (auth.uid(), p_tenant_id)
    ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, updated_at = NOW();
    
    -- Clear session cache for the helper function
    PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, true);
END;
$$;


ALTER FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_modified_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_modified_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tenant_config_v1"("p_config" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_tenant_id UUID;
    v_result JSONB;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated or tenant context missing';
    END IF;

    -- Deep Merge JSONB using || operator (allows patch updates)
    UPDATE tenants
    SET config = config || p_config, updated_at = NOW()
    WHERE id = v_tenant_id
    RETURNING jsonb_build_object('id', id, 'updated_at', updated_at) INTO v_result;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant not found or access denied';
    END IF;

    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."update_tenant_config_v1"("p_config" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_transaction_v1"("p_id" "uuid", "p_transaction" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_tenant_id UUID;
    v_updated_at TIMESTAMP WITH TIME ZONE;
    v_full_row JSONB;
BEGIN
    v_tenant_id := get_my_tenant();
    IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    UPDATE transactions
    SET
        amount = COALESCE(NULLIF(p_transaction->>'amount', '')::NUMERIC, amount),
        category = COALESCE(p_transaction->>'category', category),
        date = COALESCE(NULLIF(p_transaction->>'date', '')::DATE, date),
        description = COALESCE(p_transaction->>'description', description),
        currency = COALESCE(p_transaction->>'currency', currency),
        vat_detail = COALESCE(p_transaction->'vat_detail', vat_detail),
        updated_at = NOW()
    WHERE id = p_id AND tenant_id = v_tenant_id
    RETURNING updated_at, to_jsonb(transactions.*) INTO v_updated_at, v_full_row;

    IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;

    PERFORM public.enqueue_graph_sync_internal(v_tenant_id, 'transaction', p_id, 'MERGE', v_full_row);

    RETURN jsonb_build_object('id', p_id, 'updated_at', v_updated_at);
END;
$$;


ALTER FUNCTION "public"."update_transaction_v1"("p_id" "uuid", "p_transaction" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_app_user_v1"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
BEGIN
    v_user_id := auth.uid();
    v_email := auth.jwt()->>'email';
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Security Check to prevent user hopping: Check if the user's email is invited/linked to this tenant
    IF NOT EXISTS (SELECT 1 FROM tenant_members WHERE tenant_id = p_tenant_id AND email = v_email) THEN
        RAISE EXCEPTION 'Access denied. Email % is not authorized for tenant %', v_email, p_tenant_id;
    END IF;

    -- The UI passes a tenant_id to link the user context
    INSERT INTO app_users (id, tenant_id)
    VALUES (v_user_id, p_tenant_id)
    ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."upsert_app_user_v1"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_tenant_access"("input_code" "text") RETURNS TABLE("target_id" "uuid", "target_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT id, name
    FROM public.tenants
    WHERE lower(handle) = lower(input_code);
END;
$$;


ALTER FUNCTION "public"."verify_tenant_access"("input_code" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "description" "text" NOT NULL,
    "actor_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "key_value" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."api_keys" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chart_of_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "account_code" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chart_of_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['ASSET'::"text", 'LIABILITY'::"text", 'EQUITY'::"text", 'REVENUE'::"text", 'EXPENSE'::"text"])))
);


ALTER TABLE "public"."chart_of_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "item_id" "uuid" NOT NULL,
    "change_amount" numeric NOT NULL,
    "reason" "text" NOT NULL,
    "reference_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_ledger_reason_check" CHECK (("reason" = ANY (ARRAY['RECEIPT'::"text", 'SALE'::"text", 'WASTE'::"text", 'ADJUSTMENT'::"text", 'TRANSFER'::"text"])))
);


ALTER TABLE "public"."inventory_ledger" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."current_inventory" WITH ("security_invoker"='true') AS
 SELECT "tenant_id",
    "location_id",
    "item_id",
    "sum"("change_amount") AS "stock_level",
    "max"("created_at") AS "last_movement"
   FROM "public"."inventory_ledger"
  GROUP BY "tenant_id", "location_id", "item_id";


ALTER VIEW "public"."current_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."graph_sync_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    CONSTRAINT "graph_sync_queue_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['transaction'::"text", 'merchant'::"text"]))),
    CONSTRAINT "graph_sync_queue_operation_check" CHECK (("operation" = ANY (ARRAY['MERGE'::"text", 'DELETE'::"text"]))),
    CONSTRAINT "graph_sync_queue_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PROCESSING'::"text", 'COMPLETED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."graph_sync_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "purchasing_uom" "text" NOT NULL,
    "inventory_uom" "text" NOT NULL,
    "conversion_factor" numeric DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_items_conversion_factor_check" CHECK (("conversion_factor" > (0)::numeric)),
    CONSTRAINT "inventory_items_type_check" CHECK (("type" = ANY (ARRAY['RAW'::"text", 'PREP'::"text", 'SERVICE'::"text"])))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "account_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit_price" numeric NOT NULL,
    "tax_rate" numeric DEFAULT 0,
    "line_total" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "vendor_id" "uuid",
    "invoice_number" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "due_date" "date",
    "total_amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "raw_file_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "invoices_currency_check" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "invoices_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'PAID'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "invoices_total_amount_check" CHECK (("total_amount" >= (0)::numeric))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."locations" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."outbox_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "processed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."outbox_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."po_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "po_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "quantity_ordered" numeric NOT NULL,
    "quantity_received" numeric DEFAULT 0 NOT NULL,
    "unit_price" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."po_line_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "vendor_id" "uuid",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "order_date" timestamp with time zone DEFAULT "now"(),
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "purchase_orders_currency_check" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "purchase_orders_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'SUBMITTED'::"text", 'RECEIVED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "ip_hash" "text" NOT NULL,
    "action_type" "text" DEFAULT 'pin_auth'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 1,
    "window_start" timestamp with time zone DEFAULT "now"(),
    "blocked_until" timestamp with time zone
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipt_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "category" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    CONSTRAINT "receipt_items_currency_check" CHECK (("length"("currency") = 3))
);


ALTER TABLE "public"."receipt_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_telemetry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid",
    "level" "text" NOT NULL,
    "component" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."system_telemetry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'MEMBER'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."tenant_members" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "categories" "jsonb" DEFAULT '[]'::"jsonb",
    "total_budget" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "handle" "text",
    "config" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "category" "text" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "who" "text",
    "who_id" "uuid",
    "description" "text",
    "is_deleted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location_id" "uuid",
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "ico" "text",
    "receipt_number" "text",
    "transacted_at" timestamp with time zone,
    "vat_detail" "jsonb",
    "transaction_type" "text" DEFAULT 'DEBIT'::"text",
    "invoice_id" "uuid",
    "account_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "expenses_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "expenses_currency_check" CHECK (("length"("currency") = 3)),
    CONSTRAINT "transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['DEBIT'::"text", 'CREDIT'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_inbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "outbox_id" "uuid",
    "sender_phone" "text" NOT NULL,
    "message_id" "text" NOT NULL,
    "message_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."whatsapp_inbox" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_inbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "api_key_id" "uuid",
    "recipient_phone" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "whatsapp_message_id" "text",
    "webhook_url" "text",
    "webhook_secret" "text"
);

ALTER TABLE ONLY "public"."whatsapp_outbox" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_outbox" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_value_key" UNIQUE ("key_value");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "app_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_tenant_id_account_code_key" UNIQUE ("tenant_id", "account_code");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."graph_sync_queue"
    ADD CONSTRAINT "graph_sync_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_categories"
    ADD CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_categories"
    ADD CONSTRAINT "inventory_categories_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_tenant_id_sku_key" UNIQUE ("tenant_id", "sku");



ALTER TABLE ONLY "public"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."outbox_events"
    ADD CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."po_line_items"
    ADD CONSTRAINT "po_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("ip_hash", "action_type");



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_telemetry"
    ADD CONSTRAINT "system_telemetry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_tenant_id_email_key" UNIQUE ("tenant_id", "email");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "unique_location_name_per_household" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."whatsapp_inbox"
    ADD CONSTRAINT "whatsapp_inbox_message_id_key" UNIQUE ("message_id");



ALTER TABLE ONLY "public"."whatsapp_inbox"
    ADD CONSTRAINT "whatsapp_inbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_whatsapp_message_id_key" UNIQUE ("whatsapp_message_id");



CREATE INDEX "idx_activity_log_household" ON "public"."activity_log" USING "btree" ("tenant_id");



CREATE INDEX "idx_expenses_household" ON "public"."transactions" USING "btree" ("tenant_id");



CREATE INDEX "idx_expenses_location_date" ON "public"."transactions" USING "btree" ("location_id", "date" DESC);



CREATE INDEX "idx_graph_sync_pending" ON "public"."graph_sync_queue" USING "btree" ("status", "created_at") WHERE ("status" = 'PENDING'::"text");



CREATE INDEX "idx_locations_household" ON "public"."locations" USING "btree" ("tenant_id");



CREATE INDEX "idx_locations_metadata" ON "public"."locations" USING "gin" ("metadata");



CREATE INDEX "idx_members_email" ON "public"."tenant_members" USING "btree" ("email");



CREATE INDEX "idx_receipt_items_expense" ON "public"."receipt_items" USING "btree" ("transaction_id");



CREATE INDEX "idx_tenant_members_email" ON "public"."tenant_members" USING "btree" ("email");



CREATE INDEX "idx_transactions_invoice" ON "public"."transactions" USING "btree" ("invoice_id");



CREATE OR REPLACE TRIGGER "trg_audit_expenses" AFTER INSERT OR DELETE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_expense_mutation"();



CREATE OR REPLACE TRIGGER "trg_auto_invoice_outbox_signal" AFTER UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."auto_invoice_outbox_signal"();



CREATE OR REPLACE TRIGGER "trg_consume_procurement_signal" AFTER INSERT ON "public"."outbox_events" FOR EACH ROW EXECUTE FUNCTION "public"."consume_procurement_signal"();



CREATE OR REPLACE TRIGGER "trg_invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "trg_notify_outbox" AFTER INSERT ON "public"."outbox_events" FOR EACH ROW EXECUTE FUNCTION "public"."notify_outbox_event"();



CREATE OR REPLACE TRIGGER "trg_signal_procurement_to_finance" AFTER UPDATE ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."signal_procurement_to_finance"();



CREATE OR REPLACE TRIGGER "trg_tenant_members_updated_at" BEFORE UPDATE ON "public"."tenant_members" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_update_app_state" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "trg_update_app_users" BEFORE UPDATE ON "public"."app_users" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "trg_update_locations" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_household_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_household_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "expenses_household_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "expenses_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."graph_sync_queue"
    ADD CONSTRAINT "graph_sync_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_categories"
    ADD CONSTRAINT "inventory_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_ledger"
    ADD CONSTRAINT "inventory_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_household_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."outbox_events"
    ADD CONSTRAINT "outbox_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."po_line_items"
    ADD CONSTRAINT "po_line_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."po_line_items"
    ADD CONSTRAINT "po_line_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."po_line_items"
    ADD CONSTRAINT "po_line_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_household_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."receipt_items"
    ADD CONSTRAINT "receipt_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_telemetry"
    ADD CONSTRAINT "system_telemetry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_inbox"
    ADD CONSTRAINT "whatsapp_inbox_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "public"."whatsapp_outbox"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_inbox"
    ADD CONSTRAINT "whatsapp_inbox_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_outbox"
    ADD CONSTRAINT "whatsapp_outbox_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



CREATE POLICY "Enable insert for authenticated users" ON "public"."activity_log" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."system_telemetry" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Members see own" ON "public"."tenant_members" FOR SELECT TO "authenticated" USING (("email" = "auth"."email"()));



CREATE POLICY "Service Role Only" ON "public"."graph_sync_queue" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Tenant Isolation" ON "public"."activity_log" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."app_users" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("tenant_id" = "public"."get_my_tenant"())));



CREATE POLICY "Tenant Isolation" ON "public"."chart_of_accounts" TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."inventory_categories" TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."inventory_items" TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."inventory_ledger" TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."invoice_items" TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."invoices" TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."locations" USING (("tenant_id" = "public"."get_my_tenant"())) WITH CHECK (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."outbox_events" TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."po_line_items" TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."purchase_orders" TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."receipt_items" USING (("tenant_id" = "public"."get_my_tenant"())) WITH CHECK (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."system_telemetry" FOR SELECT TO "authenticated" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."tenants" USING (("id" = "public"."get_my_tenant"())) WITH CHECK (("id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant Isolation" ON "public"."transactions" USING (("tenant_id" = "public"."get_my_tenant"())) WITH CHECK (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant isolation api_keys" ON "public"."api_keys" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant isolation inbox" ON "public"."whatsapp_inbox" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant isolation outbox" ON "public"."whatsapp_outbox" USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant members can view other members" ON "public"."tenant_members" FOR SELECT USING (("tenant_id" = "public"."get_my_tenant"()));



CREATE POLICY "Tenant owners can manage members" ON "public"."tenant_members" USING ((("tenant_id" = "public"."get_my_tenant"()) AND "public"."is_tenant_management_privileged"("tenant_id")));



CREATE POLICY "Users can manage their own row" ON "public"."app_users" TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "Users can view their own memberships" ON "public"."tenant_members" FOR SELECT USING (("email" = ("auth"."jwt"() ->> 'email'::"text")));



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chart_of_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."graph_sync_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."outbox_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."po_line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipt_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_telemetry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_inbox" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_outbox" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."add_transaction_v3"("p_transaction" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_transaction_v3"("p_transaction" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_transaction_v3"("p_transaction" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_transactions_bulk_v1"("p_transactions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_transactions_bulk_v1"("p_transactions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_transactions_bulk_v1"("p_transactions" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_expense_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_expense_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_expense_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_invoice_outbox_signal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_invoice_outbox_signal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_invoice_outbox_signal"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_ip_hash" "text", "p_action" "text", "p_max_attempts" integer, "p_window_minutes" integer, "p_block_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_ip_hash" "text", "p_action" "text", "p_max_attempts" integer, "p_window_minutes" integer, "p_block_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_ip_hash" "text", "p_action" "text", "p_max_attempts" integer, "p_window_minutes" integer, "p_block_minutes" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_tenant_pin"("h_id" "uuid", "input_pin" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_tenant_pin"("h_id" "uuid", "input_pin" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_tenant_pin"("h_id" "uuid", "input_pin" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_procurement_signal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_procurement_signal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_procurement_signal"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_inventory_item_v1"("p_item" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_inventory_item_v1"("p_item" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_inventory_item_v1"("p_item" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_handle" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_handle" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_graph_sync_internal"("p_tenant_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_operation" "text", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_graph_sync_internal"("p_tenant_id" "uuid", "p_entity_type" "text", "p_entity_id" "uuid", "p_operation" "text", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_function_security_state"("p_func_name" "text", "p_args_signature" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_function_security_state"("p_func_name" "text", "p_args_signature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_function_security_state"("p_func_name" "text", "p_args_signature" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_available_tenants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_available_tenants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_available_tenants"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_tenant"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_tenant_bundle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tenant_bundle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_bundle"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_tenant_management_privileged"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_tenant_management_privileged"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tenant_management_privileged"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_expense_activity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_expense_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_expense_activity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_outbox_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_outbox_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_outbox_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_expired_whatsapp_logs"("days_to_keep" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_expired_whatsapp_logs"("days_to_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_expired_whatsapp_logs"("days_to_keep" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."receive_purchase_order_v1"("p_po_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."receive_purchase_order_v1"("p_po_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_purchase_order_v1"("p_po_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."safe_cast_user_uuid"("p_val" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."safe_cast_user_uuid"("p_val" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_cast_user_uuid"("p_val" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."safe_cast_uuid"("p_val" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."safe_cast_uuid"("p_val" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_cast_uuid"("p_val" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_receipt_v3"("p_expense" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_receipt_v4"("p_transaction" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_receipt_v4"("p_transaction" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_receipt_v4"("p_transaction" "jsonb", "p_items" "jsonb", "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."signal_procurement_to_finance"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."signal_procurement_to_finance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."signal_procurement_to_finance"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."soft_delete_transaction_v1"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."soft_delete_transaction_v1"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."soft_delete_transaction_v1"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."switch_tenant"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_modified_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_tenant_config_v1"("p_config" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_tenant_config_v1"("p_config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_config_v1"("p_config" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_transaction_v1"("p_id" "uuid", "p_transaction" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_transaction_v1"("p_id" "uuid", "p_transaction" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_transaction_v1"("p_id" "uuid", "p_transaction" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_app_user_v1"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_app_user_v1"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_app_user_v1"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_tenant_access"("input_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_tenant_access"("input_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_tenant_access"("input_code" "text") TO "service_role";


















GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."inventory_ledger" TO "anon";
GRANT ALL ON TABLE "public"."inventory_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."current_inventory" TO "anon";
GRANT ALL ON TABLE "public"."current_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."current_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."graph_sync_queue" TO "anon";
GRANT ALL ON TABLE "public"."graph_sync_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."graph_sync_queue" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."inventory_categories" TO "anon";
GRANT ALL ON TABLE "public"."inventory_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_categories" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."outbox_events" TO "anon";
GRANT ALL ON TABLE "public"."outbox_events" TO "authenticated";
GRANT ALL ON TABLE "public"."outbox_events" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."po_line_items" TO "anon";
GRANT ALL ON TABLE "public"."po_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."po_line_items" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."receipt_items" TO "anon";
GRANT ALL ON TABLE "public"."receipt_items" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_items" TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."system_telemetry" TO "anon";
GRANT ALL ON TABLE "public"."system_telemetry" TO "authenticated";
GRANT ALL ON TABLE "public"."system_telemetry" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenant_members" TO "anon";
GRANT ALL ON TABLE "public"."tenant_members" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_members" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_inbox" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_inbox" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_inbox" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_outbox" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_outbox" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

revoke delete on table "public"."activity_log" from "anon";

revoke update on table "public"."activity_log" from "anon";

revoke delete on table "public"."app_users" from "anon";

revoke insert on table "public"."app_users" from "anon";

revoke update on table "public"."app_users" from "anon";

revoke delete on table "public"."chart_of_accounts" from "anon";

revoke insert on table "public"."chart_of_accounts" from "anon";

revoke update on table "public"."chart_of_accounts" from "anon";

revoke delete on table "public"."inventory_categories" from "anon";

revoke insert on table "public"."inventory_categories" from "anon";

revoke update on table "public"."inventory_categories" from "anon";

revoke delete on table "public"."inventory_items" from "anon";

revoke insert on table "public"."inventory_items" from "anon";

revoke update on table "public"."inventory_items" from "anon";

revoke delete on table "public"."inventory_ledger" from "anon";

revoke insert on table "public"."inventory_ledger" from "anon";

revoke update on table "public"."inventory_ledger" from "anon";

revoke delete on table "public"."invoice_items" from "anon";

revoke insert on table "public"."invoice_items" from "anon";

revoke update on table "public"."invoice_items" from "anon";

revoke delete on table "public"."invoices" from "anon";

revoke insert on table "public"."invoices" from "anon";

revoke update on table "public"."invoices" from "anon";

revoke delete on table "public"."locations" from "anon";

revoke insert on table "public"."locations" from "anon";

revoke update on table "public"."locations" from "anon";

revoke delete on table "public"."outbox_events" from "anon";

revoke insert on table "public"."outbox_events" from "anon";

revoke update on table "public"."outbox_events" from "anon";

revoke delete on table "public"."po_line_items" from "anon";

revoke insert on table "public"."po_line_items" from "anon";

revoke update on table "public"."po_line_items" from "anon";

revoke delete on table "public"."purchase_orders" from "anon";

revoke insert on table "public"."purchase_orders" from "anon";

revoke update on table "public"."purchase_orders" from "anon";

revoke delete on table "public"."receipt_items" from "anon";

revoke insert on table "public"."receipt_items" from "anon";

revoke update on table "public"."receipt_items" from "anon";

revoke delete on table "public"."system_telemetry" from "anon";

revoke update on table "public"."system_telemetry" from "anon";

revoke delete on table "public"."tenant_members" from "anon";

revoke insert on table "public"."tenant_members" from "anon";

revoke update on table "public"."tenant_members" from "anon";

revoke delete on table "public"."tenants" from "anon";

revoke insert on table "public"."tenants" from "anon";

revoke update on table "public"."tenants" from "anon";

revoke delete on table "public"."transactions" from "anon";

revoke insert on table "public"."transactions" from "anon";

revoke update on table "public"."transactions" from "anon";


