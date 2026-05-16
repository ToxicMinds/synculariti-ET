'use client';

import Link from 'next/link';
import { useTenant } from '@/modules/identity/hooks/useTenant';
import { useNavigation } from '@/hooks/useNavigation';

import { ModuleSwitcher } from './ModuleSwitcher';
import { MonthSelector } from './MonthSelector';
import { ProfileMenu } from './ProfileMenu';

import styles from '../NavBar.module.css';

/**
 * NavBarContent: Consumes the useNavigation hook.
 * MUST be wrapped in a <Suspense> boundary to avoid CSR Bailout 
 * during static page generation in Next.js.
 */
export function NavBarContent() {
  const { tenant, resolvedWhoId } = useTenant();
  const { months, selectedMonth, activeModule, modules, isChanging, actions } = useNavigation({
    earliestDataDate: tenant?.created_at
  });

  return (
    <>
      <ModuleSwitcher 
        activeModule={activeModule} 
        modules={modules} 
      />

      <div className={styles.centerGroup}>
        <MonthSelector 
          months={months}
          selectedMonth={selectedMonth}
          onMonthChange={actions.setMonth}
          isChanging={isChanging}
        />
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
    </>
  );
}
