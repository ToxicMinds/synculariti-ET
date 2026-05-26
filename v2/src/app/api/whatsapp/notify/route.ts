export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getErrorMessage } from '@synculariti/whatsapp-client';
import { z } from 'zod';
import { ServerLogger } from '@/lib/logger-server';
import { createClient } from '@/lib/supabase-server';

const payloadSchema = z.object({
  recipientPhone: z.string(),
  payload: z.object({
    type: z.enum(['text', 'poll']),
    text: z.string().optional(),
    name: z.string().optional(),
    options: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  webhookUrl: z.string().url().optional(),
  webhookSecret: z.string().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

const WashedPayload = payloadSchema.transform(w => ({
  recipientPhone: w.recipientPhone,
  payload: {
    type: w.payload.type,
    text: w.payload.text ?? null,
    name: w.payload.name ?? null,
    options: w.payload.options ?? null,
    metadata: w.payload.metadata ?? {},
  },
  webhookUrl: w.webhookUrl ?? null,
  webhookSecret: w.webhookSecret ?? null,
  idempotencyKey: w.idempotencyKey ?? null,
}));

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
    const parsed = WashedPayload.parse(body);

    // Idempotency check before insert
    if (parsed.idempotencyKey) {
      const { data: existing } = await supabase
        .from('whatsapp_outbox')
        .select('id')
        .eq('idempotency_key', parsed.idempotencyKey)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({ success: true, existing: true, outboxId: existing.id }, { status: 200 });
      }
    }

    const insertPayload: Record<string, unknown> = {
      tenant_id: keyRecord.tenant_id,
      api_key_id: keyRecord.id,
      recipient_phone: parsed.recipientPhone,
      payload: parsed.payload,
      status: 'PENDING',
      webhook_url: parsed.webhookUrl,
      webhook_secret: parsed.webhookSecret,
    };

    if (parsed.idempotencyKey) {
      insertPayload.idempotency_key = parsed.idempotencyKey;
    }

    const { error: insertError } = await supabase
      .from('whatsapp_outbox')
      .insert(insertPayload);

    if (insertError) throw insertError;

    await ServerLogger.system('INFO', 'WhatsApp', `Queued message for ${parsed.recipientPhone}`, {
      type: parsed.payload.type,
      tenantId: keyRecord.tenant_id,
    });

    return NextResponse.json({ success: true }, { status: 202 });
  } catch (e: unknown) {
    const errMsg = getErrorMessage(e);
    await ServerLogger.system('ERROR', 'WhatsApp', 'notify handler error', { error: errMsg });
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
};
