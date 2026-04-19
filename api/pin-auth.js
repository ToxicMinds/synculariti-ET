/**
 * /api/pin-auth.js
 * 
 * Secure server-side PIN validation.
 * PIN credentials live in Vercel env vars - NOT in client source code.
 * 
 * Required Vercel Env Vars:
 *   LEGACY_PIN          = "2026"
 *   LEGACY_EMAIL        = "legacy@et-tracker.com"
 *   LEGACY_PASSWORD     = "pass2026"
 *   SUPABASE_URL        = https://xxx.supabase.co
 *   SUPABASE_ANON_KEY   = eyJ...
 */

// Simple in-memory rate limiter (resets on serverless cold start)
const attempts = {};
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting by IP
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  if (!attempts[ip] || now - attempts[ip].start > WINDOW_MS) {
    attempts[ip] = { count: 0, start: now };
  }
  attempts[ip].count++;
  if (attempts[ip].count > MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }

  const { pin } = req.body || {};
  if (!pin) {
    return res.status(400).json({ error: 'PIN required' });
  }

  const validPin    = process.env.LEGACY_PIN      || '2026';
  const legacyEmail = process.env.LEGACY_EMAIL    || 'legacy@et-tracker.com';
  const legacyPass  = process.env.LEGACY_PASSWORD || 'pass2026';
  const sbUrl       = process.env.SUPABASE_URL    || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey       = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (String(pin) !== String(validPin)) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }

  if (!sbUrl || !sbKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Sign in via Supabase REST (no SDK needed server-side)
  try {
    const authRes = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': sbKey
      },
      body: JSON.stringify({ email: legacyEmail, password: legacyPass })
    });

    const authData = await authRes.json();

    if (!authRes.ok) {
      console.error('PIN bridge auth failed:', authData);
      return res.status(401).json({ 
        error: 'Household not found. Please contact your administrator.',
        detail: authData.error_description || authData.message
      });
    }

    // Reset attempt counter on success
    attempts[ip] = { count: 0, start: now };

    return res.status(200).json({
      access_token: authData.access_token,
      refresh_token: authData.refresh_token,
      expires_in: authData.expires_in
    });
  } catch (e) {
    console.error('PIN auth server error:', e);
    return res.status(500).json({ error: 'Server error during authentication' });
  }
};
