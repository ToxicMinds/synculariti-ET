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
      if (action === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
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
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="max-w-md w-full space-y-8 p-8 bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">
        
        <div className="text-center">
          <div className="w-20 h-20 mx-auto bg-zinc-800 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(59,130,246,0.2)] overflow-hidden border border-white/5">
            <img 
              src="/home/nik/.gemini/antigravity/brain/397c29fc-3420-4a9c-8a26-c3c9c008ff17/synculariti_identity_logo_1778355891824.png" 
              alt="Identity" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Synculariti Identity</h2>
          <p className="mt-2 text-sm text-zinc-400">Secure enterprise access gatekeeper</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-xl relative block w-full px-4 py-3 bg-zinc-950/50 border border-zinc-800 placeholder-zinc-500 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm transition-all"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-xl relative block w-full px-4 py-3 bg-zinc-950/50 border border-zinc-800 placeholder-zinc-500 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm transition-all"
                placeholder="Password"
              />
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-xl text-sm ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
              {message.text}
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => handleAuth('login')}
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all shadow-lg shadow-blue-500/25"
            >
              Sign In
            </button>
            <button
              onClick={() => handleAuth('signup')}
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-zinc-700 text-sm font-medium rounded-xl text-zinc-300 bg-zinc-800 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-600 disabled:opacity-50 transition-all"
            >
              Sign Up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
