'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BentoCard } from './BentoCard';
import { Logger } from '@/lib/logger';

interface Invoice {
  id: string;
  invoice_number: string;
  vendor_id: string;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  total_amount: number;
  currency: string;
  due_date: string;
  raw_file_url?: string;
}

export function InvoiceManager({ tenantId }: { tenantId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) fetchInvoices();
  }, [tenantId]);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setInvoices(data || []);
    } catch (e) {
      Logger.system('ERROR', 'Finance', 'Failed to fetch invoices', e, tenantId);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return '#10b981';
      case 'PENDING': return '#f59e0b';
      case 'CANCELLED': return '#ef4444';
      default: return 'var(--text-secondary)';
    }
  };

  if (loading) return <div>Loading Invoices...</div>;

  return (
    <BentoCard colSpan={12} title="Accounts Payable (Invoices)">
      <div className="scroll-area" style={{ maxHeight: 400 }}>
        {invoices.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>No invoices found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: 12 }}>
                <th style={{ padding: '12px 8px' }}>NUMBER</th>
                <th style={{ padding: '12px 8px' }}>AMOUNT</th>
                <th style={{ padding: '12px 8px' }}>DUE DATE</th>
                <th style={{ padding: '12px 8px' }}>STATUS</th>
                <th style={{ padding: '12px 8px' }}>LINK</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-color-subtle)', fontSize: 14 }}>
                  <td style={{ padding: '12px 8px', fontWeight: 500 }}>{inv.invoice_number || 'INV-UNKN'}</td>
                  <td style={{ padding: '12px 8px' }}>{inv.currency} {inv.total_amount.toFixed(2)}</td>
                  <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{inv.due_date || 'N/A'}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ 
                      fontSize: 10, 
                      padding: '2px 8px', 
                      borderRadius: 12, 
                      background: `${getStatusColor(inv.status)}22`,
                      color: getStatusColor(inv.status),
                      fontWeight: 700
                    }}>
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    {inv.raw_file_url ? (
                      <a href={inv.raw_file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)', fontSize: 12 }}>
                        View PDF
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </BentoCard>
  );
}
