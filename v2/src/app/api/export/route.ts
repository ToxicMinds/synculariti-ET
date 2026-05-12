import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/**
 * GET /api/export
 * Exports tenant transactions as CSV.
 *
 * SECURITY: Session-authenticated. tenant_id is derived from the
 * authenticated session via get_my_tenant() — never from URL params.
 * Fixes: table renamed 'expenses' -> 'transactions', removed auth bypass.
 */
export async function GET(req: Request) {
  const supabase = await createClient();

  // Verify session — reject unauthenticated callers
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'csv';

  // tenant_id is resolved server-side from the session, never from URL params
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('date, description, category, amount, who, currency, transaction_type')
    .eq('is_deleted', false)
    .order('date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (format === 'csv') {
    const header = 'Date,Description,Category,Amount,Currency,Type,Person\n';
    const rows = (transactions || []).map(e =>
      `${e.date},"${(e.description || '').replace(/"/g, '""')}",${e.category},${e.amount},${e.currency},${e.transaction_type},${e.who || ''}`
    ).join('\n');

    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="Synculariti-Export-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  }

  return NextResponse.json({ transactions });
}
