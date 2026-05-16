/**
 * useCamera Contract Tests (Batch H - Phase 2)
 * =============================================
 * These tests are IMMUTABLE. Do NOT alter them during Phase 3.
 * They define the hardware interface contract for the ReceiptScanner.
 *
 * Enforces:
 * - Hardware permission state machine ('PERMISSION_DENIED', 'NOT_FOUND', etc.)
 * - Client-side compression via CameraOptions (maxWidth, quality)
 * - Idempotency key (hash) is always returned alongside the Blob
 * - stop() correctly disposes of the MediaStream to prevent memory leaks
 */

import { renderHook, act } from '@testing-library/react';
import { useCamera } from './useCamera';

// --- Mock Setup ---
const mockStop = jest.fn();
const mockGetVideoTracks = jest.fn(() => [{ stop: mockStop }]);
const mockMediaStream = { getVideoTracks: mockGetVideoTracks } as unknown as MediaStream;

beforeEach(() => {
  jest.clearAllMocks();
});

// -----------------------------------------------------------------------
// SCENARIO 1: Initial State
// -----------------------------------------------------------------------
describe('useCamera: Initial State', () => {
  it('should initialize with camera inactive and permission undecided', () => {
    const { result } = renderHook(() => useCamera());

    expect(result.current.state.isActive).toBe(false);
    expect(result.current.state.hasPermission).toBeNull();
    expect(result.current.state.error).toBeUndefined();
  });
});

// -----------------------------------------------------------------------
// SCENARIO 2: Permission Denied
// The UI must immediately offer "Upload from Gallery" instead of a black screen.
// -----------------------------------------------------------------------
describe('useCamera: Permission Denied', () => {
  it('should set state.error to PERMISSION_DENIED when the user blocks the camera', async () => {
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockRejectedValue(
          Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' })
        ),
      },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state.isActive).toBe(false);
    expect(result.current.state.hasPermission).toBe(false);
    expect(result.current.state.error).toBe('PERMISSION_DENIED');
  });
});

// -----------------------------------------------------------------------
// SCENARIO 3: Hardware Not Found
// -----------------------------------------------------------------------
describe('useCamera: Hardware Not Found', () => {
  it('should set state.error to NOT_FOUND when no camera is available on the device', async () => {
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockRejectedValue(
          Object.assign(new Error('NotFoundError'), { name: 'NotFoundError' })
        ),
      },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state.error).toBe('NOT_FOUND');
  });
});

// -----------------------------------------------------------------------
// SCENARIO 4: Successful Start & Clean Stop
// Verifies hardware lifecycle management — stream tracks must be stopped
// on cleanup to prevent memory leaks and "camera in use" indicators.
// -----------------------------------------------------------------------
describe('useCamera: Successful Start and Clean Stop', () => {
  it('should set isActive to true and stop all tracks when stop() is called', async () => {
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockMediaStream),
      },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state.isActive).toBe(true);
    expect(result.current.state.hasPermission).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(result.current.state.isActive).toBe(false);
  });
});

// -----------------------------------------------------------------------
// SCENARIO 5: Capture returns a Blob AND an idempotency hash
// The hash allows useReceiptProcessor to detect duplicate scan attempts.
// -----------------------------------------------------------------------
describe('useCamera: Capture with Compression & Hash', () => {
  it('should return a compressed Blob and a non-empty idempotency hash', async () => {
    // Mock canvas-based compression
    const mockToBlob = jest.fn((callback: BlobCallback) => {
      const blob = new Blob(['fake-compressed-image'], { type: 'image/jpeg' });
      // Polyfill arrayBuffer for JSDOM
      blob.arrayBuffer = async () => new ArrayBuffer(8);
      callback(blob);
    });
    const mockCanvas = { getContext: jest.fn(() => ({ drawImage: jest.fn() })), toBlob: mockToBlob, width: 0, height: 0 };
    
    Object.defineProperty(global, 'crypto', {
      value: { subtle: { digest: jest.fn().mockResolvedValue(new ArrayBuffer(8)) } },
      configurable: true
    });
    
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(mockMediaStream) },
      configurable: true, writable: true,
    });

    const { result } = renderHook(() => useCamera({ maxWidth: 1200, quality: 0.8 }));

    // Mock the video element attachment that would normally happen in the component
    Object.defineProperty(result.current.videoRef, 'current', {
      value: { videoWidth: 1920, videoHeight: 1080 } as unknown as HTMLVideoElement,
      writable: true
    });

    await act(async () => { await result.current.start(); });

    let captureResult: { blob: Blob; hash: string } | null = null;
    await act(async () => {
      captureResult = await result.current.capture();
    });

    expect(captureResult).not.toBeNull();
    expect(captureResult!.blob).toBeInstanceOf(Blob);
    expect(typeof captureResult!.hash).toBe('string');
    expect(captureResult!.hash.length).toBeGreaterThan(0);
  });
});
