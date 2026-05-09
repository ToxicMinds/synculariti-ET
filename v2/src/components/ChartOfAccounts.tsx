'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BentoCard } from './BentoCard';
import { Logger } from '@/lib/logger';

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
}

export function ChartOfAccounts({ tenantId }: { tenantId: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) fetchAccounts();
  }, [tenantId]);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .order('account_code');
      
      if (error) throw error;
      setAccounts(data || []);
    } catch (e) {
      Logger.system('ERROR', 'CoA', 'Failed to fetch CoA', e, tenantId);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading Ledger...</div>;

  return (
    <BentoCard colSpan={12} title="Chart of Accounts (Ledger)">
      <div className="scroll-area" style={{ maxHeight: 400 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 12 }}>
              <th style={{ padding: '12px 8px' }}>CODE</th>
              <th style={{ padding: '12px 8px' }}>ACCOUNT NAME</th>
              <th style={{ padding: '12px 8px' }}>TYPE</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(acc => (
              <tr key={acc.id} style={{ borderBottom: '1px solid var(--border-color-subtle)', fontSize: 14 }}>
                <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--accent-primary)' }}>{acc.account_code}</td>
                <td style={{ padding: '12px 8px' }}>{acc.account_name}</td>
                <td style={{ padding: '12px 8px' }}>
                  <span style={{ 
                    fontSize: 10, 
                    padding: '2px 8px', 
                    borderRadius: 12, 
                    background: acc.account_type === 'EXPENSE' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                    color: acc.account_type === 'EXPENSE' ? '#ef4444' : '#3b82f6',
                    fontWeight: 700
                  }}>
                    {acc.account_type}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BentoCard>
  );
}
