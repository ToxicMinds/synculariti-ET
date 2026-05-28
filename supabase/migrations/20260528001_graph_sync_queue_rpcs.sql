-- ==========================================
-- Migration 35: Graph Sync Queue Status RPCs
-- Fixes ACID V-75 in sync-neo4j route
-- Replaces direct graph_sync_queue.update() with atomic RPCs
-- ==========================================

-- RPC 1: Update individual graph_sync_queue entry status
-- Used for claiming (PROCESSING) and error handling (FAILED/PENDING retry)
CREATE OR REPLACE FUNCTION public.update_graph_sync_queue_status_v1(
  p_id UUID,
  p_status TEXT,
  p_retry_count INT DEFAULT NULL,
  p_last_error TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.graph_sync_queue
  SET
    status = p_status,
    processed_at = NOW(),
    retry_count = COALESCE(p_retry_count, retry_count),
    last_error = COALESCE(p_last_error, last_error)
  WHERE id = p_id;
END;
$$;

-- RPC 2: Bulk-complete multiple graph_sync_queue entries
-- Used after successful Neo4j merge
CREATE OR REPLACE FUNCTION public.complete_graph_sync_batch_v1(
  p_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.graph_sync_queue
  SET
    status = 'COMPLETED',
    processed_at = NOW()
  WHERE id = ANY(p_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_graph_sync_queue_status_v1 FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_graph_sync_queue_status_v1 TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_graph_sync_batch_v1 FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_graph_sync_batch_v1 TO authenticated;
