'use client';

import { BentoCard } from '@/components/BentoCard';
import { Transaction } from '../lib/finance';
import { formatCurrency, safeAmount } from '@/lib/utils';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

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

const CHART_COLORS = ['#6366F1','#8B5CF6','#EC4899','#F43F5E','#F59E0B','#10B981','#06B6D4','#3B82F6'];

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

  // Doughnut chart data
  const categories = sortedCats.map(([cat]) => cat);
  const values = sortedCats.map(([, val]) => val);
  const doughnutData = {
    labels: categories,
    datasets: [{
      data: values,
      backgroundColor: CHART_COLORS,
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  return (
    <BentoCard title="Spend Comparison" colSpan={colSpan}>
      <div className="flex-col" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Total Spent + Comparison row */}
        <div className="flex-row" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p className="card-subtitle">Total spent</p>
            <div className="card-title" style={{ fontSize: 32 }}>{formatCurrency(currentTotal)}</div>
          </div>
          {hasSomeData && !isNewMonthNoData && !isFirstMonthEver && (
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
          )}
        </div>

        {/* Empty/first month states */}
        {!hasSomeData && (
          <div className="flex-col items-center gap-2 py-4">
            <div style={{ fontSize: 24 }}>📊</div>
            <p className="card-subtitle">No data found for this period.</p>
          </div>
        )}
        {isNewMonthNoData && hasSomeData && (
          <div className="flex-row items-center gap-3 p-3 glass-card rounded-xl">
            <div style={{ fontSize: 20 }}>✨</div>
            <p className="card-subtitle">It's a new month! Start scanning receipts to see how your spending changes.</p>
          </div>
        )}
        {isFirstMonthEver && !isNewMonthNoData && (
          <div className="flex-row items-center gap-3 p-3 glass-card rounded-xl">
            <div style={{ fontSize: 20 }}>🚀</div>
            <div className="flex-col">
              <p className="card-title" style={{ fontSize: 14 }}>First month of tracking!</p>
              <p className="card-subtitle">We'll show trend comparisons once you have two months of data.</p>
            </div>
          </div>
        )}

        {/* Insight callout */}
        {hasSomeData && maxIncrease > 20 && (
          <div className="p-3 glass-card rounded-xl">
            <p className="card-subtitle" style={{ lineHeight: 1.5 }}>
              ⚠️ Your <strong>{biggestIncreaseCat}</strong> spending is up by <strong>{formatCurrency(maxIncrease)}</strong> compared to last month.
            </p>
          </div>
        )}

        {/* Doughnut + Category List side by side */}
        {sortedCats.length > 0 && (
          <div className="flex-row" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 160, height: 160, flexShrink: 0 }}>
              <Doughnut data={doughnutData} options={{
                plugins: { legend: { display: false } },
                cutout: '65%',
                maintainAspectRatio: false,
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
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
          </div>
        )}
      </div>
    </BentoCard>
  );
}
