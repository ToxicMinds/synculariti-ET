import { ServerLogger } from '@/lib/logger-server';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { getCategoryPrompt } from '@/lib/ai-categories';

import { callGroq } from '@/lib/groq';

export const POST = withAuth(async (req: Request) => {

  try {
    const { text, categories } = await req.json();

    if (!text || text.length < 10) {
      return NextResponse.json({ error: 'Statement text too short or empty' }, { status: 400 });
    }

    let content = await callGroq("llama-3.3-70b-versatile", [
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
${getCategoryPrompt(categories as string[])}
Only output the JSON object.`
      },
      {
        role: "user",
        content: text.substring(0, 8000) // limit to avoid max tokens
      }
    ], { temperature: 0.1, response_format: { type: 'json_object' } }).catch(() => "");
    
    // Clean up potential markdown formatting Groq might still add
    content = content.trim();
    if (content.startsWith('```json')) content = content.substring(7);
    if (content.startsWith('```')) content = content.substring(3);
    if (content.endsWith('```')) content = content.substring(0, content.length - 3);

    const parsed = JSON.parse(content);

    return NextResponse.json({ 
      success: true, 
      transactions: parsed.transactions || []
    });

  } catch (e: unknown) {
    ServerLogger.system('ERROR', 'AI', 'Statement AI error', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI Processing failed' }, { status: 500 });
  }
});
