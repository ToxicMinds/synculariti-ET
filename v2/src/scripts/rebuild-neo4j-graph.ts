import './load-env';
import { createServiceClient } from '../lib/supabase-server';
import { getNeo4jDriver, neo4jBulkMerge } from '../lib/neo4j';
import { buildSyncPayload } from '../lib/neo4j-ontology';
import { TransactionSyncPayload } from '../lib/types';

interface ReceiptItemInsert {
  id: string;
  transaction_id: string;
  tenant_id: string;
  name: string;
  amount: number;
  category: string;
  currency: string;
}

interface TransactionRow {
  id: string;
  amount: number;
  date: string;
  category: string;
  who: string;
  description: string;
  currency: string;
  tenant_id: string;
}

interface ReceiptItemRow {
  id: string;
  transaction_id: string | null;
  name: string;
  amount: number;
  category: string;
  currency: string;
}

const supabase = createServiceClient();

// Multi-merchant items that map to the same canonicalIngredientId
// Milk → ing-milk (perishability=7d) — triggers BOTH price intel AND waste
// Chicken Breast → ing-chicken-breast (perishability=5d) — waste + price intel
const MULTI_MERCHANT_ITEMS = [
  { name: 'Mlieko 1L', cat: 'COGS - Dry Goods', vendors: ['Metro Cash & Carry SR', 'LUNYS s.r.o.'] },
  { name: 'Kuracie prsia 1kg', cat: 'COGS - Meat', vendors: ['LUNYS s.r.o.', 'Bidfood Slovakia'] },
  { name: 'Maslo 250g', cat: 'COGS - Dry Goods', vendors: ['Metro Cash & Carry SR', 'Bidfood Slovakia'] },
];

function generateUUID() {
  return crypto.randomUUID();
}

async function main() {
  const driver = getNeo4jDriver();
  if (!driver) throw new Error('Neo4j Driver could not be initialized.');
  const session = driver.session();

  const { data: tenant, error: tErr } = await supabase
    .from('tenants').select('id').eq('handle', '@demo-2026').single();
  if (tErr || !tenant) throw new Error('Tenant not found');
  const tenantId = tenant.id;

  // Step 1: Find existing transactions for each vendor
  const vendorTx: Record<string, string[]> = {};
  for (const item of MULTI_MERCHANT_ITEMS) {
    for (const vendor of item.vendors) {
      if (!vendorTx[vendor]) {
        const { data: txs } = await supabase
          .from('transactions')
          .select('id, date, amount, category')
          .eq('tenant_id', tenantId)
          .eq('description', vendor)
          .eq('is_deleted', false)
          .limit(5);
        vendorTx[vendor] = txs?.map(t => t.id) || [];
        console.log(`${vendor}: ${vendorTx[vendor].length} transactions found`);
      }
    }
  }

  // Step 2: For each vendor-transaction pair, add a receipt_item with the multi-merchant item
  const newItems: ReceiptItemInsert[] = [];
  for (const item of MULTI_MERCHANT_ITEMS) {
    for (const vendor of item.vendors) {
      const txs = vendorTx[vendor] || [];
      for (const txId of txs) {
        const price = Math.round((Math.random() * 30 + 2) * 100) / 100; // €2–32
        newItems.push({
          id: generateUUID(),
          transaction_id: txId,
          tenant_id: tenantId,
          name: item.name,
          amount: price,
          category: item.cat,
          currency: 'EUR',
        });
      }
    }
  }

  if (newItems.length === 0) {
    console.log('No items to add - check vendor transaction existence');
    await session.close();
    await driver.close();
    return;
  }

  console.log(`Inserting ${newItems.length} new receipt items...`);
  const { error: insErr } = await supabase.from('receipt_items').insert(newItems);
  if (insErr) {
    console.error('Insert error:', insErr.message);
    // Try batch insert if bulk fails
    for (let i = 0; i < newItems.length; i += 100) {
      const batch = newItems.slice(i, i + 100);
      const { error } = await supabase.from('receipt_items').insert(batch);
      if (error) console.error(`Batch ${i} error:`, error.message);
      else console.log(`  Batch ${i / 100 + 1} OK`);
    }
  } else {
    console.log('  All inserted successfully');
  }

  // Step 3: Verify insertion counts
  const { count: riCount } = await supabase
    .from('receipt_items')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  console.log(`Total receipt_items for tenant: ${riCount}`);

  // Step 4: Rebuild Neo4j from scratch
  console.log('\nDeleting old Neo4j data...');
  await session.executeWrite(async tx => {
    await tx.run('MATCH (t:Transaction {tenant_id: $tid}) DETACH DELETE t', { tid: tenantId });
    await tx.run('MATCH (i:Ingredient) WHERE NOT (i)<-[:IS_INSTANCE_OF]-() DETACH DELETE i');
    await tx.run('MATCH (sku:MerchantSKU) WHERE NOT (sku)-[:SUPPLIED_BY]->() DETACH DELETE sku');
    await tx.run('MATCH (m:Merchant) WHERE NOT (m)-[:PROCESSED]->() DETACH DELETE m');
  });
  console.log('  Clean slate ready');

  // Step 5: Fetch ALL data from Postgres (no default 1000-row limit)
  let allTransactions: TransactionRow[] = [];
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: chunk, error } = await supabase
      .from('transactions')
      .select('id, amount, date, category, who, description, currency, tenant_id')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .order('id', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error('Failed to fetch transactions');
    if (!chunk || chunk.length === 0) break;
    allTransactions = allTransactions.concat(chunk);
    if (chunk.length < PAGE_SIZE) break;
    page++;
  }
  const transactions = allTransactions;
  if (!transactions || transactions.length === 0) throw new Error('No transactions found');
  console.log(`Fetched ${transactions.length} transactions`);

  // Paginate items too
  let allItems: ReceiptItemRow[] = [];
  let itemPage = 0;
  while (true) {
    const { data: chunk, error } = await supabase
      .from('receipt_items')
      .select('id, transaction_id, name, amount, category, currency')
      .eq('tenant_id', tenantId)
      .range(itemPage * PAGE_SIZE, (itemPage + 1) * PAGE_SIZE - 1);
    if (error) throw new Error('Failed to fetch items: ' + error.message);
    if (!chunk || chunk.length === 0) break;
    allItems = allItems.concat(chunk);
    if (chunk.length < PAGE_SIZE) break;
    itemPage++;
  }
  const itemsRows = allItems;
  
  const itemsByTx: Record<string, typeof itemsRows> = {};
  for (const item of itemsRows || []) {
    if (item.transaction_id) {
      if (!itemsByTx[item.transaction_id]) itemsByTx[item.transaction_id] = [];
      itemsByTx[item.transaction_id].push(item);
    }
  }

  console.log(`Items: ${itemsRows?.length || 0} across ${Object.keys(itemsByTx).length} transactions`);

  const payloads: TransactionSyncPayload[] = transactions.map(tx =>
    buildSyncPayload(tx, itemsByTx[tx.id] || [])
  );

  // Custom small-batch loop (AuraDB free tier has limited memory)
  const SMALL_BATCH = 100;
  let totalSynced = 0;
  for (let i = 0; i < payloads.length; i += SMALL_BATCH) {
    const chunk = payloads.slice(i, i + SMALL_BATCH);
    try {
      await neo4jBulkMerge(chunk, session);
      totalSynced += chunk.length;
    } catch (e) {
      console.log(`  Batch ${Math.floor(i / SMALL_BATCH)} failed, retrying with 50...`);
      // Retry with even smaller batches
      for (let j = 0; j < chunk.length; j += 50) {
        const sub = chunk.slice(j, j + 50);
        await neo4jBulkMerge(sub, session);
        totalSynced += sub.length;
      }
    }
    if (totalSynced % 500 === 0) console.log(`  ${totalSynced}/${payloads.length}`);
  }
  console.log(`Synced ${totalSynced} transactions`);

  // Step 6: Verify
  const verify = await session.run('MATCH (t:Transaction {tenant_id: $tid}) RETURN count(t) AS txs', { tid: tenantId });
  const txs = Number(verify.records[0]?.get('txs')?.toString() || 0);
  const skuR = await session.run('MATCH (sku:MerchantSKU)<-[c:CONTAINS]-() RETURN count(DISTINCT c) AS rels, count(DISTINCT sku) AS skus');
  const rels = Number(skuR.records[0]?.get('rels')?.toString() || 0);
  const skus = Number(skuR.records[0]?.get('skus')?.toString() || 0);
  const ingR = await session.run('MATCH (i:Ingredient) RETURN count(i) AS ings');
  const ings = Number(ingR.records[0]?.get('ings')?.toString() || 0);

  console.log(`\n=== VERIFICATION ===`);
  console.log(`Transactions: ${txs}`);
  console.log(`MerchantSKUs: ${skus}`);
  console.log(`Ingredients: ${ings}`);
  console.log(`CONTAINS rels: ${rels}`);

  // Check specific ingredients
  const milk = await session.run("MATCH (i:Ingredient {id: 'ing-milk'}) RETURN i.name AS name, i.perishability_days AS per");
  if (milk.records.length > 0) console.log(`Milk: ${milk.records[0].get('name')} (perishability=${milk.records[0].get('per')}d)`);
  else console.log('Milk: NOT FOUND');

  const chicken = await session.run("MATCH (i:Ingredient {id: 'ing-chicken-breast'}) RETURN i.name AS name, i.perishability_days AS per");
  if (chicken.records.length > 0) console.log(`Chicken: ${chicken.records[0].get('name')} (perishability=${chicken.records[0].get('per')}d)`);
  else console.log('Chicken: NOT FOUND');

  await session.close();
  await driver.close();
  console.log('\nDone');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
