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
  const colorClass = isBetter ? 'status-success' : 'status-danger';
  const colorHex = isBetter ? '#10b981' : '#ef4444';

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
      <div className="flex-col gap-4">
        <div>
          <p className="card-subtitle">Spent this month</p>
          <div className="card-title" style={{ fontSize: 32 }}>€{currentTotal.toFixed(2)}</div>
        </div>

        {!hasSomeData ? (
          <div className="flex-col items-center gap-2 py-4">
            <div style={{ fontSize: 24 }}>📊</div>
            <p className="card-subtitle">No data found for this period.</p>
          </div>
        ) : isNewMonthNoData ? (
          <div className="flex-row items-center gap-3 p-3 glass-card rounded-xl">
            <div style={{ fontSize: 20 }}>✨</div>
            <p className="card-subtitle">It's a new month! Start scanning receipts to see your performance.</p>
          </div>
        ) : isFirstMonthEver ? (
          <div className="flex-row items-center gap-3 p-3 glass-card rounded-xl">
            <div style={{ fontSize: 20 }}>🚀</div>
            <div className="flex-col">
              <p className="card-title" style={{ fontSize: 14 }}>First month of tracking!</p>
              <p className="card-subtitle">We'll show comparisons once you have two months of data.</p>
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
                  vs last month (€{prevTotal.toFixed(0)})
                </p>
              </div>
            </div>
            
            <div className="p-3 glass-card rounded-xl">
              <p className="card-subtitle" style={{ lineHeight: 1.5 }}>
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
      </div>
    </BentoCard>
  );
}
