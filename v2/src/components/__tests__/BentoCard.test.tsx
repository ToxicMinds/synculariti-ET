import { render, unmountComponentAtNode } from '@testing-library/react';
import { BentoCard } from '../BentoCard';
import React from 'react';

// Mock ResizeObserver
const mockObserve = jest.fn();
const mockDisconnect = jest.fn();
(globalThis as any).ResizeObserver = class {
  observe = mockObserve;
  disconnect = mockDisconnect;
};

describe('BentoCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Mount 3 BentoCards -> ResizeObserver.observe called 3 times', () => {
    render(
      <>
        <BentoCard title="Card 1">Content 1</BentoCard>
        <BentoCard title="Card 2">Content 2</BentoCard>
        <BentoCard title="Card 3">Content 3</BentoCard>
      </>
    );

    expect(mockObserve).toHaveBeenCalledTimes(3);
  });

  test('Unmount all 3 -> ResizeObserver.disconnect called 3 times', () => {
    const { unmount } = render(
      <>
        <BentoCard title="Card 1">Content 1</BentoCard>
        <BentoCard title="Card 2">Content 2</BentoCard>
        <BentoCard title="Card 3">Content 3</BentoCard>
      </>
    );

    unmount();

    expect(mockDisconnect).toHaveBeenCalledTimes(3);
  });
});
