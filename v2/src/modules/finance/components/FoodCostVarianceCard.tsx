'use client';

import { useState, useEffect, useRef } from 'react';
import { BentoCard } from '@/components/BentoCard';
import { formatCurrency, getErrorMessage } from '@/lib/utils';
import { Logger } from '@/lib/logger';
import type { FCVReport } from '@/lib/food-cost-variance';

interface FoodCostVarianceCardProps {
  selectedMonth: string;
  colSpan?: number;
}

const DirectionConfig: Record<string, { label: string; color: string; icon: string }> = {
  BLEEDING:    { label: 'Bleeding',   color: 'var(--accent-danger)', icon: '🔥' },
  PROFITABLE:  { label: 'Profitable', color: '#34d399',              icon: '✅' },
  NEUTRAL:     { label: 'In Check',   color: 'var(--accent-warn)',   icon: '📊' },
};

const FlagConfig: Record<string, { label: string; color: string }> = {
  HIGH_VARIANCE:      { label: 'Spike',    color: 'var(--accent-danger)' },
  NEGATIVE_VARIANCE:  { label: 'Dip',      color: '#60a5fa' },
  NORMAL:             { label: 'Normal',   color: 'var(--text-muted)' },
};

export function FoodCostVarianceCard({ selectedMonth, colSpan = 6 }: FoodCostVarianceCardProps) {
  const [report, setReport] = useState<FCVReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetching = useRef(false);

  const [start, end] = selectedMonth.split('-');
  const periodStart = `${selectedMonth}-01`;
  const lastDay = new Date(Number(start), Number(end), 0).getDate();
  const periodEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

  useEffect(() => {
    if (isFetching.current) return;
    fetchReport();
  }, [selectedMonth]);

  async function fetchReport() {
    isFetching.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/food-cost-variance?start=${periodStart}&end=${periodEnd}`);
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
      } else {
        setError(data.error || 'Failed to load report');
      }
    } catch (e: unknown) {
      Logger.system('ERROR', 'FCV', 'Report fetch failed', { error: getErrorMessage(e) });
      setError('Could not load Food Cost Variance report.');
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }

  const dir = report ? DirectionConfig[report.direction] : null;

  const spikeCount = report?.varianceSpikes.filter(s => s.flag !== 'NORMAL').length ?? 0;

  return (
    <BentoCard
      title="Food Cost Variance"
      colSpan={colSpan}
      tooltip={{
        title: 'Food Cost Variance',
        explanation: 'Compares actual ingredient spend against theoretical COGS from POS sales × recipe costs. A positive gap means you spent more than expected.',
        formula: 'Gap = Actual Spend − Theoretical COGS. BLEEDING when gap > 5% of revenue. HIGH_VARIANCE when daily actual > theoretical × 1.3.',
      }}
    >
      {loading ? (
        <div className="flex-row items-center gap-3" style={{ minHeight: 80 }}>
          <div className="spinner-small" />
          <span className="card-subtitle">Computing variance from POS & purchase data…</span>
        </div>
      ) : error ? (
        <div style={{ padding: '16px 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{error}</p>
          <button onClick={fetchReport} style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            ↻ Retry
          </button>
        </div>
      ) : !report || report.headline.theoreticalCOGS === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No POS or purchase data for {selectedMonth}. Sync sales and ingredient purchases to see variance.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Direction badge + gap row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em' }}>
                {formatCurrency(report.headline.gap)}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                ({report.headline.gapPct != null ? report.headline.gapPct.toFixed(1) : 'N/A'}%)
              </span>
            </div>
            {dir && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 12,
                background: 'var(--bg-secondary)', color: dir.color,
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {dir.icon} {dir.label}
              </span>
            )}
          </div>

          {/* Spend vs COGS mini-breakdown */}
          <div style={{
            background: 'var(--bg-secondary)', padding: 10, borderRadius: 10,
            border: '1px solid var(--border-color)', fontSize: 12,
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Revenue</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(report.headline.totalRevenue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Theoretical COGS</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(report.headline.theoreticalCOGS)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Actual Spend</span>
              <span style={{ fontWeight: 600, color: report.direction === 'BLEEDING' ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
                {formatCurrency(report.headline.actualSpend)}
              </span>
            </div>
          </div>

          {/* Top ingredients */}
          {report.byIngredient.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Top Drivers
              </p>
              {report.byIngredient.slice(0, 4).map((ing, i) => (
                <div key={ing.ingredient} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 0', fontSize: 12, borderTop: i === 0 ? 'none' : '1px solid var(--border-color)',
                }}>
                  <span style={{ color: 'var(--text-primary)' }}>{ing.ingredient}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, color: ing.gap > 0 ? 'var(--accent-danger)' : '#34d399' }}>
                      {ing.gap > 0 ? '+' : ''}{formatCurrency(ing.gap)}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      {(ing.shareOfTotalGap * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Coverage + spikes footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Coverage: {report.dataCoverage.pctCovered.toFixed(0)}%
              {report.dataCoverage.warning && (
                <span style={{ marginLeft: 4, color: 'var(--accent-warn)' }}>⚠</span>
              )}
            </span>
            {spikeCount > 0 && (
              <span style={{ fontSize: 11, color: 'var(--accent-danger)', fontWeight: 600 }}>
                {spikeCount} spike{spikeCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </BentoCard>
  );
}
