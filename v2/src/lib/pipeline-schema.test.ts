import { supabase, checkFunctionSecurity, tableExists, columnExists } from '@/lib/db-security-helpers';
import { BATCH_2_SECURITY_CONTRACT, BATCH_2_LANDMINE_CONTRACT } from './db-security-contract';
import { resolveFixtures, TestFixtures, skipIfNoFixtures } from './test-fixtures';

interface ReleaseQuarantineResult {
  released_purchases: number;
  released_pending: number;
}

describe('Phase 0: Two-Table Architecture Schema Contract', () => {

  // ───── purchases table ─────
  describe('purchases table', () => {
    const requiredColumns = [
      'id', 'tenant_id', 'location_id', 'account_id',
      'vendor_name', 'invoice_number',
      'total_amount', 'currency', 'tax_amount', 'tax_rate',
      'receipt_type', 'receipt_hash', 'source_image_url',
      'purchase_date',
      'created_at', 'updated_at',
      'quarantine_status', 'reviewed_at', 'reviewed_by',
      'rejection_reason', 'rejection_note',
      'ingredient_id', 'ingredient_name'
    ];

    test('table exists', async () => {
      expect(await tableExists('purchases')).toBe(true);
    });

    requiredColumns.forEach(col => {
      test(`has column: ${col}`, async () => {
        expect(await columnExists('purchases', col)).toBe(true);
      });
    });

    describe('purchases constraints', () => {
      let fx: TestFixtures;

      beforeAll(async () => {
        fx = await resolveFixtures();
      });

      afterAll(async () => {
        if (fx.tenantId) {
          await supabase.from('purchases').delete().eq('tenant_id', fx.tenantId).gte('total_amount', 10000);
        }
      });

      test('total_amount column rejects NULL (NOT NULL)', async () => {
        if (skipIfNoFixtures(fx)) return;
        const { error } = await supabase.from('purchases').insert({
          tenant_id: fx.tenantId, location_id: fx.locationId, account_id: fx.accountId,
          total_amount: null, purchase_date: '2026-01-01',
        });
        expect(error).not.toBeNull();
        expect(error.message).toMatch(/null value in column "total_amount"/i);
      });

      test('purchase_date column rejects NULL (NOT NULL)', async () => {
        if (skipIfNoFixtures(fx)) return;
        const { error } = await supabase.from('purchases').insert({
          tenant_id: fx.tenantId, location_id: fx.locationId, account_id: fx.accountId,
          total_amount: 1, purchase_date: null,
        });
        expect(error).not.toBeNull();
        expect(error.message).toMatch(/null value in column "purchase_date"/i);
      });

      test('quarantine_status rejects invalid value', async () => {
        if (skipIfNoFixtures(fx)) return;
        const { error } = await supabase.from('purchases').insert({
          tenant_id: fx.tenantId, location_id: fx.locationId, account_id: fx.accountId,
          total_amount: 100, purchase_date: '2026-01-01',
          quarantine_status: 'INVALID_STATUS'
        });
        expect(error).not.toBeNull();
        expect(error.message).toMatch(/check constraint|quarantine_status/i);
      });

      test('quarantine_status accepts all valid values', async () => {
        if (skipIfNoFixtures(fx)) return;
        const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'AUTO_RELEASED', 'RELEASED'];
        for (const status of validStatuses) {
          const { error } = await supabase.from('purchases').insert({
            tenant_id: fx.tenantId, location_id: fx.locationId, account_id: fx.accountId,
            total_amount: 1, purchase_date: '2026-01-01',
            quarantine_status: status
          });
          if (error && !error.message.match(/duplicate/i)) {
            throw new Error(`quarantine_status '${status}' rejected: ${error.message}`);
          }
        }
      });

      test('receipt_type rejects invalid value', async () => {
        if (skipIfNoFixtures(fx)) return;
        const { error } = await supabase.from('purchases').insert({
          tenant_id: fx.tenantId, location_id: fx.locationId, account_id: fx.accountId,
          total_amount: 100, purchase_date: '2026-01-01',
          receipt_type: 'fax'
        });
        expect(error).not.toBeNull();
        expect(error.message).toMatch(/check constraint|receipt_type/i);
      });

      test('receipt_type accepts all valid values', async () => {
        if (skipIfNoFixtures(fx)) return;
        const validTypes = ['scanned', 'ekasa', 'manual', 'imported'];
        for (const rtype of validTypes) {
          const { error } = await supabase.from('purchases').insert({
            tenant_id: fx.tenantId, location_id: fx.locationId, account_id: fx.accountId,
            total_amount: 1, purchase_date: '2026-01-01',
            receipt_type: rtype
          });
          if (error && !error.message.match(/duplicate/i)) {
            throw new Error(`receipt_type '${rtype}' rejected: ${error.message}`);
          }
        }
      });
    });
  });

  // ───── purchase_anomaly_queue table ─────
  describe('purchase_anomaly_queue table', () => {
    const requiredColumns = [
      'id', 'tenant_id', 'location_id',
      'purchase_id', 'receipt_item_id',
      'check_type', 'severity', 'anomaly_score', 'anomaly_detail',
      'status', 'outbox_id',
      'notification_sent_at', 'response_received_at', 'response_decision',
      'created_at'
    ];

    test('table exists', async () => {
      expect(await tableExists('purchase_anomaly_queue')).toBe(true);
    });

    requiredColumns.forEach(col => {
      test(`has column: ${col}`, async () => {
        expect(await columnExists('purchase_anomaly_queue', col)).toBe(true);
      });
    });

    describe('purchase_anomaly_queue constraints', () => {
      let fx: TestFixtures;
      let insertedPurchaseId: string | null = null;

      beforeAll(async () => {
        fx = await resolveFixtures();
        // Seed a purchase row for FK reference
        if (!skipIfNoFixtures(fx)) {
          const { data } = await supabase.from('purchases').insert({
            tenant_id: fx.tenantId,
            location_id: fx.locationId,
            account_id: fx.accountId,
            total_amount: 999999,
            purchase_date: '2026-01-01',
          }).select('id').single();
          if (data) insertedPurchaseId = data.id;
        }
      });

      afterAll(async () => {
        if (insertedPurchaseId) {
          await supabase.from('purchase_anomaly_queue').delete().eq('purchase_id', insertedPurchaseId);
          await supabase.from('purchases').delete().eq('id', insertedPurchaseId);
        }
      });

      test('check_type rejects invalid value', async () => {
        if (!fx.tenantId || !fx.locationId || !insertedPurchaseId) return;
        const { error } = await supabase.from('purchase_anomaly_queue').insert({
          tenant_id: fx.tenantId, location_id: fx.locationId, purchase_id: insertedPurchaseId,
          check_type: 'invalid_check', severity: 'medium'
        });
        expect(error).not.toBeNull();
        expect(error.message).toMatch(/check constraint|check_type/i);
      });

      test('check_type accepts all valid values', async () => {
        if (!fx.tenantId || !fx.locationId || !insertedPurchaseId) return;
        for (const checkType of ['duplicate', 'price_spike', 'quantity_spike', 'missing_receipt', 'new_vendor', 'vendor_mismatch']) {
          const { error } = await supabase.from('purchase_anomaly_queue').insert({
            tenant_id: fx.tenantId, location_id: fx.locationId, purchase_id: insertedPurchaseId,
            check_type: checkType, severity: 'low',
          });
          expect(error).toBeNull();
        }
      });

      test('severity rejects invalid value', async () => {
        if (!fx.tenantId || !fx.locationId || !insertedPurchaseId) return;
        const { error } = await supabase.from('purchase_anomaly_queue').insert({
          tenant_id: fx.tenantId, location_id: fx.locationId, purchase_id: insertedPurchaseId,
          check_type: 'duplicate', severity: 'critical'
        });
        expect(error).not.toBeNull();
        expect(error.message).toMatch(/check constraint|severity/i);
      });

      test('severity accepts all valid values', async () => {
        if (!fx.tenantId || !fx.locationId || !insertedPurchaseId) return;
        for (const sv of ['low', 'medium', 'high']) {
          const { error } = await supabase.from('purchase_anomaly_queue').insert({
            tenant_id: fx.tenantId, location_id: fx.locationId, purchase_id: insertedPurchaseId,
            check_type: 'duplicate', severity: sv,
          });
          expect(error).toBeNull();
        }
      });

      test('status rejects invalid value', async () => {
        if (!fx.tenantId || !fx.locationId || !insertedPurchaseId) return;
        const { error } = await supabase.from('purchase_anomaly_queue').insert({
          tenant_id: fx.tenantId, location_id: fx.locationId, purchase_id: insertedPurchaseId,
          check_type: 'duplicate', severity: 'medium', status: 'BOGUS'
        });
        expect(error).not.toBeNull();
        expect(error.message).toMatch(/check constraint|status/i);
      });
    });
  });

  // ───── pending_text_followups table ─────
  describe('pending_text_followups table', () => {
    const requiredColumns = [
      'id', 'tenant_id', 'outbox_id',
      'entity_type', 'entity_id',
      'status', 'prompt', 'response',
      'created_at', 'responded_at', 'expires_at'
    ];

    test('table exists', async () => {
      expect(await tableExists('pending_text_followups')).toBe(true);
    });

    requiredColumns.forEach(col => {
      test(`has column: ${col}`, async () => {
        expect(await columnExists('pending_text_followups', col)).toBe(true);
      });
    });

    describe('pending_text_followups constraints', () => {
      let fx: TestFixtures;
      let outboxId: string | null = null;

      beforeAll(async () => {
        fx = await resolveFixtures();
        if (!skipIfNoFixtures(fx)) {
          const { data } = await supabase.from('whatsapp_outbox').insert({
            tenant_id: fx.tenantId,
            recipient_phone: '+421000000000',
            payload: { type: 'text', text: 'test' },
          }).select('id').single();
          if (data) outboxId = data.id;
        }
      });

      afterAll(async () => {
        if (outboxId) {
          await supabase.from('pending_text_followups').delete().eq('outbox_id', outboxId);
          await supabase.from('whatsapp_outbox').delete().eq('id', outboxId);
        }
      });

      test('status rejects invalid value', async () => {
        if (!fx.tenantId || !outboxId) return;
        const { error } = await supabase.from('pending_text_followups').insert({
          tenant_id: fx.tenantId, outbox_id: outboxId,
          entity_type: 'purchase_anomaly', entity_id: fx.tenantId,
          status: 'INVALID_STATUS', prompt: 'test', expires_at: '2026-12-31T23:59:59Z',
        });
        expect(error).not.toBeNull();
        expect(error.message).toMatch(/check constraint|status/i);
      });

      test('status accepts all valid values', async () => {
        if (!fx.tenantId || !outboxId) return;
        const validStatuses = ['AWAITING_REPLY', 'COMPLETED', 'TIMEOUT'];
        for (const s of validStatuses) {
          const { error } = await supabase.from('pending_text_followups').insert({
            tenant_id: fx.tenantId, outbox_id: outboxId,
            entity_type: 'purchase_anomaly', entity_id: fx.tenantId,
            status: s, prompt: 'test', expires_at: '2026-12-31T23:59:59Z',
          });
          expect(error).toBeNull();
        }
      });
    });
  });

  // ───── receipt_items polymorphic migration ─────
  describe('receipt_items polymorphic FK migration', () => {
    test('has source_type column', async () => {
      expect(await columnExists('receipt_items', 'source_type')).toBe(true);
    });

    test('has source_id column', async () => {
      expect(await columnExists('receipt_items', 'source_id')).toBe(true);
    });

    test('existing rows backfilled with source_type=transaction', async () => {
      const { data, error } = await supabase
        .from('receipt_items')
        .select('source_type')
        .not('source_type', 'is', null)
        .limit(1);
      expect(error).toBeNull();
      if (data && data.length > 0) {
        expect(data[0].source_type).toBe('transaction');
      }
    });

    test('transaction_id column kept for rollback safety', async () => {
      expect(await columnExists('receipt_items', 'transaction_id')).toBe(true);
    });
  });

  // ───── chart_of_accounts seed ─────
  describe('chart_of_accounts seed', () => {
    test('COGS-001 account exists for every tenant', async () => {
      const { data: tenants } = await supabase.from('tenants').select('id');
      if (!tenants || tenants.length === 0) return;
      for (const tenant of tenants) {
        const { data } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('account_code', 'COGS-001')
          .maybeSingle();
        expect(data).not.toBeNull();
      }
    });

    test('all 8 default OPEX accounts exist for every tenant', async () => {
      const { data: tenants } = await supabase.from('tenants').select('id');
      if (!tenants || tenants.length === 0) return;
      const expectedCodes = ['OPEX-001', 'OPEX-002', 'OPEX-003', 'OPEX-004', 'OPEX-005', 'OPEX-006', 'OPEX-007', 'OPEX-008'];
      for (const tenant of tenants) {
        const { data } = await supabase
          .from('chart_of_accounts')
          .select('account_code')
          .eq('tenant_id', tenant.id);
        const codes = (data || []).map(r => r.account_code);
        for (const code of expectedCodes) {
          expect(codes).toContain(code);
        }
      }
    });

    test('COGS-001 account_type is EXPENSE', async () => {
      const { data: tenants } = await supabase.from('tenants').select('id');
      if (!tenants || tenants.length === 0) return;
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('account_type')
        .eq('tenant_id', tenants[0].id)
        .eq('account_code', 'COGS-001')
        .maybeSingle();
      expect(data).not.toBeNull();
      expect(data.account_type).toBe('EXPENSE');
    });

    test('no duplicate account codes per tenant', async () => {
      const { data: tenants } = await supabase.from('tenants').select('id');
      if (!tenants || tenants.length === 0) return;
      for (const tenant of tenants) {
        const { data } = await supabase
          .from('chart_of_accounts')
          .select('account_code')
          .eq('tenant_id', tenant.id);
        const codes = (data || []).map(r => r.account_code);
        const uniqueCodes = new Set(codes);
        expect(codes.length).toBe(uniqueCodes.size);
      }
    });
  });

  // ───── RPC function security (Batch 2) ─────
  describe('RPC function security - Batch 2', () => {
    BATCH_2_SECURITY_CONTRACT.forEach(req => {
      test(`Function ${req.functionName}(${req.args}) should be hardened`, async () => {
        const state = await checkFunctionSecurity(req.functionName, req.args);
        expect(state.exists).toBe(req.exists);
        expect(state.hasSearchPathPublic).toBe(req.hasSearchPathPublic);
        expect(state.isRevokedFromPublic).toBe(req.isRevokedFromPublic);
      });
    });

    BATCH_2_LANDMINE_CONTRACT.forEach(req => {
      test(`Landmine ${req.functionName}(${req.args}) should not exist`, async () => {
        const state = await checkFunctionSecurity(req.functionName, req.args);
        expect(state.exists).toBe(req.exists);
      });
    });
  });

  // ───── release_expired_quarantines_v1 behavior ─────
  describe('release_expired_quarantines_v1 behavior', () => {
    test('returns typed result with released_purchases and released_pending', async () => {
      const { data, error } = await supabase.rpc('release_expired_quarantines_v1');
      expect(error).toBeNull();
      const result = data as unknown as ReleaseQuarantineResult[];
      expect(result).not.toBeNull();
      expect(typeof result[0].released_purchases).toBe('number');
      expect(typeof result[0].released_pending).toBe('number');
    });

    test('returns zero when no pending quarantines exist', async () => {
      const { data, error } = await supabase.rpc('release_expired_quarantines_v1');
      expect(error).toBeNull();
      const result = data as unknown as ReleaseQuarantineResult[];
      expect(result[0].released_purchases).toBe(0);
      expect(result[0].released_pending).toBe(0);
    });

    test('idempotent: calling twice returns same zero result', async () => {
      const { data: first } = await supabase.rpc('release_expired_quarantines_v1');
      const { data: second } = await supabase.rpc('release_expired_quarantines_v1');
      const a = first as unknown as ReleaseQuarantineResult[];
      const b = second as unknown as ReleaseQuarantineResult[];
      expect(a[0].released_purchases).toBe(b[0].released_purchases);
      expect(a[0].released_pending).toBe(b[0].released_pending);
    });
  });

  // ───── approve_purchase_v1 ─────
  describe('approve_purchase_v1', () => {
    test('function exists with signature (uuid, uuid)', async () => {
      const state = await checkFunctionSecurity('approve_purchase_v1', 'uuid, uuid');
      expect(state.exists).toBe(true);
      expect(state.hasSearchPathPublic).toBe(true);
      expect(state.isRevokedFromPublic).toBe(true);
    });
  });

  // ───── reject_purchase_v1 ─────
  describe('reject_purchase_v1', () => {
    test('function exists with signature (uuid, uuid, text)', async () => {
      const state = await checkFunctionSecurity('reject_purchase_v1', 'uuid, uuid, text');
      expect(state.exists).toBe(true);
      expect(state.hasSearchPathPublic).toBe(true);
      expect(state.isRevokedFromPublic).toBe(true);
    });
  });
});
