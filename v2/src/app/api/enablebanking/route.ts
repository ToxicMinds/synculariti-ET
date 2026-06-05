import { NextResponse } from 'next/server';
import { withTestHandler } from '@/lib/withTestHandler';
import { z } from 'zod';
import { ServerLogger } from '@/lib/logger-server';
import { recordEventServer } from '@/lib/event-log-server';
import { SecureHandler } from '@/lib/types/api';
import { getErrorMessage } from '@/lib/utils';
import { HEADER_CONTENT_TYPE, CONTENT_TYPE_JSON } from '@/lib/constants';

// 1. Validation Schema
const EnableBankingSchema = z.object({
  action: z.enum(['institutions', 'start_session', 'get_session', 'get_accounts', 'get_transactions']),
  country: z.string().length(2).optional(),
  institution_id: z.string().optional(),
  redirect_uri: z.string().url().refine(val => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return val.startsWith(appUrl);
  }, 'Redirect URI must point to the application domain').optional(),
  session_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional()
});

const BASE = process.env.ENABLE_BANKING_BASE_URL || 'https://api.enablebanking.com';

const handler: SecureHandler = async (req, context) => {
  const { tenantId, user } = context.auth!;
  
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const appSecret = process.env.ENABLE_BANKING_APP_SECRET;

  if (!appId || !appSecret) {
    await ServerLogger.system('ERROR', 'API', 'Enable Banking keys missing');
    return NextResponse.json({ error: 'Enable Banking keys not configured.' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const result = EnableBankingSchema.safeParse(body);

    if (!result.success) {
      await ServerLogger.system('WARN', 'API', 'Enable Banking validation failed', { 
        errors: result.error.issues,
        tenantId,
        user: user.email
      });
      return NextResponse.json({ 
        error: 'Invalid request parameters', 
        details: result.error.issues 
      }, { status: 400 });
    }

    const { action, country, institution_id, redirect_uri, session_id, account_id } = result.data;
    
    const headers = {
      [HEADER_CONTENT_TYPE]: CONTENT_TYPE_JSON,
      'Accept': CONTENT_TYPE_JSON,
      'Authorization': `Token ${appSecret}`
    };

    let url = '', method = 'GET', fetchBody: string | null = null;

    switch (action) {
      case 'institutions':
        url = `${BASE}/institutions?country=${country || 'SK'}`;
        break;

      case 'start_session':
        if (!institution_id || !redirect_uri) {
          return NextResponse.json({ error: 'Missing institution_id or redirect_uri' }, { status: 400 });
        }
        url = `${BASE}/sessions`;
        method = 'POST';
        fetchBody = JSON.stringify({
          connector: institution_id,
          redirect_url: redirect_uri,
          state: 'sf-eb-' + Date.now(),
          access: {
            valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          }
        });
        break;

      case 'get_session':
        if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
        url = `${BASE}/sessions/${session_id}`;
        break;

      case 'get_accounts':
        if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
        url = `${BASE}/accounts?session_id=${session_id}`;
        break;

      case 'get_transactions':
        if (!account_id) return NextResponse.json({ error: 'Missing account_id' }, { status: 400 });
        url = `${BASE}/accounts/${account_id}/transactions`;
        break;
    }

    const response = await fetch(url, { method, headers, body: fetchBody });
    const data: Record<string, unknown> = await response.json();

    if (!response.ok) {
      const errMsg = typeof data.error === 'string' ? data.error : typeof data.detail === 'string' ? data.detail : 'Enable Banking API Error';
      return NextResponse.json({ 
        error: errMsg
      }, { status: response.status });
    }

    if (action === 'start_session') {
      void recordEventServer({
        tenantId,
        action: 'bank_sync.session_started',
        whoType: 'user',
        whoId: user.id,
        metadata: { institutionId: institution_id },
        description: `Started bank sync session with ${institution_id}`,
      }).catch(() => {});
    }

    return NextResponse.json(data);

  } catch (e: unknown) {
    const msg = getErrorMessage(e);
    await ServerLogger.system('ERROR', 'API', 'Enable Banking route exception', { error: msg, tenantId });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

export const POST = withTestHandler(handler);
