import neo4j, { Driver, Session, ManagedTransaction } from 'neo4j-driver';
import { Logger } from './logger';
import { Transaction } from '@/modules/finance/lib/finance';
import { TransactionSyncPayload } from './types';

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver | null {
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
 * Bulk merges transactions into Neo4j using Cypher 5 compliant syntax.
 * Utilizes a 3-Phase Lock-Safe aggregated query structure to prevent Cartesian explosions and locking.
 */
export async function neo4jBulkMerge(expenses: (Transaction | TransactionSyncPayload)[], sessionNeo: Session): Promise<number> {
  if (!expenses || expenses.length === 0) return 0;

  // Map input (including backwards compatible support for legacy flat Transaction format)
  const mappedPayload: TransactionSyncPayload[] = expenses.map(exp => {
    if ('items' in exp) {
      return exp as TransactionSyncPayload;
    }
    const rawName = (exp.description || 'Unknown Merchant').trim();
    // Deterministic Merchant ID for legacy fallback
    const merchantId = `merchant-${rawName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    return {
      txId: exp.id || '',
      tenantId: exp.tenant_id || '',
      amount: Number(exp.amount),
      date: exp.date,
      vendorName: rawName,
      merchantId,
      items: []
    };
  });

  await sessionNeo.executeWrite(async (tx: ManagedTransaction) => {
    // ==========================================
    // Phase 1: Ingest and isolate all Parent entities
    // ==========================================
    await tx.run(
      `// Phase 1: Ingest and isolate all Parent entities
       UNWIND $batch AS txData
       MERGE (m:Merchant {id: txData.merchantId})
       ON CREATE SET m.name = txData.vendorName

       MERGE (t:Transaction {id: txData.txId})
       ON CREATE SET t.amount = txData.amount, t.date = txData.date, t.tenant_id = txData.tenantId
       ON MATCH SET t.amount = txData.amount, t.date = txData.date

       MERGE (m)-[:PROCESSED]->(t)`,
      { batch: mappedPayload }
    );

    // ==========================================
    // Phase 2: Deduplicate global :Ingredient nodes (Eager Aggregation)
    // ==========================================
    await tx.run(
      `// Phase 2: Deduplicate global :Ingredient nodes (Eager Aggregation)
       WITH $batch AS safeBatch
       UNWIND safeBatch AS txData
       UNWIND txData.items AS item
       WITH DISTINCT item.canonicalIngredientId AS ingId, item

       MERGE (i:Ingredient {id: ingId})
       ON CREATE SET i.name = item.canonicalName, i.category = item.itemCategory, i.base_unit = item.baseUnit, i.perishability_days = item.perishability`,
      { batch: mappedPayload }
    );

    // ==========================================
    // Phase 3: Construct SKUs and relationships using clean context
    // ==========================================
    await tx.run(
      `// Phase 3: Construct SKUs and relationships using clean context
       WITH $batch AS safeBatch
       UNWIND safeBatch AS txData
       UNWIND txData.items AS item

       MATCH (t:Transaction {id: txData.txId})
       MATCH (m:Merchant {id: txData.merchantId})
       MATCH (i:Ingredient {id: item.canonicalIngredientId})

       MERGE (sku:MerchantSKU {id: item.skuId})
       ON CREATE SET sku.raw_name = item.itemName, sku.currency = item.currency

       MERGE (t)-[r:CONTAINS]->(sku)
       ON CREATE SET r.amount = item.itemAmount

       MERGE (sku)-[:SUPPLIED_BY]->(m)
       MERGE (sku)-[:IS_INSTANCE_OF]->(i)`,
      { batch: mappedPayload }
    );
  });

  return expenses.length;
}

/**
 * Processes outbox events using high-performance flat sliding cursor chunking.
 */
export async function processOutboxSync(pendingEvents: TransactionSyncPayload[], sessionNeo: Session): Promise<number> {
  const BATCH_SIZE = 500;
  let totalProcessed = 0;

  for (let i = 0; i < pendingEvents.length; i += BATCH_SIZE) {
    const chunk = pendingEvents.slice(i, i + BATCH_SIZE);
    const count = await neo4jBulkMerge(chunk, sessionNeo);
    totalProcessed += count;
  }

  return totalProcessed;
}

/**
 * Atomically removes a transaction from the graph.
 */
export async function neo4jDeleteTransaction(id: string, sessionNeo: Session): Promise<void> {
  await sessionNeo.executeWrite(tx => 
    tx.run(`MATCH (t:Transaction {id: $id}) DETACH DELETE t RETURN count(t)`, { id })
  );
}
