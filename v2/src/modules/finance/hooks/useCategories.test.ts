/**
 * Phase 2 Contract Tests: useCategories event-log wiring
 * These tests prove recordEvent is called with 'category.created' on addCategory success.
 */

jest.mock('@/lib/event-log', () => ({
  recordEvent: jest.fn().mockResolvedValue(true)
}));
jest.mock('@/lib/logger', () => ({
  Logger: { system: jest.fn(), user: jest.fn() }
}));
const mockUpdateState = jest.fn().mockResolvedValue(undefined);
jest.mock('@/context/TenantContext', () => ({
  useTenantContext: jest.fn().mockReturnValue({
    tenant: {
      tenant_id: 'tenant-abc',
      categories: ['Existing'],
      budgets: {}
    },
    updateState: mockUpdateState
  })
}));

import { renderHook, act } from '@testing-library/react';
import { useCategories } from './useCategories';
import { recordEvent } from '@/lib/event-log';
import { Logger } from '@/lib/logger';

describe('useCategories — Event Log Wiring (Contract)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POSITIVE: calls recordEvent with category.created on addCategory success', async () => {
    const { result } = renderHook(() => useCategories());
    await act(async () => {
      await result.current.addCategory('NewCat');
    });

    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'category.created',
      description: expect.stringContaining('NewCat'),
    }));
  });

  it('NEGATIVE: does NOT call Logger.user on success', async () => {
    const { result } = renderHook(() => useCategories());
    await act(async () => {
      await result.current.addCategory('AnotherCat');
    });

    expect(Logger.user).not.toHaveBeenCalled();
  });

  it('EDGE: does NOT emit category.created if category already exists', async () => {
    const { result } = renderHook(() => useCategories());
    await act(async () => {
      await result.current.addCategory('Existing'); // already in categories list
    });

    expect(recordEvent).not.toHaveBeenCalled();
  });
});
