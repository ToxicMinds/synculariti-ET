'use client';

import { useState } from 'react';

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  selected?: boolean;
}

interface StatementScannerProps {
  names: Record<string, string>;
  categories: string[];
  selectedUser: string;
  onSave: (transactions: any[], whoId: string, whoName: string) => Promise<void>;
  onClose: () => void;
}

export function StatementScanner({ names, categories, selectedUser, onSave, onClose }: StatementScannerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [whoId, setWhoId] = useState(selectedUser || Object.keys(names)[0] || '');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    try {
      const text = await file.text();
      const res = await fetch('/api/ai/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, categories })
      });
      const data = await res.json();
      
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to parse statement');
      
      setTransactions(data.transactions.map((t: any) => ({ ...t, selected: true })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (index: number) => {
    const newTx = [...transactions];
    newTx[index].selected = !newTx[index].selected;
    setTransactions(newTx);
  };

  const handleSave = async () => {
    const selectedTx = transactions.filter(t => t.selected);
    if (selectedTx.length === 0) return;
    
    setLoading(true);
    try {
      await onSave(selectedTx, whoId, names[whoId]);
      onClose();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="tooltip-overlay" onClick={onClose}>
      <div className="tooltip-modal" style={{ maxWidth: 600, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🧠 AI Statement Analyzer</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)' }}>×</button>
        </div>

        {transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div className="spinner" />
                <p style={{ color: 'var(--text-secondary)' }}>Groq AI is analyzing your statement...</p>
              </div>
            ) : (
              <>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
                  Upload a CSV or TXT bank statement. The AI will extract and categorize all transactions automatically.
                </p>
                <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                  Choose File
                  <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
                </label>
              </>
            )}
            {error && <p style={{ color: 'var(--accent-danger)', marginTop: 16, fontSize: 14 }}>{error}</p>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Review the extracted transactions before saving.</p>
            
            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              {transactions.map((tx, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderBottom: '1px solid var(--border-color)',
                  background: tx.selected ? 'transparent' : 'var(--bg-hover)',
                  opacity: tx.selected ? 1 : 0.6
                }}>
                  <input 
                    type="checkbox" 
                    checked={tx.selected} 
                    onChange={() => toggleSelect(idx)} 
                    style={{ width: 16, height: 16 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tx.description}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                      <span>{tx.date}</span>
                      <span>•</span>
                      <span>{tx.category}</span>
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>€{Number(tx.amount).toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Assign To</label>
                <select 
                  value={whoId} 
                  onChange={e => setWhoId(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                >
                  {Object.entries(names).map(([id, name]) => (
                    <option key={id} value={id}>{name as string}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setTransactions([])}>Reset</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                  {loading ? 'Saving...' : `Save ${transactions.filter(t => t.selected).length} Items`}
                </button>
              </div>
            </div>
            {error && <p style={{ color: 'var(--accent-danger)', fontSize: 13 }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
