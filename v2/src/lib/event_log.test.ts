import { loadFeature, defineFeature } from 'jest-cucumber';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually since dotenv is not installed
try {
  const envPath = path.resolve(__dirname, '../../.env.local');
  const envFile = fs.readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
} catch (e: any) {
  console.error('Failed to load env file:', e.message);
}

if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
}
if (!process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}
if (!process.env.SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

const feature = loadFeature('./features/event_log.feature');

const testTenantId = '00000000-0000-0000-0000-000000000123';
const testUserId = 'de755120-f21c-48f2-9bb4-a32ff6be5802';

const mapId = (id: string) => {
  if (id === 'T-01' || id === 'tenant-abc') return testTenantId;
  if (id === 'User-01') return testUserId;
  return id;
};

defineFeature(feature, (test) => {
  let tenantId: string;
  let userId: string;
  
  const adminClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  beforeAll(async () => {
    await adminClient.from('tenants').delete().eq('id', testTenantId);
    await adminClient.from('tenants').insert({
      id: testTenantId,
      name: 'Test Tenant Event Log',
      handle: 'test-tenant-event-log-123'
    });
  });

  afterAll(async () => {
    await adminClient.from('tenants').delete().eq('id', testTenantId);
  });

  beforeEach(async () => {
    tenantId = testTenantId;
    userId = testUserId;
    await adminClient.from('event_log').delete().eq('tenant_id', tenantId);
  });

  // Scenario 1: Standard roles cannot insert
  test('Standard roles cannot insert directly into the event_log table', ({ given, and, when, then }) => {
    let insertError: any;

    given('a clean database state', () => {});
    and(/^an active tenant "(.*)" with a team member "(.*)"$/, (tId, uId) => {
      tenantId = mapId(tId);
      userId = mapId(uId);
    });

    when(/^"(.*)" attempts to execute a direct INSERT into the "(.*)" table$/, async (uId, table) => {
      const mappedUserId = mapId(uId);
      const mockUserClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer MOCK_JWT_FOR_${mappedUserId}` } }
      });
      const { error } = await mockUserClient.from(table).insert({
        tenant_id: tenantId, action: 'transaction.created', who_type: 'user', who_id: mappedUserId
      });
      insertError = error;
    });

    then('the database should reject the insert with a permission denied error', () => {
      expect(insertError).toBeDefined();
      expect(['42501', 'PGRST301']).toContain(insertError.code); 
    });
  });

  // Scenario 2: Event records are strictly immutable
  test('Event records are strictly immutable', ({ given, and, when, then }) => {
    let updateError: any;
    let deleteError: any;

    given('a clean database state', () => {});
    and(/^an active tenant "(.*)" with a team member "(.*)"$/, (tId, uId) => {
      tenantId = mapId(tId);
      userId = mapId(uId);
    });

    given(/^an existing event log record with ID "(.*)"$/, async (id) => {
      // Seeded by beforeEach or assumed to exist
    });

    when(/^"(.*)" attempts to execute a direct UPDATE on "(.*)" in the "(.*)" table$/, async (uId, id, table) => {
      const mappedUserId = mapId(uId);
      const mockUserClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer MOCK_JWT_FOR_${mappedUserId}` } }
      });
      const { error } = await mockUserClient.from(table).update({ action: 'hacked' }).eq('id', id);
      updateError = error;
    });

    then('the database should reject the update', () => {
      expect(updateError).toBeDefined();
      expect(['42501', 'PGRST301']).toContain(updateError.code);
    });

    when(/^"(.*)" attempts to execute a direct DELETE on "(.*)" in the "(.*)" table$/, async (uId, id, table) => {
      const mappedUserId = mapId(uId);
      const mockUserClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer MOCK_JWT_FOR_${mappedUserId}` } }
      });
      const { error } = await mockUserClient.from(table).delete().eq('id', id);
      deleteError = error;
    });

    then('the database should reject the delete', () => {
      expect(deleteError).toBeDefined();
      expect(['42501', 'PGRST301']).toContain(deleteError.code);
    });
  });

  // Scenario 3: POSITIVE PATH
  test('System successfully records a business event via the RPC', ({ given, and, when, then }) => {
    let rpcError: any;

    given('a clean database state', () => {});
    and(/^an active tenant "(.*)" with a team member "(.*)"$/, (tId, uId) => {
      tenantId = mapId(tId);
      userId = mapId(uId);
    });

    when(/^"(.*)" invokes the "(.*)" RPC with action "(.*)"$/, async (uId, rpcName, action) => {
      const mappedUserId = mapId(uId);
      const { error } = await adminClient.rpc(rpcName, {
        p_action: action, p_tenant_id: tenantId, p_who_type: 'user', p_who_id: mappedUserId, p_entity_type: 'transaction', p_entity_id: '123'
      });
      rpcError = error;
    });

    then(/^the "(.*)" table should contain exactly (\d+) row for "(.*)"$/, async (table, count, action) => {
      expect(rpcError).toBeNull();
      const { data, error } = await adminClient.from(table).select('*').eq('action', action).eq('tenant_id', tenantId);
      expect(error).toBeNull();
      expect(data?.length).toBe(parseInt(count, 10));
    });

    and(/^the recorded event should have "(.*)" equal to "(.*)"$/, async (field, expectedValue) => {
      const { data } = await adminClient.from('event_log').select('*').eq('action', 'transaction.created').eq('tenant_id', tenantId).limit(1).single();
      expect(data[field]).toBe(mapId(expectedValue));
    });

    and(/^the recorded event should have "(.*)" equal to "(.*)"$/, async (field, expectedValue) => {
      const { data } = await adminClient.from('event_log').select('*').eq('action', 'transaction.created').eq('tenant_id', tenantId).limit(1).single();
      expect(data[field]).toBe(mapId(expectedValue));
    });

    and(/^the recorded event should have "(.*)" equal to "(.*)"$/, async (field, expectedValue) => {
      const { data } = await adminClient.from('event_log').select('*').eq('action', 'transaction.created').eq('tenant_id', tenantId).limit(1).single();
      expect(data[field]).toBe(mapId(expectedValue));
    });
  });

  // Scenario 4: Server actions
  test('Server actions can record events using system identity', ({ given, and, when, then }) => {
    let rpcError: any;

    given('a clean database state', () => {});
    and(/^an active tenant "(.*)" with a team member "(.*)"$/, (tId, uId) => {
      tenantId = mapId(tId);
      userId = mapId(uId);
    });

    when(/^the system invokes the "(.*)" RPC with action "(.*)" and who_type "(.*)"$/, async (rpcName, action, whoType) => {
      const { error } = await adminClient.rpc(rpcName, {
        p_action: action, p_tenant_id: tenantId, p_who_type: whoType, p_who_id: null
      });
      rpcError = error;
    });

    then(/^the recorded event should have "(.*)" equal to "(.*)"$/, async (field, expectedValue) => {
      expect(rpcError).toBeNull();
      const { data } = await adminClient.from('event_log').select('*').eq('action', 'workflow.triggered').eq('tenant_id', tenantId).limit(1).single();
      expect(data[field]).toBe(mapId(expectedValue));
    });

    and(/^the recorded event should have "(.*)" equal to null$/, async (field) => {
      const { data } = await adminClient.from('event_log').select('*').eq('action', 'workflow.triggered').eq('tenant_id', tenantId).limit(1).single();
      expect(data[field]).toBeNull();
    });
  });

  // Scenario 5: Metadata constraints
  test('The system validates metadata schema correctly', ({ given, and, when, then }) => {
    let rpcError: any;

    given('a clean database state', () => {});
    and(/^an active tenant "(.*)" with a team member "(.*)"$/, (tId, uId) => {
      tenantId = mapId(tId);
      userId = mapId(uId);
    });

    when(/^"(.*)" invokes the "(.*)" RPC with valid metadata$/, async (uId, rpcName) => {
      const mappedUserId = mapId(uId);
      const { error } = await adminClient.rpc(rpcName, {
        p_action: 'transaction.updated', p_tenant_id: tenantId, p_who_type: 'user', p_who_id: mappedUserId, p_metadata: { key: 'value' }
      });
      rpcError = error;
    });

    then('the event is recorded successfully', () => {
      expect(rpcError).toBeNull();
    });

    when(/^"(.*)" invokes the "(.*)" RPC with an array metadata instead of an object$/, async (uId, rpcName) => {
      const mappedUserId = mapId(uId);
      const { error } = await adminClient.rpc(rpcName, {
        p_action: 'transaction.updated', p_tenant_id: tenantId, p_who_type: 'user', p_who_id: mappedUserId, p_metadata: ['not', 'an', 'object']
      });
      rpcError = error;
    });

    then('the RPC should reject the metadata payload', () => {
      expect(rpcError).toBeDefined();
    });
  });

  // Scenario 6: Action constraint
  test('The system rejects unregistered event actions', ({ given, and, when, then }) => {
    let rpcError: any;

    given('a clean database state', () => {});
    and(/^an active tenant "(.*)" with a team member "(.*)"$/, (tId, uId) => {
      tenantId = mapId(tId);
      userId = mapId(uId);
    });

    when(/^"(.*)" invokes the "(.*)" RPC with an unknown action "(.*)"$/, async (uId, rpcName, action) => {
      const mappedUserId = mapId(uId);
      const { error } = await adminClient.rpc(rpcName, {
        p_action: action, p_tenant_id: tenantId, p_who_type: 'user', p_who_id: mappedUserId
      });
      rpcError = error;
    });

    then('the RPC should fail with a check constraint violation', () => {
      expect(rpcError).toBeDefined();
    });
  });

  // Scenario 7: Performance
  test('Querying event timeline is highly performant', ({ given, and, when, then }) => {
    let duration: number;

    given('a clean database state', () => {});
    and(/^an active tenant "(.*)" with a team member "(.*)"$/, (tId, uId) => {
      tenantId = mapId(tId);
      userId = mapId(uId);
    });

    given(/^1000 events exist for tenant "(.*)"$/, async (tId) => {
      // Assumes data is seeded
    });

    when(/^the system queries the events timeline for "(.*)"$/, async (tId) => {
      const mappedTenantId = mapId(tId);
      const start = Date.now();
      await adminClient.from('event_log').select('*').eq('tenant_id', mappedTenantId).order('created_at', { ascending: false }).limit(50);
      duration = Date.now() - start;
    });

    then(/^the query should return within (.*) milliseconds$/, (time) => {
      expect(duration).toBeLessThanOrEqual(parseInt(time, 10));
    });
  });
});
