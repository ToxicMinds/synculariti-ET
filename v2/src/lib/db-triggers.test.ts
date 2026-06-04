import { loadFeature, defineFeature } from 'jest-cucumber';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually since dotenv is not installed
try {
  const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
} catch (e) {}

import { createServiceClient } from '@/lib/supabase-server';

const feature = loadFeature('./features/db-triggers.feature');

defineFeature(feature, (test) => {
  let supabase: any;
  const tenantId = '00000000-0000-0000-0000-000000000999';
  let transactionId = '';

  beforeAll(async () => {
    supabase = createServiceClient();
    // Setup test tenant
    await supabase.from('tenants').delete().eq('id', tenantId);
    await supabase.from('tenants').insert({
      id: tenantId,
      name: 'Test Tenant Trigger DB',
      handle: 'test-tenant-trigger-123'
    });
  });

  afterAll(async () => {
    await supabase.from('tenants').delete().eq('id', tenantId);
  });

  test('Legacy transaction insert trigger inserts into event_log', ({ given, when, then, and }) => {
    given(/^the test tenant "(.*)" exists$/, () => {});
    and('the event_log table is clear for the test tenant', async () => {
      await supabase.from('event_log').delete().eq('tenant_id', tenantId);
    });

    when('a transaction is inserted via direct DML', async () => {
      const { data, error } = await supabase.from('transactions').insert({
        tenant_id: tenantId,
        amount: 100,
        currency: 'EUR',
        category: 'Test',
        description: 'Test trigger transaction',
        transaction_type: 'DEBIT',
        date: new Date().toISOString().split('T')[0]
      }).select('id').single();
      
      if (error) throw error;
      transactionId = data.id;
    });

    then(/^an event "(.*)" should be recorded in event_log$/, async (action: string) => {
      const { data, error } = await supabase.from('event_log')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('action', action)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    and('the event who_id should be NULL', async () => {
      const { data } = await supabase.from('event_log')
        .select('who_id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      expect(data?.who_id).toBeNull();
    });

    and(/^the event who_type should be "(.*)"$/, async (whoType: string) => {
      const { data } = await supabase.from('event_log')
        .select('who_type')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      expect(data?.who_type).toBe(whoType);
    });
  });

  test('Legacy transaction delete trigger inserts into event_log', ({ given, when, then, and }) => {
    given(/^the test tenant "(.*)" exists$/, () => {});
    and('the event_log table is clear for the test tenant', async () => {
      await supabase.from('event_log').delete().eq('tenant_id', tenantId);
    });

    when('a transaction is deleted via direct DML', async () => {
      const { error } = await supabase.from('transactions').delete().eq('id', transactionId);
      if (error) throw error;
    });

    then(/^an event "(.*)" should be recorded in event_log$/, async (action: string) => {
      const { data, error } = await supabase.from('event_log')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('action', action)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    and('the event who_id should be NULL', async () => {
      const { data } = await supabase.from('event_log')
        .select('who_id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      expect(data?.who_id).toBeNull();
    });

    and(/^the event who_type should be "(.*)"$/, async (whoType: string) => {
      const { data } = await supabase.from('event_log')
        .select('who_type')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      expect(data?.who_type).toBe(whoType);
    });
  });

  test('Legacy inventory ledger triggers insert into event_log', ({ given, when, then, and }) => {
    let itemId = '';
    
    given(/^the test tenant "(.*)" exists$/, () => {});
    and('the event_log table is clear for the test tenant', async () => {
      await supabase.from('event_log').delete().eq('tenant_id', tenantId);
    });

    when('an inventory_ledger record is inserted via direct DML', async () => {
      // First create a location and an item to satisfy FKs
      const { data: loc, error: locErr } = await supabase.from('locations').insert({ tenant_id: tenantId, name: 'Test Loc' }).select('id').single();
      if (locErr) throw new Error('Loc insert failed: ' + locErr.message);
      
      const { data: item, error: itemErr } = await supabase.from('inventory_items').insert({ 
        tenant_id: tenantId, 
        name: 'Test Item', 
        sku: 'TEST-SKU', 
        inventory_uom: 'pcs', 
        purchasing_uom: 'pcs',
        conversion_factor: 1,
        type: 'RAW' 
      }).select('id').single();
      if (itemErr) throw new Error('Item insert failed: ' + itemErr.message);
      
      itemId = item.id;
      
      const { error } = await supabase.from('inventory_ledger').insert({
        tenant_id: tenantId,
        item_id: item.id,
        location_id: loc.id,
        change_amount: 10,
        reason: 'ADJUSTMENT',
        reference_id: '00000000-0000-0000-0000-000000000456'
      });
      if (error) throw new Error('Ledger insert failed: ' + error.message);
    });

    then(/^an event "(.*)" should be recorded in event_log$/, async (action: string) => {
      const { data, error } = await supabase.from('event_log')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('action', action)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    and('the event who_id should be NULL', async () => {
      const { data } = await supabase.from('event_log')
        .select('who_id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      expect(data?.who_id).toBeNull();
    });

    and(/^the event who_type should be "(.*)"$/, async (whoType: string) => {
      const { data } = await supabase.from('event_log')
        .select('who_type')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      expect(data?.who_type).toBe(whoType);
    });
  });

  test('resolve_purchase_quarantine_v1 ignores missing user ID parameter', ({ given, when, then, and }) => {
    let poId = '';

    given(/^the test tenant "(.*)" exists$/, () => {});
    and('the event_log table is clear for the test tenant', async () => {
      await supabase.from('event_log').delete().eq('tenant_id', tenantId);
    });

    when(/^I call resolve_purchase_quarantine_v1 with status "(.*)"$/, async (status: string) => {
      // First create a location and chart_of_accounts to satisfy FKs
      const { data: loc, error: locErr } = await supabase.from('locations').insert({ tenant_id: tenantId, name: 'Test Loc 2' }).select('id').single();
      if (locErr) throw new Error('Loc 2 insert failed: ' + locErr.message);

      const { data: acc, error: accErr } = await supabase.from('chart_of_accounts').insert({
        tenant_id: tenantId,
        account_code: 'TEST-ACC-1',
        account_name: 'Test Account',
        account_type: 'EXPENSE'
      }).select('id').single();
      if (accErr) throw new Error('Account insert failed: ' + accErr.message);
      
      const { data: po, error: poErr } = await supabase.from('purchases').insert({
        tenant_id: tenantId,
        location_id: loc.id,
        account_id: acc.id,
        quarantine_status: 'PENDING',
        total_amount: 100,
        vendor_name: 'Test Vendor',
        invoice_number: 'INV-123',
        currency: 'EUR',
        purchase_date: new Date().toISOString().split('T')[0]
      }).select('id').single();
      if (poErr) throw new Error('Purchase insert failed: ' + poErr.message);
      
      poId = po.id;
      
      const { error } = await supabase.rpc('resolve_purchase_quarantine_v1', {
        p_purchase_id: poId,
        p_status: status
      });
      // Test will fail if error is thrown
      expect(error).toBeNull();
    });

    then(/^the purchase_orders status should be "(.*)"$/, async (status: string) => {
      const { data, error } = await supabase.from('purchases')
        .select('quarantine_status')
        .eq('id', poId)
        .single();
        
      expect(error).toBeNull();
      expect(data?.quarantine_status).toBe(status);
    });

    and(/^no error regarding "(.*)" parameter should be thrown$/, (param: string) => {
      // Handled implicitly by expect(error).toBeNull() in the when step
    });
  });
});
