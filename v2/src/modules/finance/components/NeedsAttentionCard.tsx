'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import { getErrorMessage, formatCurrency } from '@/lib/utils';
import { resolvePurchaseAction } from '@/modules/finance/actions/resolvePurchaseAction';
import { EventTimeline } from '@/components/EventTimeline';

interface NeedsAttentionCardProps {
  tenantId: string | undefined;
  selectedMonth: string;
}

interface PendingApproval {
  id: string;
  name: string;
}

interface PendingPurchaseRow {
  id: string;
  vendor_name: string;
  total_amount: number;
  currency: string;
  purchase_date: string;
  invoice_number: string | null;
}

interface AttentionItems {
  pendingPurchases: number;
  openAnomalies: number;
  rejectedPurchases: number;
  dataGaps: number;
  pendingApprovals: PendingApproval[];
}

export function NeedsAttentionCard({ tenantId, selectedMonth }: NeedsAttentionCardProps) {
  const [items, setItems] = useState<AttentionItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [pendingRows, setPendingRows] = useState<PendingPurchaseRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  const openReviewModal = useCallback(async () => {
    if (!tenantId) return;
    setIsReviewModalOpen(true);
    setModalLoading(true);
    try {
      const { data } = await supabase
        .from('purchases')
        .select('id, vendor_name, total_amount, currency, purchase_date, invoice_number')
        .eq('tenant_id', tenantId)
        .eq('quarantine_status', 'PENDING')
        .order('purchase_date', { ascending: false });

      setPendingRows((data || []) as PendingPurchaseRow[]);
    } catch (e: unknown) {
      Logger.system('ERROR', 'FCV', 'Failed to fetch pending purchases', { error: getErrorMessage(e) });
    } finally {
      setModalLoading(false);
    }
  }, [tenantId]);

  const closeReviewModal = useCallback(() => {
    setIsReviewModalOpen(false);
    setPendingRows([]);
  }, []);

  const handleResolve = useCallback(async (purchaseId: string, decision: 'RELEASED' | 'REJECTED') => {
    setActionLoading(purchaseId);
    try {
      const result = await resolvePurchaseAction(purchaseId, decision);
      if (result.success) {
        setPendingRows(prev => prev.filter(r => r.id !== purchaseId));
        fetchItems();
      } else {
        Logger.system('ERROR', 'FCV', 'Resolve action failed', { purchaseId, error: result.error });
      }
    } catch (e: unknown) {
      Logger.system('ERROR', 'FCV', 'Resolve action crashed', { purchaseId, error: getErrorMessage(e) });
    } finally {
      setActionLoading(null);
    }
  }, []);

  if (loading || !items) return null;

  const totalAttention = items.pendingPurchases + items.openAnomalies + items.rejectedPurchases + items.pendingApprovals.length;
  const hasGaps = items.dataGaps > 0;

  if (totalAttention === 0 && !hasGaps) return null;

  const attentionType = totalAttention > 0 ? 'error' : 'warning';

  const chips: { text: string; href?: string; onClick?: () => void }[] = [];
  if (items.pendingPurchases > 0) chips.push({
    text: `${items.pendingPurchases} pending purchase${items.pendingPurchases > 1 ? 's' : ''}`,
    onClick: openReviewModal,
  });
  if (items.openAnomalies > 0) chips.push({ text: `${items.openAnomalies} anomal${items.openAnomalies > 1 ? 'ies' : 'y'}` });
  if (items.rejectedPurchases > 0) chips.push({ text: `${items.rejectedPurchases} rejected` });
  if (items.dataGaps > 0) chips.push({ text: `${items.dataGaps} data gap${items.dataGaps > 1 ? 's' : ''}` });

  return (
    <>
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
            chip.onClick ? (
              <button key={i} onClick={chip.onClick} style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 8,
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
              }}>
                {chip.text}
              </button>
            ) : (
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
            )
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

      {isReviewModalOpen && (
        <div className="tooltip-overlay" style={{ alignItems: 'center' }} onClick={closeReviewModal}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 560, padding: 28, borderRadius: 20 }} onClick={e => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 className="card-title" style={{ fontSize: 18 }}>Pending Purchase Review</h2>
              <button onClick={closeReviewModal} className="btn btn-secondary" style={{ padding: 0, width: 32, height: 32, borderRadius: '50%' }}>✕</button>
            </div>

            {modalLoading ? (
              <div className="flex-center" style={{ padding: 40 }}><div className="spinner-small" /></div>
            ) : pendingRows.length === 0 ? (
              <p className="card-subtitle">No pending purchases to review.</p>
            ) : (
              <div className="flex-col gap-3">
                {pendingRows.map(row => (
                  <div key={row.id} className="glass-card" style={{ padding: '12px 16px', borderRadius: 12 }}>
                    <div className="flex-between" style={{ marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{row.vendor_name || 'Unknown Vendor'}</span>
                        {row.invoice_number && (
                          <span className="card-subtitle" style={{ fontSize: 11, marginLeft: 8 }}>#{row.invoice_number}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{formatCurrency(Number(row.total_amount))}</span>
                    </div>
                    <div className="flex-between">
                      <span className="card-subtitle" style={{ fontSize: 11 }}>
                        {new Date(row.purchase_date).toLocaleDateString()}
                      </span>
                      <div className="flex-row gap-2">
                        <button
                          disabled={actionLoading === row.id}
                          onClick={() => handleResolve(row.id, 'RELEASED')}
                          className="btn btn-primary"
                          style={{ padding: '4px 12px', fontSize: 12 }}
                        >
                          {actionLoading === row.id ? '...' : 'Approve'}
                        </button>
                        <button
                          disabled={actionLoading === row.id}
                          onClick={() => handleResolve(row.id, 'REJECTED')}
                          className="btn btn-secondary"
                          style={{ padding: '4px 12px', fontSize: 12 }}
                        >
                          {actionLoading === row.id ? '...' : 'Reject'}
                        </button>
                      </div>
                    </div>
                    {tenantId && (
                      <EventTimeline
                        entityType="purchase"
                        entityId={row.id}
                        tenantId={tenantId}
                        limit={3}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
