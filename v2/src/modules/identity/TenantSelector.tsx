'use client';

import { AvailableTenant } from './useIdentity';

interface Props {
  tenants: AvailableTenant[];
  onSelect: (id: string) => void;
  onJoinNew: () => void;
}

export function TenantSelector({ tenants, onSelect, onJoinNew }: Props) {
  return (
    <div className="flex-center" style={{ minHeight: '80vh', padding: 24 }}>
      <div className="glass-card" style={{ maxWidth: 480, width: '100%', padding: 40, borderRadius: 28, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--bg-hover)', margin: '0 auto 24px', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
          🏢
        </div>
        
        <h1 className="text-gradient" style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Select Organization</h1>
        <p className="card-subtitle" style={{ marginBottom: 32 }}>We found you in {tenants.length} organizations</p>

        <div className="flex-col gap-3" style={{ marginBottom: 32 }}>
          {tenants.map(t => (
            <button 
              key={t.tenant_id}
              className="btn btn-secondary"
              onClick={() => onSelect(t.tenant_id)}
              style={{ 
                width: '100%', 
                padding: '20px', 
                textAlign: 'left', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                borderRadius: 16
              }}
            >
              <div className="flex-col" style={{ alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{t.tenant_name}</span>
                <span style={{ fontSize: 12, opacity: 0.6 }}>@{t.tenant_handle}</span>
              </div>
              <div className="status-badge status-primary" style={{ fontSize: 10 }}>{t.user_role}</div>
            </button>
          ))}
        </div>

        <div className="flex-row items-center gap-2" style={{ justifyContent: 'center' }}>
          <span className="card-subtitle" style={{ fontSize: 13 }}>Looking for another?</span>
          <button 
            onClick={onJoinNew}
            style={{ 
              background: 'none', 
              border: 'none', 
              fontSize: 13, 
              color: 'var(--accent-primary)', 
              fontWeight: 700, 
              cursor: 'pointer' 
            }}
          >
            Join via Code →
          </button>
        </div>
      </div>
    </div>
  );
}
