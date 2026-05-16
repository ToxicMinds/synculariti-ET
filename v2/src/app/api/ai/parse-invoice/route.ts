import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { apiError } from '@/lib/api-error-handler';
import { callGroq } from '@/lib/groq';
import { getCategoryPrompt } from '@/lib/ai-categories';
import { DocumentParseRequestSchema } from '@/lib/validations/schemas';
import { ServerLogger } from '@/lib/logger-server';
import { SecureHandler } from '@/lib/types/api';

const handler: SecureHandler = async (req, context) => {
  const { tenantId, user } = context.auth || { tenantId: 'fallback', user: { email: 'test@example.com' } as any };
  
  try {
    const body = await req.json();
    
    // Validation: 400 Bad Request
    const parsedRequest = DocumentParseRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return apiError('Validation failed', 'AI', 'Invalid invoice parse request', {
        status: 400,
        details: parsedRequest.error.issues
      });
    }

    const { image, categories } = parsedRequest.data;

    // --- STAGE 0: TRIAGE ---
    const triage = await callGroq('llama-3.2-11b-vision-preview', [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Does this image contain a financial document (invoice, receipt, bill, or statement)? Answer ONLY with "VALID" or "INVALID" followed by a short reason why.' },
          { type: 'image_url', image_url: { url: image } }
        ]
      }
    ], { temperature: 0.1 });

    if (triage.content.startsWith('INVALID')) {
      return NextResponse.json({ 
        success: false, 
        triage: 'REJECTED',
        message: triage.content.replace('INVALID', '').trim() || 'No financial data detected.',
        usage: triage.usage
      });
    }

    // --- STAGE 1 & 2: EXTRACTION & REASONING ---
    const parse = await callGroq('llama-3.2-11b-vision-preview', [
      {
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `Extract all data from this invoice. Respond ONLY with a JSON object:
{
  "store": "Issuer Name",
  "date": "YYYY-MM-DD",
  "total": 0.00,
  "ico": "Issuer ID (IČO)",
  "items": [{ "name": "...", "amount": 0.00, "category": "..." }],
  "currency": "EUR",
  "vatDetail": {}
}
${getCategoryPrompt(categories)}` 
          },
          { type: 'image_url', image_url: { url: image } }
        ]
      }
    ], { 
      temperature: 0.1,
      cacheKey: `invoice-${image.substring(image.length - 30)}`
    });

    let content = parse.content.trim();
    if (content.startsWith('```json')) content = content.substring(7);
    if (content.startsWith('```')) content = content.substring(3);
    if (content.endsWith('```')) content = content.substring(0, content.length - 3);

    const result = JSON.parse(content);

    await ServerLogger.user(tenantId, 'INVOICE_PARSED', `AI parsed invoice from ${result.store || 'Unknown'}`, user.email || 'User');

    return NextResponse.json({ 
      success: true, 
      triage: 'ACCEPTED',
      data: result,
      usage: parse.usage
    });

  } catch (err: unknown) {
    return apiError(err, 'AI', 'Invoice AI parse error', { retryable: true });
  }
};

export const POST = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
