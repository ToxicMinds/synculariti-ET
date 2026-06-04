'use server';

import { createClient } from '@/lib/supabase-server';
import { Logger } from '@/lib/logger';
import { recordEventServer } from '@/lib/event-log-server';
import { getErrorMessage, formatCurrency, safeAmount } from '@/lib/utils';

interface InvoiceItem {
  id?: string;
  amount?: string | number | null;
  description?: string;
  category?: string;
  who?: string;
  date?: string;
  merchant?: string;
}

export async function notifyLargeInvoice(
  tenantId: string,
  items: InvoiceItem[]
): Promise<{ success: boolean; sent?: boolean; error?: string }> {
  try {
    const largeItems = items.filter(t => t.amount != null && safeAmount(t.amount) > 500);
    if (largeItems.length === 0) return { success: true, sent: false };

    const supabase = await createClient();

    const { data: tenantData, error: tenantErr } = await supabase
      .from('tenants')
      .select('config')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenantData?.config?.phones?.owner) {
      Logger.system('WARN', 'WhatsApp', 'Owner phone not configured for tenant', { tenantId });
      return { success: true, sent: false, error: 'No owner phone configured' };
    }

    const ownerPhone = tenantData.config.phones.owner;
    const lines = largeItems.map(i =>
      `• ${formatCurrency(safeAmount(i.amount))} — ${i.description || i.merchant || 'Manual entry'} (${i.category || 'Uncategorized'}) by ${i.who || 'Unknown'} on ${i.date || 'today'}`
    ).join('\n');

    const messageText = `🚨 Large invoice alert!\n\n${lines}\n\nTap to review → https://synculariti-et.vercel.app`;

    await supabase.rpc('insert_whatsapp_outbox_v2', {
      p_tenant_id: tenantId,
      p_recipient_phone: ownerPhone,
      p_payload: {
        type: 'text',
        text: messageText,
        source: 'large_invoice_auto',
      },
      p_api_key_id: null,
      p_webhook_url: null,
      p_webhook_secret: null,
      p_idempotency_key: null,
    });

    Logger.system('INFO', 'WhatsApp', 'Large invoice notification queued', {
      tenantId, count: largeItems.length,
    });

    void recordEventServer({
      tenantId,
      action: 'whatsapp.notification.sent',
      whoType: 'system',
      metadata: {
        recipientPhone: ownerPhone,
        source: 'large_invoice_auto',
      },
      description: `Auto-queued large invoice alert for ${largeItems.length} item(s)`,
    }).catch(() => {});

    return { success: true, sent: true };
  } catch (e: unknown) {
    const errMsg = getErrorMessage(e);
    Logger.system('ERROR', 'WhatsApp', 'notifyLargeInvoice crashed', { error: errMsg });
    return { success: false, sent: false, error: errMsg };
  }
}
