'use client';

import { BentoCard } from './BentoCard';
import { Transaction, calcPerUserSpend } from '@/lib/finance';

export function FamilySpends({ transactions, names, colSpan = 4 }: { transactions: Transaction[], names: Record<string, string>, colSpan?: number }) {
  // FIXED: Use the proper hybrid resolver that handles BOTH who_id AND legacy who-name
  const userSpends = calcPerUserSpend(transactions, names);

  const sortedUsers = Object.entries(names).map(([id, name]) => ({
    id,
    name,
    amount: userSpends[id] || 0
  })).sort((a, b) => b.amount - a.amount);

  const maxSpend = sortedUsers[0]?.amount || 1;
  // Champion = lowest spender (most budget-conscious, not counting zero-data users)
  const activeUsers = sortedUsers.filter(u => u.amount > 0);
  const champion = activeUsers.length > 1 ? activeUsers[activeUsers.length - 1] : null;

  return (
    <BentoCard title="Family Spends" colSpan={colSpan}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sortedUsers.map((user) => (
          <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 36, 
              height: 36, 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0
            }}>
              {user.name.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
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

        {champion && (
          <div style={{ 
            marginTop: 4, 
            padding: '10px 14px', 
            background: 'rgba(16, 185, 129, 0.08)', 
            borderRadius: 12,
            border: '1px solid rgba(16, 185, 129, 0.2)',
            fontSize: 12,
            color: '#10b981',
            fontWeight: 600
          }}>
            🏆 {champion.name} is the Budget Champion this month!
          </div>
        )}

        {activeUsers.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No spending data attributed to members yet.</p>
        )}
      </div>
    </BentoCard>
  );
}
