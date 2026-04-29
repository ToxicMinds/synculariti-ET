'use client';

import { useState } from 'react';

const CATEGORIES = [
  'Groceries','Food','Transport','Housing','Utilities',
  'Health','Clothing','Entertainment','Savings','Adjustment','Other'
];

interface ManualEntryProps {
  defaultDescription?: string;
  names: Record<string, string>;
  selectedUser: string;
  onSave: (entry: { description: string; amount: number; category: string; who_id: string; who: string; date: string }) => Promise<void>;
  onClose: () => void;
}

export function ManualEntryModal({ defaultDescription, names, selectedUser, onSave, onClose }: ManualEntryProps) {
  const [description, setDescription] = useState(defaultDescription || '');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [who_id, setWhoId] = useState(selectedUser || Object.keys(names)[0] || '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        description,
        amount: Number(amount),
        category,
        who_id,
        who: names[who_id] || '',
        date
      });
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tooltip-overlay" onClick={onClose}>
      <div className="tooltip-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Add Expense</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)' }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Description</label>
            <input
              style={inputStyle}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Lidl groceries"
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Amount (€)</label>
              <input
                style={inputStyle}
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input
                style={inputStyle}
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Person</label>
              <select style={inputStyle} value={who_id} onChange={e => setWhoId(e.target.value)}>
                {Object.entries(names).map(([id, name]) => (
                  <option key={id} value={id}>{name as string}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p style={{ fontSize: 13, color: 'var(--accent-danger)' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
              {saving ? 'Saving…' : '✓ Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
