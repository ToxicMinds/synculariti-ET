'use client';

import { useState, useEffect } from 'react';
import { BentoCard } from './BentoCard';

export function CommandCenter({ onScan, onManual }: { onScan: () => void, onManual: (item: string) => void }) {
  const [frequent, setFrequent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFrequent();
  }, []);

  async function fetchFrequent() {
    try {
      const response = await fetch('/api/ai/insight');
      const data = await response.json();
      if (data.success && data.facts) {
        setFrequent(data.facts.map((f: any) => f.merchant));
      }
    } catch (e) {
      console.error("Failed to fetch frequent merchants:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <BentoCard title="Command Center" colSpan={4}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            className="btn btn-primary" 
            style={{ flex: 1, height: 48, fontSize: 16 }}
            onClick={onScan}
          >
            📸 Scan
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ flex: 1, height: 48 }}
            onClick={() => onManual('')}
          >
            ➕ Manual
          </button>
        </div>

        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.05em' }}>
            ⚡ Frequent Merchants
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {loading ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Learning your habits...</div>
            ) : frequent.length > 0 ? (
              frequent.map((item) => (
                <button 
                  key={item}
                  onClick={() => onManual(item)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  {item}
                </button>
              ))
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No frequent items found yet.</div>
            )}
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
