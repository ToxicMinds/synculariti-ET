import { NextResponse } from 'next/server';

/**
 * eKasa Regional Proxy (Next.js API Route)
 * 
 * Portability: This route handles the Gov API fetch internally, 
 * making the app independent of Vercel-specific 'vercel.json' rewrites.
 * 
 * Regionality: Slovak Gov API blocks US IPs. We pin this to 'fra1' (Frankfurt).
 */
import { createClient } from '@/lib/supabase-server';

export const preferredRegion = 'fra1';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createClient();
  
  // 1. Verify Authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { receiptId } = await request.json();

    if (!receiptId) {
      return NextResponse.json({ error: 'Missing Receipt ID' }, { status: 400 });
    }

    // Matching the V1 Protocol exactly
    const targetUrl = `https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find`;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Synculariti-V2-Portable-Proxy'
      },
      body: JSON.stringify({ receiptId }),
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('eKasa Gov API Error:', response.status, errText);
      return NextResponse.json({ 
        error: 'Slovak Gov API returned an error', 
        status: response.status 
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('eKasa Proxy Exception:', error);
    return NextResponse.json({ error: 'Proxy failed to reach eKasa', detail: error.message }, { status: 500 });
  }
}
