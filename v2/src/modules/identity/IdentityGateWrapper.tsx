'use client';

import { ReactNode } from 'react';
import { useTenantContext } from '@/context/TenantContext';
import { IdentityGate } from './IdentityGate';
import { OrgAccessForm } from '@/components/OrgAccessForm';

export function IdentityGateWrapper({ children }: { children: ReactNode }) {
  const { session, tenant, loading } = useTenantContext();

  // 1. Initial Authentication Gate: User MUST be logged into Supabase Auth
  if (!session && !loading) {
    return <OrgAccessForm session={null} />;
  }

  // 2. Identity Discovery Gate: User MUST be linked to an organization
  return (
    <IdentityGate 
      session={session} 
      currentTenantId={tenant?.tenant_id}
    >
      {children}
    </IdentityGate>
  );
}
