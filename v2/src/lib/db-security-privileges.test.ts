import { supabase } from '@/lib/db-security-helpers';

interface TablePrivilegeExpectation {
  table: string;
  anon_select: boolean;
  anon_insert: boolean;
  anon_update: boolean;
  anon_delete: boolean;
  anon_references: boolean;
  anon_trigger: boolean;
}

const ANON_PRIVILEGE_EXPECTATIONS: TablePrivilegeExpectation[] = [
  // api_keys: sensitive secrets — zero anon access
  { table: 'api_keys', anon_select: false, anon_insert: false, anon_update: false, anon_delete: false, anon_references: false, anon_trigger: false },
  // current_inventory: read-only for public stock view
  { table: 'current_inventory', anon_select: true, anon_insert: false, anon_update: false, anon_delete: false, anon_references: false, anon_trigger: false },
  // graph_sync_queue: internal queue — zero anon access
  { table: 'graph_sync_queue', anon_select: false, anon_insert: false, anon_update: false, anon_delete: false, anon_references: false, anon_trigger: false },
  // rate_limits: read-only
  { table: 'rate_limits', anon_select: true, anon_insert: false, anon_update: false, anon_delete: false, anon_references: false, anon_trigger: false },
  // whatsapp_inbox: SELECT+INSERT for webhook inbound
  { table: 'whatsapp_inbox', anon_select: true, anon_insert: true, anon_update: false, anon_delete: false, anon_references: false, anon_trigger: false },
  // whatsapp_outbox: internal queue — zero anon access
  { table: 'whatsapp_outbox', anon_select: false, anon_insert: false, anon_update: false, anon_delete: false, anon_references: false, anon_trigger: false },
];

describe('Database Table Privileges — Phase 1 Security Hardening', () => {
  beforeAll(async () => {
    const { error } = await supabase.rpc('get_table_privilege_state_v1', {
      p_table_name: 'public.whatsapp_outbox',
    });
    if (error) {
      throw new Error(`Migration 20260530003 not applied: ${error.message}. Run supabase db push first.`);
    }
  });

  ANON_PRIVILEGE_EXPECTATIONS.forEach(({ table, anon_select, anon_insert, anon_update, anon_delete, anon_references, anon_trigger }) => {
    test(`Table "${table}" anon privileges match expected: SELECT=${anon_select} INSERT=${anon_insert} UPDATE=${anon_update} DELETE=${anon_delete}`, async () => {
      const { data } = await supabase.rpc('get_table_privilege_state_v1', {
        p_table_name: `public.${table}`,
      });
      expect(data?.[0]?.anon_has_select).toBe(anon_select);
      expect(data?.[0]?.anon_has_insert).toBe(anon_insert);
      expect(data?.[0]?.anon_has_update).toBe(anon_update);
      expect(data?.[0]?.anon_has_delete).toBe(anon_delete);
      expect(data?.[0]?.anon_has_references).toBe(anon_references);
      expect(data?.[0]?.anon_has_trigger).toBe(anon_trigger);
    });
  });

  test('ALTER DEFAULT PRIVILEGES should not grant INSERT to anon for future tables', async () => {
    const { data, error } = await supabase.rpc('check_default_privileges_v1');
    if (error) {
      throw new Error(`check_default_privileges_v1 RPC missing: ${error.message}`);
    }
    expect(data?.[0]?.anon_default_insert).toBe(false);
  });
});
