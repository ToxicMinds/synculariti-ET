import { ServerLogger } from '@/lib/logger-server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'node:crypto';

// 1. Input Validation Schema
const PinAuthSchema = z.object({
  pin: z.string().min(4).max(12).regex(/^[a-zA-Z0-9]+$/, 'PIN must be alphanumeric')
});

export async function POST(req: Request) {
  try {
    // 1. Validate Input
    const body = await req.json();
    const result = PinAuthSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json({ 
        error: 'Invalid PIN format', 
        details: result.error.errors 
      }, { status: 400 });
    }
    
    const { pin } = result.data;

    // 2. Initialize Admin Client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Rate Limiting Check
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipHash = crypto.createHash('sha256').update(ip + (process.env.SYNC_SECRET_KEY || '')).digest('hex');

    const { data: limitData, error: limitErr } = await supabaseAdmin.rpc('check_rate_limit', {
      p_ip_hash: ipHash,
      p_action: 'pin_auth',
      p_max_attempts: 5,
      p_window_minutes: 15,
      p_block_minutes: 60
    });

    if (limitErr) {
      ServerLogger.system('ERROR', 'Auth', 'Rate limit RPC failed', { error: String(limitErr) });
      // Fail open or closed? For auth, we fail closed to be safe.
      return NextResponse.json({ error: 'Security service unavailable' }, { status: 503 });
    }

    const { allowed, remaining_attempts, retry_after_seconds } = limitData as {
      allowed: boolean;
      remaining_attempts: number;
      retry_after_seconds: number;
    };

    if (!allowed) {
      return NextResponse.json({ 
        error: 'Too many attempts.', 
        retry_after: retry_after_seconds 
      }, { status: 429 });
    }

    // 4. Find tenant by PIN
    const { data: lookup, error: lErr } = await supabaseAdmin.rpc('verify_tenant_access', { 
      input_code: pin 
    });

    const lookupArray = lookup as { target_id: string; target_name: string }[] | null;

    if (lErr || !lookupArray || lookupArray.length === 0) {
      return NextResponse.json({ 
        error: 'Authentication failed', 
        remaining: remaining_attempts 
      }, { status: 401 });
    }

    const tenantId = lookupArray[0].target_id;

    // 5. Verify PIN via DB (Stored in config->'pin')
    const { data: isValid, error: vErr } = await supabaseAdmin.rpc('check_tenant_pin', {
      h_id: tenantId,
      input_pin: pin
    });

    if (vErr || !isValid) {
      return NextResponse.json({ 
        error: 'Authentication failed', 
        remaining: remaining_attempts 
      }, { status: 401 });
    }

    // 6. Get Tenant Handle for Virtual Email
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('handle')
      .eq('id', tenantId)
      .single();

    if (!tenantData) {
      return NextResponse.json({ error: 'Tenant configuration missing' }, { status: 404 });
    }

    // 7. Strengthen Password Derivation (HMAC-SHA256)
    const secret = process.env.PIN_DERIVATION_SECRET;
    if (!secret) {
      ServerLogger.system('CRITICAL', 'Auth', 'PIN_DERIVATION_SECRET is missing');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${pin}:${tenantId}`)
    );
    
    const virtualPass = 'sp-' + Buffer.from(signature).toString('hex').substring(0, 32);
    const virtualEmail = `h_${tenantData.handle}@synculariti.com`;

    // 8. Log in to Supabase Auth
    const { data: authData, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
      email: virtualEmail,
      password: virtualPass,
    });

    if (authErr || !authData.session) {
      ServerLogger.system('ERROR', 'Auth', 'Virtual login failed', { 
        error: authErr?.message,
        email: virtualEmail
      });
      return NextResponse.json({ error: 'Virtual account not provisioned' }, { status: 403 });
    }

    return NextResponse.json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    });

  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown auth error';
    ServerLogger.system('ERROR', 'Auth', 'PIN Auth Exception', { error: errorMsg });
    return NextResponse.json({ error: 'Authentication processing error' }, { status: 500 });
  }
}
