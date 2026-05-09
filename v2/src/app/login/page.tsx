'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);
  const router = useRouter();

  const handleAuth = async (action: 'login' | 'signup') => {
    setLoading(true);
    setMessage(null);
    try {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });
        if (error) throw error;
        setMessage({ text: 'Check your email for the confirmation link.', type: 'success' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/');
      }
    } catch (error: any) {
      setMessage({ text: error.message || 'Authentication failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ minHeight: '90vh', padding: 24 }}>
      <div className="glass-card" style={{ maxWidth: 440, width: '100%', padding: 40, borderRadius: 28, textAlign: 'center' }}>
        
        <div style={{ width: 80, height: 80, borderRadius: 20, background: 'var(--bg-hover)', margin: '0 auto 24px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 0 30px rgba(99, 102, 241, 0.15)' }}>
          <img src="/brand/identity.png" alt="Identity" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        <h1 className="text-gradient" style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Synculariti Identity</h1>
        <p className="card-subtitle" style={{ marginBottom: 32 }}>Secure enterprise access gatekeeper</p>

        {message && (
          <div className={`status-badge ${message.type === 'error' ? 'status-danger' : 'status-success'}`} style={{ marginBottom: 24, width: '100%', justifyContent: 'center', padding: '10px' }}>
            {message.text}
          </div>
        )}

        <form className="flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
          <div className="flex-col gap-1">
            <label className="card-subtitle" style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700 }}>EMAIL ADDRESS</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="btn btn-secondary"
              style={{ textAlign: 'left', width: '100%', padding: '12px 16px' }}
              placeholder="name@company.com"
            />
          </div>

          <div className="flex-col gap-1">
            <label className="card-subtitle" style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700 }}>PASSWORD</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="btn btn-secondary"
              style={{ textAlign: 'left', width: '100%', padding: '12px 16px' }}
              placeholder="••••••••"
            />
          </div>

          <div className="flex-row gap-3" style={{ marginTop: 12 }}>
            <button
              onClick={() => handleAuth('login')}
              disabled={loading}
              className="btn btn-primary"
              style={{ flex: 1, padding: '14px' }}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </div>

          <div className="flex-row items-center gap-2" style={{ justifyContent: 'center', marginTop: 16 }}>
            <span className="card-subtitle" style={{ fontSize: 13 }}>New here?</span>
            <button 
              onClick={() => handleAuth('signup')} 
              style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--accent-primary)', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Create Account →
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
