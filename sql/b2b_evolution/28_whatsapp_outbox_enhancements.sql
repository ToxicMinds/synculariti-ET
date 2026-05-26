-- ==========================================
-- Migration 28: WhatsApp outbox enhancements
-- 1. Add PROCESSING status to CHECK constraint
-- 2. Add retry_count column for backoff
-- 3. Add idempotency_key column for dedup
-- ==========================================

ALTER TABLE public.whatsapp_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_outbox_status_check;

ALTER TABLE public.whatsapp_outbox
  ADD CONSTRAINT whatsapp_outbox_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'COMPLETED'));

ALTER TABLE public.whatsapp_outbox
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;

ALTER TABLE public.whatsapp_outbox
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_idempotency ON public.whatsapp_outbox(idempotency_key);
