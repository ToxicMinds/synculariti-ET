import { ServerLogger } from '@/lib/logger-server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { pin } = await req.json();
    if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 });

    // Use Service Role to bypass RLS for the lookup
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Find tenant by PIN (using the alias lookup)
    const { data: lookup, error: lErr } = await supabaseAdmin.rpc('verify_tenant_access', { 
      input_code: pin 
    });

    const lookupArray = lookup as { target_id: string; target_name: string }[] | null;

    if (lErr || !lookupArray || lookupArray.length === 0) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    const tenantId = lookupArray[0].target_id;

    // 2. Verify PIN
    const { data: isValid, error: vErr } = await supabaseAdmin.rpc('check_tenant_pin', {
      h_id: tenantId,
      input_pin: pin
    });

    if (vErr || !isValid) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }

    // 3. Log in as the "Virtual Tenant User"
    // We use a standardized email format for virtual accounts
    const { data: houseData } = await supabaseAdmin
      .from('tenants')
      .select('handle')
      .eq('id', tenantId)
      .single();

    if (!houseData) {
      return NextResponse.json({ error: 'Tenant metadata not found' }, { status: 404 });
    }

    const virtualEmail = `h_${houseData.handle}@synculariti.com`;
    const virtualPass = `pin_${pin}_${tenantId.substring(0, 8)}`;

    const { data: authData, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
      email: virtualEmail,
      password: virtualPass,
    });

    if (authErr || !authData.session) {
      // If virtual account doesn't exist, we could auto-provision it here, 
      // but for now, we'll assume they are seeded or handled via a migration.
      ServerLogger.system('ERROR', 'Auth', 'Virtual login failed for PIN auth', { error: String(authErr) });
      return NextResponse.json({ error: 'System Error: Virtual Account not initialized.' }, { status: 500 });
    }

    return NextResponse.json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    });

  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'PIN Auth failed' }, { status: 500 });
  }
}
