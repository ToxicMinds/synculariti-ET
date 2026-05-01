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

    // 1. Find household by PIN (using the alias lookup)
    const { data: lookup, error: lErr } = await supabaseAdmin.rpc('verify_household_access', { 
      input_code: pin 
    });

    if (lErr || !lookup || lookup.length === 0) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    const householdId = lookup[0].target_id;

    // 2. Verify PIN
    const { data: isValid, error: vErr } = await supabaseAdmin.rpc('check_household_pin', {
      h_id: householdId,
      input_pin: pin
    });

    if (vErr || !isValid) {
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
    }

    // 3. Log in as the "Virtual Household User"
    // We use a standardized email format for virtual accounts
    const { data: houseData } = await supabaseAdmin
      .from('households')
      .select('handle')
      .eq('id', householdId)
      .single();

    const virtualEmail = `h_${houseData.handle}@synculariti.com`;
    const virtualPass = `pin_${pin}_${householdId.substring(0, 8)}`;

    const { data: authData, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
      email: virtualEmail,
      password: virtualPass,
    });

    if (authErr) {
      // If virtual account doesn't exist, we could auto-provision it here, 
      // but for now, we'll assume they are seeded or handled via a migration.
      console.error('Virtual Login Failed:', authErr);
      return NextResponse.json({ error: 'System Error: Virtual Account not initialized.' }, { status: 500 });
    }

    return NextResponse.json({
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
