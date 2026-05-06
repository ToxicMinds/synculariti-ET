import neo4j, { Driver } from 'neo4j-driver';

let driver: Driver | null = null;

export function getNeo4jDriver() {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI || '';
  const username = process.env.NEO4J_USERNAME || '';
  const password = process.env.NEO4J_PASSWORD || '';

  if (!uri || !username || !password) {
    console.warn('Neo4j credentials missing. Graph features will be disabled.');
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
