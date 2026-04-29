import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase (uses service role to access data for export)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id');
  const format = searchParams.get('format') || 'csv';

  if (!householdId) {
    return NextResponse.json({ error: 'Missing household_id' }, { status: 400 });
  }

  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('date, description, category, amount, who, who_id')
    .eq('household_id', householdId)
    .eq('is_deleted', false)
    .order('date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (format === 'csv') {
    const header = 'Date,Description,Category,Amount,Person\n';
    const rows = (expenses || []).map(e =>
      `${e.date},"${(e.description || '').replace(/"/g, '""')}",${e.category},${e.amount},${e.who || e.who_id || ''}`
    ).join('\n');

    return new NextResponse(header + rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="ET-Expenses-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  }

  return NextResponse.json({ expenses });
}
