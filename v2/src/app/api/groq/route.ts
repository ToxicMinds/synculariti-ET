import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';

import { callGroq } from '@/lib/groq';

export const POST = withAuth(async (req: Request) => {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ error: { message: 'GROQ_API_KEY not configured.' } }, { status: 500 });
  }

  try {
    const body = await req.json();
    
    // SECURITY: Limit request body to valid Groq parameters to prevent injection or misuse
    const { model, messages, temperature, max_tokens, stream, response_format } = body;
    
    const content = await callGroq(model, messages, { temperature, max_tokens, stream, response_format });
    
    const data = { choices: [{ message: { content } }] };
    return NextResponse.json(data, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Groq API error';
    return NextResponse.json({ error: { message: msg } }, { status: 500 });
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
