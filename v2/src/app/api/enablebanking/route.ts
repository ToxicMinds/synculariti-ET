import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';

const BASE = 'https://api.enablebanking.com';

export const POST = withAuth(async (req: Request) => {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const appSecret = process.env.ENABLE_BANKING_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json({ error: 'Enable Banking keys not configured.' }, { status: 500 });
  }

  try {
    const { action, ...params } = await req.json();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Token ${appSecret}`
    };

    let url = '', method = 'GET', body: string | null = null;

    switch (action) {
      case 'institutions':
        url = `${BASE}/institutions?country=${params.country || 'SK'}`;
        break;

      case 'start_session':
        url = `${BASE}/sessions`;
        method = 'POST';
        body = JSON.stringify({
          connector: params.institution_id,
          redirect_url: params.redirect_uri,
          state: 'sf-eb-' + Date.now(),
          access: {
            valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
          }
        });
        break;

      case 'get_session':
        url = `${BASE}/sessions/${params.session_id}`;
        break;

      case 'get_accounts':
        url = `${BASE}/accounts?session_id=${params.session_id}`;
        break;

      case 'get_transactions':
        url = `${BASE}/accounts/${params.account_id}/transactions`;
        break;

      default:
        return NextResponse.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }

    const response = await fetch(url, { method, headers, body });
    const data = (await response.json()) as unknown;

    if (!response.ok) {
      const errData = data as { error?: string; detail?: string };
      return NextResponse.json({ error: errData.error || errData.detail || 'Enable Banking API Error' }, { status: response.status });
    }

    return NextResponse.json(data);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Enable Banking exception';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
