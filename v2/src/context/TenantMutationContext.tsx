'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { AppState } from '@/modules/identity/hooks/useTenant';
import { useTenantData } from './TenantDataContext';
import { recordEvent } from '@/lib/event-log';

interface TenantMutationContextType {
  updateState: (updates: Partial<AppState>) => Promise<void>;
}

const TenantMutationContext = createContext<TenantMutationContextType | undefined>(undefined);

export function TenantMutationProvider({ children }: { children: ReactNode }) {
  const { tenant, setTenant } = useTenantData();

  const updateState = async (updates: Partial<AppState>) => {
    if (!tenant?.tenant_id) return;
    
    // Atomic Patching via RPC
    const { error } = await supabase.rpc('update_tenant_config_v1', { p_config: updates });

    if (error) throw error;

    // Skip event logging for automated/internal-only config keys to avoid noise
    const changedKeys = Object.keys(updates);
    if (!(changedKeys.length === 1 && changedKeys[0] === 'ai_insight')) {
      void recordEvent({
        action: 'tenant_config.updated',
        description: `Updated config: ${changedKeys.join(', ')}`,
      });
    }
    
    // Update local state by merging
    setTenant(prev => prev ? ({ ...prev, ...updates }) : null);
  };

  return (
    <TenantMutationContext.Provider value={{ updateState }}>
      {children}
    </TenantMutationContext.Provider>
  );
}

export function useTenantMutations() {
  const context = useContext(TenantMutationContext);
  if (context === undefined) {
    throw new Error('useTenantMutations must be used within a TenantMutationProvider');
  }
  return { updateState: context.updateState };
}
