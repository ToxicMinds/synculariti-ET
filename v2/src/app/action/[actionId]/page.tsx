import React from 'react';
import { createClient as createSessionClient, createServiceClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ActionClient } from './ActionClient';
import { formatCurrency, safeAmount, getErrorMessage } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ServerLogger } from '@/lib/logger-server';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://synculariti-et.vercel.app';

interface PageProps {
  params: Promise<{
    actionId: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const supabase = createServiceClient();
  const { data: record } = await supabase
    .from('whatsapp_outbox')
    .select('payload')
    .eq('id', resolvedParams.actionId)
    .single();

  const name = record?.payload?.name || 'Action Required';
  const meta = record?.payload?.metadata || {};
  const desc = meta.description || (meta.amount ? formatCurrency(safeAmount(meta.amount), typeof meta.currency === 'string' ? meta.currency : 'EUR') : 'Respond to this action request');

  return {
    title: `${name} - Synculariti`,
    description: desc,
    openGraph: {
      title: name,
      description: desc,
      url: `${BASE_URL}/action/${resolvedParams.actionId}`,
      siteName: 'Synculariti',
      images: [{ url: `${BASE_URL}/icon.png`, width: 512, height: 512 }],
    },
    twitter: {
      card: 'summary',
      title: name,
      description: desc,
      images: [`${BASE_URL}/icon.png`],
    },
  };
}

export default async function ActionPage({ params }: PageProps) {
  const resolvedParams = await params;
  const actionId = resolvedParams.actionId;

  return (
    <ErrorBoundary module="App">
      <main style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px 16px',
        background: 'var(--bg-primary)'
      }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>
          <ActionPageLoader actionId={actionId} />
        </div>
      </main>
    </ErrorBoundary>
  );
}

/** @internal exported for testing */
export async function ActionPageLoader({ actionId }: { actionId: string }) {
  // 1. Authenticate via session cookies (matches withAuth.ts pattern)
  const sessionSupabase = await createSessionClient();
  const { data: { session }, error: sessionError } = await sessionSupabase.auth.getSession();

  if (sessionError || !session?.user) {
    await ServerLogger.system('WARN', 'WhatsApp', 'Action page — no session', {
      actionId,
      error: getErrorMessage(sessionError),
    });
    redirect(`/login?redirect=/action/${actionId}`);
  }

  const user = session.user;
  const userEmail = user.email;

  // 2. Read outbox via service_role client (bypasses RLS tenant filter)
  //    The user received this link via WhatsApp — the outbox ID is an unguessable UUID.
  //    Security is enforced by verifying tenant membership below.
  const serviceClient = createServiceClient();
  const { data: record, error: outboxErr } = await serviceClient
    .from('whatsapp_outbox')
    .select('*, tenants!inner(name, id)')
    .eq('id', actionId)
    .single();

  if (outboxErr || !record) {
    const errCode = (outboxErr as { code?: string })?.code || 'N/A';
    const errMsg = getErrorMessage(outboxErr);
    await ServerLogger.system('WARN', 'WhatsApp', 'Action page — outbox not found', {
      actionId,
      error: errMsg,
      errorCode: errCode,
      userEmail: userEmail || null,
    });
    return <ActionNotFound />;
  }

  if (!userEmail) {
    await ServerLogger.system('WARN', 'WhatsApp', 'Action page — user has no email, rejecting', {
      actionId,
      tenantId: record.tenants?.id,
      userId: user.id,
    });
    return <ActionNotFound />;
  }

  // 3. Verify the authenticated user is a member of the outbox's tenant
  const { data: member, error: memberErr } = await serviceClient
    .from('tenant_members')
    .select('id, role')
    .eq('tenant_id', record.tenants.id)
    .eq('email', userEmail)
    .maybeSingle();

  if (memberErr) {
    await ServerLogger.system('WARN', 'WhatsApp', 'Action page — membership query failed', {
      actionId,
      tenantId: record.tenants.id,
      userEmail,
      error: getErrorMessage(memberErr),
    });
  }

  if (!member) {
    await ServerLogger.system('WARN', 'WhatsApp', 'Action page — user not a tenant member', {
      actionId,
      tenantId: record.tenants.id,
      tenantName: record.tenants?.name,
      userEmail,
    });
    return <ActionNotFound />;
  }

  await ServerLogger.system('INFO', 'WhatsApp', 'Action page — user authorized', {
    actionId,
    tenantId: record.tenants.id,
    tenantName: record.tenants?.name,
    userEmail,
    role: member.role,
  });

  if (record.status === 'COMPLETED') {
    return (
      <div className="bento-card glass-card flex-col flex-center gap-4" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px' }}>🔒</div>
        <h2 className="card-title text-gradient">Action Already Completed</h2>
        <p className="card-subtitle" style={{ maxWidth: '320px' }}>
          This action request has already been completed and cannot be submitted again.
        </p>
      </div>
    );
  }

  const tenantName = record.tenants?.name || 'Synculariti Client';
  const meta = record.payload?.metadata || {};
  const clientPayload = {
    title: record.payload?.name || 'Action Required',
    description: meta.description || (meta.amount ? formatCurrency(safeAmount(meta.amount), typeof meta.currency === 'string' ? meta.currency : 'EUR') : ''),
    options: record.payload?.options || [],
    metadata: meta,
  };

  return (
    <ActionClient
      actionId={actionId}
      tenantName={tenantName}
      payload={clientPayload}
    />
  );
}

/** @internal exported for testing */
export function ActionNotFound() {
  return (
    <div className="bento-card glass-card flex-col flex-center gap-4" style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '48px' }}>⚠️</div>
      <h2 className="card-title text-gradient">Action Not Found</h2>
      <p className="card-subtitle" style={{ maxWidth: '320px' }}>
        This action does not belong to your account or has expired.
      </p>
    </div>
  );
}
