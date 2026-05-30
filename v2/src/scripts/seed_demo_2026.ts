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

// --- FCV Pipeline data constants ---
const LOCATIONS = [
  { name: 'Bratislava - Obchodná', address: 'Obchodná 12, Bratislava' },
  { name: 'Bratislava - Ružinov', address: 'Ružinovská 45, Bratislava' },
  { name: 'Košice - Hlavná', address: 'Hlavná 78, Košice' },
];

// canonical ingredients for FCV pipeline
const INGREDIENTS: Array<{
  id: string; name: string; category: string; unit: string; perishabilityDays: number; costPerGram: number;
}> = [
  { id: 'ing-chicken-breast', name: 'Kuracie prsia', category: 'Mäso', unit: 'g', perishabilityDays: 5, costPerGram: 0.042 },
  { id: 'ing-potatoes', name: 'Zemiaky', category: 'Zelenina', unit: 'g', perishabilityDays: 30, costPerGram: 0.008 },
  { id: 'ing-milk', name: 'Mlieko', category: 'Mliečne výrobky', unit: 'ml', perishabilityDays: 7, costPerGram: 0.0012 },
  { id: 'ing-oil', name: 'Slnečnicový olej', category: 'Tuky', unit: 'ml', perishabilityDays: 365, costPerGram: 0.006 },
  { id: 'ing-lettuce', name: 'Šalát ľadový', category: 'Zelenina', unit: 'g', perishabilityDays: 3, costPerGram: 0.015 },
  { id: 'ing-tomato', name: 'Rajčiny', category: 'Zelenina', unit: 'g', perishabilityDays: 5, costPerGram: 0.018 },
  { id: 'ing-bun', name: 'Žemľa burgerová', category: 'Pečivo', unit: 'pc', perishabilityDays: 4, costPerGram: 0.025 },
  { id: 'ing-ice-cream', name: 'Zmrzlina vanilková', category: 'Mliečne výrobky', unit: 'g', perishabilityDays: 90, costPerGram: 0.020 },
  { id: 'ing-kofola', name: 'Kofola', category: 'Nápoje', unit: 'ml', perishabilityDays: 180, costPerGram: 0.0008 },
  { id: 'ing-beer', name: 'Zlatý Bažant', category: 'Nápoje', unit: 'ml', perishabilityDays: 90, costPerGram: 0.0010 },
];

const RECIPES: Array<{
  menuItemId: string; menuItemName: string; sellingPrice: number;
  ingredients: Array<{ ingredientId: string; gramsPerServing: number }>;
}> = [
  { menuItemId: 'burger-chicken', menuItemName: 'Kurací burger', sellingPrice: 8.50, ingredients: [
    { ingredientId: 'ing-chicken-breast', gramsPerServing: 150 },
    { ingredientId: 'ing-bun', gramsPerServing: 80 },
    { ingredientId: 'ing-lettuce', gramsPerServing: 30 },
    { ingredientId: 'ing-tomato', gramsPerServing: 40 },
    { ingredientId: 'ing-oil', gramsPerServing: 10 },
  ]},
  { menuItemId: 'fries', menuItemName: 'Zemiakové hranolky', sellingPrice: 3.50, ingredients: [
    { ingredientId: 'ing-potatoes', gramsPerServing: 250 },
    { ingredientId: 'ing-oil', gramsPerServing: 15 },
  ]},
  { menuItemId: 'milkshake', menuItemName: 'Mliečny koktail', sellingPrice: 4.00, ingredients: [
    { ingredientId: 'ing-milk', gramsPerServing: 300 },
    { ingredientId: 'ing-ice-cream', gramsPerServing: 50 },
  ]},
  { menuItemId: 'kofola-03', menuItemName: 'Kofola 0.3L', sellingPrice: 1.50, ingredients: [
    { ingredientId: 'ing-kofola', gramsPerServing: 300 },
  ]},
  { menuItemId: 'beer-05', menuItemName: 'Zlatý Bažant 0.5L', sellingPrice: 2.80, ingredients: [
    { ingredientId: 'ing-beer', gramsPerServing: 500 },
  ]},
  { menuItemId: 'salad-chicken', menuItemName: 'Grilovaný kurací šalát', sellingPrice: 9.00, ingredients: [
    { ingredientId: 'ing-chicken-breast', gramsPerServing: 120 },
    { ingredientId: 'ing-lettuce', gramsPerServing: 80 },
    { ingredientId: 'ing-tomato', gramsPerServing: 50 },
    { ingredientId: 'ing-oil', gramsPerServing: 10 },
  ]},
];

const MENU_ITEM_IDS = RECIPES.map(r => r.menuItemId);

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateUUID() {
  return crypto.randomUUID();
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  console.log('--- STARTING SEED FOR @demo-2026 ---');

  // 1. Ensure Tenant Exists
  const { data: tenantRes } = await supabase
    .from('tenants')
    .select('id')
    .eq('handle', DEMO_TENANT_HANDLE)
    .single();

  let tenantId: string;

  if (!tenantRes) {
    console.log('Tenant not found. Creating...');
    const { data: newTenant, error: insertErr } = await supabase
      .from('tenants')
      .insert({
        name: DEMO_TENANT_NAME,
        handle: DEMO_TENANT_HANDLE,
        categories: Array.from(new Set(VENDORS.map(v => v.cat))),
      })
      .select('id')
      .single();

    if (insertErr) throw new Error(`Failed to create tenant: ${insertErr.message}`);
    tenantId = newTenant.id;
  } else {
    tenantId = tenantRes.id;
  }

  console.log(`Using Tenant ID: ${tenantId}`);

  // ====== 2. FCV Pipeline Seed ======

  // 2a. Chart of Accounts
  console.log('Seeding chart_of_accounts...');
  const coaEntries = [
    { account_code: '5000', account_name: 'COGS - Mäsové výrobky', account_type: 'EXPENSE' },
    { account_code: '5010', account_name: 'COGS - Zelenina', account_type: 'EXPENSE' },
    { account_code: '5020', account_name: 'COGS - Mliečne výrobky', account_type: 'EXPENSE' },
    { account_code: '5030', account_name: 'COGS - Nápoje', account_type: 'EXPENSE' },
    { account_code: '5040', account_name: 'COGS - Ostatné', account_type: 'EXPENSE' },
  ];

  const accountMap = new Map<string, string>();
  for (const coa of coaEntries) {
    const { data: existing } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('account_code', coa.account_code)
      .maybeSingle();

    if (existing) {
      accountMap.set(coa.account_code, existing.id);
    } else {
      const { data: inserted, error } = await supabase
        .from('chart_of_accounts')
        .insert({ ...coa, tenant_id: tenantId })
        .select('id')
        .single();
      if (error) throw new Error(`Failed to create COA ${coa.account_code}: ${error.message}`);
      accountMap.set(coa.account_code, inserted.id);
    }
  }

  // Map ingredient category → account_code
  function accountForIngredient(ingId: string): string {
    const ing = INGREDIENTS.find(i => i.id === ingId);
    if (!ing) return accountMap.get('5040')!;
    if (ing.category === 'Mäso') return accountMap.get('5000')!;
    if (ing.category === 'Zelenina' || ing.category === 'Pečivo') return accountMap.get('5010')!;
    if (ing.category === 'Mliečne výrobky' || ing.category === 'Tuky') return accountMap.get('5020')!;
    if (ing.category === 'Nápoje') return accountMap.get('5030')!;
    return accountMap.get('5040')!;
  }

  // 2b. Locations
  console.log('Seeding locations...');
  const locationRows: Array<{ id: string; name: string; address: string }> = [];
  for (const loc of LOCATIONS) {
    const { data: existing } = await supabase
      .from('locations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', loc.name)
      .maybeSingle();
    if (existing) {
      locationRows.push({ id: existing.id, name: loc.name, address: loc.address });
      console.log(`  Location exists: ${loc.name} (${existing.id})`);
    } else {
      const id = generateUUID();
      const { error } = await supabase
        .from('locations')
        .insert({ id, tenant_id: tenantId, name: loc.name, address: loc.address });
      if (error) throw new Error(`Failed to create location ${loc.name}: ${error.message}`);
      locationRows.push({ id, name: loc.name, address: loc.address });
      console.log(`  Location created: ${loc.name} (${id})`);
    }
  }

  // 2c. Cached Ingredients
  console.log('Seeding cached_ingredients...');
  for (const ing of INGREDIENTS) {
    const { error } = await supabase
      .from('cached_ingredients')
      .upsert({
        tenant_id: tenantId,
        ingredient_id: ing.id,
        canonical_name: ing.name,
        category: ing.category,
        base_unit: ing.unit,
        perishability_days: ing.perishabilityDays,
        cost_per_gram: ing.costPerGram,
        current_stock_grams: randInt(5000, 50000),
      }, { onConflict: 'tenant_id, ingredient_id' });
    if (error) console.error(`  Failed to insert ingredient ${ing.name}:`, error.message);
  }
  console.log(`  ${INGREDIENTS.length} ingredients cached`);

  // 2d. Cached Recipes
  console.log('Seeding cached_recipes...');
  for (const recipe of RECIPES) {
    const totalCost = recipe.ingredients.reduce((sum, ri) => {
      const ing = INGREDIENTS.find(i => i.id === ri.ingredientId);
      return sum + (ing ? ing.costPerGram * ri.gramsPerServing : 0);
    }, 0);
    const foodCostPct = recipe.sellingPrice > 0 ? (totalCost / recipe.sellingPrice) * 100 : 0;

    const { error } = await supabase
      .from('cached_recipes')
      .upsert({
        tenant_id: tenantId,
        menu_item_id: recipe.menuItemId,
        menu_item_name: recipe.menuItemName,
        selling_price: recipe.sellingPrice,
        is_active: true,
        ingredients: recipe.ingredients.map(ri => ({
          ingredient_id: ri.ingredientId,
          ingredient_name: INGREDIENTS.find(i => i.id === ri.ingredientId)?.name || ri.ingredientId,
          grams_per_serving: ri.gramsPerServing,
        })),
        total_ingredient_cost: Math.round(totalCost * 100) / 100,
        food_cost_pct: Math.round(foodCostPct * 10) / 10,
      }, { onConflict: 'tenant_id, menu_item_id' });
    if (error) console.error(`  Failed to insert recipe ${recipe.menuItemName}:`, error.message);
  }
  console.log(`  ${RECIPES.length} recipes cached`);

  // 2e. POS Batch + Staging Transactions
  console.log('Seeding POS data (May 1 – Jun 30)...');
  const posStart = new Date('2026-05-01T00:00:00Z');
  const posEnd = new Date('2026-06-30T23:59:59Z');
  const posTotalDays = Math.floor((posEnd.getTime() - posStart.getTime()) / 86400000) + 1;

  // Create a batch per week
  let totalStagingRows = 0;
  let currentDate = new Date(posStart);

  while (currentDate <= posEnd) {
    const batchEnd = new Date(currentDate);
    batchEnd.setUTCDate(batchEnd.getUTCDate() + 6);
    if (batchEnd > posEnd) batchEnd.setTime(posEnd.getTime());

    const batchId = generateUUID();
    const { error: batchErr } = await supabase
      .from('pos_batch_uploads')
      .insert({
        id: batchId,
        tenant_id: tenantId,
        location_id: locationRows[0].id,
        batch_id: `batch-${currentDate.toISOString().slice(0, 10)}`,
        source: 'ims',
        status: 'COMPLETED',
        total_receipts: 0,
        approved_rows: 0,
        quarantined_rows: 0,
        period_start: currentDate.toISOString().slice(0, 10),
        period_end: batchEnd.toISOString().slice(0, 10),
        received_at: currentDate.toISOString(),
        processed_at: batchEnd.toISOString(),
      });

    if (batchErr) {
      console.error(`  Batch insert error at ${currentDate.toISOString().slice(0, 10)}:`, batchErr.message);
      currentDate.setUTCDate(currentDate.getUTCDate() + 7);
      continue;
    }

    // Generate staging rows for each day in batch
    for (let d = new Date(currentDate); d <= batchEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      const dayOfWeek = d.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const multiplier = isWeekend ? 2.5 : 1.0;

      for (const loc of locationRows) {
        // Skip some days to create data gaps (roughly 10% of days)
        if (Math.random() < 0.08) continue;

        const numSales = Math.floor((12 + Math.random() * 20) * multiplier);

        for (let s = 0; s < numSales; s++) {
          const recipe = pick(RECIPES);
          const transactionTime = new Date(d);
          transactionTime.setUTCHours(randInt(8, 22), randInt(0, 59), 0, 0);

          const ingResolved = recipe.ingredients.map(ri => {
            const ing = INGREDIENTS.find(i => i.id === ri.ingredientId)!;
            const cost = Math.round(ing.costPerGram * ri.gramsPerServing * 100) / 100;
            return {
              ingredient_id: ri.ingredientId,
              ingredient_name: ing.name,
              grams: ri.gramsPerServing,
              cost,
            };
          });

          const totalCost = ingResolved.reduce((sum, ir) => sum + ir.cost, 0);

          const { error: stagingErr } = await supabase
            .from('pos_transaction_staging')
            .insert({
              tenant_id: tenantId,
              location_id: loc.id,
              batch_id: batchId,
              line_number: s + 1,
              raw_payload: { menuItemId: recipe.menuItemId },
              transaction_time: transactionTime.toISOString(),
              receipt_number: `POS-${d.toISOString().slice(0, 10)}-${loc.name.slice(0, 3)}-${s + 1}`,
              item_sku: recipe.menuItemId,
              item_name: recipe.menuItemName,
              quantity: 1,
              revenue: recipe.sellingPrice,
              recipe_found: true,
              theoretical_grams: {
                ingredients: ingResolved,
                total_grams: ingResolved.reduce((sum, r) => sum + r.grams, 0),
                total_cost: Math.round(totalCost * 100) / 100,
              },
              flag: 'APPROVED',
            });

          if (stagingErr) {
            console.error(`    Staging insert error at ${d.toISOString().slice(0, 10)}:`, stagingErr.message);
          } else {
            totalStagingRows++;
          }
        }
      }
    }

    // Update batch counts
    await supabase
      .from('pos_batch_uploads')
      .update({ status: 'COMPLETED', processed_at: new Date().toISOString() })
      .eq('id', batchId);

    currentDate.setUTCDate(currentDate.getUTCDate() + 7);
  }
  console.log(`  ${totalStagingRows} POS staging rows inserted`);

  // 2f. Purchase Records
  console.log('Seeding purchase records (matching POS ingredient consumption)...');
  // Collect ingredient totals from staging data for purchase correlation
  const { data: stagingRows } = await supabase
    .from('pos_transaction_staging')
    .select('theoretical_grams, transaction_time, location_id')
    .eq('tenant_id', tenantId);

  const ingConsumptionMap = new Map<string, { totalGrams: number; totalCost: number }>();

  for (const row of (stagingRows || [])) {
    if (!row.theoretical_grams?.ingredients) continue;
    for (const ing of row.theoretical_grams.ingredients) {
      const key = ing.ingredient_id;
      const cur = ingConsumptionMap.get(key) || { totalGrams: 0, totalCost: 0 };
      cur.totalGrams += ing.grams;
      cur.totalCost += ing.cost;
      ingConsumptionMap.set(key, cur);
    }
  }

  // Create purchase records that approximately match consumption
  // Some ingredients get a markup (actual > theoretical), some get a discount
  const purchaseMultipliers: Record<string, number> = {
    'ing-chicken-breast': 1.35, // premium — overspend scenario
    'ing-potatoes': 1.05,      // close to theoretical
    'ing-milk': 0.95,          // slightly under
    'ing-oil': 0.90,           // under — bought in bulk
    'ing-lettuce': 1.40,       // overspend — volatile pricing
    'ing-tomato': 1.10,
    'ing-bun': 1.00,
    'ing-ice-cream': 0.85,
    'ing-kofola': 1.00,
    'ing-beer': 1.20,          // overspend
  };

  const VENDOR_MAP: Record<string, string> = {
    'ing-chicken-breast': 'Bidfood Slovakia',
    'ing-potatoes': 'LUNYS s.r.o.',
    'ing-milk': 'Metro Cash & Carry SR',
    'ing-oil': 'Metro Cash & Carry SR',
    'ing-lettuce': 'LUNYS s.r.o.',
    'ing-tomato': 'LUNYS s.r.o.',
    'ing-bun': 'Metro Cash & Carry SR',
    'ing-ice-cream': 'Metro Cash & Carry SR',
    'ing-kofola': 'Kofola a.s.',
    'ing-beer': 'Heineken Slovensko',
  };

  let purchaseCount = 0;
  for (const ing of INGREDIENTS) {
    const consumed = ingConsumptionMap.get(ing.id);
    if (!consumed) continue;

    const multiplier = purchaseMultipliers[ing.id] || 1.1;
    const targetSpend = consumed.totalCost * multiplier;

    // Create 2-4 purchases per ingredient spread across the period
    const numPurchases = randInt(2, 4);
    const perPurchase = targetSpend / numPurchases;

    for (let p = 0; p < numPurchases; p++) {
      const purchaseDate = new Date(posStart);
      purchaseDate.setUTCDate(purchaseDate.getUTCDate() + randInt(0, posTotalDays - 1));
      const loc = pick(locationRows);
      const amount = Math.round((perPurchase * (0.85 + Math.random() * 0.3)) * 100) / 100;

      const { error } = await supabase
        .from('purchases')
        .insert({
          tenant_id: tenantId,
          location_id: loc.id,
          account_id: accountForIngredient(ing.id),
          ingredient_id: ing.id,
          ingredient_name: ing.name,
          vendor_name: VENDOR_MAP[ing.id] || 'Metro Cash & Carry SR',
          total_amount: amount,
          currency: 'EUR',
          receipt_type: 'scanned',
          purchase_date: purchaseDate.toISOString().slice(0, 10),
          quarantine_status: 'APPROVED',
        });

      if (error) {
        console.error(`  Purchase insert error for ${ing.name}:`, error.message);
      } else {
        purchaseCount++;
      }
    }
  }
  console.log(`  ${purchaseCount} purchase records inserted`);

  // 2g-bis. Attention-needing items (for NeedsAttention banner)
  if (locationRows.length > 0) {
    const loc = locationRows[0];
    const accounts = Array.from(accountMap.values());
    if (accounts.length > 0) {
      await supabase.from('purchases').insert({
        tenant_id: tenantId, location_id: loc.id, account_id: accounts[0],
        total_amount: 89.50, purchase_date: '2026-06-15',
        ingredient_id: 'ing-chicken-breast', ingredient_name: 'Kuracie prsia',
        vendor_name: 'Bidfood Slovakia', quarantine_status: 'PENDING',
      });
      const { data: latest } = await supabase.from('purchases')
        .select('id').eq('tenant_id', tenantId)
        .order('created_at', { ascending: false }).limit(1);
      if (latest?.[0]) {
        await supabase.from('purchase_anomaly_queue').insert({
          tenant_id: tenantId, location_id: loc.id,
          purchase_id: latest[0].id, check_type: 'price_spike',
          severity: 'medium', status: 'OPEN',
        });
      }
      console.log('  Seeded items needing attention');
    }
  }

  // 2h. Data Gaps (some days without POS data)
  console.log('Seeding POS data gaps...');
  let gapCount = 0;
  for (let d = new Date(posStart); d <= posEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    // Create a gap for ~5% of days
    if (Math.random() < 0.05) {
      const loc = pick(locationRows);
      const { error } = await supabase
        .from('pos_data_gaps')
        .upsert({
          tenant_id: tenantId,
          location_id: loc.id,
          gap_date: d.toISOString().slice(0, 10),
        }, { onConflict: 'tenant_id, location_id, gap_date' });
      if (!error) gapCount++;
    }
  }
  console.log(`  ${gapCount} data gap records inserted`);

  // ====== 3. Existing Transaction Seed ======
  const { count: existingTxCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if (existingTxCount && existingTxCount > 1000) {
    console.log(`Skipping transaction seed (${existingTxCount} already exist)`);
  } else {
    console.log(`Generating ${TOTAL_TRANSACTIONS} transactions over 6 months...`);

  const txStartDate = new Date('2026-03-01T00:00:00Z');
  const txEndDate = new Date('2026-04-30T23:59:59Z');

  const mockUserIds = [
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
  ];

  let transactionsBatch: any[] = [];
  let itemsBatch: any[] = [];

  for (let i = 1; i <= TOTAL_TRANSACTIONS; i++) {
    const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)];
    const txId = generateUUID();
    const date = randomDate(txStartDate, txEndDate).toISOString().split('T')[0];
    const assignedWhoId = mockUserIds[Math.floor(Math.random() * mockUserIds.length)];

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
        currency: 'EUR',
        source_type: 'receipt',
      });
    }

    transactionsBatch.push({
      id: txId,
      tenant_id: tenantId,
      amount: Math.round(totalAmount * 100) / 100,
      currency: 'EUR',
      category: vendor.cat,
      date: date,
      description: vendor.name,
      transaction_type: 'DEBIT',
      transacted_at: new Date(date).toISOString(),
      receipt_number: `REC-${Math.floor(Math.random() * 100000)}`,
      who_id: assignedWhoId,
    });

    if (transactionsBatch.length === BATCH_SIZE || i === TOTAL_TRANSACTIONS) {
      console.log(`Inserting batch up to ${i}...`);

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
        const driver = getNeo4jDriver();
        if (driver) {
          const sessionNeo = driver.session();
          await neo4jBulkMerge(transactionsBatch, sessionNeo);
          await sessionNeo.close();
          await driver.close();
          console.log(`  - Synced ${transactionsBatch.length} to Neo4j.`);
        }
      } catch (e) {
        console.error('Neo4j Sync Error:', e);
      }

      transactionsBatch = [];
      itemsBatch = [];
    }
    } // end transaction generation for loop
  } // end else (skip if transactions already exist)

  // ====== 5. Tenant Members & Config ======
  console.log('Setting up tenant members and config...');
  const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error('Failed to list auth users:', authErr.message);
  } else {
    const userMap = new Map<string, string>();
    for (const u of authUsers.users) {
      if (u.email === 'nikshanbhag@gmail.com') userMap.set('nik', u.id);
      if (u.email === 'prasanth.k.ramesh@gmail.com') userMap.set('prasanth', u.id);
      if (u.email === 'yokheshraja@gmail.com') userMap.set('yoki', u.id);
    }

    // Insert tenant_members
    const members = [
      { email: 'nikshanbhag@gmail.com', role: 'OWNER' },
      { email: 'prasanth.k.ramesh@gmail.com', role: 'ADMIN' },
      { email: 'yokheshraja@gmail.com', role: 'MEMBER' },
    ];
    for (const m of members) {
      const { error: meErr } = await supabase
        .from('tenant_members')
        .upsert({ tenant_id: tenantId, ...m }, { onConflict: 'tenant_id,email' });
      if (meErr) console.error(`  Member insert error (${m.email}):`, meErr.message);
    }
    console.log(`  Added ${members.length} tenant members`);

    // Set tenant config
    const names: Record<string, string> = {};
    if (userMap.get('nik')) names[userMap.get('nik')!] = 'Nik';
    if (userMap.get('prasanth')) names[userMap.get('prasanth')!] = 'Prasanth';
    if (userMap.get('yoki')) names[userMap.get('yoki')!] = 'Yoki';

    const { error: configErr } = await supabase
      .from('tenants')
      .update({
        config: {
          names,
          phones: {
            owner: '421904855155',
            manager: '421904855155',
            prasanth: '421944016820',
            yoki: '421951153761',
          },
          income: {
            'Bratislava - Obchodná': 25000,
            'Bratislava - Ružinov': 18000,
            'Košice - Hlavná': 22000,
          },
          budgets: {
            'Food Costs': 8000,
            'Labor & Wages': 12000,
            'Utilities': 1500,
            'Supplies': 1000,
          },
          goals: { monthly_savings: 5000 },
          workflows: {
            bill_approval: { enabled: true, threshold: 100, recipients: ['owner'] },
            low_stock_alert: { enabled: true, threshold_pct: 80, recipients: ['manager'] },
            daily_summary: { enabled: false, time: '21:00', recipients: ['owner'] },
          },
        },
      })
      .eq('id', tenantId);
    if (configErr) console.error('  Config update error:', configErr.message);
    else console.log('  Tenant config updated with phones + workflows');
  }

  console.log('--- SEEDING COMPLETE ---');
}

seed().catch(console.error);
