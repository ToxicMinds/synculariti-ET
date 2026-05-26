import { NextResponse } from 'next/server';

export const runtime = 'edge';

export const GET = async () => {
  const baseUrl = process.env.OPENWA_BASE_URL || 'http://34.66.35.89:2785';
  const apiKey = process.env.OPENWA_API_KEY || '';
  const sessionId = process.env.OPENWA_SESSION_ID || 'synculariti-bot';

  const tests: Record<string, unknown> = {};

  try {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/status`, {
      headers: { 'X-Api-Key': apiKey },
    });
    const body = await res.text();
    tests['sessionStatus'] = { status: res.status, body };
  } catch (e) {
    tests['sessionStatus'] = { error: String(e) };
  }

  try {
    const res = await fetch(`${baseUrl}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ chatId: '421944539208@c.us', text: 'Diagnostic test', session: sessionId }),
    });
    const body = await res.text();
    tests['sendText'] = { status: res.status, body };
  } catch (e) {
    tests['sendText'] = { error: String(e) };
  }

  return NextResponse.json({ baseUrl, sessionId, tests });
};
