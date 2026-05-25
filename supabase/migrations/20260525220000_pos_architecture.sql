-- ==========================================
-- POS Data Architecture Prep
-- ==========================================

-- 1. Expand graph_sync_queue entity_type to support POS and other future data
ALTER TABLE public.graph_sync_queue DROP CONSTRAINT IF EXISTS graph_sync_queue_entity_type_check;
ALTER TABLE public.graph_sync_queue ADD CONSTRAINT graph_sync_queue_entity_type_check
  CHECK (entity_type IN ('transaction', 'merchant', 'sale', 'menu_item', 'inventory_adjustment'));

-- 2. Grant access to authenticated users
ALTER TABLE public.graph_sync_queue ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.graph_sync_queue TO authenticated;
GRANT ALL ON TABLE public.graph_sync_queue TO service_role;
