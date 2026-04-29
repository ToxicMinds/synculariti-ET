'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useHousehold } from '@/hooks/useHousehold';
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

function UserSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { household } = useHousehold();
  
  const selectedUser = searchParams.get('u');
  const names = household?.names || {};

  const handleUserChange = (id: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('u', id);
    router.push(`${pathname}?${params.toString()}`);
  };

  if (Object.keys(names).length === 0) return null;

  return (
    <select 
      value={selectedUser || Object.keys(names)[0]} 
      onChange={(e) => handleUserChange(e.target.value)}
      style={{
        padding: '6px 10px',
        borderRadius: 10,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        maxWidth: 120
      }}
    >
      {Object.entries(names).map(([id, name]) => (
        <option key={id} value={id}>{name as string}</option>
      ))}
    </select>
  );
}

function ProfileMenu({ householdHandle }: { householdHandle: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  const handleExport = () => {
    // Trigger CSV download via the export API
    window.open(`/api/export?household_id=${encodeURIComponent(householdHandle)}&format=csv`, '_blank');
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700
        }}
      >
        {householdHandle.charAt(0).toUpperCase()}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setOpen(false)} />
          {/* Menu */}
          <div style={{
            position: 'absolute',
            right: 0,
            top: 44,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 14,
            padding: 8,
            minWidth: 180,
            boxShadow: 'var(--shadow-md)',
            zIndex: 99
          }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', marginBottom: 4 }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Household</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{householdHandle}</p>
            </div>
            <button onClick={handleExport} style={menuItemStyle}>
              📥 Download CSV
            </button>
            <button onClick={() => { window.print(); setOpen(false); }} style={menuItemStyle}>
              🖨️ Print Report
            </button>
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
  padding: '9px 12px',
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
  const pathname = usePathname();
  const { household } = useHousehold();

  return (
    <nav className="navbar">
      <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          {/* Theme-aware SVG icon */}
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            <img src="/icon.png" alt="ET Expense" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)' }}>ET Expense</span>
        </Link>
        <div className="hide-mobile" style={{ display: 'flex', gap: 20 }}>
          {[{ name: 'Dashboard', href: '/' }, { name: 'Settings', href: '/settings' }].map(item => (
            <Link key={item.href} href={item.href} style={{ 
              fontSize: 14, fontWeight: 500, 
              color: pathname === item.href ? 'var(--text-primary)' : 'var(--text-secondary)',
              textDecoration: 'none'
            }}>
              {item.name}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ThemeToggle />
        <Suspense fallback={<div style={{ width: 80, height: 36, background: 'var(--bg-hover)', borderRadius: 10 }} />}>
          <UserSwitcher />
        </Suspense>
        {household && <ProfileMenu householdHandle={household.handle || 'Shanbhag-26'} />}
      </div>
    </nav>
  );
}
