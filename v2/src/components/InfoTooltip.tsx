'use client';

import { useState } from 'react';

interface InfoTooltipProps {
  title: string;
  explanation: string;
  formula?: string;
}

export function InfoTooltip({ title, explanation, formula }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="info-btn" onClick={() => setOpen(true)} title="How is this calculated?">
        i
      </button>

      {open && (
        <div className="tooltip-overlay" onClick={() => setOpen(false)}>
          <div className="tooltip-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
              <button 
                onClick={() => setOpen(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: formula ? 16 : 0 }}>
              {explanation}
            </p>
            {formula && (
              <div style={{ 
                marginTop: 16, 
                padding: '12px 14px', 
                background: 'var(--bg-hover)', 
                borderRadius: 10, 
                fontFamily: 'monospace', 
                fontSize: 12, 
                color: 'var(--text-primary)',
                lineHeight: 1.6
              }}>
                {formula}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
