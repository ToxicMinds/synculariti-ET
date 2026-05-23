export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { WhatsAppNotificationPayload } from '@synculariti/whatsapp-client';
import { z } from 'zod';
import { ServerLogger } from '@/lib/logger-server';

const payloadSchema = z.object({
  tenantId: z.string().uuid(),
  locationName: z.string(),
  event: z.enum(['PROCUREMENT_RECEIVED', 'INVOICE_APPROVED', 'RECEIPT_SCANNED', 'LOW_STOCK_ALERT']),
  recipientPhone: z.string(),
  data: z.record(z.union([z.string(), z.number()]))
});

export const POST = withAuth(async (req, context) => {
  try {
    const body = await req.json();
    const parsed = payloadSchema.parse(body);

    // TODO (Phase 5/Execution): Write to supabase whatsapp_outbox table. 
    // For now, simulating the queue insert (Outbox pattern).
    
    const mockJobId = crypto.randomUUID();
    
    await ServerLogger.system('INFO', 'WhatsApp', `Queued outbox job: ${mockJobId}`, {
      event: parsed.event,
      tenantId: parsed.tenantId
    });

    return NextResponse.json({ success: true, jobId: mockJobId }, { status: 202 });
  } catch (e: any) {
    await ServerLogger.system('ERROR', 'WhatsApp', `Validation error`, { error: e.message });
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
});
