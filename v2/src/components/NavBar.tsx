'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTenant } from '@/modules/identity/hooks/useTenant';
import { Suspense, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './NavBar.module.css';

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
    <button onClick={toggleTheme} className={`btn btn-secondary ${styles.themeToggle}`}>
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

  return (
    <div className={styles.selectGroup}>
      <select 
        value={selectedM} 
        onChange={(e) => handleMonthChange(e.target.value)}
        className={styles.monthSelect}
      >
        {months.map(m => {
          const [y, mm] = m.split('-');
          const date = new Date(parseInt(y), parseInt(mm) - 1);
          const label = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          return <option key={m} value={m} className={styles.monthOption}>{label}</option>;
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
    <div className={styles.profileWrapper}>
      <button
        onClick={() => setOpen(!open)}
        className={styles.avatarBtn}
      >
        {initial}
      </button>

      {open && (
        <>
          <div className={styles.dropdownOverlay} onClick={() => setOpen(false)} />
          <div className={styles.profileDropdown}>
            <div className={styles.profileHeader}>
              <p className={styles.profileRole}>Signed in as</p>
              <p className={styles.profileName}>{userName}</p>
            </div>
            <button onClick={handleExport} className={styles.menuItem}>
              📥 Download CSV
            </button>
            <button onClick={() => { window.print(); setOpen(false); }} className={styles.menuItem}>
              🖨️ Print Report
            </button>
            <Link href="/settings" onClick={() => setOpen(false)} className={styles.menuItem}>
              ⚙️ Settings
            </Link>
            <div className={styles.logoutWrapper}>
              <button onClick={handleLogout} className={`${styles.menuItem} ${styles.logoutBtn}`}>
                🚪 Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ModuleSwitcher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const modules = [
    { name: 'Finance', icon: '💰', path: '/', logo: '/brand/finance.png' },
    { name: 'Logistics', icon: '📦', path: '/logistics', logo: '/brand/logistics.png' },
    { name: 'Identity', icon: '👤', path: '/settings', logo: '/brand/identity.png' },
  ];

  const activeModule = modules.find(m => m.path === pathname) || modules[0];

  return (
    <div className={styles.moduleWrapper}>
      <button 
        onClick={() => setOpen(!open)}
        className={`flex-row items-center gap-2 ${styles.moduleBtn}`}
      >
        <div className={styles.moduleIcon}>
          <img src={activeModule.logo} alt={activeModule.name} />
        </div>
        <div className={`flex-col items-start hide-mobile ${styles.moduleTextWrapper}`}>
          <span className={styles.moduleBrand}>Synculariti</span>
          <span className={styles.moduleBadge}>
            {activeModule.name}
          </span>
        </div>
      </button>

      {open && (
        <>
          <div className={styles.dropdownOverlay} onClick={() => setOpen(false)} />
          <div className={`glass-card ${styles.moduleDropdown}`}>
            <p className={styles.moduleSubtitle}>Switch Module</p>
            {modules.map(m => (
              <Link 
                key={m.name} 
                href={m.path} 
                onClick={() => setOpen(false)}
                className={`flex-row items-center gap-3 ${styles.moduleItem}`}
                style={{ 
                  background: m.path === pathname ? 'var(--bg-hover)' : 'none',
                }}
                onMouseOver={(e) => {
                  if (m.path !== pathname) {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                  }
                }}
                onMouseOut={(e) => {
                  if (m.path !== pathname) {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.borderColor = 'transparent';
                  }
                }}
              >
                <div className={styles.moduleItemIcon}>
                  <img src={m.logo} alt={m.name} />
                </div>
                <div className="flex-col">
                  <span className={styles.moduleItemTitle}>{m.name}</span>
                  <span className={styles.moduleItemDesc}>Synculariti : {m.name}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function NavBar() {
  const { tenant, resolvedWhoId } = useTenant();

  return (
    <nav className="navbar">
      <ModuleSwitcher />

      <div className={styles.centerGroup}>
        <Suspense fallback={<div className={styles.fallbackSelect} />}>
          <SwitcherGroup createdAt={tenant?.created_at} />
        </Suspense>
      </div>

      <div className={styles.rightGroup}>
        <Link 
          href="/ledger" 
          className={`hide-mobile ${styles.ledgerLink}`}
        >
          📊 Ledger
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
