import { NextResponse } from 'next/server';
import { OpenWAClient, getErrorMessage } from '@synculariti/whatsapp-client';
import { createClient } from '@supabase/supabase-js';
import { ServerLogger } from '@/lib/logger-server';
import { processOutboxQueue } from '@/modules/whatsapp/lib/processOutboxQueue';

export const GET = async (req: Request) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service_role to bypass RLS on whatsapp_outbox
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const client = new OpenWAClient({
    baseUrl: process.env.OPENWA_BASE_URL || 'http://34.66.35.89:2785',
    apiKey: process.env.OPENWA_API_KEY || '',
    sessionId: process.env.OPENWA_SESSION_ID || 'synculariti-bot',
  });

  const result = await processOutboxQueue(
    supabase,
    client,
    process.env.NEXT_PUBLIC_BASE_URL || 'https://synculariti-et.vercel.app'
  );

  if (result.processed > 0 || result.failed > 0) {
    await ServerLogger.system('INFO', 'WhatsApp', 'Cron sweep', result);
  }

  return NextResponse.json(result);
};
