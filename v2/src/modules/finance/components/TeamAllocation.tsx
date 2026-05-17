'use client';

import { BentoCard } from '@/components/BentoCard';
import { Transaction, calcPerUserSpend } from '../lib/finance';

interface TeamAllocationProps {
  transactions: Transaction[];
  names: Record<string, string>;
  colSpan?: number;
}

export function TeamAllocation({ transactions, names, colSpan = 4 }: TeamAllocationProps) {
  // Use our canonical polymorphic resolver that attributes both UUIDs and raw names in O(N)
  const userSpends = calcPerUserSpend(transactions, names);

  const sortedUsers = Object.entries(names).map(([id, name]) => ({
    id,
    name,
    amount: userSpends[id] || 0
  })).sort((a, b) => b.amount - a.amount);

  const maxSpend = sortedUsers[0]?.amount || 1;
  const activeUsers = sortedUsers.filter(u => u.amount > 0);
  
  // Find the lowest spender among active staff members as the efficiency leader
  const efficiencyLead = activeUsers.length > 1 ? activeUsers[activeUsers.length - 1] : null;

  return (
    <BentoCard title="Team Resource Allocation" colSpan={colSpan}>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%', 
        gap: '16px',
        justifyContent: 'center' 
      }}>
        {/* User Allocation List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {sortedUsers.map((user) => {
            const percentage = Math.min(100, (user.amount / maxSpend) * 100);
            
            return (
              <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Visual Avatar */}
                <div style={{ 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '50%', 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-color)',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  {user.name.charAt(0)}
                </div>

                {/* Progress & Label Block */}
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '13px', 
                    marginBottom: '4px',
                    fontWeight: 500 
                  }}>
                    <span style={{ color: 'var(--text-primary)' }}>{user.name}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      €{user.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  {/* Allocation Track */}
                  <div style={{ 
                    width: '100%', 
                    height: '6px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '3px', 
                    overflow: 'hidden' 
                  }}>
                    <div style={{ 
                      width: `${percentage}%`, 
                      height: '100%', 
                      background: user.amount === maxSpend 
                        ? 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)' 
                        : 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
                      borderRadius: '3px',
                      transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic status feedback */}
        {efficiencyLead && (
          <div style={{ 
            marginTop: '8px', 
            padding: '10px 14px', 
            fontSize: '12px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            color: 'var(--accent-success)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚡</span>
            <span><strong>{efficiencyLead.name}</strong> is the HORECA Resource Efficiency Lead this month!</span>
          </div>
        )}

        {activeUsers.length === 0 && (
          <p style={{ 
            color: 'var(--text-secondary)', 
            fontSize: '13px', 
            margin: '8px 0', 
            fontStyle: 'italic', 
            textAlign: 'center' 
          }}>
            No team resource allocation data found for this period.
          </p>
        )}
      </div>
    </BentoCard>
  );
}
