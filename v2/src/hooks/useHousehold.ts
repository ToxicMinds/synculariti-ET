'use client';

/**
 * PROXY HOOK: useHousehold
 * 
 * This hook now acts as a proxy for the centralized HouseholdProvider.
 * This ensures that ALL components share the same instance of household data,
 * preventing redundant network requests.
 * 
 * Zero-Regression: The interface remains identical to the previous version.
 */
import { useHouseholdContext } from '@/context/HouseholdContext';

export interface AppState {
  household_id: string;
  handle: string;
  names: Record<string, string>;
  emails?: Record<string, string>;
  income: Record<string, number>;
  budgets: Record<string, number>;
  memory: Record<string, string>;
  goals: Record<string, any>;
  ai_insight?: { insight: string; hash: string; timestamp: string };
  categories: string[];
  created_at?: string;
}

export function useHousehold() {
  const context = useHouseholdContext();
  
  return { 
    session: context.session, 
    household: context.household, 
    resolvedWhoId: context.resolvedWhoId,
    loading: context.loading, 
    fetchHouseholdState: context.fetchHouseholdState, 
    updateState: context.updateState,
    addCategory: context.addCategory
  };
}
