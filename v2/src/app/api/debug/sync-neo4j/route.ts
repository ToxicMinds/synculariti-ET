import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getNeo4jDriver } from '@/lib/neo4j';

/**
 * DEBUG API: Syncs your entire Supabase expense history to Neo4j.
 * This is the "Big Bang" migration to populate your graph intelligence.
 */
export async function GET() {
  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j not configured' }, { status: 500 });

  try {
    // 1. Fetch all expenses from Supabase
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('is_deleted', false);

    if (error) throw error;
    if (!expenses) return NextResponse.json({ message: 'No expenses found to sync' });

    const session = driver.session();
    let syncCount = 0;

    try {
      await session.executeWrite(async (tx) => {
        for (const exp of expenses) {
          const rawName = exp.description || 'Unknown Merchant';
          
          // Cypher query to create nodes and relationships
          // It normalizes 'Lidl' and 'Tesco' automatically
          await tx.run(`
            MERGE (m:Merchant {name: $rawName})
            
            // Auto-branding logic
            WITH m
            CALL {
              WITH m
              UNWIND ['LIDL', 'TESCO', 'AMAZON', 'SHELL', 'STARBUCKS', 'BOLT', 'WOLT'] AS brandName
              WITH m, brandName
              WHERE m.name CONTAINS brandName OR m.name CONTAINS apoc.text.capitalize(brandName)
              MERGE (b:Brand {name: brandName})
              MERGE (m)-[:BELONGS_TO]->(b)
              RETURN count(b) AS branded
            }
            
            // Create Transaction
            CREATE (t:Transaction {
              id: $id, 
              amount: $amount, 
              date: $date,
              category: $category
            })
            MERGE (m)-[:PROCESSED]->(t)
          `, {
            rawName,
            id: exp.id,
            amount: Number(exp.amount),
            date: exp.date,
            category: exp.category
          });
          syncCount++;
        }
      });
    } finally {
      await session.close();
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully synced ${syncCount} transactions to Neo4j.`,
      tip: 'Go to your Neo4j Aura console and run: MATCH (m:Merchant)-[r]->(t) RETURN m,r,t LIMIT 50'
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
