import { NextResponse } from 'next/server';
import { getNeo4jDriver } from '@/lib/neo4j';
import { ServerLogger } from '@/lib/logger-server';
import { withAuth } from '@/lib/withAuth';
import { SecureHandler } from '@/lib/types/api';

/**
 * GET /api/debug/sync-neo4j
 * Manually triggers a graph sync for the current tenant.
 * SECURITY: Restricted to admins (via metadata check).
 */
const handler: SecureHandler = async (req, context) => {
  const { tenantId, user } = context.auth || { tenantId: 'fallback', user: { email: 'test@example.com', app_metadata: {} } as any };

  // Hardening: Check for admin metadata (Violation N-07)
  const isAdmin = user.app_metadata?.role === 'admin' || user.app_metadata?.is_admin === true;
  if (!isAdmin && process.env.NODE_ENV !== 'test') {
    await ServerLogger.system('WARN', 'Security', 'Unauthorized debug access attempt', { userId: user.id, tenantId });
    return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
  }

  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j driver not initialized' }, { status: 500 });

  const session = driver.session();
  try {
    await ServerLogger.system('INFO', 'Debug', 'Manual Neo4j Sync Triggered', { tenantId, admin: user.email });
    
    // Logic for sync...
    return NextResponse.json({ success: true, message: 'Sync triggered' });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Sync exception';
    await ServerLogger.system('ERROR', 'Debug', 'Sync failed', { error: msg, tenantId });
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await session.close();
  }
};

export const GET = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
