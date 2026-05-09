'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTenant } from '@/hooks/useTenant';
import { Suspense, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('et_theme') as 'light' | 'dark' | null;
    const initial = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('et_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <button onClick={toggleTheme} className="btn btn-secondary" style={{ padding: 0, width: 38, height: 38, borderRadius: '50%', fontSize: 16 }}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

function SwitcherGroup({ createdAt }: { createdAt?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const now = new Date();
  const currentMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selectedM = searchParams.get('m') || currentMonthISO;

  const months = [];
  const startLimit = createdAt ? new Date(createdAt) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const startMonth = new Date(startLimit.getFullYear(), startLimit.getMonth(), 1);

  let d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d >= startMonth) {
    const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(mStr);
    d.setMonth(d.getMonth() - 1);
  }
  if (months.length === 0) months.push(currentMonthISO);

  const handleMonthChange = (val: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('m', val);
    router.push(`${pathname}?${params.toString()}`);
  };

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 12,
    border: '1px solid var(--border-color)',
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(10px)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    outline: 'none',
    width: 'auto'
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <select 
        value={selectedM} 
        onChange={(e) => handleMonthChange(e.target.value)}
        style={selectStyle}
      >
        {months.map(m => {
          const [y, mm] = m.split('-');
          const date = new Date(parseInt(y), parseInt(mm) - 1);
          const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          return <option key={m} value={m} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{label}</option>;
        })}
      </select>
    </div>
  );
}

function ProfileMenu({ resolvedWhoId, names }: { resolvedWhoId: string | null, names: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  
  const userName = resolvedWhoId ? names[resolvedWhoId] : 'User';
  const initial = userName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  const handleExport = () => {
    window.open(`/api/export?format=csv`, '_blank');
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        className="user-avatar-btn"
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-primary)',
          fontSize: 15,
          fontWeight: 700,
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {initial}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute',
            right: 0,
            top: 48,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 14,
            padding: 8,
            minWidth: 180,
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            zIndex: 99
          }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', marginBottom: 4 }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Signed in as</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{userName}</p>
            </div>
            <button onClick={handleExport} style={menuItemStyle}>
              📥 Download CSV
            </button>
            <button onClick={() => { window.print(); setOpen(false); }} style={menuItemStyle}>
              🖨️ Print Report
            </button>
            <Link href="/settings" onClick={() => setOpen(false)} style={{ ...menuItemStyle, textDecoration: 'none' }}>
              ⚙️ Settings
            </Link>
            <div style={{ borderTop: '1px solid var(--border-color)', marginTop: 4, paddingTop: 4 }}>
              <button onClick={handleLogout} style={{ ...menuItemStyle, color: 'var(--accent-danger)' }}>
                🚪 Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'none',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-primary)',
  textAlign: 'left',
  display: 'block',
  fontFamily: 'inherit',
  transition: 'background 0.15s'
};

export function NavBar() {
  const { tenant, resolvedWhoId } = useTenant();

  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            <img src="/icon.png" alt="Synculariti" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span className="logo-text" style={{ 
            fontWeight: 800, 
            fontSize: 20, 
            letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, var(--text-primary) 0%, var(--accent-primary) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Synculariti
          </span>
        </Link>
      </div>

      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        <Suspense fallback={<div style={{ width: 100, height: 36, background: 'var(--bg-hover)', borderRadius: 12 }} />}>
          <SwitcherGroup createdAt={tenant?.created_at} />
        </Suspense>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Desktop Only: Quick Settings Access */}
        <Link 
          href="/ledger" 
          className="hide-mobile"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            textDecoration: 'none', 
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 12px',
            borderRadius: 10,
            background: 'var(--bg-hover)',
            transition: 'all 0.2s'
          }}
        >
          📊 Ledger
        </Link>
        <Link 
          href="/settings" 
          className="hide-mobile"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            textDecoration: 'none', 
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 12px',
            borderRadius: 10,
            background: 'var(--bg-hover)',
            transition: 'all 0.2s'
          }}
        >
          ⚙️ Settings
        </Link>
        
        {tenant && (
          <ProfileMenu 
            resolvedWhoId={resolvedWhoId} 
            names={tenant.names} 
          />
        )}
      </div>
    </nav>
  );
}
