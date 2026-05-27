import { useState } from 'react';
import { Logger } from '@/lib/logger';
import { processScannerInput } from '@/lib/scanner-client';
import type { ScannerResult } from '@/lib/scanner-client';
import { ReceiptItem, ReceiptData as BaseReceiptData } from './useTransactionSync';
import { getErrorMessage } from '@/lib/utils';

export type { ReceiptItem };
export type ScannerStep = 'scan' | 'processing' | 'review';

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
  updateReceiptItem: (index: number, updates: Partial<ReceiptItem>) => void;
  process: (input: string | File) => Promise<void>;
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

  const process = async (input: string | File) => {
    setStep('processing');
    setIsProcessing(true);
    setError('');

    try {
      const result: ScannerResult = await processScannerInput(input, categories);

      if (result.status === 'QUEUED') {
        setStep('scan');
        setError('Network offline — receipt queued for later processing.');
        return;
      }

      if (result.status === 'ERROR' || !result.data) {
        throw new Error(result.error || 'Processing failed');
      }

      const sourceMap = { EKASA: 'ekasa' as const, AI_VISION: 'ai' as const, MANUAL: 'manual' as const, OFFLINE_QUEUE: 'manual' as const };
      const mappedSource = sourceMap[result.source] || 'manual';

      setReceipt({
        source: mappedSource,
        store: result.data.store,
        date: result.data.date,
        total: result.data.total,
        items: result.data.items.map(it => ({ ...it, selected: true })),
        ico: result.data.ico,
        receiptNumber: result.data.receiptNumber,
        transactedAt: result.data.transactedAt,
        vatDetail: result.data.vatDetail,
      });
      setIsVerified(result.source === 'EKASA');
      setStep('review');
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg);
      setStep('scan');
      Logger.system('ERROR', 'Scanner', 'Scan failure', { error: msg });
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
      const msg = getErrorMessage(e);
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
    updateReceiptItem,
    process,
    confirmAndSave,
    reset,
  };
}
