'use client';

import { useState, useEffect } from 'react';
import { useHousehold } from '@/hooks/useHousehold';
import { BentoCard } from '@/components/BentoCard';
import Link from 'next/link';

export default function SettingsPage() {
  const { household, updateState, loading } = useHousehold();
  const [names, setNames] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // SECURITY: Redirect to home if unauthenticated
  useEffect(() => {
    if (!loading && !household) {
      window.location.href = '/';
    }
  }, [loading, household]);

  useEffect(() => {
    if (household) {
      setNames(household.names);
      setEmails(household.emails || {});
      setBudgets(household.budgets);
    }
  }, [household]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateState({ names, emails, budgets });
      alert('Settings saved successfully!');
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
    // Find the next available uX ID
    const currentKeys = Object.keys(names);
    let nextIdNum = 1;
    while (currentKeys.includes(`u${nextIdNum}`)) {
      nextIdNum++;
    }
    const nextId = `u${nextIdNum}`;
    setNames({ ...names, [nextId]: `New Person ${nextIdNum}` });
    setEmails({ ...emails, [nextId]: '' });
  };

  const totalMonthlyBudget = Object.values(budgets).reduce((a, b) => a + Number(b), 0);

  if (loading || !household) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading Settings...</div>;

  return (
    <main style={{ padding: '24px', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <header style={{ maxWidth: 1000, margin: '0 auto', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Settings</h1>
        <Link href="/" className="btn btn-secondary">← Back to Dashboard</Link>
      </header>

      <div style={{ maxWidth: 1000, margin: '0 auto' }} className="bento-grid">
        
        {/* ROW 1: BUDGET SUMMARY */}
        <BentoCard colSpan={12} title="Monthly Budget Strategy">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Total Household Limit</p>
              <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>€{totalMonthlyBudget.toFixed(2)}</div>
            </div>
            <div style={{ padding: '12px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Categories</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{Object.keys(budgets).length}</div>
            </div>
          </div>
        </BentoCard>

        {/* ROW 2: CATEGORY MANAGEMENT */}
        <BentoCard colSpan={12} title="Budgets & Categories">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Configure the monthly limits for your household spending.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {Object.entries(budgets).map(([cat, limit]) => (
              <div 
                key={cat} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '12px 16px', 
                  background: 'rgba(255,255,255,0.02)', 
                  borderRadius: 10,
                  border: '1px solid var(--border-color)'
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500 }}>{cat}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>€</span>
                  <input 
                    type="number" 
                    value={limit} 
                    onChange={(e) => updateBudget(cat, Number(e.target.value))}
                    style={{ width: 80, padding: '8px', borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', textAlign: 'right', fontSize: 14 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </BentoCard>

        {/* ROW 3: ACCOUNT & ACCESS (DEMOTED) */}
        <BentoCard colSpan={12} title="Account & Access">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Members Section */}
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Family Member Access</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {Object.entries(names).map(([id, name]) => (
                  <div key={id} style={{ flex: '1 1 300px', display: 'flex', gap: 12, alignItems: 'center', padding: '12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                      {id.replace('u', '')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => updateMemberName(id, e.target.value)}
                        placeholder="Name"
                        style={{ width: '100%', background: 'transparent', border: 'none', fontSize: 13, fontWeight: 600, padding: 0 }}
                      />
                      <input 
                        type="email" 
                        value={emails[id] || ''} 
                        onChange={(e) => updateMemberEmail(id, e.target.value)}
                        placeholder="Email"
                        style={{ width: '100%', background: 'transparent', border: 'none', fontSize: 11, color: 'var(--text-muted)', padding: 0, marginTop: 2 }}
                      />
                    </div>
                  </div>
                ))}
                <button 
                  onClick={addMember} 
                  className="btn btn-secondary" 
                  style={{ flex: '1 1 300px', padding: '12px', fontSize: 12, borderStyle: 'dashed' }}
                >
                  + Add Another Member
                </button>
              </div>
            </div>

            {/* Technical Section */}
            <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Household Handle</span>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>@{household.handle}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Internal ID</span>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{household.household_id}</div>
              </div>
            </div>

          </div>
        </BentoCard>

        {/* ROW 4: SAVE ACTION */}
        <BentoCard colSpan={12}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              className="btn btn-primary" 
              style={{ padding: '12px 32px' }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </BentoCard>

      </div>
    </main>
  );
}
