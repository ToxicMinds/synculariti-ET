'use client';

import { NavigationMonth } from '@/lib/types/navigation';
import styles from '../NavBar.module.css';

interface MonthSelectorProps {
  months: NavigationMonth[];
  selectedMonth: string;
  onMonthChange: (val: string) => void;
  isChanging?: boolean;
}

export function MonthSelector({ months, selectedMonth, onMonthChange, isChanging }: MonthSelectorProps) {
  return (
    <div className={`${styles.selectGroup} ${isChanging ? styles.loading : ''}`}>
      <select 
        value={selectedMonth} 
        onChange={(e) => onMonthChange(e.target.value)}
        className={styles.monthSelect}
        disabled={isChanging}
      >
        {months.map(m => (
          <option key={m.value} value={m.value} className={styles.monthOption}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
}
