'use client';

import React from 'react';
import { useStatementScanner, ParsedTransaction } from '../hooks/useStatementScanner';
import { AppState } from '@/modules/identity/hooks/useTenant';

interface StatementScannerProps {
  names: Record<string, string>;
  categories: string[];
  selectedUser: string;
  onSave: (transactions: ParsedTransaction[], whoId: string, whoName: string) => Promise<void>;
  onClose: () => void;
}

export function StatementScanner({ names, categories, selectedUser, onSave, onClose }: StatementScannerProps) {
  const scanner = useStatementScanner({
    categories,
    names,
    onSave,
    onClose
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) scanner.processFile(file);
  };

  return (
    <div className="tooltip-overlay" onClick={onClose}>
      <div className="tooltip-modal" style={{ maxWidth: 600, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>🧠 AI Statement Analyzer</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)' }}>×</button>
        </div>

        {scanner.step === 'upload' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
              Upload a CSV or TXT bank statement. The AI will extract and categorize all transactions automatically.
            </p>
            <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-block' }}>
              Choose File
              <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
            {scanner.error && <p style={{ color: 'var(--accent-danger)', marginTop: 16, fontSize: 14 }}>{scanner.error}</p>}
          </div>
        )}

        {scanner.step === 'processing' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div className="spinner" />
              <p style={{ color: 'var(--text-secondary)' }}>
                Groq AI is analyzing your statement...
              </p>
              <div style={{ width: '100%', maxWidth: 300, height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ 
                  width: `${(scanner.progress.chunksComplete / scanner.progress.chunksTotal) * 100}%`, 
                  height: '100%', 
                  background: 'var(--accent-primary)', 
                  transition: 'width 0.3s' 
                }} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Processing chunk {scanner.progress.chunksComplete} of {scanner.progress.chunksTotal}
              </p>
            </div>
          </div>
        )}

        {(scanner.step === 'review' || scanner.step === 'reconciling') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Review the extracted transactions before saving.</p>
            
            <div style={{ maxHeight: 350, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              {scanner.transactions.map((tx, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderBottom: '1px solid var(--border-color)',
                  background: tx.selected ? 'transparent' : 'var(--bg-hover)',
                  opacity: tx.selected ? 1 : 0.6
                }}>
                  <input 
                    type="checkbox" 
                    checked={tx.selected} 
                    onChange={() => scanner.toggleRow(idx)} 
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

            {/* Reconciliation Section */}
            <div style={{ 
              background: 'var(--bg-secondary)', 
              padding: '16px', 
              borderRadius: 12, 
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Declared Total (€)</label>
                  <input 
                    type="number"
                    step="0.01"
                    placeholder="From bank header"
                    onChange={(e) => scanner.setDeclaredTotal(e.target.value ? parseFloat(e.target.value) : null)}
                    style={{ 
                      padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', 
                      background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, 
                      width: 140, outline: 'none' 
                    }}
                  />
                </div>
                <button 
                  type="button"
                  className="btn btn-secondary" 
                  onClick={() => scanner.reconcile()}
                  disabled={scanner.transactions.filter(t => t.selected).length === 0}
                >
                  Verify Totals
                </button>
              </div>

              {scanner.reconciliation && (
                <div style={{ 
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, 
                  paddingTop: 12, borderTop: '1px solid var(--border-color)' 
                }}>
                  <div>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Extracted</span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>€{scanner.reconciliation.extractedTotal.toFixed(2)}</span>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Difference</span>
                    <span style={{ 
                      fontSize: 15, fontWeight: 700, 
                      color: scanner.reconciliation.isBalanced ? '#10b981' : '#ef4444' 
                    }}>
                      €{scanner.reconciliation.delta.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Unmatched</span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{scanner.reconciliation.unmatched}</span>
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Assign To</label>
                <select 
                  value={scanner.whoId} 
                  onChange={e => scanner.setWhoId(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                >
                  {Object.entries(names).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => scanner.reset()}>Reset</button>
                <button 
                  type="button"
                  className="btn btn-primary" 
                  onClick={() => scanner.confirmAndSave()} 
                  disabled={scanner.isSaving || scanner.transactions.filter(t => t.selected).length === 0}
                >
                  {scanner.isSaving ? 'Saving...' : `Save ${scanner.transactions.filter(t => t.selected).length} Items`}
                </button>
              </div>
            </div>
            {scanner.error && <p style={{ color: 'var(--accent-danger)', fontSize: 13 }}>{scanner.error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
