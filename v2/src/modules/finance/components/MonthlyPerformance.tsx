'use client';

import { BentoCard } from '@/components/BentoCard';
import { Transaction } from '../lib/finance';
import { formatCurrency, safeAmount } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, string> = {
  'Food Costs': '#ef4444',
  'Labor & Wages': '#f59e0b',
  'Utilities': '#3b82f6',
  'Supplies': '#8b5cf6',
  'Rent': '#10b981',
  'Insurance': '#ec4899',
  'Admin': '#6366f1',
  'Marketing': '#14b8a6',
};

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
  const year = parseInt(y);
  const month = parseInt(m);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevPrefix = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  const currentMonthTx = transactions.filter(t => t.date?.startsWith(currentPrefix) && t.category !== 'Savings' && t.category !== 'Adjustment');
  const prevMonthTx = transactions.filter(t => t.date?.startsWith(prevPrefix) && t.category !== 'Savings' && t.category !== 'Adjustment');
  const currentTotal = currentMonthTx.reduce((acc, t) => acc + safeAmount(t.amount), 0);

  const prevTotal = prevMonthTx.reduce((acc, t) => acc + safeAmount(t.amount), 0);

  const diff = currentTotal - prevTotal;
  const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
  
  const isBetter = diff <= 0;
  const colorClass = isBetter ? 'status-success' : 'status-danger';
  const colorHex = isBetter ? '#10b981' : '#ef4444';

  const isNewMonthNoData = currentTotal === 0;
  const isFirstMonthEver = prevMonthTx.length === 0;
  const hasSomeData = currentMonthTx.length > 0 || prevMonthTx.length > 0;

  // Category breakdown
  const currentCats: Record<string, number> = {};
  currentMonthTx.forEach(t => currentCats[t.category] = (currentCats[t.category] || 0) + safeAmount(t.amount));

  const prevCats: Record<string, number> = {};
  prevMonthTx.forEach(t => prevCats[t.category] = (prevCats[t.category] || 0) + safeAmount(t.amount));

  const sortedCats = Object.entries(currentCats).sort(([, a], [, b]) => b - a);

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
    <BentoCard title="Spend Comparison" colSpan={colSpan}>
      <div className="flex-col gap-4">
        {/* Total Spent */}
        <div>
          <p className="card-subtitle">Total spent</p>
          <div className="card-title" style={{ fontSize: 32 }}>{formatCurrency(currentTotal)}</div>
        </div>

        {/* Comparison vs last month */}
        {!hasSomeData ? (
          <div className="flex-col items-center gap-2 py-4">
            <div style={{ fontSize: 24 }}>📊</div>
            <p className="card-subtitle">No data found for this period.</p>
          </div>
        ) : isNewMonthNoData ? (
          <div className="flex-row items-center gap-3 p-3 glass-card rounded-xl">
            <div style={{ fontSize: 20 }}>✨</div>
            <p className="card-subtitle">It's a new month! Start scanning receipts to see how your spending changes.</p>
          </div>
        ) : isFirstMonthEver ? (
          <div className="flex-row items-center gap-3 p-3 glass-card rounded-xl">
            <div style={{ fontSize: 20 }}>🚀</div>
            <div className="flex-col">
              <p className="card-title" style={{ fontSize: 14 }}>First month of tracking!</p>
              <p className="card-subtitle">We'll show trend comparisons once you have two months of data.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-row items-center gap-3">
              <div className={`flex-center status-badge ${colorClass}`} style={{ width: 40, height: 40, fontSize: 20, borderRadius: 10 }}>
                {isBetter ? '↓' : '↑'}
              </div>
              <div className="flex-col">
                <p className="card-title" style={{ fontSize: 14, color: colorHex }}>
                  {Math.abs(pct).toFixed(1)}% {isBetter ? 'less' : 'more'}
                </p>
                <p className="card-subtitle">
                  vs last month ({formatCurrency(prevTotal)})
                </p>
              </div>
            </div>

            {maxIncrease > 20 && (
              <div className="p-3 glass-card rounded-xl">
                <p className="card-subtitle" style={{ lineHeight: 1.5 }}>
                  ⚠️ Your <strong>{biggestIncreaseCat}</strong> spending is up by <strong>{formatCurrency(maxIncrease)}</strong> compared to last month.
                </p>
              </div>
            )}
          </>
        )}

        {/* Category Breakdown */}
        {sortedCats.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
              By Category
            </p>
            <div className="flex-col gap-2">
              {sortedCats.slice(0, 6).map(([cat, amount]) => {
                const pctOfTotal = currentTotal > 0 ? (amount / currentTotal) * 100 : 0;
                const color = CATEGORY_COLORS[cat] || '#6366f1';
                return (
                  <div key={cat} className="flex-row items-center gap-2" style={{ fontSize: 12 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {cat}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{formatCurrency(amount)}</span>
                    <span style={{ color: 'var(--text-muted)', width: 36, textAlign: 'right' }}>{pctOfTotal.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </BentoCard>
  );
}
