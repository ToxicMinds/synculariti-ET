import neo4j, { Driver, Session, ManagedTransaction } from 'neo4j-driver';
import { Logger } from './logger';

let driver: Driver | null = null;

export function getNeo4jDriver() {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI || '';
  const username = process.env.NEO4J_USERNAME || '';
  const password = process.env.NEO4J_PASSWORD || '';

  if (!uri || !username || !password) {
    Logger.system('WARN', 'Neo4j', 'Neo4j credentials missing. Graph features will be disabled.');
    return null;
  }

  driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  return driver;
}

/**
 * Normalizes a merchant name and links it to a Master Merchant node.
 * This ensures that "LIDL #123" and "Lidl s.r.o" both roll up to "Lidl".
 */
export async function normalizeAndLinkMerchant(rawName: string, expenseId: string, amount: number, ico?: string | null) {
  const driver = getNeo4jDriver();
  if (!driver) return;

  const session = driver.session();
  try {
    if (ico) {
      // B2B DETERMINISTIC MATCHING: Use IČO
      await session.executeWrite(tx => 
        tx.run(`
          MERGE (m:Merchant {raw_name: $rawName, ico: $ico})
          ON CREATE SET m.normalized_name = $rawName, m.created_at = datetime()
          
          WITH m
          MERGE (b:Brand {ico: $ico})
          ON CREATE SET b.name = $rawName, b.created_at = datetime()
          MERGE (m)-[:BELONGS_TO]->(b)
          
          WITH m
          CREATE (t:Transaction {id: $expenseId, amount: $amount, date: datetime()})
          MERGE (m)-[:PROCESSED]->(t)
        `, { rawName, expenseId, amount, ico })
      );
    } else {
      // LEGACY FUZZY MATCHING: No IČO available
      await session.executeWrite(tx => 
        tx.run(`
          MERGE (m:Merchant {raw_name: $rawName})
          ON CREATE SET m.normalized_name = $rawName, m.created_at = datetime()
          
          WITH m
          WHERE m.raw_name CONTAINS 'LIDL' OR m.raw_name CONTAINS 'Lidl'
          MERGE (b:Brand {name: 'Lidl'})
          MERGE (m)-[:BELONGS_TO]->(b)
          
          WITH m
          CREATE (t:Transaction {id: $expenseId, amount: $amount, date: datetime()})
          MERGE (m)-[:PROCESSED]->(t)
        `, { rawName, expenseId, amount })
      );
    }
  } finally {
    await session.close();
  }
}

/**
 * Bulk merges transactions into Neo4j using Cypher 5 compliant syntax.
 * Extracts the exact loop used by sync and backfill routes.
 */
export async function neo4jBulkMerge(expenses: any[], sessionNeo: Session) {
  let syncCount = 0;
  await sessionNeo.executeWrite(async (tx: ManagedTransaction) => {
    if (!expenses) return;
    for (const exp of expenses) {
      if (!exp.tenant_id) continue;
      
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
  return syncCount;
}
