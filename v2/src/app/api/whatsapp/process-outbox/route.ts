import { NextResponse } from 'next/server';
import { OpenWAClient, getErrorMessage } from '@synculariti/whatsapp-client';
import { createClient } from '@supabase/supabase-js';
import { ServerLogger } from '@/lib/logger-server';
import { processOutboxQueue } from '@/modules/whatsapp/lib/processOutboxQueue';

export const POST = async (req: Request) => {
  try {
    const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const auth = req.headers.get('authorization') || '';
      if (auth !== `Bearer ${webhookSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();
    const record = body?.record;

    if (!record || body.type !== 'INSERT' || record.status !== 'PENDING') {
      return NextResponse.json({ ok: true, skipped: true });
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
      process.env.NEXT_PUBLIC_BASE_URL || 'https://synculariti-et.vercel.app',
      [record]
    );

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = getErrorMessage(e);
    await ServerLogger.system('ERROR', 'WhatsApp', 'process-outbox webhook error', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
