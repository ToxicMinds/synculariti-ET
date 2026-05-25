import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processOutboxEvent, DatabaseWebhookPayload, OutboxRecord } from './handler.ts';

serve(async (req: Request) => {
  try {
    const body: DatabaseWebhookPayload<OutboxRecord> = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const sidecarUrl = Deno.env.get('OPENWA_BASE_URL') || 'http://34.66.35.89:2785';
    const sidecarApiKey = Deno.env.get('OPENWA_API_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseKey);

    await processOutboxEvent(body, supabase, sidecarUrl, sidecarApiKey);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
