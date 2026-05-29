'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { BentoCard } from '@/components/BentoCard';
import { Logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/utils';

interface QuarantineQueueCardProps {
  tenantId: string | undefined;
  selectedMonth: string;
  colSpan?: number;
}

interface QueueStats {
  pendingPurchases: number;
  approvedPurchases: number;
  rejectedPurchases: number;
  openAnomalies: number;
  dataGaps: number;
}

export function QuarantineQueueCard({ tenantId, selectedMonth, colSpan = 4 }: QuarantineQueueCardProps) {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [start, end] = selectedMonth.split('-');
  const periodStart = `${selectedMonth}-01`;
  const lastDay = new Date(Number(start), Number(end), 0).getDate();
  const periodEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

  useEffect(() => {
    if (!tenantId) return;
    fetchStats();
  }, [tenantId, selectedMonth]);

  async function fetchStats() {
    setLoading(true);
    try {
      const [pending, approved, rejected, anomalies, gaps] = await Promise.all([
        supabase.from('purchases').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('quarantine_status', 'PENDING'),
        supabase.from('purchases').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('quarantine_status', 'APPROVED')
          .gte('purchase_date', periodStart).lte('purchase_date', periodEnd),
        supabase.from('purchases').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('quarantine_status', 'REJECTED'),
        supabase.from('purchase_anomaly_queue').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('status', 'OPEN'),
        supabase.from('pos_data_gaps').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).gte('gap_date', periodStart).lte('gap_date', periodEnd),
      ]);

      setStats({
        pendingPurchases: pending.count ?? 0,
        approvedPurchases: approved.count ?? 0,
        rejectedPurchases: rejected.count ?? 0,
        openAnomalies: anomalies.count ?? 0,
        dataGaps: gaps.count ?? 0,
      });
    } catch (e: unknown) {
      Logger.system('ERROR', 'FCV', 'Queue stats fetch failed', { error: getErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  }

  const totalAttention = (stats?.pendingPurchases ?? 0) + (stats?.openAnomalies ?? 0);
  const needsAttention = totalAttention > 0 || (stats?.dataGaps ?? 0) > 0;

  return (
    <BentoCard
      title="Pipeline Health"
      colSpan={colSpan}
      tooltip={{
        title: 'Purchase Pipeline',
        explanation: 'Tracks the batch ingestion pipeline: purchases awaiting review, anomaly queue items, and POS data gaps.',
      }}
    >
      {loading ? (
        <div className="flex-row items-center gap-3" style={{ minHeight: 64 }}>
          <div className="spinner-small" />
          <span className="card-subtitle">Loading pipeline state…</span>
        </div>
      ) : !stats ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', padding: '16px 0', textAlign: 'center' }}>
          Could not load pipeline data.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Attention banner */}
          {needsAttention && (
            <div style={{
              padding: '8px 12px', borderRadius: 10, fontSize: 12,
              background: totalAttention > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
              border: `1px solid ${totalAttention > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)'}`,
              color: totalAttention > 0 ? 'var(--accent-danger)' : 'var(--accent-warn)',
              fontWeight: 600,
            }}>
              {totalAttention > 0
                ? `⚠ ${totalAttention} item${totalAttention > 1 ? 's' : ''} need${totalAttention === 1 ? 's' : ''} review`
                : `📋 ${stats.dataGaps} POS data gap${stats.dataGaps > 1 ? 's' : ''} detected`
              }
            </div>
          )}

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <StatBox label="Pending" value={stats.pendingPurchases} highlight={stats.pendingPurchases > 0} />
            <StatBox label="Anomalies" value={stats.openAnomalies} highlight={stats.openAnomalies > 0} />
            <StatBox label="Approved" value={stats.approvedPurchases} highlight={false} />
            <StatBox label="Rejected" value={stats.rejectedPurchases} highlight={stats.rejectedPurchases > 0} />
          </div>

          {/* Data gaps row */}
          {stats.dataGaps > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 12,
              padding: '8px 10px', borderRadius: 8,
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>Data Gaps (this month)</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-warn)' }}>{stats.dataGaps}</span>
            </div>
          )}

          {!needsAttention && totalAttention === 0 && (
            <p style={{ fontSize: 12, color: '#34d399', fontWeight: 600, textAlign: 'center', padding: '8px 0' }}>
              ✓ Pipeline is healthy
            </p>
          )}
        </div>
      )}
    </BentoCard>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: number; highlight: boolean }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8, textAlign: 'center',
      background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
    }}>
      <div style={{
        fontSize: 20, fontWeight: 700,
        color: highlight ? 'var(--accent-danger)' : 'var(--text-primary)',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
