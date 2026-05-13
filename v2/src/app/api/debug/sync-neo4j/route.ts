import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getNeo4jDriver, neo4jBulkMerge } from '@/lib/neo4j';
import { withAuth } from '@/lib/withAuth';

/**
 * DEBUG API: Full sync of Supabase expenses to Neo4j.
 * Cypher 5 compliant — every statement ends with RETURN.
 * Usage: GET /api/debug/sync-neo4j?key=...
 */
export const GET = withAuth(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  // SECURITY: Replace hardcoded secret with environment variable
  if (key !== process.env.SYNC_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized. Please provide the correct ?key=' }, { status: 401 });
  }

  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j not configured' }, { status: 500 });

  try {
    // Fetch all non-deleted expenses for this sync run
    const { data: expenses, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('is_deleted', false);

    if (error) throw error;

    const sessionNeo = driver.session();
    let syncCount = 0;

    try {
      syncCount = await neo4jBulkMerge(expenses, sessionNeo);
    } finally {
      await sessionNeo.close();
    }

    return NextResponse.json({
      success: true,
      message: `Big Bang Sync Complete: ${syncCount} transactions mapped.`,
      tip: 'Run in Neo4j Aura: MATCH (m:Merchant)-[:PROCESSED]->(t:Transaction) RETURN m.name, count(t) ORDER BY count(t) DESC'
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Neo4j sync exception';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
