'use client';

import { BentoCard } from './BentoCard';

const QUICK_ACTIONS = [
  { label: '🛒 Groceries', category: 'Groceries' },
  { label: '☕ Coffee', category: 'Dining out' },
  { label: '⛽ Fuel', category: 'Transport' },
  { label: '🍽️ Dining', category: 'Dining out' },
  { label: '🚇 Transport', category: 'Transport' },
];

export function CommandCenter({ onScan, onManual, onStatement }: { onScan: () => void, onManual: (item?: {category?: string}) => void, onStatement: () => void }) {
  return (
    <BentoCard title="Command Center" colSpan={4}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            className="btn btn-primary" 
            style={{ flex: 1, height: 48, fontSize: 16, padding: '0 8px' }}
            onClick={onScan}
          >
            📸 Scan
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ flex: 1, height: 48, padding: '0 8px' }}
            onClick={() => onManual()}
          >
            ➕ Manual
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ flex: 1, height: 48, padding: '0 8px', background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
            onClick={onStatement}
            title="AI Statement Analyzer"
          >
            🧠 File
          </button>
        </div>

        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.05em' }}>
            ⚡ Quick Add
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {QUICK_ACTIONS.map((action) => (
              <button 
                key={action.label}
                onClick={() => onManual({ category: action.category })}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
