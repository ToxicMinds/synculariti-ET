'use client';

/**
 * PROXY HOOK: useTenant
 * 
 * This hook now acts as a proxy for the centralized TenantProvider.
 * This ensures that ALL components share the same instance of tenant data,
 * preventing redundant network requests.
 * 
 * Zero-Regression: The interface remains identical to the previous version.
 */
import { useTenantContext } from '@/context/TenantContext';

export interface Location {
  id: string;
  tenant_id: string;
  name: string;
  address?: string;
  is_active: boolean;
  created_at: string;
}

export interface AppState {
  tenant_id: string;
  handle: string;
  names: Record<string, string>;
  emails?: Record<string, string>;
  income: Record<string, number>;
  budgets: Record<string, number>;
  memory: Record<string, string>;
  goals: Record<string, unknown>;
  ai_insight?: { insight: string; hash: string; timestamp: string };
  categories: string[];
  locations: Location[]; // B2B: Multi-location support
  created_at?: string;
}

export function useTenant() {
  const context = useTenantContext();
  
  return { 
    session: context.session, 
    tenant: context.tenant, 
    resolvedWhoId: context.resolvedWhoId,
    loading: context.loading, 
    fetchTenantState: context.fetchTenantState, 
    updateState: context.updateState
  };
}
