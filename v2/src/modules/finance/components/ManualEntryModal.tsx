'use client';

import React, { useState } from 'react';
import { labelStyle, inputStyle } from '@/components/formStyles';
import { Expense } from '../lib/finance';
import { CategorySelector } from '@/components/CategorySelector';
import { AppState } from '@/modules/identity/hooks/useTenant';

export interface ManualEntryPayload {
  id?: string;
  description: string;
  merchant: string;
  amount: number;
  category: string;
  who_id: string;
  who: string;
  date: string;
}

interface ManualEntryProps {
  prefill?: Partial<Expense> & { merchant?: string };
  tenant: AppState;
  selectedUser: string;
  onSave: (entry: ManualEntryPayload) => Promise<void>;
  onAddCategory?: (name: string) => Promise<void>;
  onClose: () => void;
}

export function ManualEntryModal({ prefill, tenant, selectedUser, onSave, onAddCategory, onClose }: ManualEntryProps) {
  const isEdit = !!prefill?.id;

  const [description, setDescription] = useState(prefill?.description || '');
  const [merchant, setMerchant] = useState(prefill?.merchant || '');
  const [amount, setAmount] = useState(prefill?.amount?.toString() || '');

  const names = tenant.names || {};
  const categories = tenant.categories || [];

  const [category, setCategory] = useState(prefill?.category || '');
  const [who_id, setWhoId] = useState(prefill?.who_id || selectedUser || Object.keys(names)[0] || '');
  const [date, setDate] = useState(prefill?.date || new Date().toISOString().slice(0, 10));
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
        id: prefill?.id,
        description,
        merchant: merchant.trim() || description.trim() || 'Unknown Merchant',
        amount: Number(amount),
        category,
        who_id,
        who: (names as Record<string, string>)[who_id] || '',
        date
      });
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const nameEntries = Object.entries(names as Record<string, string>);

  return (
    <div className="tooltip-overlay" onClick={onClose}>
      <div className="tooltip-modal" style={{ maxWidth: 500, padding: '24px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEdit ? 'Update Expense' : 'Add Expense'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: 'var(--text-muted)' }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Main Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
            <div>
              <label style={{ ...labelStyle, color: 'var(--text-primary)', fontWeight: 600 }}>Store / Merchant</label>
              <input
                style={{ ...inputStyle, fontSize: 15 }}
                value={merchant}
                onChange={e => setMerchant(e.target.value)}
                placeholder="e.g. Lidl"
                autoFocus={!isEdit}
              />
            </div>
            <div>
              <label style={labelStyle}>Description <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input
                style={inputStyle}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Weekly shop"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ ...labelStyle, color: 'var(--text-primary)', fontWeight: 600 }}>Amount (€)</label>
              <input
                style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
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

          {/* Category Pills - The "Nice V1 UX" */}
          <div>
            <label style={labelStyle}>Category</label>
            <select 
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8 }}
            >
              <option value="" disabled>Select category...</option>
              {categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
            <CategorySelector 
              categories={categories}
              selectedCategory={category}
              onSelect={setCategory}
            />

            {/* Quick Add Section - Replicating Scanner's Nice UX */}
            {onAddCategory && (
              <div style={{ 
                marginTop: 8, 
                padding: '10px 12px', 
                background: 'var(--bg-hover)', 
                borderRadius: 12,
                border: '1px dashed var(--border-color)'
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input 
                    id="manual-new-cat"
                    placeholder="New category..."
                    style={{ 
                      flex: 1, 
                      fontSize: 13, 
                      padding: '6px 10px', 
                      borderRadius: 8, 
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                  <button 
                    type="button"
                    className="btn btn-primary"
                    style={{ height: 32, minHeight: 32, fontSize: 12, padding: '0 12px' }}
                    onClick={async () => {
                      const el = document.getElementById('manual-new-cat') as HTMLInputElement;
                      if (el && el.value.trim()) {
                        await onAddCategory(el.value.trim());
                        setCategory(el.value.trim());
                        el.value = '';
                      }
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Person Pills - Fixing attribution speed */}
          <div>
            <label style={labelStyle}>Who is this for?</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {nameEntries.map(([id, name]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setWhoId(id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 12,
                    border: '1px solid',
                    borderColor: who_id === id ? '#10b981' : 'var(--border-color)',
                    background: who_id === id ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)',
                    color: who_id === id ? '#34d399' : 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {error && <p style={{ fontSize: 13, color: 'var(--accent-danger)', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: 8 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '12px' }} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? '✓ Update Expense' : '✓ Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
