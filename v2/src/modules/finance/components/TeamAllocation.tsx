'use client';

import { BentoCard } from '@/components/BentoCard';
import { Transaction, calcPerUserSpend } from '../lib/finance';

export function TeamAllocation({ transactions, names, colSpan = 4 }: { transactions: Transaction[], names: Record<string, string>, colSpan?: number }) {
  // FIXED: Use the proper hybrid resolver that handles BOTH who_id AND legacy who-name
  const userSpends = calcPerUserSpend(transactions, names);

  const sortedUsers = Object.entries(names).map(([id, name]) => ({
    id,
    name,
    amount: userSpends[id] || 0
  })).sort((a, b) => b.amount - a.amount);

  const maxSpend = sortedUsers[0]?.amount || 1;
  // Lead = lowest spender (most efficient resource usage)
  const activeUsers = sortedUsers.filter(u => u.amount > 0);
  const efficiencyLead = activeUsers.length > 1 ? activeUsers[activeUsers.length - 1] : null;

  return (
    <BentoCard title="Team Allocation" colSpan={colSpan}>
      <div className="flex-col gap-4">
        {sortedUsers.map((user) => (
          <div key={user.id} className="flex-row items-center gap-3">
            <div className="avatar-circle">
              {user.name.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div className="flex-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{user.name}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>€{user.amount.toFixed(2)}</span>
              </div>
              <div style={{ width: '100%', height: 6, background: 'var(--bg-hover)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.min(100, (user.amount / maxSpend) * 100)}%`, 
                  height: '100%', 
                  background: user.amount === maxSpend 
                    ? 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)' 
                    : 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
                  borderRadius: 3,
                  transition: 'width 1s ease-out'
                }} />
              </div>
            </div>
          </div>
        ))}

        {efficiencyLead && (
          <div className="status-badge status-success" style={{ marginTop: 4, padding: '10px 14px', fontSize: 12 }}>
            ⚡ {efficiencyLead.name} is the Efficiency Lead this month!
          </div>
        )}

        {activeUsers.length === 0 && (
          <p className="card-subtitle">No resource allocation data found.</p>
        )}
      </div>
    </BentoCard>
  );
}
