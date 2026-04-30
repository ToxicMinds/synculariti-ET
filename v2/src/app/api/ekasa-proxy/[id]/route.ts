import { NextResponse } from 'next/server';

/**
 * eKasa Regional Proxy
 * 
 * CRITICAL: The Slovak Government's eKasa API blocks all non-EU IP addresses.
 * Since Vercel defaults to US regions (iad1), we MUST pin this route to a 
 * European region (Frankfurt or Paris) to ensure successful communication.
 */
export const preferredRegion = 'fra1'; 
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const receiptId = params.id;

  if (!receiptId) {
    return NextResponse.json({ error: 'Missing Receipt ID' }, { status: 400 });
  }

  try {
    const targetUrl = `https://ekasa.financnasprava.sk/mdu/api/v1/opd/${receiptId}`;
    
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Synculariti-V2-Proxy'
      },
      next: { revalidate: 3600 } // Cache results for 1 hour to prevent Gov API rate limits
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
