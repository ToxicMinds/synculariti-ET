'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../NavBar.module.css';

interface ProfileMenuProps {
  resolvedWhoId: string | null;
  names: Record<string, string>;
}

export function ProfileMenu({ resolvedWhoId, names }: ProfileMenuProps) {
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
