'use client';

import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { BentoCard } from './BentoCard';
import { CategorySelector } from './CategorySelector';
import { CategoryPill } from './CategoryPill';

import { fetchWithRetry } from '@/lib/utils';
import { Logger } from '@/lib/logger';

import { DEFAULT_CATEGORIES } from '@/lib/constants';

interface ReceiptItem {
  name: string;
  amount: number;
  category: string;
  selected: boolean;
}

interface ReceiptData {
  store: string;
  date: string;
  total: number;
  items: ReceiptItem[];
}

export function ReceiptScanner({ 
  onSave,
  onAddCategory,
  categories = DEFAULT_CATEGORIES,
  names = {}
}: { 
  onSave: (data: ReceiptData, whoId: string) => Promise<void>;
  onAddCategory?: (name: string) => Promise<void>;
  categories?: string[];
  names?: Record<string, string>;
}) {
  const [step, setStep] = useState<'scan' | 'processing' | 'review'>('scan');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [payerId, setPayerId] = useState<string>(Object.keys(names)[0] || '');
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (step === 'scan') {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render(onScanSuccess, onScanFailure);

      return () => {
        scanner.clear().catch(error => console.error("Failed to clear scanner", error));
      };
    }
  }, [step]);

  async function onScanSuccess(decodedText: string) {
    setStep('processing');
    setLoading(true);
    setError('');

    try {
      // 1. Extract eKasa ID from QR text
      const receiptId = extractEkasaId(decodedText);
      if (!receiptId) throw new Error("Could not find a valid eKasa ID in this QR code.");

      // 2. Fetch from Portable API Route (Regionally pinned to EU)
      const response = await fetchWithRetry(`/api/ekasa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId })
      });
      
      if (!response.ok) throw new Error("Failed to fetch receipt data.");
      const ekasaData = await response.json();

      // 3. Categorize with Groq with Retry
      const groqResponse = await fetchWithRetry('/api/ai/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ekasaData, categories })
      });

      if (!groqResponse.ok) throw new Error("AI Categorization failed.");
      const parsed = await groqResponse.json();

      setReceipt({
        store: parsed.store || 'Unknown Store',
        date: parsed.date || new Date().toISOString().split('T')[0],
        total: parsed.total || 0,
        items: (parsed.items || []).map((it: any) => ({
          ...it,
          selected: true
        }))
      });
      
      if (!parsed.date) {
        console.warn("Date missing from eKasa response, falling back to today.");
      }

      setStep('review');
    } catch (e: any) {
      setError(e.message);
      setStep('scan');
      Logger.system('ERROR', 'Scanner', 'eKasa scan failure', e);
    } finally {
      setLoading(false);
    }
  }

  function onScanFailure(error: any) {
    // Quietly ignore scan failures
  }

  async function handleSave() {
    if (!receipt) return;
    setIsSaving(true);
    setError('');
    try {
      // Find name for selected payer
      // We'll pass the whole logic to the parent via onSave if we want to follow current pattern
      // but easier to just let onSave handle the data
      await onSave(receipt, payerId);
      // The parent will usually unmount us on success (setShowScanner(false))
    } catch (e: any) {
      setError(e.message || 'Failed to save receipt.');
      setIsSaving(false);
    }
  }

  function extractEkasaId(txt: string) {
    const m = txt.match(/O-[0-9A-F]{32}/i);
    if (m) return m[0];
    const mUrl = txt.match(/id=([0-9A-F]{32})/i);
    if (mUrl && mUrl[1]) return 'O-' + mUrl[1];
    return null;
  }

  if (step === 'processing') {
    return (
      <BentoCard title={isSaving ? "Finalizing..." : "Processing Receipt"}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="spinner" style={{ marginBottom: 16 }}></div>
          <p>{isSaving ? "Analyzing & Storing your receipt..." : "Fetching eKasa details and running AI categorization..."}</p>
        </div>
      </BentoCard>
    );
  }

  if (isSaving) {
    return (
      <BentoCard title="Saving Expense">
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="spinner" style={{ marginBottom: 16 }}></div>
          <p style={{ fontWeight: 600 }}>Analyzing & Storing...</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>This will only take a moment.</p>
        </div>
      </BentoCard>
    );
  }

  if (step === 'review' && receipt) {
    return (
      <BentoCard title={`Review: ${receipt.store}`}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Date: {receipt.date}</p>
          
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Who paid?</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(names).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => setPayerId(id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1px solid var(--border-color)',
                    background: payerId === id ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                    color: payerId === id ? 'var(--accent-primary-text)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {name as string}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto', marginBottom: 20 }}>
          {receipt.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={item.selected} 
                  onChange={() => {
                    const next = [...receipt.items];
                    next[i].selected = !next[i].selected;
                    setReceipt({ ...receipt, items: next });
                  }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                  <select 
                    value={item.category} 
                    onChange={(e) => {
                      const next = [...receipt.items];
                      next[i].category = e.target.value;
                      setReceipt({ ...receipt, items: next });
                    }}
                    style={{ 
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 20,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-hover)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      marginTop: 4,
                      outline: 'none'
                    }}
                  >
                    {categories.length > 0 ? (
                      categories.map((c: string) => <option key={c} value={c}>{c}</option>)
                    ) : (
                      <option value={item.category}>{item.category}</option>
                    )}
                  </select>
                </div>
              </div>
              <div style={{ fontWeight: 600 }}>€{item.amount.toFixed(2)}</div>
            </div>
          ))}
        </div>

        {/* Global Add Category for Scanner Review */}
        {onAddCategory && (
          <div style={{ marginBottom: 20, padding: 12, background: 'var(--bg-hover)', borderRadius: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Missing a category?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                id="scanner-new-cat"
                placeholder="New category name..."
                style={{ 
                  flex: 1, 
                  fontSize: 12, 
                  padding: '6px 12px', 
                  borderRadius: 8, 
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />
              <button 
                className="btn btn-primary"
                style={{ height: 32, minHeight: 32, fontSize: 12, padding: '0 12px' }}
                onClick={async () => {
                  const el = document.getElementById('scanner-new-cat') as HTMLInputElement;
                  if (el && el.value.trim()) {
                    await onAddCategory(el.value.trim());
                    el.value = '';
                  }
                }}
              >
                + Add
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 600 }}>Total selected:</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>
            €{receipt.items.filter(i => i.selected).reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Confirm & Save'}
          </button>
          <button className="btn btn-secondary" onClick={() => setStep('scan')} disabled={isSaving}>Cancel</button>
        </div>
        {error && <div style={{ color: 'var(--accent-danger)', marginTop: 16, fontSize: 13 }}>{error}</div>}
      </BentoCard>
    );
  }

  return (
    <BentoCard title="Scan Receipt (Slovak eKasa)">
      {error && <div style={{ color: 'var(--accent-danger)', marginBottom: 16 }}>{error}</div>}
      <div id="qr-reader" style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }}></div>
      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
        Point your camera at the QR code on any Slovak fiscal receipt.
      </p>
    </BentoCard>
  );
}
