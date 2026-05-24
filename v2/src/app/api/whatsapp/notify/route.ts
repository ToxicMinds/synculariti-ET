export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getErrorMessage } from '@synculariti/whatsapp-client';
import { z } from 'zod';
import { ServerLogger } from '@/lib/logger-server';
import { createClient } from '@/lib/supabase-server';

const payloadSchema = z.object({
  locationName: z.string().optional(),
  event: z.string(),
  recipientPhone: z.string(),
  data: z.record(z.string(), z.any()).optional()
});

export const POST = async (req: Request) => {
  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-Api-Key header' }, { status: 401 });
    }

    const supabase = await createClient();
    
    // Verify API Key
    const { data: keyRecord, error: keyError } = await supabase
      .from('api_keys')
      .select('id, tenant_id')
      .eq('key_value', apiKey)
      .single();

    if (keyError || !keyRecord) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = payloadSchema.parse(body);

    // Insert into Outbox
    const { error: insertError } = await supabase
      .from('whatsapp_outbox')
      .insert({
        tenant_id: keyRecord.tenant_id,
        api_key_id: keyRecord.id,
        recipient_phone: parsed.recipientPhone,
        payload: parsed,
        status: 'PENDING'
      });

    if (insertError) throw insertError;

    await ServerLogger.system('INFO', 'WhatsApp', `Queued message for ${parsed.recipientPhone}`, {
      event: parsed.event,
      tenantId: keyRecord.tenant_id
    });

    return NextResponse.json({ success: true }, { status: 202 });
  } catch (e: unknown) {
    const errMsg = getErrorMessage(e);
    await ServerLogger.system('ERROR', 'WhatsApp', `Validation error`, { error: errMsg });
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
};
