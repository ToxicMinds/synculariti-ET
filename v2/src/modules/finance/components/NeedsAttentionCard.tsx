'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/utils';

interface NeedsAttentionCardProps {
  tenantId: string | undefined;
  selectedMonth: string;
}

interface PendingApproval {
  id: string;
  name: string;
}

interface AttentionItems {
  pendingPurchases: number;
  openAnomalies: number;
  rejectedPurchases: number;
  dataGaps: number;
  pendingApprovals: PendingApproval[];
}

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://synculariti-et.vercel.app';

export function NeedsAttentionCard({ tenantId, selectedMonth }: NeedsAttentionCardProps) {
  const [items, setItems] = useState<AttentionItems | null>(null);
  const [loading, setLoading] = useState(true);

  const [start, end] = selectedMonth.split('-');
  const periodStart = `${selectedMonth}-01`;
  const lastDay = new Date(Number(start), Number(end), 0).getDate();
  const periodEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

  useEffect(() => {
    if (!tenantId) return;
    fetchItems();
  }, [tenantId, selectedMonth]);

  async function fetchItems() {
    setLoading(true);
    try {
      const [pending, rejected, anomalies, gaps, approvalRows] = await Promise.all([
        supabase.from('purchases').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('quarantine_status', 'PENDING'),
        supabase.from('purchases').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('quarantine_status', 'REJECTED'),
        supabase.from('purchase_anomaly_queue').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('status', 'OPEN'),
        supabase.from('pos_data_gaps').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).gte('gap_date', periodStart).lte('gap_date', periodEnd),
        supabase.rpc('get_pending_approvals_v1'),
      ]);

      setItems({
        pendingPurchases: pending.count ?? 0,
        rejectedPurchases: rejected.count ?? 0,
        openAnomalies: anomalies.count ?? 0,
        dataGaps: gaps.count ?? 0,
        pendingApprovals: (approvalRows.data || []).map((r: { id: string; payload: Record<string, unknown> }) => ({
          id: r.id,
          name: (r.payload as { name?: string })?.name || 'Action Required',
        })),
      });
    } catch (e: unknown) {
      Logger.system('ERROR', 'FCV', 'Attention fetch failed', { error: getErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  }

  if (loading || !items) return null;

  const totalAttention = items.pendingPurchases + items.openAnomalies + items.rejectedPurchases + items.pendingApprovals.length;
  const hasGaps = items.dataGaps > 0;

  if (totalAttention === 0 && !hasGaps) return null;

  const attentionType = totalAttention > 0 ? 'error' : 'warning';

  const chips: { text: string; href?: string }[] = [];
  if (items.pendingPurchases > 0) chips.push({ text: `${items.pendingPurchases} pending purchase${items.pendingPurchases > 1 ? 's' : ''}` });
  if (items.openAnomalies > 0) chips.push({ text: `${items.openAnomalies} anomal${items.openAnomalies > 1 ? 'ies' : 'y'}` });
  if (items.rejectedPurchases > 0) chips.push({ text: `${items.rejectedPurchases} rejected` });
  if (items.dataGaps > 0) chips.push({ text: `${items.dataGaps} data gap${items.dataGaps > 1 ? 's' : ''}` });

  return (
    <div style={{
      padding: '14px 20px',
      marginBottom: 16,
      borderRadius: 14,
      background: attentionType === 'error'
        ? 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(239,68,68,0.06) 100%)'
        : 'linear-gradient(135deg, rgba(234,179,8,0.12) 0%, rgba(234,179,8,0.06) 100%)',
      border: `1px solid ${attentionType === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(234,179,8,0.25)'}`,
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '8px 16px',
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>
        {attentionType === 'error' ? '⚠️' : '📋'}
      </span>
      <span style={{
        fontSize: 14,
        fontWeight: 600,
        color: attentionType === 'error' ? 'var(--accent-danger)' : 'var(--accent-warn)',
        flexShrink: 0,
      }}>
        {attentionType === 'error'
          ? `${totalAttention} item${totalAttention > 1 ? 's' : ''} need${totalAttention === 1 ? 's' : ''} your attention`
          : 'POS data gaps detected'}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {chips.map((chip, i) => (
          <span key={i} style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}>
            {chip.text}
          </span>
        ))}
        {items.pendingApprovals.map((a) => (
          <a
            key={a.id}
            href={`/action/${a.id}`}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 8,
              background: '#fef3cd',
              color: '#92400e',
              whiteSpace: 'nowrap',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {a.name.substring(0, 30)}{a.name.length > 30 ? '…' : ''} →
          </a>
        ))}
      </div>
    </div>
  );
}
