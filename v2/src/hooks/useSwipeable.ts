'use client';

import { useState, useRef, useCallback } from 'react';

export interface UseSwipeableReturn {
  offset: number;
  isDragging: boolean;
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  reset: () => void;
}

/**
 * useSwipeable: Managing horizontal swipe gestures (Swipe-to-Reveal).
 */
export function useSwipeable(maxOffset: number = -140): UseSwipeableReturn {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent): void => {
    startX.current = e.touches[0].clientX;
    setIsDragging(true);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent): void => {
    if (!startX.current) return;
    const diff = e.touches[0].clientX - startX.current;
    
    // Allow swiping left (negative offset) but clamp it
    if (diff < 0) {
      setOffset(Math.max(diff, maxOffset));
    } else {
      setOffset(0);
    }
  }, [maxOffset]);

  const onTouchEnd = useCallback((): void => {
    setIsDragging(false);
    startX.current = 0;
    
    // Snap to open if swiped past 50% of maxOffset
    const threshold = maxOffset / 2;
    setOffset(prev => prev < threshold ? maxOffset : 0);
  }, [maxOffset]);

  const reset = useCallback((): void => {
    setOffset(0);
    setIsDragging(false);
    startX.current = 0;
  }, []);

  return {
    offset,
    isDragging,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd
    },
    reset
  };
}
