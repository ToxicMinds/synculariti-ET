'use client';

import { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { BentoCard } from './BentoCard';
import { CategoryPill } from './CategoryPill';

import { fetchWithRetry, systemLog } from '@/lib/utils';

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
  categories = []
}: { 
  onSave: (data: ReceiptData) => Promise<void>;
  categories?: string[];
}) {
  const [step, setStep] = useState<'scan' | 'processing' | 'review'>('scan');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(false);
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
      setStep('review');
    } catch (e: any) {
      setError(e.message);
      setStep('scan');
      systemLog('ekasa_scan_error', e);
    } finally {
      setLoading(false);
    }
  }

  function onScanFailure(error: any) {
    // Quietly ignore scan failures
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
      <BentoCard title="Processing Receipt">
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="spinner" style={{ marginBottom: 16 }}></div>
          <p>Fetching eKasa details and running AI categorization...</p>
        </div>
      </BentoCard>
    );
  }

  if (step === 'review' && receipt) {
    return (
      <BentoCard title={`Review: ${receipt.store}`}>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Date: {receipt.date}</p>
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
                  <CategoryPill category={item.category} />
                </div>
              </div>
              <div style={{ fontWeight: 600 }}>€{item.amount.toFixed(2)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 600 }}>Total selected:</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>
            €{receipt.items.filter(i => i.selected).reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={() => onSave(receipt)} disabled={loading}>
            {loading ? 'Saving...' : 'Confirm & Save'}
          </button>
          <button className="btn btn-secondary" onClick={() => setStep('scan')}>Cancel</button>
        </div>
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
