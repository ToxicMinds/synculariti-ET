'use client';

import { useState, useEffect } from 'react';
import { BentoCard } from './BentoCard';

export function BudgetHealth({ spent, totalBudget }: { spent: number, totalBudget: number }) {
  const [forecast, setForecast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchForecast();
  }, [spent, totalBudget]);

  async function fetchForecast() {
    setLoading(true);
    try {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysElapsed = now.getDate();

      const response = await fetch('/api/ai/forecast', {
        method: 'POST',
        body: JSON.stringify({
          spent,
          budget: totalBudget,
          daysElapsed,
          daysInMonth
        })
      });
      const data = await response.json();
      setForecast(data.aiForecast);
    } catch (e) {
      setForecast("Calculation pending...");
    } finally {
      setLoading(false);
    }
  }

  const remaining = totalBudget - spent;
  const isOver = remaining < 0;

  return (
    <BentoCard title="Budget Health" colSpan={4}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ fontSize: 32, fontWeight: 600, color: isOver ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
          €{remaining.toFixed(2)}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          {isOver ? 'Over budget' : 'Remaining this month'}
        </p>

        <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--border-color)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
            🤖 AI Forecast
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {loading ? 'Analyzing burn rate...' : forecast}
          </p>
        </div>
      </div>
    </BentoCard>
  );
}
