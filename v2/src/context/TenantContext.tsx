'use client';

import React, { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { TenantDataProvider, useTenantData } from './TenantDataContext';
import { TenantMutationProvider, useTenantMutations } from './TenantMutationContext';

/**
 * TenantProvider (Composition Root)
 * RESPONSIBILITY: Nests sub-providers in the correct dependency order.
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TenantDataProvider>
        <TenantMutationProvider>
          {children}
        </TenantMutationProvider>
      </TenantDataProvider>
    </AuthProvider>
  );
}

/**
 * useTenantContext (Unified Aggregator Hook)
 * RESPONSIBILITY: Provides backward compatibility by merging sub-contexts.
 * Use specialized hooks (useAuth, useTenantData, useTenantMutations) for new code.
 */
export function useTenantContext() {
  const { session, loading: authLoading } = useAuth();
  const { 
    tenant, 
    resolvedWhoId, 
    loading: dataLoading, 
    syncToken, 
    triggerRefresh, 
    fetchTenantState 
  } = useTenantData();
  const { updateState } = useTenantMutations();

  return {
    session,
    tenant,
    resolvedWhoId,
    loading: authLoading || dataLoading,
    syncToken,
    triggerRefresh,
    fetchTenantState,
    updateState
  };
}

// Re-export specialized hooks for clean imports
export { useAuth } from './AuthContext';
export { useTenantData } from './TenantDataContext';
export { useTenantMutations } from './TenantMutationContext';
