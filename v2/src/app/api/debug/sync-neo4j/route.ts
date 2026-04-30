import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getNeo4jDriver } from '@/lib/neo4j';

/**
 * DEBUG API: Syncs transactions to Neo4j using a secret key.
 * This bypasses the session cookie issue for easy debugging.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  // Simple secret key check for debugging
  if (key !== 'et-secret-sync') {
    return NextResponse.json({ error: 'Unauthorized. Please provide the correct ?key=' }, { status: 401 });
  }

  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j not configured' }, { status: 500 });

  try {
    // Fetch all non-deleted expenses for this sync run
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('is_deleted', false);

    if (error) throw error;

    const sessionNeo = driver.session();
    let syncCount = 0;

    try {
      await sessionNeo.executeWrite(async (tx) => {
        for (const exp of expenses) {
          const rawName = exp.description || 'Unknown Merchant';
          
          await tx.run(`
            MERGE (m:Merchant {name: $rawName})
            
            // Smart Case-Insensitive Branding
            WITH m
            CALL {
              WITH m
              UNWIND ['Lidl', 'Tesco', 'Amazon', 'Shell', 'Starbucks', 'Bolt', 'Wolt', 'McDonalds', 'Billa', 'Kaufland'] AS brandName
              WITH m, brandName
              WHERE m.name =~ ('(?i).*'+brandName+'.*')
              MERGE (b:Brand {name: brandName})
              MERGE (m)-[:BELONGS_TO]->(b)
              RETURN count(b) AS branded
            }
            
            MERGE (t:Transaction {id: $id})
            ON CREATE SET t.amount = $amount, t.date = $date, t.category = $category, t.household_id = $household_id
            ON MATCH SET t.amount = $amount, t.date = $date, t.category = $category, t.household_id = $household_id
            MERGE (m)-[:PROCESSED]->(t)
          `, {
            rawName,
            id: exp.id,
            amount: Number(exp.amount),
            date: exp.date,
            category: exp.category,
            household_id: exp.household_id
          });
          syncCount++;
        }
      });
    } finally {
      await sessionNeo.close();
    }

    return NextResponse.json({ 
      success: true, 
      message: `Big Bang Sync Complete: ${syncCount} transactions mapped.`,
      tip: 'Run in Neo4j: MATCH (b:Brand)<-[:BELONGS_TO]-(m:Merchant) RETURN b,m'
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
