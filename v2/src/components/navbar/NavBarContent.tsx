'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTenant } from '@/modules/identity/hooks/useTenant';
import { useNavigation } from '@/hooks/useNavigation';
import { supabase } from '@/lib/supabase';

import { ModuleSwitcher } from './ModuleSwitcher';
import { MonthSelector } from './MonthSelector';
import { ProfileMenu } from './ProfileMenu';

import styles from '../NavBar.module.css';

export function NavBarContent() {
  const { tenant, resolvedWhoId } = useTenant();
  const [earliestTxDate, setEarliestTxDate] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant?.tenant_id) return;
    supabase
      .from('transactions')
      .select('date')
      .eq('tenant_id', tenant.tenant_id)
      .eq('is_deleted', false)
      .order('date', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]?.date) {
          setEarliestTxDate(data[0].date);
        }
      });
  }, [tenant?.tenant_id]);

  const earliestFromTx = earliestTxDate ? new Date(earliestTxDate) : null;
  const earliestFromTenant = tenant?.created_at ? new Date(tenant.created_at) : null;
  const earliest = earliestFromTx && earliestFromTenant
    ? new Date(Math.min(earliestFromTx.getTime(), earliestFromTenant.getTime())).toISOString()
    : (earliestFromTx || earliestFromTenant)?.toISOString();

  const { months, selectedMonth, activeModule, modules, isChanging, actions } = useNavigation({
    earliestDataDate: earliest
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
