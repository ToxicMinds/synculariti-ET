import React from 'react';
import { createClient as createSessionClient, createServiceClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ActionClient } from './ActionClient';
import { formatCurrency, safeAmount } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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

async function ActionPageLoader({ actionId }: { actionId: string }) {
  // Use session-based client — only logged-in users can act
  const supabase = await createSessionClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect(`/login?redirect=/action/${actionId}`);
  }

  // Fetch the outbox record (RLS applies: tenant_id = get_my_tenant())
  const { data: record, error } = await supabase
    .from('whatsapp_outbox')
    .select('*, tenants!inner(name)')
    .eq('id', actionId)
    .single();

  if (error || !record) {
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
  };

  return (
    <ActionClient
      actionId={actionId}
      tenantName={tenantName}
      payload={clientPayload}
    />
  );
}
