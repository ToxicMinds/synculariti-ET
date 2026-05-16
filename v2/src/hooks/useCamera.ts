'use client';

import { useState, useRef, useCallback } from 'react';
import { Logger } from '@/lib/logger';

export interface CameraOptions {
  maxWidth?: number;
  quality?: number;
  facingMode?: 'user' | 'environment';
}

export interface CameraState {
  isActive: boolean;
  hasPermission: boolean | null;
  error?: 'PERMISSION_DENIED' | 'NOT_FOUND' | 'HARDWARE_BUSY' | 'ABORTED';
}

export interface UseCameraReturn {
  state: CameraState;
  videoRef: React.RefObject<HTMLVideoElement>;
  start: () => Promise<void>;
  stop: () => void;
  capture: () => Promise<{ blob: Blob; hash: string }>;
}

/**
 * Generates a short hex hash from a Blob for idempotency keying.
 * Uses SubtleCrypto (available in all modern browsers and Node.js test env).
 */
async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * useCamera: Encapsulates hardware lifecycle and client-side payload optimization.
 * Handles the full MediaStream lifecycle — start, stop, capture with compression.
 * Returns an idempotency hash alongside the compressed Blob on every capture.
 */
export function useCamera(options: CameraOptions = {}): UseCameraReturn {
  const { maxWidth = 1200, quality = 0.8, facingMode = 'environment' } = options;

  const [state, setState] = useState<CameraState>({
    isActive: false,
    hasPermission: null,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStartingRef = useRef<boolean>(false);

  const start = useCallback(async (): Promise<void> => {
    // React 19 Strict Mode Protection: Prevent double-invocation
    if (streamRef.current || isStartingRef.current) return;
    
    isStartingRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setState({ isActive: true, hasPermission: true });
    } catch (e: unknown) {
      const err = e as { name?: string };
      let errorCode: CameraState['error'] = 'HARDWARE_BUSY';

      if (err.name === 'NotAllowedError') errorCode = 'PERMISSION_DENIED';
      else if (err.name === 'NotFoundError') errorCode = 'NOT_FOUND';
      else if (err.name === 'AbortError') errorCode = 'ABORTED';

      setState({ isActive: false, hasPermission: false, error: errorCode });
      Logger.system('ERROR', 'Camera', 'Camera start failure', { error: errorCode });
    } finally {
      isStartingRef.current = false;
    }
  }, [facingMode]);

  const stop = useCallback((): void => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setState(prev => ({ ...prev, isActive: false }));
  }, []);

  const capture = useCallback(async (): Promise<{ blob: Blob; hash: string }> => {
    const video = videoRef.current;
    if (!video) throw new Error('Camera not active');

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
    canvas.width = (video.videoWidth || maxWidth) * scale;
    canvas.height = (video.videoHeight || maxWidth) * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise<{ blob: Blob; hash: string }>((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) { reject(new Error('Capture failed — canvas returned empty blob')); return; }
        const hash = await hashBlob(blob);
        resolve({ blob, hash });
      }, 'image/jpeg', quality);
    });
  }, [maxWidth, quality]);

  return { state, videoRef, start, stop, capture };
}
