import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { withTestHandler } from '@/lib/withTestHandler';
import { ServerLogger } from '@/lib/logger-server';
import { recordEventServer } from '@/lib/event-log-server';
import { SecureHandler } from '@/lib/types/api';
import { HEADER_CONTENT_TYPE } from '@/lib/constants';

/**
 * GET /api/export
 * Exports tenant transactions as CSV.
 *
 * SECURITY: Session-authenticated. tenant_id is derived from the
 * authenticated session via get_my_tenant() — never from URL params.
 */
const handler: SecureHandler = async (req, context) => {
  const { tenantId, user } = context.auth || { tenantId: 'fallback' };
  const supabase = await createClient();

  await ServerLogger.system('INFO', 'API', 'Export request started', { tenantId, format: req.url.includes('csv') ? 'csv' : 'json' });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'csv';

  // tenant_id is resolved server-side from the session, never from URL params
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('date, description, category, amount, who, currency, transaction_type')
    .eq('is_deleted', false)
    .order('date', { ascending: false });

  if (error) {
    await ServerLogger.system('ERROR', 'API', 'Export query failed', { error: error.message, tenantId });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void recordEventServer({
    tenantId,
    action: 'tenant.data_exported',
    whoType: 'user',
    whoId: user?.id,
    description: `Exported transactions to ${format.toUpperCase()}`,
  }).catch(() => {});

  if (format === 'csv') {
    const header = 'Date,Description,Category,Amount,Currency,Type,Person\n';
    const rows = (transactions || []).map(e =>
      `${e.date},"${(e.description || '').replace(/"/g, '""')}",${e.category},${e.amount},${e.currency},${e.transaction_type},${e.who || ''}`
    ).join('\n');

    return new NextResponse(header + rows, {
      headers: {
        [HEADER_CONTENT_TYPE]: 'text/csv',
        'Content-Disposition': `attachment; filename="Synculariti-Export-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  }

  return NextResponse.json({ transactions });
};

export const GET = withTestHandler(handler);
