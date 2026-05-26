import React from 'react';
import { createClient } from '@supabase/supabase-js';
import { ActionClient } from './ActionClient';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface PageProps {
  params: Promise<{
    actionId: string;
  }>;
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
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 1. Fetch outbox record (service_role bypasses RLS — public action link, no session)
  const { data: record, error } = await supabase
    .from('whatsapp_outbox')
    .select('*')
    .eq('id', actionId)
    .single();

  if (error || !record) {
    return (
      <div className="bento-card glass-card flex-col flex-center gap-4" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px' }}>⚠️</div>
        <h2 className="card-title text-gradient">Link Expired or Invalid</h2>
        <p className="card-subtitle" style={{ maxWidth: '320px' }}>
          This action link is invalid or has expired. If you believe this is an error, please request a new link.
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

  // 2. Fetch tenant name
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', record.tenant_id)
    .single();

  const tenantName = tenant?.name || 'Synculariti Client';

  // 3. Map stored payload to ActionClient interface
  const meta = record.payload?.metadata || {};
  const clientPayload = {
    title: record.payload?.name || 'Action Required',
    description: meta.description || (meta.amount ? `${meta.currency || '€'}${meta.amount}` : ''),
    options: record.payload?.options || [],
  };

  // 4. Render the interactive client interface
  return (
    <ActionClient
      actionId={actionId}
      tenantName={tenantName}
      payload={clientPayload}
    />
  );
}
