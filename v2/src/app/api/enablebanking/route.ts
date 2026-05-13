import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { z } from 'zod';
import { ServerLogger } from '@/lib/logger-server';

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

export const POST = withAuth(async (req: Request) => {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const appSecret = process.env.ENABLE_BANKING_APP_SECRET;

  if (!appId || !appSecret) {
    ServerLogger.system('ERROR', 'API', 'Enable Banking keys missing');
    return NextResponse.json({ error: 'Enable Banking keys not configured.' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const result = EnableBankingSchema.safeParse(body);

    if (!result.success) {
      ServerLogger.system('WARN', 'API', 'Enable Banking validation failed', { errors: result.error.issues });
      return NextResponse.json({ 
        error: 'Invalid request parameters', 
        details: result.error.issues 
      }, { status: 400 });
    }

    const { action, country, institution_id, redirect_uri, session_id, account_id } = result.data;
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
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
    const data = (await response.json()) as unknown;

    if (!response.ok) {
      const errData = data as { error?: string; detail?: string };
      return NextResponse.json({ 
        error: errData.error || errData.detail || 'Enable Banking API Error' 
      }, { status: response.status });
    }

    return NextResponse.json(data);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Enable Banking exception';
    ServerLogger.system('ERROR', 'API', 'Enable Banking route exception', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
