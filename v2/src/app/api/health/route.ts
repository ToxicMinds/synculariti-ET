import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getNeo4jDriver } from '@/lib/neo4j';

export async function GET() {
  const checks = {
    supabase: 'down',
    neo4j: 'down',
  };

  let status = 200;

  // 1. Check Supabase
  try {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (!error) checks.supabase = 'ok';
    else {
      checks.supabase = `error: ${error.message}`;
      status = 503;
    }
  } catch (e: any) {
    checks.supabase = `error: ${e.message}`;
    status = 503;
  }

  // 2. Check Neo4j
  const driver = getNeo4jDriver();
  if (driver) {
    try {
      const session = driver.session();
      await session.run('RETURN 1');
      await session.close();
      checks.neo4j = 'ok';
    } catch (e: any) {
      checks.neo4j = `error: ${e.message}`;
      status = 503;
    }
  }

  return NextResponse.json(
    { status: status === 200 ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status }
  );
}
