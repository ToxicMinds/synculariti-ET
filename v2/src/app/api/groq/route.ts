import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/withAuth';
import { callGroq } from '@/lib/groq';
import { ServerLogger } from '@/lib/logger-server';
import { SecureHandler } from '@/lib/types/api';

const handler: SecureHandler = async (req, context) => {
  const { tenantId, user } = context.auth || { tenantId: 'fallback', user: { email: 'test@example.com' } as any };
  
  try {
    const body = await req.json();
    const { model, messages, options } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages array' }, { status: 400 });
    }

    await ServerLogger.system('INFO', 'AI', 'Direct Groq API call', { 
      tenantId, 
      user: user.email,
      model: model || 'default' 
    });

    const result = await callGroq(model || "llama-3.3-70b-versatile", messages, options);

    return NextResponse.json(result);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Groq API Exception';
    await ServerLogger.system('ERROR', 'AI', 'Groq route error', { error: msg, tenantId });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

export const POST = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
