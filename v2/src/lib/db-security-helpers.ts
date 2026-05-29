import * as fs from 'fs';
import * as path from 'path';
import { createServiceClient } from '@/lib/supabase-server';
import { RPC_GET_SECURITY_STATE, FunctionSecurityState } from './types';

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

export const supabase = createServiceClient();

export async function checkFunctionSecurity(name: string, args: string): Promise<FunctionSecurityState> {
  const { data, error } = await supabase.rpc(RPC_GET_SECURITY_STATE, {
    p_func_name: name,
    p_args_signature: args
  });
  if (error) throw new Error(`Supabase RPC error: ${error.message}`);
  if (!data || data.length === 0) {
    return { exists: false, hasSearchPathPublic: false, isRevokedFromPublic: false };
  }
  return {
    exists: data[0].func_exists,
    hasSearchPathPublic: data[0].has_search_path_public,
    isRevokedFromPublic: data[0].is_revoked_from_public
  };
}

export async function tableExists(tableName: string): Promise<boolean> {
  const { error } = await supabase.from(tableName).select('id').limit(1);
  return !error;
}

export async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const { error } = await supabase.from(tableName).select(columnName).limit(1);
  return !error;
}

export async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_index_exists', {
    p_table: tableName,
    p_index: indexName,
  });
  if (error) return false;
  return data === true;
}

export async function getTableRlsStatus(tableName: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('get_table_rls_status', { p_table: tableName });
  if (error) return null;
  return data === true;
}

export async function viewExists(viewName: string): Promise<boolean> {
  const { error } = await supabase.from(viewName).select('id').limit(1);
  return !error;
}
