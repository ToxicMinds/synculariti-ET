'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BrandHeader } from './BrandHeader';
import type { Session } from '@supabase/supabase-js';

interface Props {
  session: Session | null;
  onBack?: () => void;
}

export function OrgAccessForm({ session, onBack }: Props) {
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [handle, setHandle] = useState('');
  const [orgName, setOrgName] = useState('');
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed');
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!handle) {
      setError('Enter Tenant Access Code');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const lowerHandle = handle.toLowerCase();
      const { data: lookupData, error: lErr } = await supabase.rpc('verify_tenant_access', { input_code: lowerHandle });
      if (lErr) throw lErr;
      if (!lookupData || lookupData.length === 0) throw new Error("Invalid access code.");
      
      const tenantId = lookupData[0].target_id;
      
      // Use the switch_tenant RPC to link the user (V-25 fixed)
      const { error: linkErr } = await supabase.rpc('switch_tenant', { p_tenant_id: tenantId });
      if (linkErr) throw linkErr;
      
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Join failed');
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!orgName || !handle) {
      setError('Organization Name and Access Code are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: cErr } = await supabase.rpc('create_organization', { 
        p_name: orgName, 
        p_handle: handle.toLowerCase() 
      });
      if (cErr) throw cErr;
      
      window.location.reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Create failed');
      setLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ minHeight: '80vh', padding: 24 }}>
      <div className="glass-card" style={{ maxWidth: 440, width: '100%', padding: 40, borderRadius: 28 }}>
        <BrandHeader />
        
        {error && (
          <div className="status-badge status-danger" style={{ marginBottom: 24, width: '100%', justifyContent: 'center' }}>
            {error}
          </div>
        )}
        
        {!session ? (
          <div className="flex-col gap-4">
            <button 
              className="btn btn-primary" 
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{ width: '100%', padding: '14px', fontSize: 15 }}
            >
              <span style={{ marginRight: 8 }}>🔑</span>
              {loading ? 'Authenticating...' : 'Sign in with Google'}
            </button>
            <div className="flex-row items-center gap-2" style={{ justifyContent: 'center' }}>
              <span className="card-subtitle" style={{ fontSize: 13 }}>First time?</span>
              <span className="card-subtitle" style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 700 }}>
                Join Organization Below
              </span>
            </div>
            <p className="card-subtitle" style={{ fontSize: 11, textAlign: 'center', marginTop: 8 }}>
              Note: You must log in first to select or create a tenant.
            </p>
          </div>
        ) : (
          <div className="flex-col gap-4">
            <p className="card-subtitle" style={{ fontSize: 14, textAlign: 'center' }}>
              Logged in as <strong style={{ color: 'var(--text-primary)' }}>{session.user.email}</strong>
            </p>

            <div className="flex-row gap-2" style={{ marginBottom: 12 }}>
              <button 
                onClick={() => { setMode('join'); setError(''); }} 
                className={`btn ${mode === 'join' ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ flex: 1, minHeight: 38, fontSize: 12 }}
              >
                Join
              </button>
              <button 
                onClick={() => { setMode('create'); setError(''); }} 
                className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-secondary'}`} 
                style={{ flex: 1, minHeight: 38, fontSize: 12 }}
              >
                Create
              </button>
            </div>
            
            <div className="flex-col gap-2">
              {mode === 'create' && (
                <div className="flex-col gap-1">
                  <label className="card-subtitle" style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700 }}>ORGANIZATION NAME</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Acme Corp" 
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    className="btn btn-secondary"
                    style={{ textAlign: 'left', width: '100%', padding: '12px 16px', marginBottom: 8 }}
                  />
                </div>
              )}
              
              <label className="card-subtitle" style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700 }}>
                {mode === 'join' ? 'ORGANIZATION ACCESS CODE' : 'DESIRED ACCESS CODE'}
              </label>
              <input 
                type="text" 
                placeholder="e.g. ALPHA-99" 
                value={handle}
                onChange={e => setHandle(e.target.value)}
                className="btn btn-secondary"
                style={{ textAlign: 'left', width: '100%', padding: '12px 16px' }}
              />
              
              <button 
                className="btn btn-primary" 
                onClick={mode === 'join' ? handleJoin : handleCreate}
                disabled={loading}
                style={{ width: '100%', padding: '14px', marginTop: 12 }}
              >
                {loading ? 'Verifying...' : mode === 'join' ? 'Link Organization' : 'Create Organization'}
              </button>

              {onBack && (
                <button 
                  className="btn btn-secondary" 
                  onClick={onBack}
                  style={{ width: '100%', padding: '12px', marginTop: 4, background: 'none', border: 'none', fontSize: 13 }}
                >
                  ← Back to Selector
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
