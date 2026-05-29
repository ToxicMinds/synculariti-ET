import { supabase, checkFunctionSecurity, tableExists, columnExists, indexExists } from '@/lib/db-security-helpers';
import { BATCH_3_SECURITY_CONTRACT, BATCH_3_LANDMINE_CONTRACT } from './db-security-contract';
import { resolveFixtures, TestFixtures, skipIfNoFixtures, uniqueBatchId, uniqueGapDate } from './test-fixtures';

describe('Phase 1: POS Batch Staging Schema Contract', () => {

  // ───── pos_batch_uploads table ─────
  describe('pos_batch_uploads table', () => {
    const requiredColumns = [
      'id', 'tenant_id', 'location_id', 'batch_id', 'source',
      'status', 'total_receipts', 'approved_rows', 'quarantined_rows',
      'period_start', 'period_end', 'received_at', 'processed_at', 'error_detail'
    ];

    test('table exists', async () => {
      expect(await tableExists('pos_batch_uploads')).toBe(true);
    });

    requiredColumns.forEach(col => {
      test(`has column: ${col}`, async () => {
        expect(await columnExists('pos_batch_uploads', col)).toBe(true);
      });
    });
  });

  // ───── pos_batch_uploads constraints ─────
  describe('pos_batch_uploads constraints', () => {
    let fx: TestFixtures;
    let batchId: string;

    beforeAll(async () => {
      fx = await resolveFixtures();
    });

    afterAll(async () => {
      if (batchId) {
        await supabase.from('pos_batch_uploads').delete().eq('batch_id', batchId);
      }
    });

    test('total_receipts column rejects NULL (NOT NULL)', async () => {
      if (skipIfNoFixtures(fx)) return;
      const { error } = await supabase.from('pos_batch_uploads').insert({
        tenant_id: fx.tenantId,
        location_id: fx.locationId,
        batch_id: uniqueBatchId(),
        total_receipts: null,
        status: 'STAGED',
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/null value in column "total_receipts"/i);
    });

    test('status column rejects NULL (NOT NULL)', async () => {
      if (skipIfNoFixtures(fx)) return;
      const { error } = await supabase.from('pos_batch_uploads').insert({
        tenant_id: fx.tenantId,
        location_id: fx.locationId,
        batch_id: uniqueBatchId(),
        total_receipts: 0,
        status: null,
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/null value in column "status"/i);
    });

    test('status CHECK rejects invalid value', async () => {
      if (skipIfNoFixtures(fx)) return;
      const { error } = await supabase.from('pos_batch_uploads').insert({
        tenant_id: fx.tenantId,
        location_id: fx.locationId,
        total_receipts: 0,
        status: 'INVALID_STATUS',
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/check constraint|status/i);
    });

    test('status CHECK accepts all valid values', async () => {
      if (skipIfNoFixtures(fx)) return;
      for (const status of ['STAGED', 'PROCESSING', 'COMPLETED', 'FAILED']) {
        const testBatch = uniqueBatchId();
        const { error } = await supabase.from('pos_batch_uploads').insert({
          tenant_id: fx.tenantId,
          location_id: fx.locationId,
          batch_id: testBatch,
          total_receipts: 0,
          status,
        });
        expect(error).toBeNull();
        batchId = testBatch;
      }
    });

    test('UNIQUE (tenant_id, batch_id) rejects duplicates', async () => {
      if (skipIfNoFixtures(fx)) return;
      const dupBatchId = uniqueBatchId();
      const { error: err1 } = await supabase.from('pos_batch_uploads').insert({
        tenant_id: fx.tenantId,
        location_id: fx.locationId,
        batch_id: dupBatchId,
        total_receipts: 0,
        status: 'STAGED',
      });
      expect(err1).toBeNull();
      batchId = dupBatchId;

      const { error: err2 } = await supabase.from('pos_batch_uploads').insert({
        tenant_id: fx.tenantId,
        location_id: fx.locationId,
        batch_id: dupBatchId,
        total_receipts: 0,
        status: 'STAGED',
      });
      expect(err2).not.toBeNull();
      expect(err2.message).toMatch(/duplicate/i);
    });

    test('UNIQUE allows same batch_id for different tenants', async () => {
      if (!fx.tenantId) return;
      const { data: tenants } = await supabase.from('tenants').select('id').limit(2);
      if (!tenants || tenants.length < 2) return;

      const sharedBatch = uniqueBatchId();
      const tid1 = tenants[0].id;
      const tid2 = tenants[1].id;

      const { data: loc1 } = await supabase.from('locations').select('id').eq('tenant_id', tid1).limit(1);
      const { data: loc2 } = await supabase.from('locations').select('id').eq('tenant_id', tid2).limit(1);
      if (!loc1?.length || !loc2?.length) return;

      const { error: err1 } = await supabase.from('pos_batch_uploads').insert({
        tenant_id: tid1, location_id: loc1[0].id,
        batch_id: sharedBatch, total_receipts: 0, status: 'STAGED',
      });
      expect(err1).toBeNull();

      const { error: err2 } = await supabase.from('pos_batch_uploads').insert({
        tenant_id: tid2, location_id: loc2[0].id,
        batch_id: sharedBatch, total_receipts: 0, status: 'STAGED',
      });
      expect(err2).toBeNull();

      await supabase.from('pos_batch_uploads').delete().eq('batch_id', sharedBatch);
    });
  });

  // ───── pos_transaction_staging table ─────
  describe('pos_transaction_staging table', () => {
    const requiredColumns = [
      'id', 'batch_id', 'tenant_id', 'location_id', 'line_number',
      'raw_payload', 'transaction_time', 'receipt_number',
      'item_sku', 'item_name', 'quantity', 'revenue', 'is_void', 'is_comp',
      'recipe_found', 'theoretical_grams',
      'anomaly_score', 'anomaly_reason', 'flag',
      'created_at'
    ];

    test('table exists', async () => {
      expect(await tableExists('pos_transaction_staging')).toBe(true);
    });

    requiredColumns.forEach(col => {
      test(`has column: ${col}`, async () => {
        expect(await columnExists('pos_transaction_staging', col)).toBe(true);
      });
    });
  });

  // ───── pos_transaction_staging indexes ─────
  describe('pos_transaction_staging indexes', () => {
    test('has idx_staging_batch index', async () => {
      expect(await indexExists('pos_transaction_staging', 'idx_staging_batch')).toBe(true);
    });

    test('has idx_staging_time index', async () => {
      expect(await indexExists('pos_transaction_staging', 'idx_staging_time')).toBe(true);
    });

    test('has idx_staging_sku index', async () => {
      expect(await indexExists('pos_transaction_staging', 'idx_staging_sku')).toBe(true);
    });
  });

  // ───── pos_transaction_staging constraints ─────
  describe('pos_transaction_staging constraints', () => {
    let fx: TestFixtures;
    let batchId: string;

    beforeAll(async () => {
      fx = await resolveFixtures();
      if (!skipIfNoFixtures(fx)) {
        const tBatchId = uniqueBatchId();
        const { error } = await supabase.from('pos_batch_uploads').insert({
          tenant_id: fx.tenantId,
          location_id: fx.locationId,
          batch_id: tBatchId,
          total_receipts: 0,
          status: 'STAGED',
        });
        if (!error) batchId = tBatchId;
      }
    });

    afterAll(async () => {
      if (fx.tenantId && batchId) {
        await supabase.from('pos_transaction_staging').delete().eq('batch_id',
          (await supabase.from('pos_batch_uploads').select('id').eq('batch_id', batchId).single()).data?.id ?? ''
        );
        await supabase.from('pos_batch_uploads').delete().eq('batch_id', batchId);
      }
    });

    test('raw_payload column rejects NULL (NOT NULL)', async () => {
      if (!fx.tenantId || !fx.locationId || !batchId) return;
      const { data: batch } = await supabase.from('pos_batch_uploads').select('id').eq('batch_id', batchId).single();
      if (!batch) return;
      const { error } = await supabase.from('pos_transaction_staging').insert({
        batch_id: batch.id,
        tenant_id: fx.tenantId,
        location_id: fx.locationId,
        line_number: 999,
        raw_payload: null,
        transaction_time: '2026-01-01T00:00:00Z',
        flag: 'PENDING',
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/null value in column "raw_payload"/i);
    });

    test('flag CHECK rejects invalid value', async () => {
      if (!fx.tenantId || !fx.locationId || !batchId) return;
      const { data: batch } = await supabase.from('pos_batch_uploads').select('id').eq('batch_id', batchId).single();
      if (!batch) return;
      const { error } = await supabase.from('pos_transaction_staging').insert({
        batch_id: batch.id,
        tenant_id: fx.tenantId,
        location_id: fx.locationId,
        line_number: 999,
        raw_payload: {},
        transaction_time: '2026-01-01T00:00:00Z',
        flag: 'INVALID_FLAG',
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/check constraint|flag/i);
    });

    test('flag CHECK accepts all valid values', async () => {
      if (!fx.tenantId || !fx.locationId || !batchId) return;
      const { data: batch } = await supabase.from('pos_batch_uploads').select('id').eq('batch_id', batchId).single();
      if (!batch) return;
      for (const flag of ['PENDING', 'APPROVED', 'QUARANTINED']) {
        const { error } = await supabase.from('pos_transaction_staging').insert({
          batch_id: batch.id,
          tenant_id: fx.tenantId,
          location_id: fx.locationId,
          line_number: 999,
          raw_payload: {},
          transaction_time: '2026-01-01T00:00:00Z',
          flag,
        });
        expect(error).toBeNull();
      }
    });
  });

  // ───── pos_data_gaps table ─────
  describe('pos_data_gaps table', () => {
    const requiredColumns = [
      'id', 'tenant_id', 'location_id', 'gap_date', 'notified_at', 'resolved_at'
    ];

    test('table exists', async () => {
      expect(await tableExists('pos_data_gaps')).toBe(true);
    });

    requiredColumns.forEach(col => {
      test(`has column: ${col}`, async () => {
        expect(await columnExists('pos_data_gaps', col)).toBe(true);
      });
    });
  });

  // ───── pos_data_gaps constraints ─────
  describe('pos_data_gaps constraints', () => {
    let fx: TestFixtures;
    let gapDate: string;

    beforeAll(async () => {
      fx = await resolveFixtures();
    });

    afterAll(async () => {
      if (fx.tenantId && gapDate) {
        await supabase.from('pos_data_gaps').delete().eq('gap_date', gapDate);
      }
    });

    test('UNIQUE (tenant_id, location_id, gap_date) rejects duplicates', async () => {
      if (skipIfNoFixtures(fx)) return;
      gapDate = uniqueGapDate();

      const { error: err1 } = await supabase.from('pos_data_gaps').insert({
        tenant_id: fx.tenantId,
        location_id: fx.locationId,
        gap_date: gapDate,
      });
      expect(err1).toBeNull();

      const { error: err2 } = await supabase.from('pos_data_gaps').insert({
        tenant_id: fx.tenantId,
        location_id: fx.locationId,
        gap_date: gapDate,
      });
      expect(err2).not.toBeNull();
      expect(err2.message).toMatch(/duplicate/i);
    });

    test('UNIQUE allows same date for different tenants', async () => {
      if (!fx.tenantId) return;
      const { data: tenants } = await supabase.from('tenants').select('id').limit(2);
      if (!tenants || tenants.length < 2) return;

      const sharedDate = uniqueGapDate();
      const tid1 = tenants[0].id;
      const tid2 = tenants[1].id;

      const { data: loc1 } = await supabase.from('locations').select('id').eq('tenant_id', tid1).limit(1);
      const { data: loc2 } = await supabase.from('locations').select('id').eq('tenant_id', tid2).limit(1);
      if (!loc1?.length || !loc2?.length) return;

      const { error: err1 } = await supabase.from('pos_data_gaps').insert({
        tenant_id: tid1, location_id: loc1[0].id, gap_date: sharedDate,
      });
      expect(err1).toBeNull();

      const { error: err2 } = await supabase.from('pos_data_gaps').insert({
        tenant_id: tid2, location_id: loc2[0].id, gap_date: sharedDate,
      });
      expect(err2).toBeNull();

      await supabase.from('pos_data_gaps').delete().eq('gap_date', sharedDate);
    });
  });

  // ───── Row Level Security ─────
  describe('Row Level Security', () => {
    test('pos_batch_uploads has RLS enabled', async () => {
      const { data, error } = await supabase.rpc('get_table_rls_status', { p_table: 'pos_batch_uploads' });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    test('pos_transaction_staging has RLS enabled', async () => {
      const { data, error } = await supabase.rpc('get_table_rls_status', { p_table: 'pos_transaction_staging' });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    test('pos_data_gaps has RLS enabled', async () => {
      const { data, error } = await supabase.rpc('get_table_rls_status', { p_table: 'pos_data_gaps' });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });
  });

  // ───── v_quarantine_audit view ─────
  describe('v_quarantine_audit view', () => {
    test('view exists and is queryable', async () => {
      const { data, error } = await supabase
        .from('v_quarantine_audit')
        .select('batch_id')
        .limit(1);
      expect(error).toBeNull();
    });

    test('has expected columns', async () => {
      const { data, error } = await supabase
        .from('v_quarantine_audit')
        .select('batch_id, ims_batch_id, line_number, transaction_time, item_sku, item_name, quantity, revenue, anomaly_score, anomaly_reason')
        .limit(1);
      expect(error).toBeNull();
    });
  });

  // ───── process_batch_v1 RPC ─────
  describe('process_batch_v1 RPC', () => {
    test('function exists with signature (uuid) and search_path is hardened', async () => {
      const state = await checkFunctionSecurity('process_batch_v1', 'uuid');
      expect(state.exists).toBe(true);
      expect(state.hasSearchPathPublic).toBe(true);
      expect(state.isRevokedFromPublic).toBe(true);
    });
  });

  // ───── Batch 3 Security Contract ─────
  describe('Batch 3 Security Contract', () => {
    BATCH_3_SECURITY_CONTRACT.forEach(fn => {
      test(`${fn.functionName}(${fn.args}) meets security contract`, async () => {
        const state = await checkFunctionSecurity(fn.functionName, fn.args);
        expect(state.exists).toBe(true);
        expect(state.hasSearchPathPublic).toBe(true);
        expect(state.isRevokedFromPublic).toBe(true);
      });
    });
  });

  // ───── Batch 3 Landmines ─────
  describe('Batch 3 Landmines', () => {
    BATCH_3_LANDMINE_CONTRACT.forEach(fn => {
      test(`${fn.functionName}(${fn.args}) does NOT exist`, async () => {
        const state = await checkFunctionSecurity(fn.functionName, fn.args);
        expect(state.exists).toBe(false);
      });
    });
  });
});
