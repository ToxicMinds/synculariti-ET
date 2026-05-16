'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ModuleDescriptor } from '@/lib/types/navigation';
import styles from '../NavBar.module.css';

interface ModuleSwitcherProps {
  activeModule: ModuleDescriptor;
  modules: ModuleDescriptor[];
}

export function ModuleSwitcher({ activeModule, modules }: ModuleSwitcherProps) {
  const [open, setOpen] = useState(false);

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
                  background: m.id === activeModule.id ? 'var(--bg-hover)' : 'none',
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
