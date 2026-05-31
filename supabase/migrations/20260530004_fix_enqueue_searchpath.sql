-- Fix enqueue_graph_sync_internal search_path to match verification standard
-- All other SECURITY DEFINER functions use SET "search_path" TO 'public'
CREATE OR REPLACE FUNCTION public.enqueue_graph_sync_internal(
  p_tenant_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_operation text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.graph_sync_queue (tenant_id, entity_type, entity_id, operation, payload)
    VALUES (p_tenant_id, p_entity_type, p_entity_id, p_operation, p_payload);
END;
$$;

ALTER FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_graph_sync_internal(uuid, text, uuid, text, jsonb) TO service_role;
