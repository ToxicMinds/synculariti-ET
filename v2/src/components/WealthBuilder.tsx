'use client';

import { BentoCard } from './BentoCard';

export function WealthBuilder({ income, spent, goal }: { income: number, spent: number, goal: number }) {
  const netSavings = income - spent;
  const progress = Math.min(100, Math.max(0, (netSavings / goal) * 100));
  const isNegative = netSavings < 0;

  return (
    <BentoCard title="Wealth Builder" colSpan={4}>
      <div style={{ position: 'relative', height: 160, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ 
          fontSize: 32, 
          fontWeight: 600, 
          color: isNegative ? 'var(--accent-danger)' : 'var(--accent-success)',
          letterSpacing: '-0.02em'
        }}>
          €{netSavings.toFixed(2)}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          {isNegative ? 'Net Deficit' : 'Net Savings'} this month
        </p>

        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            <span>Target: €{goal}</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <div style={{ width: '100%', height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ 
              width: `${progress}%`, 
              height: '100%', 
              background: isNegative ? 'var(--accent-danger)' : 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
              transition: 'width 1s ease-out'
            }} />
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
