
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env from v2/.env.local
dotenv.config({ path: path.resolve(process.cwd(), 'v2/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectSchema() {
  console.log('--- Inspecting expenses table ---');
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching expenses:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns:', Object.keys(data[0]));
    console.log('Sample Row:', data[0]);
  } else {
    console.log('No data found in expenses table.');
  }
}

inspectSchema();
