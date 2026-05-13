'use client';

import { Suspense } from 'react';
import { useTenant } from '@/modules/identity/hooks/useTenant';
import { ChartOfAccounts } from '@/components/ChartOfAccounts';
import { InvoiceManager } from '@/components/InvoiceManager';
import { OrgAccessForm } from '@/components/OrgAccessForm';

function LedgerContent() {
  const { session, tenant, loading } = useTenant();

  if (loading) return (
    <div style={{ padding: 64, textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div className="spinner-small" style={{ margin: '0 auto 12px' }} />
      <p style={{ fontSize: 14 }}>Loading ledger...</p>
    </div>
  );

  if (!tenant) return <OrgAccessForm session={session} />;

  return (
    <main>
      <div className="bento-grid">
        <div style={{ gridColumn: 'span 12', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Finance Ledger</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Accounts Payable & Chart of Accounts</p>
        </div>
        
        <InvoiceManager tenantId={tenant.tenant_id} />
        <ChartOfAccounts tenantId={tenant.tenant_id} />
      </div>
    </main>
  );
}

export default function LedgerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 64, textAlign: 'center' }}>Loading…</div>}>
      <LedgerContent />
    </Suspense>
  );
}
