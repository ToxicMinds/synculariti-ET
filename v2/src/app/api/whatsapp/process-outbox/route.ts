import { NextResponse } from 'next/server';
import { getErrorMessage } from '@synculariti/whatsapp-client';
import { createServiceClient } from '@/lib/supabase-server';
import { createOpenWAClient } from '@/lib/create-openwa-client';
import { ServerLogger } from '@/lib/logger-server';
import { processOutboxQueue } from '@/modules/whatsapp/lib/processOutboxQueue';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const POST = async (req: Request) => {
  try {
    const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const auth = req.headers.get('authorization') || '';
      if (!timingSafeEqual(auth, `Bearer ${webhookSecret}`)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();
    const record = body?.record;

    if (!record || body.type !== 'INSERT' || record.status !== 'PENDING') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Use service_role to bypass RLS on whatsapp_outbox
    const supabase = createServiceClient();
    const client = createOpenWAClient();

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
