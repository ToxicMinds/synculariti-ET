'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/utils';

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
    const largeItems = items.filter(t => t.amount != null && Number(t.amount) > 500);
    if (largeItems.length === 0) return { success: true, sent: false };

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookies) { cookies.forEach((c) => cookieStore.set(c.name, c.value)); },
        }
      }
    );

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
      `• €${Number(i.amount).toFixed(2)} — ${i.description || i.merchant || 'Manual entry'} (${i.category || 'Uncategorized'}) by ${i.who || 'Unknown'} on ${i.date || 'today'}`
    ).join('\n');

    const messageText = `🚨 Large invoice alert!\n\n${lines}\n\nTap to review → https://synculariti-et.vercel.app`;

    await supabase.rpc('insert_whatsapp_outbox_v1', {
      p_tenant_id: tenantId,
      p_recipient_phone: ownerPhone,
      p_payload: {
        type: 'text',
        text: messageText,
        source: 'large_invoice_auto',
      },
    });

    Logger.system('INFO', 'WhatsApp', 'Large invoice notification queued', {
      tenantId, count: largeItems.length,
    });

    return { success: true, sent: true };
  } catch (e: unknown) {
    const errMsg = getErrorMessage(e);
    Logger.system('ERROR', 'WhatsApp', 'notifyLargeInvoice crashed', { error: errMsg });
    return { success: false, sent: false, error: errMsg };
  }
}
