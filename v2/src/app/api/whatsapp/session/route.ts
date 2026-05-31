export const runtime = 'edge';

import { NextResponse } from 'next/server';
import { SecureHandler } from '@/lib/types/api';
import { withTestHandler } from '@/lib/withTestHandler';
import { getErrorMessage } from '@synculariti/whatsapp-client';
import { createOpenWAClient } from '@/lib/create-openwa-client';
import { ServerLogger } from '@/lib/logger-server';

const handler: SecureHandler = async (req, context) => {
  try {
    const client = createOpenWAClient();

    // We do a direct call to OpenWA here since status check is fast and synchronous
    const statusResult = await client.getSessionStatus();

    return NextResponse.json({ 
      session: {
        id: process.env.OPENWA_SESSION_ID || 'synculariti-bot',
        name: 'Synculariti Core',
        status: statusResult.status || 'DISCONNECTED',
        phoneNumber: null,
        pushName: null,
        connectedAt: null,
        createdAt: new Date().toISOString()
      },
      qrCode: null 
    });
  } catch (e: unknown) {
    const errMsg = getErrorMessage(e);
    await ServerLogger.system('ERROR', 'WhatsApp', `Session check failed`, { error: errMsg });
    return NextResponse.json({ error: 'Session check failed' }, { status: 500 });
  }
};

export const GET = withTestHandler(handler);
