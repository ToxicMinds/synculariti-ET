'use client';

import { BentoCard } from './BentoCard';
import { Transaction } from '@/lib/finance';

export function MonthlyPerformance({ 
  transactions, 
  selectedMonth,
  colSpan = 4
}: { 
  transactions: Transaction[], 
  selectedMonth: string,
  colSpan?: number
}) {
  const [y, m] = selectedMonth.split('-');
  const currentPrefix = `${y}-${m}`;
  const prevDate = new Date(parseInt(y), parseInt(m) - 2, 1);
  const prevPrefix = prevDate.toISOString().slice(0, 7);

  const currentMonthTx = transactions.filter(t => t.date?.startsWith(currentPrefix) && t.category !== 'Savings' && t.category !== 'Adjustment');
  const prevMonthTx = transactions.filter(t => t.date?.startsWith(prevPrefix) && t.category !== 'Savings' && t.category !== 'Adjustment');

  const currentTotal = currentMonthTx.reduce((acc, t) => acc + Number(t.amount), 0);
  const prevTotal = prevMonthTx.reduce((acc, t) => acc + Number(t.amount), 0);

  const diff = currentTotal - prevTotal;
  const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
  
  const isBetter = diff <= 0; // Spending less is better
  const color = isBetter ? 'var(--accent-success)' : 'var(--accent-danger)';

  // Smart states
  const isNewMonthNoData = currentTotal === 0;
  const isFirstMonthEver = prevMonthTx.length === 0;
  const hasSomeData = currentMonthTx.length > 0 || prevMonthTx.length > 0;

  // Find biggest category increase
  const currentCats: Record<string, number> = {};
  currentMonthTx.forEach(t => currentCats[t.category] = (currentCats[t.category] || 0) + Number(t.amount));
  
  const prevCats: Record<string, number> = {};
  prevMonthTx.forEach(t => prevCats[t.category] = (prevCats[t.category] || 0) + Number(t.amount));

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
    <BentoCard title="Monthly Performance" colSpan={colSpan}>
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
