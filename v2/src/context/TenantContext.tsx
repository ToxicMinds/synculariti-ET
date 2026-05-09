'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { AppState } from '@/hooks/useTenant';
import { DEFAULT_CATEGORIES } from '@/lib/constants';

interface TenantContextType {
  session: Session | null;
  tenant: AppState | null;
  resolvedWhoId: string | null;
  loading: boolean;
  syncToken: number;
  triggerRefresh: () => void;
  fetchTenantState: () => Promise<void>;
  updateState: (updates: Partial<AppState>) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tenant, setTenant] = useState<AppState | null>(null);
  const [resolvedWhoId, setResolvedWhoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncToken, setSyncToken] = useState(0);

  const triggerRefresh = () => setSyncToken(prev => prev + 1);

  // Initialize Session & Auth Listeners
  useEffect(() => {
    // 1. Initial Quick Check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchTenantState(session);
      } else {
        setLoading(false); // Immediate resolution for unauth users
      }
    });

    // 2. Realtime Auth Sync
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        fetchTenantState(session);
      } else if (event === 'SIGNED_OUT') {
        setTenant(null);
        setResolvedWhoId(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * PERFORMANCE FIX: Using the bundled RPC
   * Reduces network traffic by 66% per instance.
   */
  const fetchTenantState = async (currentSession?: Session | null) => {
    try {
      const activeSession = currentSession || session;
      if (!activeSession) return;

      const { data: bundle, error } = await supabase.rpc('get_tenant_bundle');
      
      if (error) throw error;
      if (!bundle || !bundle.tenant) return;

      const { tenant: h, user: u, locations: l } = bundle;

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
        locations: l || [],
        created_at: h.created_at
      });

      // Identity Resolution: Use the bundled user profile if available
      if (u) {
        // You can now store the full user profile in state if needed
      }

      const email = activeSession.user?.email;
      if (email && h.config?.emails) {
        const foundId = Object.keys(h.config.emails).find(
          key => h.config.emails[key]?.toLowerCase() === email.toLowerCase()
        );
        if (foundId) setResolvedWhoId(foundId);
      }
    } catch (e) {
      Logger.system('ERROR', 'Auth', 'Failed to fetch tenant bundle', { error: e });
    } finally {
      setLoading(false);
    }
  };

  const updateState = async (updates: Partial<AppState>) => {
    if (!tenant?.tenant_id) return;
    
    // Get latest config from DB to avoid race conditions
    const { data: stateData } = await supabase
      .from('tenants')
      .select('config')
      .eq('id', tenant.tenant_id)
      .single();

    const currentConfig = stateData?.config || {};

    const newConfig = {
      ...currentConfig,
      names: updates.names || tenant.names,
      income: updates.income || tenant.income,
      budgets: updates.budgets || tenant.budgets,
      memory: updates.memory || tenant.memory,
      goals: updates.goals || tenant.goals,
      ai_insight: updates.ai_insight || tenant.ai_insight,
      categories: updates.categories || tenant.categories
    };

    const { error } = await supabase
      .from('tenants')
      .update({ config: newConfig })
      .eq('id', tenant.tenant_id);

    if (error) throw error;
    setTenant({ ...tenant, ...updates });
  };

  const addCategory = async (name: string) => {
    if (!tenant) return;
    const cleanName = name.trim();
    if (!cleanName) return;
    
    const existingBudgets = tenant.budgets || {};
    const existingCategories = tenant.categories || [];
    
    // Skip if already exists
    if (existingCategories.includes(cleanName)) return;
    
    const newBudgets = { ...existingBudgets, [cleanName]: existingBudgets[cleanName] || 0 };
    const newCategories = [...existingCategories, cleanName];
    
    await updateState({ 
      budgets: newBudgets,
      categories: newCategories
    });
  };

  return (
    <TenantContext.Provider value={{ 
      session, 
      tenant, 
      resolvedWhoId,
      loading, 
      syncToken,
      triggerRefresh,
      fetchTenantState, 
      updateState,
      addCategory
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenantContext must be used within a TenantProvider');
  }
  return context;
}
