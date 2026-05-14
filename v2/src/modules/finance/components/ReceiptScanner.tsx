'use client';

import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { BentoCard } from '@/components/BentoCard';
import { Logger } from '@/lib/logger';
import { DEFAULT_CATEGORIES } from '@/lib/constants';
import { useScannerState, UseScannerStateReturn, ReceiptData } from '../hooks/useScannerState';
import styles from './ReceiptScanner.module.css';

interface ReceiptScannerProps {
  onSave: (data: ReceiptData, whoId: string) => Promise<void>;
  onAddCategory?: (name: string) => Promise<void>;
  categories?: string[];
  names?: Record<string, string>;
}

export function ReceiptScanner({ 
  onSave,
  onAddCategory,
  categories = DEFAULT_CATEGORIES,
  names = {}
}: ReceiptScannerProps) {
  const scanner = useScannerState({ categories, names, onSave });

  if (scanner.step === 'processing' || scanner.isSaving) {
    return <ProcessingStep isSaving={scanner.isSaving} />;
  }

  if (scanner.step === 'review' && scanner.receipt) {
    return (
      <ReviewStep 
        scanner={scanner} 
        names={names} 
        categories={categories} 
        onAddCategory={onAddCategory} 
      />
    );
  }

  return <ScanStep scanner={scanner} />;
}

// --- SUB-COMPONENTS ---

function ProcessingStep({ isSaving }: { isSaving: boolean }) {
  return (
    <BentoCard title={isSaving ? "Finalizing..." : "Processing Document"}>
      <div className={styles.processingContainer}>
        <div className={`spinner ${styles.spinner}`}></div>
        <p>{isSaving ? "Analyzing & Storing your record..." : "Running AI Document Triage & Extraction..."}</p>
      </div>
    </BentoCard>
  );
}

function ScanStep({ scanner }: { scanner: UseScannerStateReturn }) {
  useEffect(() => {
    const html5Scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    html5Scanner.render(
      (decodedText) => {
        // Clear the scanner instance quickly to avoid duplicate scanning
        html5Scanner.clear().catch(e => Logger.system('WARN', 'Scanner', 'Clear failed', { error: String(e) }));
        scanner.processEkasaQr(decodedText);
      },
      () => {} // Ignore continuous scan failures
    );

    return () => {
      html5Scanner.clear().catch(e => Logger.system('WARN', 'Scanner', 'Clear failed on unmount', { error: String(e) }));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      scanner.processInvoiceFile(file);
    }
  };

  return (
    <BentoCard title="Business Intelligence Scanner">
      {scanner.error && (
        <div className="status-badge status-danger" style={{ marginBottom: 16, width: '100%', justifyContent: 'center', padding: 12 }}>
          {scanner.error}
        </div>
      )}
      
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

function ReviewStep({ 
  scanner, 
  names, 
  categories, 
  onAddCategory 
}: { 
  scanner: UseScannerStateReturn;
  names: Record<string, string>;
  categories: string[];
  onAddCategory?: (name: string) => Promise<void>;
}) {
  const { receipt, payerId, setPayerId, updateReceiptItem, confirmAndSave, reset, isSaving, error, isVerified } = scanner;

  if (!receipt) return null;

  return (
    <BentoCard title={`Review: ${receipt.store}`}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className={styles.reviewDate}>Date: {receipt.date}</p>
          {isVerified ? (
            <span className="status-badge status-success" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Verified eKasa</span>
          ) : (
            <span className="status-badge status-warning" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Estimated (AI)</span>
          )}
        </div>
        
        <div style={{ marginTop: 12 }}>
          <p className={styles.whoPaidLabel}>Who paid?</p>
          <div className={styles.whoPaidContainer}>
            {Object.entries(names).map(([id, name]) => (
              <button
                key={id}
                onClick={() => setPayerId(id)}
                className={`${styles.payerBtn} ${payerId === id ? styles.payerBtnActive : styles.payerBtnInactive}`}
              >
                {name}
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
                onChange={() => updateReceiptItem(i, { selected: !item.selected })}
              />
              <div>
                <div className={styles.itemName}>{item.name}</div>
                <select 
                  value={item.category || ''} 
                  onChange={(e) => updateReceiptItem(i, { category: e.target.value })}
                  className={styles.itemCategorySelect}
                >
                  <option value="">Select category...</option>
                  {categories.length > 0 ? (
                    categories.map((c: string) => <option key={c} value={c}>{c}</option>)
                  ) : (
                    item.category ? <option value={item.category}>{item.category}</option> : null
                  )}
                </select>
              </div>
            </div>
            <div className={item.amount < 0 ? styles.itemAmountNegative : styles.itemAmount}>
              €{item.amount.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

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
        <button className="btn btn-primary" onClick={confirmAndSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Confirm & Save'}
        </button>
        <button className="btn btn-secondary" onClick={reset} disabled={isSaving}>Cancel</button>
      </div>
      {error && <div className={styles.errorMessage}>{error}</div>}
    </BentoCard>
  );
}
