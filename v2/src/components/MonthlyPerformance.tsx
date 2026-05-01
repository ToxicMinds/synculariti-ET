'use client';

import { BentoCard } from './BentoCard';
import { Expense } from '@/lib/finance';

export function MonthlyPerformance({ 
  expenses, 
  selectedMonth 
}: { 
  expenses: Expense[], 
  selectedMonth: string 
}) {
  const [y, m] = selectedMonth.split('-');
  const currentPrefix = `${y}-${m}`;
  const prevDate = new Date(parseInt(y), parseInt(m) - 2, 1);
  const prevPrefix = prevDate.toISOString().slice(0, 7);

  const currentMonthExpenses = expenses.filter(e => e.date?.startsWith(currentPrefix) && e.category !== 'Savings' && e.category !== 'Adjustment');
  const prevMonthExpenses = expenses.filter(e => e.date?.startsWith(prevPrefix) && e.category !== 'Savings' && e.category !== 'Adjustment');

  const currentTotal = currentMonthExpenses.reduce((acc, e) => acc + Number(e.amount), 0);
  const prevTotal = prevMonthExpenses.reduce((acc, e) => acc + Number(e.amount), 0);

  const diff = currentTotal - prevTotal;
  const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
  
  const isBetter = diff <= 0; // Spending less is better
  const color = isBetter ? 'var(--accent-success)' : 'var(--accent-danger)';

  // Smart states
  const isNewMonthNoData = currentTotal === 0;
  const isFirstMonthEver = prevMonthExpenses.length === 0;
  const hasSomeData = currentMonthExpenses.length > 0 || prevMonthExpenses.length > 0;

  // Find biggest category increase
  const currentCats: Record<string, number> = {};
  currentMonthExpenses.forEach(e => currentCats[e.category] = (currentCats[e.category] || 0) + Number(e.amount));
  
  const prevCats: Record<string, number> = {};
  prevMonthExpenses.forEach(e => prevCats[e.category] = (prevCats[e.category] || 0) + Number(e.amount));

  let biggestIncreaseCat = '';
  let maxIncrease = 0;

  Object.keys(currentCats).forEach(cat => {
    const increase = currentCats[cat] - (prevCats[cat] || 0);
    if (increase > maxIncrease) {
      maxIncrease = increase;
      biggestIncreaseCat = cat;
    }
  });

  return (
    <BentoCard title="Monthly Performance" colSpan={4}>
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Spent this month</p>
        <div style={{ fontSize: 32, fontWeight: 700 }}>€{currentTotal.toFixed(2)}</div>
      </div>

      {!hasSomeData ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
          <p style={{ fontSize: 13 }}>No data found for this period.</p>
        </div>
      ) : isNewMonthNoData ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', background: 'var(--bg-secondary)', borderRadius: 12 }}>
          <div style={{ fontSize: 20 }}>✨</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>It's a new month! Start scanning receipts to see your performance.</p>
        </div>
      ) : isFirstMonthEver ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', background: 'var(--accent-primary)15', borderRadius: 12 }}>
          <div style={{ fontSize: 20 }}>🚀</div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-primary)' }}>First month of tracking!</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>We'll show comparisons once you have two months of data.</p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ 
              width: 40, height: 40, borderRadius: 10, 
              background: `${color}20`, color: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20
            }}>
              {isBetter ? '↓' : '↑'}
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: color }}>
                {Math.abs(pct).toFixed(1)}% {isBetter ? 'less' : 'more'}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                vs last month (€{prevTotal.toFixed(0)})
              </p>
            </div>
          </div>
          
          <div style={{ marginTop: 24, padding: '12px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
            <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              {maxIncrease > 20 ? (
                <>
                  ⚠️ Your <strong>{biggestIncreaseCat}</strong> spending is up by <strong>€{maxIncrease.toFixed(0)}</strong> compared to last month.
                </>
              ) : isBetter ? (
                "✨ Great job! You're trending lower than last month. Keep it up!"
              ) : (
                "You've spent slightly more than last month. Watch your variable expenses."
              )}
            </p>
          </div>
        </>
      )}
    </BentoCard>
  );
}
