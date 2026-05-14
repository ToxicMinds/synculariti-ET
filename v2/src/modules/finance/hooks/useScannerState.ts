import { useState } from 'react';
import { Logger } from '@/lib/logger';
import { extractUniversal, parseEkasaError } from '@/lib/ekasa-protocols';
import { fetchWithRetry } from '@/lib/utils';

import { ReceiptItem, ReceiptData as BaseReceiptData } from './useTransactionSync';

export type { ReceiptItem };
export type ScannerStep = 'scan' | 'processing' | 'review';

// Extends the canonical ReceiptData from useTransactionSync with scanner-specific source tracking
export interface ReceiptData extends BaseReceiptData {
  source: 'ekasa' | 'ai' | 'manual';
}

export interface UseScannerStateProps {
  categories?: string[];
  names?: Record<string, string>;
  onSave: (data: ReceiptData, payerId: string) => Promise<void>;
}

export interface UseScannerStateReturn {
  step: ScannerStep;
  receipt: ReceiptData | null;
  payerId: string;
  isProcessing: boolean;
  isSaving: boolean;
  isVerified: boolean;
  error: string;
  
  setPayerId: (id: string) => void;
  setStep: (step: ScannerStep) => void;
  updateReceiptItem: (index: number, updates: Partial<ReceiptItem>) => void;
  processInvoiceFile: (file: File) => Promise<void>;
  processEkasaQr: (decodedText: string) => Promise<void>;
  confirmAndSave: () => Promise<void>;
  reset: () => void;
}

export function useScannerState({ categories = [], names = {}, onSave }: UseScannerStateProps): UseScannerStateReturn {
  const [step, setStep] = useState<ScannerStep>('scan');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [payerId, setPayerId] = useState<string>(Object.keys(names)[0] || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('scan');
    setReceipt(null);
    setIsProcessing(false);
    setIsSaving(false);
    setIsVerified(false);
    setError('');
  };

  const processEkasaQr = async (decodedText: string) => {
    setStep('processing');
    setIsProcessing(true);
    setError('');

    try {
      const receiptId = extractUniversal(decodedText);
      if (!receiptId) throw new Error("Could not find a valid eKasa ID in this QR code.");

      const payload = typeof receiptId === 'string' ? { receiptId } : { okpData: receiptId };

      const response = await fetchWithRetry(`/api/ekasa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { detail?: string };
        const humanMessage = parseEkasaError(response.status, errorData.detail);
        throw new Error(humanMessage);
      }
      
      const parsed = await response.json() as Partial<ReceiptData>;

      setReceipt({
        source: 'ekasa',
        store: parsed.store || 'Unknown Store',
        date: parsed.date || new Date().toISOString().split('T')[0],
        total: parsed.total || 0,
        items: (parsed.items || []).map(it => ({ ...it, selected: true })),
        ico: parsed.ico,
        receiptNumber: parsed.receiptNumber,
        transactedAt: parsed.transactedAt,
        vatDetail: parsed.vatDetail
      });
      setIsVerified(true);
      setStep('review');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Scan failed';
      setError(msg);
      setStep('scan');
      Logger.system('ERROR', 'Scanner', 'eKasa scan failure', { error: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  const processInvoiceFile = async (file: File) => {
    setStep('processing');
    setIsProcessing(true);
    setError('');

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      const response = await fetch('/api/ai/parse-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, categories })
      });

      const result = await response.json() as { success: boolean; data?: Partial<ReceiptData>; triage?: string; message?: string; error?: string };

      if (!result.success || !result.data) {
        if (result.triage === 'REJECTED') {
          throw new Error(`Invalid Document: ${result.message}`);
        }
        throw new Error(result.error || 'Failed to parse invoice');
      }

      const parsed = result.data;
      setReceipt({
        source: 'ai',
        store: parsed.store || 'Unknown Store',
        date: parsed.date || new Date().toISOString().split('T')[0],
        total: parsed.total || 0,
        items: (parsed.items || []).map(it => ({ ...it, selected: true })),
        ico: parsed.ico,
        receiptNumber: parsed.receiptNumber,
        transactedAt: parsed.transactedAt,
        vatDetail: parsed.vatDetail
      });
      setIsVerified(false);
      setStep('review');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Scan failed';
      setError(msg);
      setStep('scan');
      Logger.system('ERROR', 'Scanner', 'AI Invoice scan failure', { error: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateReceiptItem = (index: number, updates: Partial<ReceiptItem>) => {
    setReceipt(prev => {
      if (!prev) return prev;
      const nextItems = [...prev.items];
      nextItems[index] = { ...nextItems[index], ...updates };
      return { ...prev, items: nextItems };
    });
  };

  const confirmAndSave = async () => {
    if (!receipt) return;
    setIsSaving(true);
    setError('');
    try {
      await onSave(receipt, payerId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save receipt';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return {
    step,
    receipt,
    payerId,
    isProcessing,
    isSaving,
    isVerified,
    error,
    setPayerId,
    setStep,
    updateReceiptItem,
    processInvoiceFile,
    processEkasaQr,
    confirmAndSave,
    reset
  };
}
