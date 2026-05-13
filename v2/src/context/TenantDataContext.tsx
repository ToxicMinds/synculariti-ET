'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { AppState, Location } from '@/modules/identity/hooks/useTenant';
import { DEFAULT_CATEGORIES } from '@/lib/constants';
import { useAuth } from './AuthContext';

interface TenantDataContextType {
  tenant: AppState | null;
  resolvedWhoId: string | null;
  loading: boolean;
  syncToken: number;
  triggerRefresh: () => void;
  fetchTenantState: () => Promise<void>;
  setTenant: React.Dispatch<React.SetStateAction<AppState | null>>;
}

const TenantDataContext = createContext<TenantDataContextType | undefined>(undefined);

export function TenantDataProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<AppState | null>(null);
  const [resolvedWhoId, setResolvedWhoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncToken, setSyncToken] = useState(0);

  const triggerRefresh = useCallback(() => setSyncToken(prev => prev + 1), []);

  const fetchTenantState = useCallback(async () => {
    if (!session) {
      setTenant(null);
      setResolvedWhoId(null);
      setLoading(false);
      return;
    }

    try {
      const { data: bundle, error } = await supabase.rpc('get_tenant_bundle');
      
      if (error) throw error;
      if (!bundle || !bundle.tenant) return;

      const { tenant: h, locations: l } = bundle;

      setTenant({
        tenant_id: h.id,
        handle: h.handle || '',
        names: h.config?.names || {},
        emails: h.config?.emails || {},
        income: h.config?.income || {},
        budgets: h.config?.budgets || {},
        memory: h.config?.memory || {},
        goals: h.config?.goals || { monthly_savings: 500 },
        ai_insight: h.config?.ai_insight,
        categories: h.categories || DEFAULT_CATEGORIES,
        locations: (l as Location[]) || [],
        created_at: h.created_at
      });

      const email = session.user?.email;
      if (email && h.config?.emails) {
        const foundId = Object.keys(h.config.emails).find(
          key => h.config.emails[key]?.toLowerCase() === email.toLowerCase()
        );
        if (foundId) setResolvedWhoId(foundId);
      }
    } catch (e: unknown) {
      Logger.system('ERROR', 'Auth', 'Failed to fetch tenant bundle', { error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!authLoading) {
      fetchTenantState();
    }
  }, [session, authLoading, syncToken, fetchTenantState]);

  return (
    <TenantDataContext.Provider value={{ 
      tenant, 
      resolvedWhoId, 
      loading: loading || authLoading, 
      syncToken, 
      triggerRefresh, 
      fetchTenantState,
      setTenant
    }}>
      {children}
    </TenantDataContext.Provider>
  );
}

export function useTenantData() {
  const context = useContext(TenantDataContext);
  if (context === undefined) {
    throw new Error('useTenantData must be used within a TenantDataProvider');
  }
  return context;
}
