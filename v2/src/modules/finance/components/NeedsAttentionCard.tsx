'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/utils';

interface NeedsAttentionCardProps {
  tenantId: string | undefined;
  selectedMonth: string;
}

interface AttentionItems {
  pendingPurchases: number;
  openAnomalies: number;
  rejectedPurchases: number;
  dataGaps: number;
  pendingApprovals: number;
}

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
      const [pending, rejected, anomalies, gaps, approvals] = await Promise.all([
        supabase.from('purchases').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('quarantine_status', 'PENDING'),
        supabase.from('purchases').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('quarantine_status', 'REJECTED'),
        supabase.from('purchase_anomaly_queue').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('status', 'OPEN'),
        supabase.from('pos_data_gaps').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).gte('gap_date', periodStart).lte('gap_date', periodEnd),
        supabase.from('whatsapp_outbox').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).in('status', ['PENDING', 'SENT']),
      ]);

      setItems({
        pendingPurchases: pending.count ?? 0,
        rejectedPurchases: rejected.count ?? 0,
        openAnomalies: anomalies.count ?? 0,
        dataGaps: gaps.count ?? 0,
        pendingApprovals: approvals.count ?? 0,
      });
    } catch (e: unknown) {
      Logger.system('ERROR', 'FCV', 'Attention fetch failed', { error: getErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  }

  if (loading || !items) return null;

  const totalAttention = items.pendingPurchases + items.openAnomalies + items.rejectedPurchases + items.pendingApprovals;
  const hasGaps = items.dataGaps > 0;

  if (totalAttention === 0 && !hasGaps) return null;

  const attentionType = totalAttention > 0 ? 'error' : 'warning';

  const chips: string[] = [];
  if (items.pendingPurchases > 0) chips.push(`${items.pendingPurchases} pending purchase${items.pendingPurchases > 1 ? 's' : ''}`);
  if (items.openAnomalies > 0) chips.push(`${items.openAnomalies} anomal${items.openAnomalies > 1 ? 'ies' : 'y'}`);
  if (items.rejectedPurchases > 0) chips.push(`${items.rejectedPurchases} rejected`);
  if (items.pendingApprovals > 0) chips.push(`${items.pendingApprovals} pending approval${items.pendingApprovals > 1 ? 's' : ''}`);
  if (items.dataGaps > 0) chips.push(`${items.dataGaps} data gap${items.dataGaps > 1 ? 's' : ''}`);

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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}
