'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useIdentity } from './useIdentity';
import { TenantSelector } from './TenantSelector';
import { OrgAccessForm } from '@/components/OrgAccessForm';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

interface Props {
  children: ReactNode;
  session: Session | null;
  currentTenantId?: string; // Passed from TenantContext if already resolved
}

export function IdentityGate({ children, session, currentTenantId }: Props) {
  const { tenants, loading, selectTenant } = useIdentity(session);
  const [showManualAuth, setShowManualAuth] = useState(false);

  // If we already have a tenant_id resolved in the app session, we are AUTHORIZED.
  if (currentTenantId) {
    return <>{children}</>;
  }

  // Identity Phase: User is logged in but not linked to a tenant
  if (session && !currentTenantId) {
    if (loading) {
      return (
        <div className="flex-center" style={{ minHeight: '100vh' }}>
          <div className="flex-col items-center gap-4">
            <div className="spinner" />
            <p className="card-subtitle">Resolving Identity...</p>
          </div>
        </div>
      );
    }

    // SCENARIO: User is invited to 1 or more organizations
    if (tenants.length > 0 && !showManualAuth) {
      return (
        <TenantSelector 
          tenants={tenants} 
          onSelect={selectTenant} 
          onJoinNew={() => setShowManualAuth(true)}
        />
      );
    }

    // SCENARIO: No invitations found, or user chose to Join via Code
    return (
      <OrgAccessForm 
        session={session} 
        onBack={tenants.length > 0 ? () => setShowManualAuth(false) : undefined} 
      />
    );
  }

  // Public State: Not logged in (handled by standard Auth flow, but we pass through)
  return <>{children}</>;
}
