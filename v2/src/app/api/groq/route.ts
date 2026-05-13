import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';

export const POST = withAuth(async (req: Request) => {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ error: { message: 'GROQ_API_KEY not configured.' } }, { status: 500 });
  }

  try {
    const body = await req.json();
    
    // SECURITY: Limit request body to valid Groq parameters to prevent injection or misuse
    const { model, messages, temperature, max_tokens, stream } = body;
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens, stream })
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 });
  }
});

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
