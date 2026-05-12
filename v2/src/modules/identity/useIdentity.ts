'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';

import type { Session } from '@supabase/supabase-js';

export interface AvailableTenant {
  tenant_id: string;
  tenant_name: string;
  tenant_handle: string;
  user_role: string;
}

export function useIdentity(session: Session | null) {
  const [tenants, setTenants] = useState<AvailableTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 1. DISCOVERY: Find all orgs the user is invited to
  const discoverTenants = async () => {
    if (!session?.user?.email) return [];
    
    try {
      const { data, error } = await supabase.rpc('get_my_available_tenants');
      if (error) throw error;
      setTenants(data || []);
      return data || [];
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.system('ERROR', 'Auth', 'Tenant discovery failed', { error: msg });
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // 2. MUTATION: Explicitly enter an organization
  const selectTenant = async (tenantId: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.rpc('switch_tenant', { p_tenant_id: tenantId });
      if (error) throw error;
      
      // Force a full reload to re-initialize the App with the new tenant_id context
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) {
      discoverTenants();
    }
  }, [session]);

  return {
    tenants,
    loading,
    error,
    discoverTenants,
    selectTenant
  };
}
