-- Migration to add webhook target support to whatsapp_outbox for web-bridge callback notifications.
ALTER TABLE public.whatsapp_outbox
  ADD COLUMN webhook_url TEXT,
  ADD COLUMN webhook_secret TEXT;
