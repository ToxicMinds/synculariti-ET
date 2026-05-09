'use client';

import { useState, useEffect } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { BentoCard } from '@/components/BentoCard';
import Link from 'next/link';

export default function SettingsPage() {
  const { tenant, updateState, loading } = useTenant();
  const [names, setNames] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // SECURITY: Redirect to home if unauthenticated
  useEffect(() => {
    if (!loading && !tenant) {
      window.location.href = '/';
    }
  }, [loading, tenant]);

  useEffect(() => {
    if (tenant) {
      setNames(tenant.names);
      setEmails(tenant.emails || {});
      setBudgets(tenant.budgets);
    }
  }, [tenant]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateState({ names, emails, budgets });
      alert('Organization settings updated successfully!');
    } catch (e) {
      alert('Error saving settings: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateMemberName = (id: string, name: string) => {
    setNames({ ...names, [id]: name });
  };

  const updateMemberEmail = (id: string, email: string) => {
    setEmails({ ...emails, [id]: email });
  };

  const updateBudget = (cat: string, limit: number) => {
    setBudgets({ ...budgets, [cat]: limit });
  };

  const addMember = () => {
    const currentKeys = Object.keys(names);
    let nextIdNum = 1;
    while (currentKeys.includes(`u${nextIdNum}`)) {
      nextIdNum++;
    }
    const nextId = `u${nextIdNum}`;
    setNames({ ...names, [nextId]: `Staff Member ${nextIdNum}` });
    setEmails({ ...emails, [nextId]: '' });
  };

  const totalMonthlyLimit = Object.values(budgets).reduce((a, b) => a + Number(b), 0);

  if (loading || !tenant) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading Settings...</div>;

  return (
    <main style={{ padding: '24px', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <header style={{ maxWidth: 1000, margin: '0 auto', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: 28, fontWeight: 800 }}>Tenant Settings</h1>
          <p className="card-subtitle">Manage organization structure, team access, and financial limits.</p>
        </div>
        <Link href="/" className="btn btn-secondary">← Back to Dashboard</Link>
      </header>

      <div style={{ maxWidth: 1000, margin: '0 auto' }} className="bento-grid">
        
        {/* ROW 1: FINANCIAL LIMITS SUMMARY */}
        <BentoCard colSpan={12} title="Operating Spending Limits">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <div>
              <p className="card-subtitle" style={{ fontSize: 13, marginBottom: 4 }}>Total Monthly Spending Cap</p>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em' }}>€{totalMonthlyLimit.toFixed(2)}</div>
            </div>
            <div className="glass-card" style={{ padding: '12px 20px', borderRadius: 16, textAlign: 'center' }}>
              <div className="card-subtitle" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>Expense Lines</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{Object.keys(budgets).length}</div>
            </div>
          </div>
        </BentoCard>

        {/* ROW 2: CATEGORY & LIMIT MANAGEMENT */}
        <BentoCard colSpan={12} title="Financial Categories & Caps">
          <p className="card-subtitle" style={{ marginBottom: 20 }}>
            Define spending thresholds for specific operational areas.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {Object.entries(budgets).map(([cat, limit]) => (
              <div 
                key={cat} 
                className="btn btn-secondary"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '12px 16px', 
                  cursor: 'default',
                  textAlign: 'left'
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700 }}>{cat}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>€</span>
                  <input 
                    type="number" 
                    value={limit} 
                    onChange={(e) => updateBudget(cat, Number(e.target.value))}
                    style={{ width: 90, padding: '6px', borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.2)', color: 'white', textAlign: 'right', fontSize: 14 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </BentoCard>

        {/* ROW 3: TEAM & ACCESS */}
        <BentoCard colSpan={12} title="Organization Team">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <p className="card-subtitle" style={{ marginBottom: 16 }}>Grant administrative or viewer access to staff members.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {Object.entries(names).map(([id, name]) => (
                  <div key={id} className="glass-card" style={{ flex: '1 1 300px', display: 'flex', gap: 12, alignItems: 'center', padding: '16px', borderRadius: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--accent-primary)', border: '1px solid var(--border-color)' }}>
                      {id.replace('u', '')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => updateMemberName(id, e.target.value)}
                        placeholder="Staff Member Name"
                        style={{ width: '100%', background: 'transparent', border: 'none', fontSize: 14, fontWeight: 700, padding: 0, color: 'var(--text-primary)' }}
                      />
                      <input 
                        type="email" 
                        value={emails[id] || ''} 
                        onChange={(e) => updateMemberEmail(id, e.target.value)}
                        placeholder="business@email.com"
                        style={{ width: '100%', background: 'transparent', border: 'none', fontSize: 12, color: 'var(--text-muted)', padding: 0, marginTop: 4 }}
                      />
                    </div>
                  </div>
                ))}
                <button 
                  onClick={addMember} 
                  className="btn btn-secondary" 
                  style={{ flex: '1 1 300px', padding: '16px', fontSize: 13, borderStyle: 'dashed', borderRadius: 16 }}
                >
                  ➕ Add Team Member
                </button>
              </div>
            </div>

            {/* TECHNICAL METADATA */}
            <div style={{ paddingTop: 20, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <span className="card-subtitle" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>Tenant Handle</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-primary)', marginTop: 2 }}>@{tenant.handle}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="card-subtitle" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>System Reference</span>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{tenant.tenant_id}</div>
              </div>
            </div>
          </div>
        </BentoCard>

        {/* ROW 4: SAVE ACTION */}
        <BentoCard colSpan={12}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-primary" 
              style={{ padding: '14px 48px', fontSize: 15, borderRadius: 16 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Synchronizing...' : 'Save All Changes'}
            </button>
          </div>
        </BentoCard>

      </div>
    </main>
  );
}
