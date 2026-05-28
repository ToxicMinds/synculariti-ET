import './load-env';
import { createServiceClient } from '../lib/supabase-server';
import { getNeo4jDriver, neo4jBulkMerge } from '../lib/neo4j';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createServiceClient();

const DEMO_TENANT_NAME = 'Demo Tenant 2026';
const DEMO_TENANT_HANDLE = '@demo-2026';
const TOTAL_TRANSACTIONS = 5000;
const BATCH_SIZE = 500;

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

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateUUID() {
  return crypto.randomUUID();
}

async function seed() {
  console.log('--- STARTING SEED FOR @demo-2026 ---');

  // 1. Ensure Tenant Exists
  const { data: tenantRes, error: tenantErr } = await supabase
    .from('tenants')
    .select('id')
    .eq('handle', DEMO_TENANT_HANDLE)
    .single();

  let tenantId;

  if (tenantErr || !tenantRes) {
    console.log('Tenant not found. Creating...');
    const { data: newTenant, error: insertErr } = await supabase
      .from('tenants')
      .insert({
        name: DEMO_TENANT_NAME,
        handle: DEMO_TENANT_HANDLE,
        categories: Array.from(new Set(VENDORS.map(v => v.cat)))
      })
      .select('id')
      .single();
    
    if (insertErr) throw new Error(`Failed to create tenant: ${insertErr.message}`);
    tenantId = newTenant.id;
  } else {
    tenantId = tenantRes.id;
  }

  console.log(`Using Tenant ID: ${tenantId}`);

  // We don't necessarily need an app_user if we insert using service_role and just set tenant_id.
  
  // 2. Generate Data
  const driver = getNeo4jDriver();
  if (!driver) throw new Error('Neo4j Driver could not be initialized.');
  const sessionNeo = driver.session();

  console.log(`Generating ${TOTAL_TRANSACTIONS} transactions over 6 months with polymorphic user mappings...`);

  const startDate = new Date('2026-03-01T00:00:00Z');
  const endDate = new Date('2026-04-30T23:59:59Z');

  // Polymorphic mock user IDs for team allocation tracking
  const mockUserIds = [
    '00000000-0000-0000-0000-000000000001', // Staff Member 1 (u1)
    '00000000-0000-0000-0000-000000000002'  // Staff Member 2 (u2)
  ];

  let transactionsBatch: any[] = [];
  let itemsBatch: any[] = [];

  for (let i = 1; i <= TOTAL_TRANSACTIONS; i++) {
    const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)];
    const txId = generateUUID();
    const date = randomDate(startDate, endDate).toISOString().split('T')[0];
    const assignedWhoId = mockUserIds[Math.floor(Math.random() * mockUserIds.length)];
    
    // Generate 1 to 5 random items
    const itemCount = Math.floor(Math.random() * 5) + 1;
    let totalAmount = 0;
    
    for (let j = 0; j < itemCount; j++) {
      const itemPrice = Math.round((Math.random() * 100 + 5) * 100) / 100;
      totalAmount += itemPrice;
      const itemName = vendor.items[Math.floor(Math.random() * vendor.items.length)];
      
      itemsBatch.push({
        id: generateUUID(),
        transaction_id: txId,
        tenant_id: tenantId,
        name: itemName,
        amount: itemPrice,
        category: vendor.cat,
        currency: 'EUR'
      });
    }

    transactionsBatch.push({
      id: txId,
      tenant_id: tenantId,
      amount: Math.round(totalAmount * 100) / 100,
      currency: 'EUR',
      category: vendor.cat,
      date: date,
      description: vendor.name, // The neo4jBulkMerge expects description = vendor name
      transaction_type: 'DEBIT',
      transacted_at: new Date(date).toISOString(),
      receipt_number: `REC-${Math.floor(Math.random() * 100000)}`,
      who_id: assignedWhoId
    });

    if (transactionsBatch.length === BATCH_SIZE || i === TOTAL_TRANSACTIONS) {
      console.log(`Inserting batch up to ${i}...`);
      
      // Insert Transactions (with select to capture IDs for rollback)
      const { data: insertedTxs, error: txErr } = await supabase
        .from('transactions')
        .insert(transactionsBatch)
        .select('id');
      if (txErr) {
        console.error('Transactions Error:', txErr);
        transactionsBatch = [];
        itemsBatch = [];
        continue;
      }

      // Insert Items (atomic with transactions via rollback)
      const { error: itemsErr } = await supabase
        .from('receipt_items')
        .insert(itemsBatch);
      if (itemsErr) {
        console.error('Items Error:', itemsErr, '- Rolling back transactions');
        await supabase
          .from('transactions')
          .delete()
          .in('id', insertedTxs.map(t => t.id));
        transactionsBatch = [];
        itemsBatch = [];
        continue;
      }

      // Neo4j Merge
      try {
        await neo4jBulkMerge(transactionsBatch, sessionNeo);
        console.log(`  - Synced ${transactionsBatch.length} to Neo4j.`);
      } catch (e) {
        console.error('Neo4j Sync Error:', e);
      }

      transactionsBatch = [];
      itemsBatch = [];
    }
  }

  await sessionNeo.close();
  await driver.close();
  console.log('--- SEEDING COMPLETE ---');
}

seed().catch(console.error);
