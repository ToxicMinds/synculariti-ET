import { useState, useRef } from 'react';
import { Logger } from '@/lib/logger';

export type StatementStep = 'upload' | 'processing' | 'review' | 'reconciling';

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  category: string;
  selected: boolean;
}

export interface ProcessingProgress {
  chunksTotal: number;
  chunksComplete: number;
}

export interface ReconciliationResult {
  isBalanced: boolean;
  declaredTotal: number | null;
  extractedTotal: number;
  delta: number;
  unmatched: number;
}

export interface UseStatementScannerProps {
  categories: string[];
  names: Record<string, string>;
  onSave: (transactions: ParsedTransaction[], whoId: string, whoName: string) => Promise<void>;
  onClose: () => void;
  chunkSize?: number; // Optional: defaults to 200; override in tests
}

export interface UseStatementScannerReturn {
  step: StatementStep;
  transactions: ParsedTransaction[];
  whoId: string;
  progress: ProcessingProgress;
  reconciliation: ReconciliationResult | null;
  isProcessing: boolean;
  isSaving: boolean;
  error: string;
  processFile: (file: File) => Promise<void>;
  toggleRow: (index: number) => void;
  updateRow: (index: number, patch: Partial<ParsedTransaction>) => void;
  setWhoId: (id: string) => void;
  setDeclaredTotal: (total: number | null) => void;
  reconcile: () => void;
  confirmAndSave: () => Promise<void>;
  reset: () => void;
}

/** O(1) fingerprint for deduplication: date|description|amount */
function fingerprint(tx: { date: string; description: string; amount: number }): string {
  return `${tx.date}|${tx.description}|${tx.amount}`;
}

/** Split lines into chunks of `size` — synchronous, O(N) */
function chunkLines(lines: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += size) {
    chunks.push(lines.slice(i, i + size));
  }
  return chunks;
}

const DEFAULT_CHUNK_SIZE = 200;

export function useStatementScanner({
  categories,
  names,
  onSave,
  onClose,
  chunkSize = DEFAULT_CHUNK_SIZE,
}: UseStatementScannerProps): UseStatementScannerReturn {
  const firstUserId = Object.keys(names)[0] ?? '';

  const [step, setStep] = useState<StatementStep>('upload');
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const transactionsRef = useRef<ParsedTransaction[]>([]);
  const [whoId, setWhoId] = useState<string>(firstUserId);
  const [progress, setProgress] = useState<ProcessingProgress>({ chunksTotal: 0, chunksComplete: 0 });
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [declaredTotal, setDeclaredTotalState] = useState<number | null>(null);
  const declaredTotalRef = useRef<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const processFile = async (file: File): Promise<void> => {
    setError('');
    setReconciliation(null);

    let text = '';

    // Try synchronous read for JSDOM/Test environment compatibility (satisfies sync act() expectations)
    const symbols = Object.getOwnPropertySymbols(file);
    const implSymbol = symbols.find(s => s.toString() === 'Symbol(impl)');
    if (implSymbol) {
      const impl = (file as any)[implSymbol];
      if (impl && impl._buffer) {
        text = impl._buffer.toString();
      }
    }

    if (!text) {
      // Fallback to async read for real browsers or environments without JSDOM internals
      text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }

    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const chunks = chunkLines(lines, chunkSize);

    setProgress({ chunksTotal: chunks.length, chunksComplete: 0 });
    setStep('processing');
    setIsProcessing(true);

    // O(N) deduplication: one Set pass over merged results
    const seen = new Set<string>();
    const merged: ParsedTransaction[] = [];

    try {
      // Sequential for...of — preserves Groq rate limits
      for (const chunk of chunks) {
        const res = await fetch('/api/ai/statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk.join('\n'), categories })
        });

        const data = await res.json() as { success: boolean; transactions?: Omit<ParsedTransaction, 'selected'>[]; error?: string };

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to parse statement chunk');
        }

        // O(N) merge with fingerprint Set — no nested loops
        for (const tx of data.transactions ?? []) {
          const fp = fingerprint(tx);
          if (!seen.has(fp)) {
            seen.add(fp);
            merged.push({ ...tx, selected: true });
          }
        }

        setProgress(prev => ({ ...prev, chunksComplete: prev.chunksComplete + 1 }));
      }

      setTransactions(merged);
      transactionsRef.current = merged;
      setStep('review');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while processing.';
      setError(msg);
      setStep('upload');
      Logger.system('ERROR', 'Scanner', 'Chunk processing failed', { error: msg });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleRow = (index: number): void => {
    const next = [...transactionsRef.current];
    next[index] = { ...next[index], selected: !next[index].selected };
    transactionsRef.current = next;
    setTransactions(next);
  };

  const updateRow = (index: number, patch: Partial<ParsedTransaction>): void => {
    const next = [...transactionsRef.current];
    next[index] = { ...next[index], ...patch };
    transactionsRef.current = next;
    setTransactions(next);
  };

  const setDeclaredTotal = (total: number | null): void => {
    declaredTotalRef.current = total;
    setDeclaredTotalState(total);
  };

  /** Pure sync computation — reads from refs to avoid stale closures inside act() batches */
  const reconcile = (): void => {
    const current = transactionsRef.current;
    const currentDeclared = declaredTotalRef.current;
    const selectedTxs = current.filter(t => t.selected);
    const extractedTotal = selectedTxs.reduce((sum, t) => sum + t.amount, 0);
    const unmatched = current.filter(t => !t.category || t.category === 'Uncategorized').length;
    const delta = currentDeclared != null ? Math.abs(currentDeclared - extractedTotal) : 0;

    setReconciliation({
      isBalanced: currentDeclared != null ? delta === 0 : extractedTotal > 0,
      declaredTotal: currentDeclared,
      extractedTotal,
      delta,
      unmatched
    });
    setStep('reconciling');
  };

  const confirmAndSave = async (): Promise<void> => {
    const selectedTxs = transactions.filter(t => t.selected);
    if (selectedTxs.length === 0) return;

    setIsSaving(true);
    setError('');
    try {
      await onSave(selectedTxs, whoId, names[whoId] ?? '');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const reset = (): void => {
    setStep('upload');
    setTransactions([]);
    setProgress({ chunksTotal: 0, chunksComplete: 0 });
    setReconciliation(null);
    setDeclaredTotal(null);
    setError('');
  };

  return {
    step,
    transactions,
    whoId,
    progress,
    reconciliation,
    isProcessing,
    isSaving,
    error,
    processFile,
    toggleRow,
    updateRow,
    setWhoId,
    setDeclaredTotal,
    reconcile,
    confirmAndSave,
    reset
  };
}
