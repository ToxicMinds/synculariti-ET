import { supabase, tableExists } from './db-security-helpers';

export interface TestFixtures {
  tenantId: string | null;
  locationId: string | null;
  accountId: string | null;
}

/**
 * Resolves FK references from the live database.
 * Returns null for any FK that could not be resolved.
 * Callers MUST check for null before using these values.
 *
 * NOTE: locations.tenant_id is the actual column name (not household_id).
 * The legacy FK constraint names contain 'household_id' but the column is tenant_id.
 */
export async function resolveFixtures(): Promise<TestFixtures> {
  if (!(await tableExists('tenants')) || !(await tableExists('locations')) || !(await tableExists('chart_of_accounts'))) {
    return { tenantId: null, locationId: null, accountId: null };
  }

  const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
  if (!tenants?.length) return { tenantId: null, locationId: null, accountId: null };
  const tenantId = tenants[0].id;

  const { data: locations } = await supabase.from('locations').select('id').eq('tenant_id', tenantId).limit(1);
  const locationId = locations?.length ? locations[0].id : null;

  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('account_code', 'COGS-001')
    .limit(1);
  const accountId = accounts?.length ? accounts[0].id : null;

  return { tenantId, locationId, accountId };
}

/**
 * Returns true if fixtures are insufficient for FK-dependent tests.
 * Tests should call this at the start and early-return when true.
 */
export function skipIfNoFixtures(fixtures: TestFixtures): boolean {
  return !fixtures.tenantId || !fixtures.locationId;
}

/**
 * Generates a unique batch_id for test isolation.
 */
export function uniqueBatchId(): string {
  return `test-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generates a unique gap_date for test isolation.
 */
export function uniqueGapDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.floor(Math.random() * 365 * 10));
  return d.toISOString().slice(0, 10);
}

/**
 * Cleanup helper: deletes all rows matching a filter.
 */
export async function cleanWhere(table: string, column: string, value: string): Promise<void> {
  await supabase.from(table).delete().eq(column, value);
}
