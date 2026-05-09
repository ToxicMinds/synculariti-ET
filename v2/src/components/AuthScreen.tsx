'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BentoCard } from './BentoCard';

export function AuthScreen({ session }: { session: any }) {
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
    } catch (e: any) {
      setError(e.message);
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
      const { error: linkErr } = await supabase.from('app_users').upsert({ id: session.user.id, tenant_id: tenantId });
      if (linkErr) throw linkErr;
      
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
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
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ minHeight: '80vh', padding: 24 }}>
      <div className="glass-card" style={{ maxWidth: 440, width: '100%', padding: 40, borderRadius: 28, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--bg-hover)', margin: '0 auto 24px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
          <img src="/brand/identity.png" alt="Identity" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        
        <h1 className="text-gradient" style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Synculariti Identity</h1>
        <p className="card-subtitle" style={{ marginBottom: 32 }}>Secure enterprise access gatekeeper</p>

        {error && <div className="status-badge status-danger" style={{ marginBottom: 24, width: '100%', justifyContent: 'center' }}>{error}</div>}
        
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
              <a href="/login" style={{ fontSize: 13, color: 'var(--accent-primary)', fontWeight: 700, textDecoration: 'none' }}>
                Join Organization →
              </a>
            </div>
          </div>
        ) : (
          <div className="flex-col gap-4">
            <p className="card-subtitle" style={{ fontSize: 14 }}>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
