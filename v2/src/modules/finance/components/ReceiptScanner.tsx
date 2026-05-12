'use client';

import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { BentoCard } from '@/components/BentoCard';
import { CategorySelector } from '@/components/CategorySelector';
import { CategoryPill } from '@/components/CategoryPill';

import { fetchWithRetry } from '@/lib/utils';
import { Logger } from '@/lib/logger';
import { DEFAULT_CATEGORIES } from '@/lib/constants';
import { extractUniversal, parseEkasaError } from '@/lib/ekasa-protocols';
import styles from './ReceiptScanner.module.css';

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
  ico?: string | null;
  receiptNumber?: string | null;
  transactedAt?: string | null;
  vatDetail?: any;
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
        scanner.clear().catch(error => Logger.system('ERROR', 'Scanner', 'Failed to clear QR scanner instance', { error }));
      };
    }
  }, [step]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep('processing');
    setLoading(true);
    setError('');

    try {
      // 1. Convert to Base64 for Groq Vision
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64 = await base64Promise;

      // 2. Call our new AI Invoice Parser (Stage 0-2)
      const response = await fetch('/api/ai/parse-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image: base64, 
          categories 
        })
      });

      const result = await response.json();

      if (!result.success) {
        if (result.triage === 'REJECTED') {
          throw new Error(`Invalid Document: ${result.message}`);
        }
        throw new Error(result.error || 'Failed to parse invoice');
      }

      const parsed = result.data;
      setReceipt({
        store: parsed.store || 'Unknown Store',
        date: parsed.date || new Date().toISOString().split('T')[0],
        total: parsed.total || 0,
        items: (parsed.items || []).map((it: any) => ({
          ...it,
          selected: true
        })),
        ico: parsed.ico,
        receiptNumber: parsed.receiptNumber,
        transactedAt: parsed.transactedAt,
        vatDetail: parsed.vatDetail
      });

      setStep('review');
    } catch (e: any) {
      setError(e.message);
      setStep('scan');
      Logger.system('ERROR', 'Scanner', 'AI Invoice scan failure', e);
    } finally {
      setLoading(false);
    }
  }

  async function onScanSuccess(decodedText: string) {
    setStep('processing');
    setLoading(true);
    setError('');

    try {
      // 1. Extract eKasa ID from QR text (Using Protocol Intelligence)
      const receiptId = extractUniversal(decodedText);
      if (!receiptId) throw new Error("Could not find a valid eKasa ID in this QR code.");

      // 2. Fetch from Portable API Route (Regionally pinned to EU)
      const payload = typeof receiptId === 'string' 
        ? { receiptId } 
        : { okpData: receiptId };

      const response = await fetchWithRetry(`/api/ekasa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const humanMessage = parseEkasaError(response.status, errorData.detail);
        throw new Error(humanMessage);
      }
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
        })),
        ico: parsed.ico,
        receiptNumber: parsed.receiptNumber,
        transactedAt: parsed.transactedAt,
        vatDetail: parsed.vatDetail
      });
      
      if (!parsed.date) {
        Logger.system('WARN', 'Scanner', 'Date missing from eKasa response — falling back to today', {});
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
    if (m) return m[0].toUpperCase();
    const mUrl = txt.match(/id=([0-9A-F]{32})/i);
    if (mUrl && mUrl[1]) return 'O-' + mUrl[1].toUpperCase();
    return null;
  }

  if (step === 'processing') {
    return (
      <BentoCard title={isSaving ? "Finalizing..." : "Processing Document"}>
        <div className={styles.processingContainer}>
          <div className={`spinner ${styles.spinner}`}></div>
          <p>{isSaving ? "Analyzing & Storing your record..." : "Running AI Document Triage & Extraction..."}</p>
        </div>
      </BentoCard>
    );
  }

  if (isSaving) {
    return (
      <BentoCard title="Saving Expense">
        <div className={styles.processingContainer}>
          <div className={`spinner ${styles.spinner}`}></div>
          <p className={styles.savingText}>Analyzing & Storing...</p>
          <p className={styles.savingSubtext}>This will only take a moment.</p>
        </div>
      </BentoCard>
    );
  }

  if (step === 'review' && receipt) {
    return (
      <BentoCard title={`Review: ${receipt.store}`}>
        <div style={{ marginBottom: 20 }}>
          <p className={styles.reviewDate}>Date: {receipt.date}</p>
          
          <div style={{ marginTop: 12 }}>
            <p className={styles.whoPaidLabel}>Who paid?</p>
            <div className={styles.whoPaidContainer}>
              {Object.entries(names).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => setPayerId(id)}
                  className={`${styles.payerBtn} ${payerId === id ? styles.payerBtnActive : styles.payerBtnInactive}`}
                >
                  {name as string}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.itemsContainer}>
          {receipt.items.map((item, i) => (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemLeft}>
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
                  <div className={styles.itemName}>{item.name}</div>
                  <select 
                    value={item.category} 
                    onChange={(e) => {
                      const next = [...receipt.items];
                      next[i].category = e.target.value;
                      setReceipt({ ...receipt, items: next });
                    }}
                    className={styles.itemCategorySelect}
                  >
                    {categories.length > 0 ? (
                      categories.map((c: string) => <option key={c} value={c}>{c}</option>)
                    ) : (
                      <option value={item.category}>{item.category}</option>
                    )}
                  </select>
                </div>
              </div>
              <div className={styles.itemAmount}>€{item.amount.toFixed(2)}</div>
            </div>
          ))}
        </div>

        {/* Global Add Category for Scanner Review */}
        {onAddCategory && (
          <div className={styles.missingCategoryContainer}>
            <p className={styles.missingCategoryLabel}>Missing a category?</p>
            <div className={styles.missingCategoryInputContainer}>
              <input 
                id="scanner-new-cat"
                placeholder="New category name..."
                className={styles.missingCategoryInput}
              />
              <button 
                className={`btn btn-primary ${styles.missingCategoryBtn}`}
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

        <div className={styles.totalContainer}>
          <span className={styles.totalLabel}>Total selected:</span>
          <span className={styles.totalAmount}>
            €{receipt.items.filter(i => i.selected).reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)}
          </span>
        </div>

        <div className={styles.actionButtons}>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Confirm & Save'}
          </button>
          <button className="btn btn-secondary" onClick={() => setStep('scan')} disabled={isSaving}>Cancel</button>
        </div>
        {error && <div className={styles.errorMessage}>{error}</div>}
      </BentoCard>
    );
  }

  return (
    <BentoCard title="Business Intelligence Scanner">
      {error && <div className="status-badge status-danger" style={{ marginBottom: 16, width: '100%', justifyContent: 'center', padding: 12 }}>{error}</div>}
      
      <div className="flex-col gap-4">
        <div id="qr-reader" className={styles.qrContainer}></div>
        
        <div className={styles.dividerContainer}>
          <div className={styles.dividerLine} />
          <span className={styles.dividerText}>OR SCAN INVOICE</span>
          <div className={styles.dividerLine} />
        </div>

        <label className={`btn btn-primary flex-center gap-2 ${styles.captureLabel}`}>
          <span className={styles.captureIcon}>📷</span>
          <span className={styles.captureText}>Capture B2B Invoice</span>
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
        </label>

        <p className={styles.helpText}>
          Point camera at an **eKasa QR** code for instant deterministic sync, <br />
          or **capture a full invoice** for AI-powered multi-stage extraction.
        </p>
      </div>
    </BentoCard>
  );
}
