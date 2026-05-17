'use client';

import { BentoCard } from '@/components/BentoCard';
import { calcOperatingMargin } from '../lib/finance';

interface OperatingMarginProps {
  income: number;
  spent: number;
  goal?: number; // Kept for backward compatibility but overridden by B2B standards
}

export function OperatingMargin({ income, spent }: OperatingMarginProps) {
  // Enforce Slovak HORECA standard 15% target
  const metrics = calcOperatingMargin(income, spent, 15);
  const { retainedEarnings, marginPercentage, targetBenchmark } = metrics;
  
  const isNegative = retainedEarnings < 0;
  
  // Dynamic color palette based on B2B benchmark thresholds (12% survival, 15% gold)
  let statusColor = 'var(--accent-danger)'; // < 12%
  let statusLabel = 'Deficit / Critical';
  let progressBackground = 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)';
  
  if (marginPercentage >= 15) {
    statusColor = 'var(--accent-success)'; // >= 15%
    statusLabel = 'Gold Standard Met';
    progressBackground = 'linear-gradient(90deg, #10b981 0%, #34d399 100%)';
  } else if (marginPercentage >= 12) {
    statusColor = 'var(--accent-warn)'; // 12% - 15%
    statusLabel = 'Survival Threshold';
    progressBackground = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
  }

  // Calculate percentage progression for the visual bar (normalized to 0-100)
  const visualProgress = Math.min(100, Math.max(0, marginPercentage > 0 ? (marginPercentage / targetBenchmark) * 100 : 0));

  return (
    <BentoCard title="Operating Margin" colSpan={4}>
      <div style={{ 
        position: 'relative', 
        height: 160, 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center',
        gap: '4px'
      }}>
        {/* KPI Value Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <div style={{ 
            fontSize: 32, 
            fontWeight: 600, 
            color: statusColor,
            letterSpacing: '-0.02em',
            transition: 'color 0.3s ease'
          }}>
            {marginPercentage.toFixed(1)}%
          </div>
          <span style={{ 
            fontSize: '11px', 
            fontWeight: 600, 
            padding: '2px 8px', 
            borderRadius: '12px', 
            background: 'var(--bg-secondary)', 
            color: statusColor,
            textTransform: 'uppercase',
            letterSpacing: '0.02em'
          }}>
            {statusLabel}
          </span>
        </div>

        {/* Retained Earnings Context */}
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '2px 0 0 0' }}>
          €{retainedEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {isNegative ? ' Net Deficit' : ' Cash Retained'}
          </span>
        </p>

        {/* B2B Benchmark Bar & Indicator */}
        <div style={{ marginTop: 20 }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            fontSize: 11, 
            color: 'var(--text-secondary)', 
            marginBottom: 6,
            fontWeight: 500
          }}>
            <span>Bratislava target: {targetBenchmark}%</span>
            <span>{visualProgress.toFixed(0)}% to Goal</span>
          </div>
          
          {/* Progress track */}
          <div style={{ 
            width: '100%', 
            height: 6, 
            background: 'var(--bg-secondary)', 
            borderRadius: 3, 
            overflow: 'hidden',
            position: 'relative'
          }}>
            {/* Survival threshold line indicator at 12% margin (80% of target) */}
            <div style={{
              position: 'absolute',
              left: '80%',
              top: 0,
              width: '2px',
              height: '100%',
              background: 'var(--border-color)',
              zIndex: 2
            }} title="12% HORECA Survival Threshold" />

            <div style={{ 
              width: `${visualProgress}%`, 
              height: '100%', 
              background: progressBackground,
              transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }} />
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
