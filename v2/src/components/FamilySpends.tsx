'use client';

import { BentoCard } from './BentoCard';

export function FamilySpends({ expenses, names }: { expenses: any[], names: Record<string, string> }) {
  const userSpends: Record<string, number> = {};
  
  expenses.forEach(exp => {
    const who = exp.who_id || 'unknown';
    userSpends[who] = (userSpends[who] || 0) + Number(exp.amount);
  });

  const sortedUsers = Object.entries(names).map(([id, name]) => ({
    id,
    name,
    amount: userSpends[id] || 0
  })).sort((a, b) => b.amount - a.amount);

  const champion = sortedUsers.length > 1 ? sortedUsers[sortedUsers.length - 1] : null;

  return (
    <BentoCard title="Family Spends" colSpan={4}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sortedUsers.map((user) => (
          <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 32, 
              height: 32, 
              borderRadius: '50%', 
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--border-color)'
            }}>
              {user.name.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{user.name}</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>€{user.amount.toFixed(2)}</span>
              </div>
              <div style={{ width: '100%', height: 4, background: 'var(--bg-secondary)', borderRadius: 2 }}>
                <div style={{ 
                  width: `${Math.min(100, (user.amount / (sortedUsers[0].amount || 1)) * 100)}%`, 
                  height: '100%', 
                  background: 'var(--accent-primary)',
                  borderRadius: 2
                }} />
              </div>
            </div>
          </div>
        ))}

        {champion && (
          <div style={{ 
            marginTop: 8, 
            padding: '10px 12px', 
            background: 'rgba(16, 185, 129, 0.1)', 
            borderRadius: 12,
            border: '1px solid rgba(16, 185, 129, 0.2)',
            fontSize: 12,
            color: 'var(--accent-success)',
            fontWeight: 500
          }}>
            🏆 {champion.name} is the Budget Champion!
          </div>
        )}
      </div>
    </BentoCard>
  );
}
