import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getNeo4jDriver } from '@/lib/neo4j';

export async function GET() {
  const checks: Record<string, string> = {
    supabase: 'down',
    neo4j: 'down',
  };

  let status = 200;
  const supabase = await createClient();

  // 1. Check Supabase
  try {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (!error) checks.supabase = 'ok';
    else {
      checks.supabase = `error: ${error.message}`;
      status = 503;
    }
  } catch (e: unknown) {
    checks.supabase = `error: ${e instanceof Error ? e.message : String(e)}`;
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
    } catch (e: unknown) {
      checks.neo4j = `error: ${e instanceof Error ? e.message : String(e)}`;
      status = 503;
    }
  }

  return NextResponse.json(
    { status: status === 200 ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status }
  );
}
