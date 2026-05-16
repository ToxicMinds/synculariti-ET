'use client';

import { useRef, useCallback } from 'react';
import { Logger } from '@/lib/logger';
import { OfflineQueue } from '@/lib/offlineQueue';
import { ReceiptData } from './useTransactionSync';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProcessStatus = 'IDLE' | 'SCANNING' | 'PARSING' | 'SUCCESS' | 'QUEUED' | 'ERROR';

export interface ProcessResult {
  status: ProcessStatus;
  data?: ReceiptData;
  source: 'EKASA' | 'AI_VISION' | 'OFFLINE_QUEUE' | 'MANUAL';
  cacheKey: string;
  error?: string;
}

interface ProcessPayload {
  input: string | Blob;
  hash: string;
}

export interface UseReceiptProcessorReturn {
  process: (payload: ProcessPayload) => Promise<ProcessResult>;
  reset: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Timeout in milliseconds before an AbortController fires. */
const PROCESSING_TIMEOUT_MS = 15_000;

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useReceiptProcessor: Orchestrates the full receipt intelligence pipeline.
 *
 * Routing hierarchy:
 *   1. OFFLINE  → enqueue to OfflineQueue, return QUEUED (never crash)
 *   2. STRING   → eKasa deterministic path (/api/ekasa)
 *   3. BLOB     → AI Vision path (/api/ai/parse-invoice)
 *
 * Resilience:
 *   - Idempotency cache keyed on `hash` — duplicate scans never hit the network
 *   - AbortController enforces a 15s timeout on all network requests
 *   - On timeout/abort, degrades gracefully to source: 'MANUAL'
 */
export function useReceiptProcessor(): UseReceiptProcessorReturn {
  // In-memory idempotency cache: hash → ProcessResult
  const cache = useRef<Map<string, ProcessResult>>(new Map());

  const process = useCallback(async ({ input, hash }: ProcessPayload): Promise<ProcessResult> => {
    // ── 1. Idempotency Shield ───────────────────────────────────────────────
    const cached = cache.current.get(hash);
    if (cached) {
      Logger.system('INFO', 'Scanner', 'Idempotency cache hit — skipping network call', { cacheKey: hash });
      return cached;
    }

    // ── 2. Offline Resilience ───────────────────────────────────────────────
    if (!navigator.onLine) {
      await OfflineQueue.enqueue('SAVE_RECEIPT', { input: typeof input === 'string' ? input : '[blob]', hash });
      const result: ProcessResult = {
        status: 'QUEUED',
        source: 'OFFLINE_QUEUE',
        cacheKey: hash,
      };
      Logger.system('INFO', 'Scanner', 'Device offline — receipt queued for later processing', { cacheKey: hash });
      return result;
    }

    // ── 3. Routed Network Request with Timeout ──────────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROCESSING_TIMEOUT_MS);

    try {
      let result: ProcessResult;

      if (typeof input === 'string') {
        // eKasa Deterministic Path
        result = await processEkasa(input, hash, controller.signal);
      } else {
        // AI Vision Path
        result = await processAiVision(input, hash, controller.signal);
      }

      cache.current.set(hash, result);
      return result;
    } catch (e: unknown) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      const errorMsg = isAbort ? 'Receipt processing timed out' : (e instanceof Error ? e.message : 'Unknown error');

      Logger.system('ERROR', 'Scanner', errorMsg, { cacheKey: hash });

      const errorResult: ProcessResult = {
        status: 'ERROR',
        source: 'MANUAL',
        cacheKey: hash,
        error: errorMsg,
      };
      return errorResult;
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const reset = useCallback((): void => {
    cache.current.clear();
  }, []);

  return { process, reset };
}

// ─── Private Routing Helpers ─────────────────────────────────────────────────

async function safeFetch(url: string, options: RequestInit): Promise<Response> {
  const fetchPromise = fetch(url, options);
  if (!options.signal) return fetchPromise;

  const abortPromise = new Promise<never>((_, reject) => {
    const err = new Error('AbortError');
    err.name = 'AbortError';
    if (options.signal!.aborted) reject(err);
    options.signal!.addEventListener('abort', () => reject(err));
  });

  return Promise.race([fetchPromise, abortPromise]);
}

async function processEkasa(qrString: string, hash: string, signal: AbortSignal): Promise<ProcessResult> {
  const response = await safeFetch('/api/ekasa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiptId: qrString }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`eKasa API error: ${response.status}`);
  }

  const data = await response.json() as ReceiptData;
  return {
    status: 'SUCCESS',
    source: 'EKASA',
    cacheKey: hash,
    data,
  };
}

async function processAiVision(blob: Blob, hash: string, signal: AbortSignal): Promise<ProcessResult> {
  // Convert blob to base64 for the AI route
  const base64 = await blobToBase64(blob);

  const response = await safeFetch('/api/ai/parse-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64 }),
    signal,
  });

  const result = await response.json() as { success: boolean; data?: ReceiptData; error?: string };

  if (!result.success || !result.data) {
    throw new Error(result.error || 'AI Vision parsing failed');
  }

  return {
    status: 'SUCCESS',
    source: 'AI_VISION',
    cacheKey: hash,
    data: result.data,
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
