/* ═══════════════════════════════════════════════
   Vercel Function: api/enablebanking.js
   Proxy for Enable Banking API (Tilisy).

   Required environment variables (set in Vercel Dashboard):
     ENABLE_BANKING_APP_ID
     ENABLE_BANKING_APP_SECRET
═══════════════════════════════════════════════ */
const BASE = 'https://api.enablebanking.com';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version')

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, ...params } = req.body || {};

  if (!process.env.ENABLE_BANKING_APP_ID || !process.env.ENABLE_BANKING_APP_SECRET) {
    return res.status(500).json({ error: 'Enable Banking keys not configured in Vercel.' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Token ${process.env.ENABLE_BANKING_APP_SECRET}` // Some tiers use Token, others use secret
  };

  try {
    let url = '', method = 'GET', body = null;

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
             valid_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
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
        // Optional date filters could be added here
        break;

      default:
        return res.status(400).json({ error: 'Unknown action: ' + action });
    }

    const r = await fetch(url, { method, headers, body });
    const data = await r.json();
    
    if (!r.ok) {
        return res.status(r.status).json({ error: data.error || data.detail || 'Enable Banking API Error' });
    }

    res.status(200).json(data);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
