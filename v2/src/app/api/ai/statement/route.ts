import { NextResponse } from 'next/server';
import { withTestHandler } from '@/lib/withTestHandler';
import { apiError } from '@/lib/api-error-handler';
import { callGroq } from '@/lib/groq';
import { getCategoryPrompt } from '@/lib/ai-categories';
import { StatementRequestSchema } from '@/lib/validations/schemas';
import { ServerLogger } from '@/lib/logger-server';
import { cleanMarkdownJsonBlock } from '@/lib/utils';
import { SecureHandler } from '@/lib/types/api';

const handler: SecureHandler = async (req, context) => {
  const { tenantId } = context.auth || { tenantId: 'fallback' };
  await ServerLogger.system('INFO', 'AI', 'Statement parse request', { tenantId });
  try {
    const body = await req.json();
    
    // Validation: 400 Bad Request
    const parsedRequest = StatementRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return apiError('Validation failed', 'AI', 'Invalid statement request', {
        status: 400,
        details: parsedRequest.error.issues
      });
    }

    const { text, categories } = parsedRequest.data;

    const result = await callGroq("llama-3.3-70b-versatile", [
      {
        role: "system",
        content: `You are an expert financial data parser. 
Extract every valid transaction from the provided bank statement text.
Ignore running balances, header text, and page numbers.
Always respond with pure JSON containing a "transactions" array.
Format each item exactly like this:
{
  "date": "YYYY-MM-DD",
  "description": "Store or Merchant Name",
  "amount": 12.34,
  "category": "..."
}
${getCategoryPrompt(categories)}
Only output the JSON object.`
      },
      {
        role: "user",
        content: text.substring(0, 8000) // limit to avoid max tokens
      }
    ], { 
      temperature: 0.1,
      cacheKey: `stmt-${text.length}-${text.substring(0, 20)}` 
    });
    
    const content = cleanMarkdownJsonBlock(result.content);
    const data = JSON.parse(content);

    return NextResponse.json({ 
      success: true, 
      transactions: data.transactions || [],
      usage: result.usage
    });

  } catch (e: unknown) {
    return apiError(e, 'AI', 'Statement AI error', { retryable: true });
  }
};

export const POST = withTestHandler(handler);
