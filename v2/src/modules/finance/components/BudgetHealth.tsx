'use client';

import { useState, useEffect } from 'react';
import { BentoCard } from '@/components/BentoCard';
import { calcTimeBoundForecast, Transaction } from '../lib/finance';
import { formatCurrency, getErrorMessage } from '@/lib/utils';
import { Logger } from '@/lib/logger';

interface BudgetHealthProps {
  spent: number;
  totalBudget: number;
  transactions?: Transaction[];
  colSpan?: number;
}

export function BudgetHealth({ spent, totalBudget, transactions = [], colSpan = 4 }: BudgetHealthProps) {
  const [aiForecast, setAiForecast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Compute real-time time-bound projection
  const forecastMetrics = calcTimeBoundForecast(transactions, totalBudget);
  const { dailySpendRate, projectedSpend, status } = forecastMetrics;

  const remaining = totalBudget - spent;
  const isOver = remaining < 0;

  // Sync with AI forecast service ONLY when budget is configured
  useEffect(() => {
    if (totalBudget <= 0) {
      setAiForecast(null);
      return;
    }
    fetchForecast();
  }, [spent, totalBudget, transactions]);

  async function fetchForecast() {
    setLoading(true);
    try {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysElapsed = now.getDate();

      const response = await fetch('/api/ai/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spent,
          budget: totalBudget,
          daysElapsed,
          daysInMonth
        })
      });
      
      const data = await response.json();
      setAiForecast(data.aiForecast);
    } catch (e: unknown) {
      Logger.system('ERROR', 'AI', 'Forecast fetch failed', { error: getErrorMessage(e) });
      setAiForecast("AI projection temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  // Design tokens based on forecast status
  let badgeColor = 'var(--text-muted)';
  let badgeLabel = 'Budget Not Configured';
  
  if (status === 'IN_DANGER') {
    badgeColor = 'var(--accent-danger)';
    badgeLabel = 'In Danger';
  } else if (status === 'WARNING') {
    badgeColor = 'var(--accent-warn)';
    badgeLabel = 'Warning';
  } else if (status === 'STABLE') {
    badgeColor = 'var(--accent-success)';
    badgeLabel = 'Stable';
  } else if (status === 'EXCELLENT') {
    badgeColor = '#34d399';
    badgeLabel = 'Excellent';
  }

  return (
    <BentoCard title="Budget Health" colSpan={colSpan}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
        
        {/* Real-time remaining balance & status badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ 
              fontSize: 32, 
              fontWeight: 600, 
              color: isOver ? 'var(--accent-danger)' : 'var(--text-primary)',
              letterSpacing: '-0.02em'
            }}>
              {formatCurrency(remaining)}
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, margin: 0 }}>
              {isOver ? 'Over target budget' : 'Remaining budget limit'}
            </p>
          </div>
          
          <span style={{ 
            fontSize: '10px', 
            fontWeight: 700, 
            padding: '4px 10px', 
            borderRadius: '12px', 
            background: 'var(--bg-secondary)', 
            color: badgeColor,
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            {badgeLabel}
          </span>
        </div>

        {/* Real-time velocity analytics */}
        <div style={{ 
          background: 'var(--bg-secondary)', 
          padding: '12px', 
          borderRadius: '12px', 
          fontSize: '13px', 
          marginTop: '8px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Daily velocity:</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(dailySpendRate)}/day</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Projected end of month:</span>
            <span style={{ fontWeight: 600, color: status === 'IN_DANGER' ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
              {formatCurrency(projectedSpend)}
            </span>
          </div>
        </div>

        {/* 🤖 AI Forecast section */}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
          <p style={{ 
            fontSize: 11, 
            fontWeight: 700, 
            color: 'var(--text-muted)', 
            textTransform: 'uppercase', 
            marginBottom: 8, 
            letterSpacing: '0.05em' 
          }}>
            🤖 AI Forecast
          </p>
          <p style={{ 
            fontSize: 13, 
            color: 'var(--text-secondary)', 
            lineHeight: 1.4,
            margin: 0
          }}>
            {totalBudget <= 0 ? (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Please set a target monthly budget in Settings to activate spatial AI forecasting.
              </span>
            ) : loading ? (
              <span style={{ color: 'var(--text-muted)' }}>Analyzing daily spend patterns...</span>
            ) : (
              aiForecast
            )}
          </p>
        </div>
      </div>
    </BentoCard>
  );
}
