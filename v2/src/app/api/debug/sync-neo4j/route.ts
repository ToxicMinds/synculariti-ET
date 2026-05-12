import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getNeo4jDriver } from '@/lib/neo4j';

/**
 * DEBUG API: Full sync of Supabase expenses to Neo4j.
 * Cypher 5 compliant — every statement ends with RETURN.
 * Usage: GET /api/debug/sync-neo4j?key=et-secret-sync
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (key !== 'et-secret-sync') {
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
      await sessionNeo.executeWrite(async (tx) => {
        for (const exp of expenses) {
          const rawName = (exp.description || 'Unknown Merchant').trim();

          // Query 1: MERGE/update Transaction node with tenant_id
          await tx.run(
            `MERGE (t:Transaction {id: $id})
             ON CREATE SET t.amount = $amount, t.date = $date, t.category = $category, t.tenant_id = $tenant_id
             ON MATCH SET  t.tenant_id = $tenant_id, t.amount = $amount, t.date = $date, t.category = $category
             RETURN t.id AS id`,
            { id: exp.id, amount: Number(exp.amount), date: exp.date, category: exp.category, tenant_id: exp.tenant_id }
          );

          // Query 2: MERGE Merchant + link to Transaction
          await tx.run(
            `MERGE (m:Merchant {name: $rawName})
             WITH m
             MATCH (t:Transaction {id: $id})
             MERGE (m)-[:PROCESSED]->(t)
             RETURN m.name AS merchant`,
            { rawName, id: exp.id }
          );

          syncCount++;
        }
      });
    } finally {
      await sessionNeo.close();
    }

    return NextResponse.json({
      success: true,
      message: `Big Bang Sync Complete: ${syncCount} transactions mapped.`,
      tip: 'Run in Neo4j Aura: MATCH (m:Merchant)-[:PROCESSED]->(t:Transaction) RETURN m.name, count(t) ORDER BY count(t) DESC'
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
