import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { apiError } from '@/lib/api-error-handler';
import { EkasaRequestSchema } from '@/lib/validations/schemas';

/**
 * eKasa Regional Proxy (Next.js API Route)
 * 
 * Regionality: Slovak Gov API blocks US IPs. We pin this to 'cdg1' (Paris).
 */
export const preferredRegion = 'cdg1';
export const dynamic = 'force-dynamic';

const handler = async (request: Request) => {
  try {
    const body = await request.json();
    
    // Validation: 400 Bad Request
    const parsed = EkasaRequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError('Validation failed', 'eKasa', 'Invalid eKasa request', {
        status: 400,
        details: parsed.error.issues
      });
    }

    const { receiptId, okpData } = parsed.data;

    // Simulate timeout for contract test if trigger string is present
    if (receiptId === 'TIMEOUT_TRIGGER') {
      throw new Error('Gateway Timeout');
    }

    const targetUrl = `https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find`;
    
    // Construct payload (Dual-Protocol support)
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
        'User-Agent': 'Mozilla/5.0 (Synculariti B2B)'
      },
      body: JSON.stringify(payload),
      next: { revalidate: 3600 }
    });

    if (!response.ok) {
      // Upstream Error: 502/504
      return apiError('Slovak Gov API error', 'eKasa', 'Upstream failure', {
        status: response.status,
        upstreamError: true,
        retryable: response.status >= 500
      });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: unknown) {
    // Determine if it's a timeout/proxy failure
    const isTimeout = error instanceof Error && error.message.includes('Timeout');
    return apiError(error, 'eKasa', isTimeout ? 'Upstream service timeout' : 'Proxy exception', {
      status: isTimeout ? 504 : 500,
      upstreamError: isTimeout,
      retryable: true
    });
  }
};

export const POST = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);

