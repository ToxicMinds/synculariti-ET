import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { ServerLogger } from '@/lib/logger-server';
import { withAuth } from '@/lib/withAuth';
import { getCategoryPrompt } from '@/lib/ai-categories';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * AI Invoice Parser (3-Stage Pipeline)
 * Stage 0: Triage (Is it a financial document?)
 * Stage 1: Extraction (High-fidelity spatial transcription)
 * Stage 2: Reasoning (Category mapping & VAT validation)
 */
export const POST = withAuth(async (req: Request, { tenantId, user }) => {
  try {

    const { image, categories } = await req.json();
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    // --- STAGE 0: TRIAGE ---
    const triageResponse = await groq.chat.completions.create({
      model: 'llama-3.2-11b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Does this image contain a financial document (invoice, receipt, bill, or statement)? Answer ONLY with "VALID" or "INVALID" followed by a short reason why.' },
            { type: 'image_url', image_url: { url: image } }
          ]
        }
      ],
      temperature: 0.1,
    });

    const triageResult = triageResponse.choices[0]?.message?.content || 'INVALID_UNKNOWN';
    if (triageResult.startsWith('INVALID')) {
      return NextResponse.json({ 
        success: false, 
        triage: 'REJECTED',
        message: triageResult.replace('INVALID', '').trim() || 'No financial data detected. Please ensure the document is clear.'
      });
    }

    // --- STAGE 1 & 2: EXTRACTION & REASONING ---
    const parseResponse = await groq.chat.completions.create({
      model: 'llama-3.2-11b-vision-preview',
      messages: [
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
              ${getCategoryPrompt(categories as string[])}` 
            },
            { type: 'image_url', image_url: { url: image } }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const result = JSON.parse(parseResponse.choices[0]?.message?.content || '{}');

    await ServerLogger.user(tenantId, 'INVOICE_PARSED', `AI parsed invoice from ${result.store || 'Unknown'}`, user.email || 'User');

    return NextResponse.json({ 
      success: true, 
      triage: 'ACCEPTED',
      data: result 
    });

  } catch (err: unknown) {
    ServerLogger.system('ERROR', 'AI', 'Invoice AI parse error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to process invoice' }, { status: 500 });
  }
});
