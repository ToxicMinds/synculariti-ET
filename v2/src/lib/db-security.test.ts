import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { BATCH_1_SECURITY_CONTRACT, BATCH_1_LANDMINE_CONTRACT } from './db-security-contract';
import { safeCastUuid, safeCastUserUuid } from './uuid-helpers';
import { RPC_GET_SECURITY_STATE, FunctionSecurityState } from './types';

// Load .env.local synchronously for live database checks in NodeJS test environment
const envPath = path.resolve(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#\s][^=]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

// Initialize real Supabase client with Service Role key to query catalog metadata
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to query function security state via live Supabase RPC
async function checkFunctionSecurity(name: string, args: string): Promise<FunctionSecurityState> {
  const { data, error } = await supabase.rpc(RPC_GET_SECURITY_STATE, {
    p_func_name: name,
    p_args_signature: args
  });
  
  if (error) {
    throw new Error(`Supabase RPC error: ${error.message}`);
  }
  
  if (!data || data.length === 0) {
    return { exists: false, hasSearchPathPublic: false, isRevokedFromPublic: false };
  }
  
  // Return the security state mapping database fields to the frontend contract
  return {
    exists: data[0].func_exists,
    hasSearchPathPublic: data[0].has_search_path_public,
    isRevokedFromPublic: data[0].is_revoked_from_public
  };
}


describe('Database Security Contract - Batch 1', () => {
  BATCH_1_SECURITY_CONTRACT.forEach(req => {
    test(`Function ${req.functionName}(${req.args}) should be hardened`, async () => {
      const state = await checkFunctionSecurity(req.functionName, req.args);
      
      expect(state.exists).toBe(req.exists);
      expect(state.hasSearchPathPublic).toBe(req.hasSearchPathPublic);
      expect(state.isRevokedFromPublic).toBe(req.isRevokedFromPublic);
    });
  });

  BATCH_1_LANDMINE_CONTRACT.forEach(req => {
    test(`Landmine ${req.functionName}(${req.args}) should not exist in hardening targets`, async () => {
      // For landmines, we check if they exist in the DB
      const state = await checkFunctionSecurity(req.functionName, req.args);
      expect(state.exists).toBe(req.exists);
    });
  });
});

describe('UUID Casting Security Contracts (Phase 2 - RED)', () => {
  describe('safeCastUuid', () => {
    test('1. Valid UUID Passthrough: returns valid lowercase UUID as-is', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(safeCastUuid(uuid)).toBe(uuid);
    });

    test('2. Valid UUID Uppercase Passthrough: returns valid uppercase UUID as-is', () => {
      const uuid = '550E8400-E29B-41D4-A716-446655440000';
      expect(safeCastUuid(uuid)).toBe(uuid);
    });

    test('3. Invalid Format Coercion: returns null for invalid formats', () => {
      expect(safeCastUuid('u1')).toBeNull();
      expect(safeCastUuid('invalid-uuid-string')).toBeNull();
    });

    test('4. Null Passthrough: returns null for empty or null/undefined inputs', () => {
      expect(safeCastUuid('')).toBeNull();
      expect(safeCastUuid(null)).toBeNull();
      expect(safeCastUuid(undefined)).toBeNull();
    });
  });

  describe('safeCastUserUuid', () => {
    test('1. Valid UUID Passthrough: returns valid UUID as-is', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(safeCastUserUuid(uuid)).toBe(uuid);
    });

    test('2. Mock User Mapping: maps standard mock user string to padded UUID block', () => {
      expect(safeCastUserUuid('u1')).toBe('00000000-0000-0000-0000-000000000001');
      expect(safeCastUserUuid('u25')).toBe('00000000-0000-0000-0000-000000000025');
      expect(safeCastUserUuid('u999999999999')).toBe('00000000-0000-0000-0000-999999999999');
    });

    test('3. Mock User Overflow Guard: falls back to system fallback on digit overflow (> 12 digits)', () => {
      expect(safeCastUserUuid('u9999999999999')).toBe('00000000-0000-0000-0000-000000000000');
    });

    test('4. System Guest Fallback: maps generic invalid strings to system guest UUID', () => {
      expect(safeCastUserUuid('guest-session')).toBe('00000000-0000-0000-0000-000000000000');
    });

    test('5. Null Passthrough: returns null for empty or null/undefined inputs', () => {
      expect(safeCastUserUuid('')).toBeNull();
      expect(safeCastUserUuid(null)).toBeNull();
      expect(safeCastUserUuid(undefined)).toBeNull();
    });
  });
});
