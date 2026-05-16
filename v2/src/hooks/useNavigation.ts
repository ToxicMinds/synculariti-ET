'use client';

import { useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { UseNavigationOptions, UseNavigationReturn, NavigationMonth } from '../lib/types/navigation';
import { MODULE_REGISTRY } from '../lib/constants/navigation';

export function useNavigation(options: UseNavigationOptions = {}): UseNavigationReturn {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isChanging, startTransition] = useTransition();

  // 1. Resolve Current Selection
  const now = new Date();
  const currentMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selectedMonth = searchParams.get('m') || currentMonthISO;

  // 2. Generate Fiscal Calendar
  const months = useMemo(() => {
    const list: NavigationMonth[] = [];
    const earliest = options.earliestDataDate ? new Date(options.earliestDataDate) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
    
    // Normalize to first of month for comparison
    const startMonth = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    let d = new Date(now.getFullYear(), now.getMonth(), 1);

    while (d >= startMonth) {
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      list.push({ value, label });
      
      // Move to previous month
      d.setMonth(d.getMonth() - 1);
    }

    if (list.length === 0) {
      list.push({ 
        value: currentMonthISO, 
        label: now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) 
      });
    }

    return list;
  }, [options.earliestDataDate, currentMonthISO]);

  // 3. Module Context
  const activeModule = MODULE_REGISTRY.find(m => m.path === pathname) || MODULE_REGISTRY[0];

  // 4. Actions
  const setMonth = (monthISO: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('m', monthISO);
    
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const setModule = (path: string) => {
    startTransition(() => {
      router.push(path);
    });
  };

  const refresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return {
    months,
    selectedMonth,
    activeModule,
    modules: MODULE_REGISTRY,
    isCurrentMonth: selectedMonth === currentMonthISO,
    isChanging,
    actions: {
      setMonth,
      setModule,
      refresh
    }
  };
}
