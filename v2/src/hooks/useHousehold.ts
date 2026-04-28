'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface AppState {
  household_id: string;
  handle: string;
  names: Record<string, string>;
  income: Record<string, number>;
  budgets: Record<string, number>;
  memory: Record<string, string>;
}

export function useHousehold() {
  const [session, setSession] = useState<any>(null);
  const [household, setHousehold] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchHouseholdState();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchHouseholdState();
      else setHousehold(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchHouseholdState = async () => {
    try {
      // 1. Get current user's household mapping
      const { data: userMapping, error: uError } = await supabase
        .from('app_users')
        .select('household_id')
        .single();
      
      if (uError || !userMapping?.household_id) {
        console.warn('No household mapping found for user');
        return;
      }
      
      const hid = userMapping.household_id;

      // 2. Get Household Handle
      const { data: house } = await supabase
        .from('households')
        .select('handle')
        .eq('id', hid)
        .single();

      // 3. Get State (Legacy-Aware)
      // v1 stores everything in a 'config' JSONB column
      const { data: stateData } = await supabase
        .from('app_state')
        .select('config')
        .eq('id', hid)
        .single();

      const config = stateData?.config || {};

      setHousehold({
        household_id: hid,
        handle: house?.handle || '',
        names: config.names || {},
        income: config.income || {},
        budgets: config.budgets || {},
        memory: config.memory || {}
      });
    } catch (e) {
      console.error('Error fetching household state:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateState = async (updates: Partial<AppState>) => {
    if (!household?.household_id) return;
    
    // We must maintain the legacy 'config' structure to keep v1 working!
    const { data: currentState } = await supabase
      .from('app_state')
      .select('config')
      .eq('id', household.household_id)
      .single();

    const newConfig = {
      ...(currentState?.config || {}),
      names: updates.names || household.names,
      income: updates.income || household.income,
      budgets: updates.budgets || household.budgets,
      memory: updates.memory || household.memory
    };

    const { error } = await supabase
      .from('app_state')
      .upsert({ id: household.household_id, config: newConfig });

    if (error) throw error;
    setHousehold({ ...household, ...updates });
  };

  return { session, household, loading, fetchHouseholdState, updateState };
}
