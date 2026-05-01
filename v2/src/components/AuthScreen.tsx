'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BentoCard } from './BentoCard';

export function AuthScreen({ session }: { session: any }) {
  const [handle, setHandle] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinOnly, setPinOnly] = useState('');

  const handlePinLogin = async () => {
    if (!pinOnly) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinOnly })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PIN login failed');

      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      });
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

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
    if (!handle || !pin) {
      setError('Enter both Handle and PIN');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const lowerHandle = handle.toLowerCase();
      
      // 1. Verify handle exists
      const { data: lookupData, error: lErr } = await supabase.rpc('verify_household_access', { input_code: lowerHandle });
      if (lErr) throw lErr;
      if (!lookupData || lookupData.length === 0) throw new Error("Household handle not found.");
      
      const householdId = lookupData[0].target_id;
      
      // 2. Verify PIN
      const { data: verifyData, error: vErr } = await supabase.rpc('check_household_pin', { 
        h_id: householdId, 
        input_pin: pin 
      });
      if (vErr) throw vErr;
      if (!verifyData) throw new Error("Incorrect Household PIN.");
      
      // 3. Link user (using upsert to prevent duplicate key errors)
      const { error: linkErr } = await supabase
        .from('app_users')
        .upsert({ id: session.user.id, household_id: householdId });
        
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
            <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>Sign in to manage your household finances.</p>
            <button 
              className="btn btn-primary" 
              onClick={handleGoogleLogin}
              disabled={loading}
              style={{ width: '100%', padding: '12px' }}
            >
              {loading ? 'Connecting...' : 'Sign in with Google'}
            </button>

            <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border-color)' }}>
              <p style={{ marginBottom: 16, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', textTransform: 'uppercase' }}>
                Or: Unblock Family Household
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  type="password" 
                  placeholder="Family PIN (e.g. 2026)" 
                  value={pinOnly}
                  onChange={e => setPinOnly(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePinLogin()}
                  style={{ 
                    flex: 1, 
                    padding: '12px', 
                    borderRadius: 8, 
                    border: '1px solid var(--border-color)', 
                    background: 'var(--bg-secondary)', 
                    color: 'var(--text-primary)',
                    textAlign: 'center',
                    letterSpacing: '4px'
                  }}
                />
                <button 
                  className="btn btn-primary"
                  onClick={handlePinLogin}
                  disabled={loading || !pinOnly}
                  style={{ padding: '0 24px' }}
                >
                  Unlock
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
              You are signed in as {session.user.email}, but you aren't part of a household yet.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input 
                type="text" 
                placeholder="Household Handle (e.g. smith-42)" 
                value={handle}
                onChange={e => setHandle(e.target.value)}
                style={{ padding: 12, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <input 
                type="password" 
                placeholder="4-Digit PIN" 
                value={pin}
                onChange={e => setPin(e.target.value)}
                maxLength={4}
                style={{ padding: 12, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              />
              <button 
                className="btn btn-primary" 
                onClick={handleJoin}
                disabled={loading}
                style={{ width: '100%', padding: '12px', marginTop: 8 }}
              >
                {loading ? 'Joining...' : 'Join Household'}
              </button>
            </div>
          </div>
        )}
      </BentoCard>
    </div>
  );
}
