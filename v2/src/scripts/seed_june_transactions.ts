import './load-env';
import { createServiceClient } from '../lib/supabase-server';
import { getNeo4jDriver, neo4jBulkMerge } from '../lib/neo4j';
import { buildSyncPayload, buildMerchantId } from '../lib/neo4j-ontology';
import { mapToOntologyItem } from '../lib/neo4j-ontology';
import { safeAmount } from '../lib/utils';
import type { TransactionSyncPayload, ReceiptItemSyncPayload } from '../lib/types';

const TENANT_ID = 'e3b20277-a2c2-4bee-a69d-aa9f945486d3';

const VENDORS = [
  { name: 'Metro Cash & Carry SR', cat: 'COGS - Dry Goods', items: ['Metro Chef Múka hladká 10x1kg', 'Cukor kryštálový 10x1kg', 'Slnečnicový olej 10l', 'Soľ jedlá 1kg', 'Toaletný papier 3-vrstvový', 'Savo proti plesniam', 'Mlieko 1L', 'Maslo 250g'] },
  { name: 'LUNYS s.r.o.', cat: 'COGS - Produce', items: ['Zemiaky neskoré prané', 'Cibuľa žltá', 'Mrkva praná', 'Citróny', 'Jablká Gala', 'Cesnak', 'Rajčiny kríčkové', 'Šalát ľadový', 'Mlieko 1L', 'Kuracie prsia 1kg'] },
  { name: 'Bidfood Slovakia', cat: 'COGS - Meat', items: ['Bravčová krkovička bez kosti', 'Hovädzie zadné', 'Kura chladené voľné', 'Zemiakové hranolky 10mm 4x2.5kg', 'Losos filet s kožou', 'Bravčové karé', 'Hovädzie kosti na vývar', 'Maslo 250g'] },
  { name: 'Kofola a.s.', cat: 'COGS - Beverages', items: ['Kofola originál 50L KEG', 'Vinea biela 0.25l sklo', 'Rajec jemne sýtený 0.33l sklo'] },
  { name: 'Heineken Slovensko', cat: 'COGS - Alcohol', items: ['Zlatý Bažant 12% 50L KEG', 'Krušovice 10% 50L KEG', 'Zlatý Bažant 0.0% Radler'] },
  { name: 'ZSE Energia', cat: 'OPEX - Utilities', items: ['Záloha za elektrinu'] },
  { name: 'SPP', cat: 'OPEX - Utilities', items: ['Záloha za plyn'] },
  { name: 'O2 Slovakia', cat: 'OPEX - Telecom', items: ['Mesačný paušál Internet'] },
  { name: 'Alza.sk', cat: 'OPEX - Equipment', items: ['Tlačiareň HP', 'Kancelársky papier A4', 'Toner čierny'] }
];

const TOTAL = 500;
const BATCH_SIZE = 100;

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function uuid() { return crypto.randomUUID(); }

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

interface ReceiptItemInsert {
  id: string;
  transaction_id: string;
  tenant_id: string;
  name: string;
  amount: number;
  category: string;
  currency: string;
  source_type: string;
  source_id: string;
}

async function seed() {
  const supabase = createServiceClient();
  const txStart = new Date('2026-06-01T00:00:00Z');
  const txEnd = new Date('2026-06-15T23:59:59Z');
  let totalInserted = 0;

  let txBatch: any[] = [];
  let itemBatch: ReceiptItemInsert[] = [];
  const neo4jPayloads: TransactionSyncPayload[] = [];

  for (let i = 1; i <= TOTAL; i++) {
    const vendor = pick(VENDORS);
    const txId = uuid();
    const date = randomDate(txStart, txEnd).toISOString().split('T')[0];
    const itemCount = randInt(1, 5);
    let totalAmount = 0;
    const items: ReceiptItemInsert[] = [];

    for (let j = 0; j < itemCount; j++) {
      const itemPrice = Math.round((Math.random() * 80 + 5) * 100) / 100;
      totalAmount += itemPrice;
      const itemName = pick(vendor.items);
      items.push({
        id: uuid(),
        transaction_id: txId,
        tenant_id: TENANT_ID,
        name: itemName,
        amount: itemPrice,
        category: vendor.cat,
        currency: 'EUR',
        source_type: 'transaction',
        source_id: txId,
      });
    }

    const merchantId = buildMerchantId(vendor.name);
    const mappedItems: ReceiptItemSyncPayload[] = items.map(item => {
      const mapped = mapToOntologyItem(item.name, merchantId, 'EUR');
      return {
        ...mapped,
        itemId: item.id,
        itemName: item.name,
        itemAmount: item.amount,
        itemQuantity: 1,
        itemUnitPrice: item.amount,
        itemCategory: item.category,
        currency: 'EUR',
      };
    });

    const d = new Date(date + 'T12:00:00Z');
    const dow = d.getUTCDay();
    neo4jPayloads.push({
      txId,
      tenantId: TENANT_ID,
      amount: safeAmount(Math.round(totalAmount * 100) / 100),
      date,
      category: vendor.cat,
      dayOfWeek: dow,
      isWeekend: dow === 0 || dow === 6,
      month: d.getUTCMonth() + 1,
      quarter: Math.ceil((d.getUTCMonth() + 1) / 3),
      isHoliday: false,
      holidayName: null,
      daysToNextHoliday: 365,
      isBeforeHoliday: false,
      vendorName: vendor.name,
      merchantId,
      items: mappedItems,
    });

    txBatch.push({
      id: txId,
      tenant_id: TENANT_ID,
      amount: Math.round(totalAmount * 100) / 100,
      currency: 'EUR',
      category: vendor.cat,
      date,
      description: vendor.name,
      transaction_type: 'DEBIT',
      transacted_at: new Date(date).toISOString(),
      receipt_number: `REC-JUN-${String(i).padStart(4, '0')}`,
      who_id: '00000000-0000-0000-0000-000000000001',
    });
    itemBatch.push(...items);

    if (txBatch.length >= BATCH_SIZE || i === TOTAL) {
      console.log(`[${i}/${TOTAL}] Inserting batch of ${txBatch.length}...`);
      const { data: inserted, error: txErr } = await supabase.from('transactions').insert(txBatch).select('id');
      if (txErr) { console.error('TX error:', txErr.message); txBatch = []; itemBatch = []; continue; }
      const { error: itemErr } = await supabase.from('receipt_items').insert(itemBatch);
      if (itemErr) {
        console.error('Items error:', itemErr.message, '- rolling back');
        await supabase.from('transactions').delete().in('id', inserted!.map(t => t.id));
        txBatch = []; itemBatch = []; continue;
      }
      totalInserted += txBatch.length;
      txBatch = [];
      itemBatch = [];
    }
  }

  console.log(`\nInserted ${totalInserted} transactions + receipt_items into Supabase.`);

  // Sync to Neo4j
  console.log('\nConnecting to Neo4j...');
  const driver = getNeo4jDriver();
  if (!driver) {
    console.error('Neo4j driver not available (check env vars)');
    process.exit(1);
  }
  const sessionNeo = driver.session();

  // Use processOutboxSync pattern: split into batches of 100 (Neo4j free tier limit)
  const BATCH_NEO = 100;
  let synced = 0;
  for (let i = 0; i < neo4jPayloads.length; i += BATCH_NEO) {
    const chunk = neo4jPayloads.slice(i, i + BATCH_NEO);
    const count = await neo4jBulkMerge(chunk, sessionNeo);
    synced += count;
    console.log(`  Synced ${Math.min(i + BATCH_NEO, neo4jPayloads.length)}/${neo4jPayloads.length} to Neo4j`);
  }

  console.log(`\nTotal Neo4j batch merges: ${synced}`);

  // Cypher query
  console.log('\n=== Neo4j Query Results ===\n');

  const querySession = driver.session();
  // Query: count by node type for this tenant
  try {
    const result = await querySession.executeRead(async (tx: any) => {
      return await tx.run(`
        MATCH (t:Transaction)
        WHERE t.tenant_id = $tenantId
        RETURN
          count(t) AS transactionCount,
          count(DISTINCT t.category) AS categoryCount
      `, { tenantId: TENANT_ID });
    });
    const row = result.records[0];
    console.log(`Tenant transactions in Neo4j: ${row.get('transactionCount')}`);
    console.log(`Distinct categories: ${row.get('categoryCount')}`);
  } catch (e) {
    console.error('Query 1 failed:', e);
  }

  try {
    const result = await querySession.executeRead(async (tx: any) => {
      return await tx.run(`
        MATCH (m:Merchant)<-[:SUPPLIED_BY]-(sku:MerchantSKU)-[:IS_INSTANCE_OF]->(i:Ingredient)
        RETURN m.name AS merchant, collect(DISTINCT i.name) AS ingredients,
               count(sku) AS skuCount
        ORDER BY skuCount DESC
        LIMIT 5
      `);
    });
    if (result.records.length > 0) {
      console.log('\nTop 5 merchants by ingredient-linked SKUs:');
      for (const r of result.records) {
        console.log(`  ${r.get('merchant')}: ${r.get('skuCount')} SKUs → [${r.get('ingredients').slice(0, 3).join(', ')}${r.get('ingredients').length > 3 ? '...' : ''}]`);
      }
    } else {
      console.log('\nNo merchant-SKU-Ingredient links found (items not carried in payload).');
    }
  } catch (e) {
    console.error('Query 2 failed:', e);
  }

  try {
    const result = await querySession.executeRead(async (tx: any) => {
      return await tx.run(`
        MATCH (t:Transaction)-[:CONTAINS]->(sku:MerchantSKU)-[:IS_INSTANCE_OF]->(i:Ingredient)
        WHERE t.tenant_id = $tenantId
        RETURN i.name AS ingredient,
               count(DISTINCT t) AS txCount,
               round(avg(sku.unit_price), 2) AS avgUnitPrice,
               count(DISTINCT sku) AS skuCount
        ORDER BY txCount DESC
        LIMIT 10
      `, { tenantId: TENANT_ID });
    });
    if (result.records.length > 0) {
      console.log('\nTop 10 ingredients by transaction count:');
      for (const r of result.records) {
        console.log(`  ${r.get('ingredient')}: ${r.get('txCount')} txs, avg €${r.get('avgUnitPrice')}/unit, ${r.get('skuCount')} SKUs`);
      }
    } else {
      console.log('\nNo ingredient-linked transactions found. Phase 2+3 only runs when items are in payload.');
    }
  } catch (e) {
    console.error('Query 3 failed:', e);
  }

  // Summary
  try {
    const summary = await querySession.executeRead(async (tx: any) => {
      return await tx.run(`
        MATCH (n)
        RETURN labels(n) AS type, count(n) AS count
        ORDER BY count DESC
      `);
    });
    console.log('\nNeo4j node type counts (all tenants):');
    for (const r of summary.records) {
      console.log(`  :${r.get('type')[0]}: ${r.get('count')}`);
    }
  } catch (e) {
    console.error('Summary query failed:', e);
  }

  await querySession.close();
  await driver.close();
  console.log('\nDone.');
}

seed().catch(e => { console.error('Seed failed:', e.message || e); process.exit(1); });
