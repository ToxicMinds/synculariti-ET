'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BentoCard } from './BentoCard';

export function AuthScreen({ session }: { session: any }) {
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!handle) {
      setError('Enter Tenant Handle');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const lowerHandle = handle.toLowerCase();
      
      // 1. Verify handle exists
      const { data: lookupData, error: lErr } = await supabase.rpc('verify_tenant_access', { input_code: lowerHandle });
      if (lErr) throw lErr;
      if (!lookupData || lookupData.length === 0) throw new Error("Tenant handle not found.");
      
      const tenantId = lookupData[0].target_id;
      
      // 2. Link user (using upsert to prevent duplicate key errors)
      const { error: linkErr } = await supabase
        .from('app_users')
        .upsert({ id: session.user.id, tenant_id: tenantId });
        
      if (linkErr) throw linkErr;
      
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="bento-grid" style={{ minHeight: '100vh', alignContent: 'center' }}>
      <BentoCard colSpan={12} title="Welcome to ET Expense">
        {error && <div style={{ color: 'var(--accent-danger)', marginBottom: 16 }}>{error}</div>}
        
        {!session ? (
          <div>
            <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>Sign in with Google to manage your tenant finances.</p>
            <button 
              className="btn btn-primary" 
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{ width: '100%', padding: '12px' }}
            >
              {loading ? 'Connecting...' : 'Sign in with Google'}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
              You are signed in as {session.user.email}, but you aren't part of a tenant yet.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input 
                type="text" 
                placeholder="Tenant Handle (e.g. smith-42)" 
                value={handle}
                onChange={e => setHandle(e.target.value)}
                style={{ padding: 12, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <button 
                className="btn btn-primary" 
                onClick={handleJoin}
                disabled={loading}
                style={{ width: '100%', padding: '12px', marginTop: 8 }}
              >
                {loading ? 'Joining...' : 'Join Tenant'}
              </button>
            </div>
          </div>
        )}
      </BentoCard>
    </div>
  );
}
