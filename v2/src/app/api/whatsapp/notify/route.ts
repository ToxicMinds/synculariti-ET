export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { getErrorMessage } from '@synculariti/whatsapp-client';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { ServerLogger } from '@/lib/logger-server';

export interface NotifyRequestBody {
  tenant_id?: string;
  source?: string;
  recipientPhone: string;
  payload: {
    type: 'text' | 'poll';
    text?: string;
    name?: string;
    options?: string[];
    metadata?: Record<string, unknown>;
  };
  webhookUrl?: string;
  webhookSecret?: string;
  idempotencyKey?: string;
}

const payloadSchema = z.object({
  tenant_id: z.string().uuid().optional(),
  source: z.string().optional(),
  recipientPhone: z.string().min(1),
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
  tenant_id: w.tenant_id ?? null,
  source: w.source ?? null,
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

    // Use service_role for API key verification (this is an API gateway, not a user session)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

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

    // Resolve tenant_id: service keys (tenant_id IS NULL) read from body
    let resolvedTenantId: string;
    let resolvedSource: string | null = parsed.source;

    if (!keyRecord.tenant_id) {
      // Service-level key — tenant_id must be in body
      if (!parsed.tenant_id) {
        return NextResponse.json(
          { error: 'tenant_id is required when using a service-level API key' },
          { status: 400 }
        );
      }

      // Validate the tenant exists
      const { data: tenantExists, error: tenantCheckErr } = await supabase
        .from('tenants')
        .select('id')
        .eq('id', parsed.tenant_id)
        .single();

      if (tenantCheckErr || !tenantExists) {
        return NextResponse.json(
          { error: 'Specified tenant does not exist' },
          { status: 400 }
        );
      }

      resolvedTenantId = parsed.tenant_id;
    } else {
      resolvedTenantId = keyRecord.tenant_id;
    }

    // Inject source into payload metadata for audit trail
    const enrichedPayload = {
      ...parsed.payload,
      metadata: {
        ...(parsed.payload.metadata as Record<string, unknown>),
        ...(resolvedSource ? { source: resolvedSource } : {}),
      },
    };

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
      tenant_id: resolvedTenantId,
      api_key_id: keyRecord.id,
      recipient_phone: parsed.recipientPhone,
      payload: enrichedPayload,
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
      tenantId: resolvedTenantId,
      source: resolvedSource ?? 'api_key',
    });

    return NextResponse.json({ success: true }, { status: 202 });
  } catch (e: unknown) {
    const errMsg = getErrorMessage(e);
    await ServerLogger.system('ERROR', 'WhatsApp', 'notify handler error', { error: errMsg });
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
};
