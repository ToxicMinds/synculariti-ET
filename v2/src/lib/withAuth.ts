import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { ServerLogger } from '@/lib/logger-server';
import { User } from '@supabase/supabase-js';

type RouteHandler = (
  req: Request,
  context: { tenantId: string; user: User }
) => Promise<NextResponse>;

/**
 * withAuth: Centralized API route authentication middleware.
 *
 * Wraps any API handler with:
 * 1. Session verification (rejects if no valid Supabase session)
 * 2. Tenant resolution (from session, never from client payload)
 * 3. Structured error logging via ServerLogger
 *
 * USAGE:
 *   export const GET = withAuth(async (req, { tenantId }) => {
 *     // tenantId is guaranteed to be valid here
 *     return NextResponse.json({ ok: true });
 *   });
 *
 * Fixes DRY violation: API auth boilerplate was copy-pasted across 5+ routes.
 */
export function withAuth(handler: RouteHandler) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      const supabase = await createClient();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        await ServerLogger.system('WARN', 'Auth', 'Unauthenticated API request rejected', {
          url: req.url,
          method: req.method,
        });
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Resolve tenant from RPC — canonical, RLS-enforced, not from client
      const { data: tenantId, error: tenantErr } = await supabase.rpc('get_my_tenant');

      if (tenantErr || !tenantId) {
        await ServerLogger.system('ERROR', 'Auth', 'Tenant resolution failed in withAuth', {
          userId: session.user.id,
          error: tenantErr?.message,
        });
        return NextResponse.json({ error: 'Tenant not found' }, { status: 403 });
      }

      return await handler(req, { tenantId, user: session.user });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await ServerLogger.system('ERROR', 'API', 'Unhandled error in withAuth wrapper', { error: msg });
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  };
}
