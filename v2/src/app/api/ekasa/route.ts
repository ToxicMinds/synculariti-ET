import { ServerLogger } from '@/lib/logger-server';
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

export const preferredRegion = 'cdg1';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createClient();
  
  // 1. Verify Authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { receiptId, okpData } = await request.json();

    if (!receiptId && !okpData) {
      return NextResponse.json({ error: 'Missing Receipt ID or OKP Data' }, { status: 400 });
    }

    const targetUrl = `https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find`;
    
    // Construct the payload based on what we have (Dual-Protocol support)
    const payload = okpData 
      ? { 
          okp: okpData.okp,
          cashRegisterCode: okpData.cashRegisterCode,
          issueDate: okpData.date,
          receiptNumber: okpData.number,
          amount: okpData.total
        }
      : { receiptId };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload),
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      const errText = await response.text();
      ServerLogger.system('ERROR', 'eKasa', 'eKasa Gov API error', { status: response.status });
      return NextResponse.json({ 
        error: 'Slovak Gov API returned an error', 
        status: response.status,
        detail: errText
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    ServerLogger.system('ERROR', 'eKasa', 'eKasa proxy exception', { error: String(error) });
    return NextResponse.json({ error: 'Proxy failed to reach eKasa', detail: error.message }, { status: 500 });
  }
}
