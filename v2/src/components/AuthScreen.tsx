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
            <div className="flex-col gap-2">
              <label className="card-subtitle" style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700 }}>ORGANIZATION ACCESS CODE</label>
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
                onClick={handleJoin}
                disabled={loading}
                style={{ width: '100%', padding: '14px', marginTop: 12 }}
              >
                {loading ? 'Verifying...' : 'Link Organization'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
