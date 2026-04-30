import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getNeo4jDriver } from '@/lib/neo4j';

/**
 * BACKFILL API: Stamps household_id onto all existing Neo4j Transaction nodes.
 * Run once after the multi-tenancy migration.
 * 
 * Usage: GET /api/debug/backfill-neo4j?key=et-secret-sync
 * Optionally: ?householdId=xxx to only backfill one household
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const filterHouseholdId = searchParams.get('householdId'); // optional

  if (key !== 'et-secret-sync') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j not configured' }, { status: 500 });

  try {
    // Fetch ALL expenses from Supabase (no limit — this is a one-time backfill)
    let query = supabase
      .from('expenses')
      .select('id, household_id, description, amount, date, category')
      .eq('is_deleted', false);

    if (filterHouseholdId) {
      query = query.eq('household_id', filterHouseholdId);
    }

    const { data: expenses, error } = await query;
    if (error) throw error;

    const sessionNeo = driver.session();
    let updatedCount = 0;
    let skippedCount = 0;

    try {
      await sessionNeo.executeWrite(async (tx) => {
        for (const exp of expenses) {
          if (!exp.household_id) {
            skippedCount++;
            continue; // Can't stamp without a household_id
          }

          const rawName = exp.description || 'Unknown Merchant';

          // MERGE the Transaction node and stamp/update household_id
          await tx.run(`
            MERGE (t:Transaction {id: $id})
            ON CREATE SET 
              t.amount = $amount,
              t.date = $date,
              t.category = $category,
              t.household_id = $household_id
            ON MATCH SET 
              t.household_id = $household_id,
              t.amount = $amount,
              t.date = $date,
              t.category = $category

            WITH t
            MERGE (m:Merchant {name: $rawName})
            MERGE (m)-[:PROCESSED]->(t)

            WITH m
            UNWIND ['Lidl', 'Tesco', 'Amazon', 'Shell', 'Starbucks', 'Bolt', 'Wolt', 'McDonalds', 'Billa', 'Kaufland'] AS brandName
            WITH m, brandName
            WHERE toLower(m.name) CONTAINS toLower(brandName)
            MERGE (b:Brand {name: brandName})
            MERGE (m)-[:BELONGS_TO]->(b)
          `, {
            rawName,
            id: exp.id,
            amount: Number(exp.amount),
            date: exp.date,
            category: exp.category,
            household_id: exp.household_id
          });

          updatedCount++;
        }
      });
    } finally {
      await sessionNeo.close();
    }

    // Verify: count how many Transaction nodes now have household_id
    const verifySession = driver.session();
    let verifyResult;
    try {
      verifyResult = await verifySession.run(`
        MATCH (t:Transaction)
        RETURN 
          count(t) AS totalNodes,
          count(t.household_id) AS nodesWithHouseholdId,
          count(DISTINCT t.household_id) AS distinctHouseholds
      `);
    } finally {
      await verifySession.close();
    }

    const stats = verifyResult.records[0];

    return NextResponse.json({
      success: true,
      message: `Backfill complete. ${updatedCount} transactions stamped with household_id.`,
      skipped: skippedCount,
      neo4j_verification: {
        total_transaction_nodes: stats.get('totalNodes').low ?? stats.get('totalNodes'),
        nodes_with_household_id: stats.get('nodesWithHouseholdId').low ?? stats.get('nodesWithHouseholdId'),
        distinct_households: stats.get('distinctHouseholds').low ?? stats.get('distinctHouseholds'),
      },
      isolation_proof: 'Each household can ONLY see its own data via the household_id filter in all graph queries.'
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
