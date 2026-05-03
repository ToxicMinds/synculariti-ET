'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { AppState } from '@/hooks/useHousehold';
import { DEFAULT_CATEGORIES } from '@/lib/constants';

interface HouseholdContextType {
  session: any;
  household: AppState | null;
  resolvedWhoId: string | null;
  loading: boolean;
  fetchHouseholdState: () => Promise<void>;
  updateState: (updates: Partial<AppState>) => Promise<void>;
  addCategory: (name: string) => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any>(null);
  const [household, setHousehold] = useState<AppState | null>(null);
  const [resolvedWhoId, setResolvedWhoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize Session & Auth Listeners
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchHouseholdState(session);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchHouseholdState(session);
      else {
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
  const fetchHouseholdState = async (currentSession?: any) => {
    try {
      const activeSession = currentSession || session;
      if (!activeSession) return;

      // PERFORMANCE GUARD: If we already have the state and the user hasn't changed, skip re-fetch
      if (household?.household_id && activeSession.user?.id === session?.user?.id) {
        setLoading(false);
        return;
      }

      // Single network round-trip instead of 3 sequential awaits
      const { data: bundle, error } = await supabase.rpc('get_household_bundle');
      
      if (error) throw error;
      if (!bundle) return;

      const { config = {}, ...metadata } = bundle;

      setHousehold({
        household_id: metadata.household_id,
        handle: metadata.handle || '',
        names: config.names || {},
        emails: config.emails || {},
        income: config.income || {},
        budgets: config.budgets || {},
        memory: config.memory || {},
        goals: config.goals || { monthly_savings: 500 },
        ai_insight: config.ai_insight,
        categories: config.categories || DEFAULT_CATEGORIES,
        created_at: metadata.created_at
      });

      // Identity Resolution: Map email to who_id
      const email = activeSession.user?.email;
      if (email && config.emails) {
        const foundId = Object.keys(config.emails).find(
          key => config.emails[key]?.toLowerCase() === email.toLowerCase()
        );
        if (foundId) setResolvedWhoId(foundId);
      }
    } catch (e) {
      console.error('Error fetching household state:', e);
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
