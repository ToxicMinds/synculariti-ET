import { renderHook, act } from '@testing-library/react';
import { useNavigation } from './useNavigation';

// Mock Next.js navigation hooks
const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams('m=2026-05')
}));

// Mock React transition
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useTransition: () => [false, (cb: () => void) => cb()]
}));

describe('useNavigation Hook (Batch F Contract)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a month list bounded by earliestDataDate', () => {
    // Fixed current date for testing
    jest.useFakeTimers().setSystemTime(new Date('2026-05-15'));

    const { result } = renderHook(() => useNavigation({ 
      earliestDataDate: '2026-03-01' 
    }));

    // Should include May, April, March (3 months)
    expect(result.current.months).toHaveLength(3);
    expect(result.current.months[0].value).toBe('2026-05');
    expect(result.current.months[2].value).toBe('2026-03');

    jest.useRealTimers();
  });

  it('should resolve the selected month from URL search params', () => {
    const { result } = renderHook(() => useNavigation({}));
    expect(result.current.selectedMonth).toBe('2026-05');
  });

  it('should identify the current month correctly', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-15'));
    const { result } = renderHook(() => useNavigation({}));
    expect(result.current.isCurrentMonth).toBe(true);
    jest.useRealTimers();
  });

  it('should trigger router.push when setMonth is called', async () => {
    const { result } = renderHook(() => useNavigation({}));
    
    await act(async () => {
      result.current.actions.setMonth('2026-04');
    });

    expect(mockPush).toHaveBeenCalledWith('/?m=2026-04');
  });

  it('should provide the standard module registry', () => {
    const { result } = renderHook(() => useNavigation({}));
    expect(result.current.modules.length).toBeGreaterThanOrEqual(3);
    expect(result.current.activeModule.name).toBe('Finance');
  });
});
