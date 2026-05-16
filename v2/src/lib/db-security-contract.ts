/**
 * Represents the required security state for a hardened Supabase RPC.
 */
export interface FunctionSecurityRequirement {
  /** The name of the function in the public schema */
  functionName: string;
  /** Arguments of the function to uniquely identify it (for overloading) */
  args: string;
  /** Whether the function is expected to exist */
  exists?: boolean;
  /** Must have `SET search_path = public` to prevent search path injection */
  hasSearchPathPublic?: boolean;
  /** Must be revoked from the `PUBLIC` and `anon` roles */
  isRevokedFromPublic?: boolean;
  /** Should be granted to the `authenticated` role for app usage */
  isGrantedToAuthenticated?: boolean;
}

/**
 * The expected results for the Batch 1 hardening task.
 */
export const BATCH_1_SECURITY_CONTRACT: FunctionSecurityRequirement[] = [
  {
    functionName: 'save_receipt_v4',
    args: 'jsonb, jsonb, uuid',
    exists: true,
    hasSearchPathPublic: true,
    isRevokedFromPublic: true,
    isGrantedToAuthenticated: true,
  },
  {
    functionName: 'add_transactions_bulk_v1',
    args: 'jsonb[]',
    exists: true,
    hasSearchPathPublic: true,
    isRevokedFromPublic: true,
    isGrantedToAuthenticated: true,
  },
  {
    functionName: 'update_tenant_config_v1',
    args: 'jsonb',
    exists: true,
    hasSearchPathPublic: true,
    isRevokedFromPublic: true,
    isGrantedToAuthenticated: true,
  },
  {
    functionName: 'is_tenant_management_privileged',
    args: 'uuid',
    exists: true,
    hasSearchPathPublic: true,
    isRevokedFromPublic: true,
    isGrantedToAuthenticated: true,
  }
];

/**
 * Landmine check: These functions should NOT exist or at least NOT be targeted 
 * by hardening if they were never created.
 */
export const BATCH_1_LANDMINE_CONTRACT: FunctionSecurityRequirement[] = [
  {
    functionName: 'verify_tenant_membership',
    args: 'uuid',
    exists: false
  },
  {
    functionName: 'create_organization',
    args: 'text, text, text',
    exists: false
  }
];
