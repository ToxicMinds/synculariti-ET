import { renderHook, act } from '@testing-library/react';
import { useSwipeable } from './useSwipeable';

describe('useSwipeable Contract (Batch G)', () => {
  it('should initialize with 0 offset and not dragging', () => {
    const { result } = renderHook(() => useSwipeable(-140));
    expect(result.current.offset).toBe(0);
    expect(result.current.isDragging).toBe(false);
  });

  it('should update offset during touch move', () => {
    const { result } = renderHook(() => useSwipeable(-140));
    
    act(() => {
      // Simulate Touch Start
      result.current.handlers.onTouchStart({
        touches: [{ clientX: 100 }]
      } as any);
    });

    act(() => {
      // Simulate Swipe Left (100 -> 50 = -50px)
      result.current.handlers.onTouchMove({
        touches: [{ clientX: 50 }]
      } as any);
    });

    expect(result.current.offset).toBe(-50);
    expect(result.current.isDragging).toBe(true);
  });

  it('should snap to open if released past threshold', () => {
    const { result } = renderHook(() => useSwipeable(-140));
    
    act(() => {
      result.current.handlers.onTouchStart({ touches: [{ clientX: 100 }] } as any);
      result.current.handlers.onTouchMove({ touches: [{ clientX: 20 }] } as any); // -80px swipe
    });

    act(() => {
      result.current.handlers.onTouchEnd();
    });

    // Snaps to full -140
    expect(result.current.offset).toBe(-140);
    expect(result.current.isDragging).toBe(false);
  });

  it('should reset offset when requested', () => {
    const { result } = renderHook(() => useSwipeable(-140));
    
    act(() => {
      result.current.handlers.onTouchStart({ touches: [{ clientX: 100 }] } as any);
      result.current.handlers.onTouchMove({ touches: [{ clientX: 20 }] } as any);
      result.current.handlers.onTouchEnd();
    });

    expect(result.current.offset).toBe(-140);

    act(() => {
      result.current.reset();
    });

    expect(result.current.offset).toBe(0);
  });
});
