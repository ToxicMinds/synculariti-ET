'use client';

import { useState } from 'react';
import { labelStyle, inputStyle } from './formStyles';

interface ManualEntryProps {
  defaultDescription?: string;
  defaultCategory?: string;
  household: any;
  selectedUser: string;
  onSave: (entry: {
    description: string;
    merchant: string;
    amount: number;
    category: string;
    who_id: string;
    who: string;
    date: string;
  }) => Promise<void>;
  onClose: () => void;
}

export function ManualEntryModal({ defaultDescription, defaultCategory, household, selectedUser, onSave, onClose }: ManualEntryProps) {
  const [description, setDescription] = useState(defaultDescription || '');
  // Merchant is the STORE name for Neo4j graph accuracy (e.g. "Lidl")
  // Defaults to empty — falls back to description on save if not provided
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');

  const names = household.names || {};
  const categories = household.budgets ? Object.keys(household.budgets) : ['Groceries', 'Food', 'Transport'];

  const [category, setCategory] = useState(defaultCategory || '');
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
    if (!category) {
      setError('Please select a category.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        description,
        // Use the explicit merchant name if provided; otherwise fall back to description
        // This feeds into Neo4j for accurate merchant graph data
        merchant: merchant.trim() || description.trim() || 'Unknown Merchant',
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
          {/* Row: Store + Description */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Store / Merchant</label>
              <input
                style={inputStyle}
                value={merchant}
                onChange={e => setMerchant(e.target.value)}
                placeholder="e.g. Lidl"
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Description <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input
                style={inputStyle}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Weekly groceries"
              />
            </div>
          </div>

          {/* Row: Amount + Date */}
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

          {/* Row: Category + Person */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">— select —</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
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
