import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { apiError } from '@/lib/api-error-handler';
import { callGroq } from '@/lib/groq';
import { getCategoryPrompt } from '@/lib/ai-categories';
import { StatementRequestSchema } from '@/lib/validations/schemas';

const handler = async (req: Request) => {
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
    
    let content = result.content.trim();
    // Clean up potential markdown formatting Groq might still add
    if (content.startsWith('```json')) content = content.substring(7);
    if (content.startsWith('```')) content = content.substring(3);
    if (content.endsWith('```')) content = content.substring(0, content.length - 3);

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

export const POST = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
