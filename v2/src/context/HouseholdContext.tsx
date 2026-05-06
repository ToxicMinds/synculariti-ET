'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { AppState } from '@/hooks/useHousehold';
import { DEFAULT_CATEGORIES } from '@/lib/constants';

interface HouseholdContextType {
  session: Session | null;
  household: AppState | null;
  resolvedWhoId: string | null;
  loading: boolean;
  syncToken: number;
  triggerRefresh: () => void;
  fetchHouseholdState: () => Promise<void>;
  updateState: (updates: Partial<AppState>) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [household, setHousehold] = useState<AppState | null>(null);
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
        fetchHouseholdState(session);
      } else {
        setLoading(false); // Immediate resolution for unauth users
      }
    });

    // 2. Realtime Auth Sync
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        fetchHouseholdState(session);
      } else if (event === 'SIGNED_OUT') {
        setHousehold(null);
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
  const fetchHouseholdState = async (currentSession?: Session | null) => {
    try {
      const activeSession = currentSession || session;
      if (!activeSession) return;

      const { data: bundle, error } = await supabase.rpc('get_household_bundle');
      
      if (error) throw error;
      if (!bundle || !bundle.household) return;

      const { household: h, user: u, locations: l } = bundle;

      setHousehold({
        household_id: h.id,
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
      Logger.system('ERROR', 'Auth', 'Failed to fetch household bundle', { error: e });
    } finally {
      setLoading(false);
    }
  };

  const updateState = async (updates: Partial<AppState>) => {
    if (!household?.household_id) return;
    
    // Get latest config from DB to avoid race conditions
    const { data: stateData } = await supabase
      .from('app_state')
      .select('config')
      .eq('id', household.household_id)
      .single();

    const currentConfig = stateData?.config || {};

    const newConfig = {
      ...currentConfig,
      names: updates.names || household.names,
      income: updates.income || household.income,
      budgets: updates.budgets || household.budgets,
      memory: updates.memory || household.memory,
      goals: updates.goals || household.goals,
      ai_insight: updates.ai_insight || household.ai_insight,
      categories: updates.categories || household.categories
    };

    const { error } = await supabase
      .from('app_state')
      .upsert({ id: household.household_id, config: newConfig });

    if (error) throw error;
    setHousehold({ ...household, ...updates });
  };

  const addCategory = async (name: string) => {
    if (!household) return;
    const cleanName = name.trim();
    if (!cleanName) return;
    
    const existingBudgets = household.budgets || {};
    const existingCategories = household.categories || [];
    
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
    <HouseholdContext.Provider value={{ 
      session, 
      household, 
      resolvedWhoId,
      loading, 
      syncToken,
      triggerRefresh,
      fetchHouseholdState, 
      updateState,
      addCategory
    }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHouseholdContext() {
  const context = useContext(HouseholdContext);
  if (context === undefined) {
    throw new Error('useHouseholdContext must be used within a HouseholdProvider');
  }
  return context;
}
