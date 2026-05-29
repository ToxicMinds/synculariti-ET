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
    args: 'jsonb',
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
  },
  {
    functionName: 'safe_cast_uuid',
    args: 'text',
    exists: true,
    hasSearchPathPublic: true,
    isRevokedFromPublic: true,
    isGrantedToAuthenticated: true,
  },
  {
    functionName: 'safe_cast_user_uuid',
    args: 'text',
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

/**
 * Batch 2: Phase 0 schema — purchases, quarantine queue, and release RPCs.
 */
export const BATCH_2_SECURITY_CONTRACT: FunctionSecurityRequirement[] = [
  {
    functionName: 'release_expired_quarantines_v1',
    args: '',
    exists: true,
    hasSearchPathPublic: true,
    isRevokedFromPublic: true,
  },
  {
    functionName: 'approve_purchase_v1',
    args: 'uuid, uuid',
    exists: true,
    hasSearchPathPublic: true,
    isRevokedFromPublic: true,
  },
  {
    functionName: 'reject_purchase_v1',
    args: 'uuid, uuid, text',
    exists: true,
    hasSearchPathPublic: true,
    isRevokedFromPublic: true,
  },
];

export const BATCH_2_LANDMINE_CONTRACT: FunctionSecurityRequirement[] = [
  {
    functionName: 'release_expired_quarantines_v1',
    args: 'integer',
    exists: false,
  },
  {
    functionName: 'approve_purchase_v1',
    args: 'uuid',
    exists: false,
  },
];

/**
 * Batch 3: POS staging — process_batch_v1 anomaly engine.
 */
export const BATCH_3_SECURITY_CONTRACT: FunctionSecurityRequirement[] = [
  {
    functionName: 'process_batch_v1',
    args: 'uuid',
    exists: true,
    hasSearchPathPublic: true,
    isRevokedFromPublic: true,
  },
];

export const BATCH_3_LANDMINE_CONTRACT: FunctionSecurityRequirement[] = [
  {
    functionName: 'process_batch',
    args: 'uuid',
    exists: false,
  },
  {
    functionName: 'process_batch_v1_wrong_name',
    args: 'uuid',
    exists: false,
  },
];
