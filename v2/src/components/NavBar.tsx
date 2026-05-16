'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useTenant } from '@/modules/identity/hooks/useTenant';
import { useNavigation } from '@/hooks/useNavigation';

import { ModuleSwitcher } from './navbar/ModuleSwitcher';
import { MonthSelector } from './navbar/MonthSelector';
import { ProfileMenu } from './navbar/ProfileMenu';

import styles from './NavBar.module.css';

export function NavBar() {
  const { tenant, resolvedWhoId } = useTenant();
  const { months, selectedMonth, activeModule, modules, isChanging, actions } = useNavigation({
    earliestDataDate: tenant?.created_at
  });

  return (
    <nav className="navbar">
      <ModuleSwitcher 
        activeModule={activeModule} 
        modules={modules} 
      />

      <div className={styles.centerGroup}>
        <Suspense fallback={<div className={styles.fallbackSelect} />}>
          <MonthSelector 
            months={months}
            selectedMonth={selectedMonth}
            onMonthChange={actions.setMonth}
            isChanging={isChanging}
          />
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
