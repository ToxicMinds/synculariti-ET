import { NextResponse } from 'next/server';
import { getErrorMessage } from '@synculariti/whatsapp-client';
import { createServiceClient } from '@/lib/supabase-server';
import { createOpenWAClient } from '@/lib/create-openwa-client';
import { ServerLogger } from '@/lib/logger-server';
import { processOutboxQueue } from '@/modules/whatsapp/lib/processOutboxQueue';

export const GET = async (req: Request) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use service_role to bypass RLS on whatsapp_outbox
  const supabase = createServiceClient();
  const client = createOpenWAClient();

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
