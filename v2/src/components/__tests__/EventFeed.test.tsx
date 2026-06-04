import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { EventFeed } from '../EventFeed';
import { useEventLog } from '@/lib/event-log-read';

jest.mock('@/lib/event-log-read', () => ({
  useEventLog: jest.fn()
}));

describe('EventFeed', () => {
  const mockEvents = [
    {
      id: 'evt-1',
      action: 'transaction.created',
      description: 'Transaction created for Metro',
      created_at: '2026-06-01T12:00:00Z',
      who_type: 'user',
      app_users: { full_name: 'Nik' },
      source: 'client'
    },
    {
      id: 'evt-2',
      action: 'whatsapp.delivered',
      description: 'Delivered WhatsApp notification',
      created_at: '2026-06-01T11:50:00Z',
      who_type: 'system',
      source: 'server_action'
    },
    {
      id: 'evt-3',
      action: 'transaction.created',
      description: 'Legacy transaction imported',
      created_at: '2026-05-01T10:00:00Z',
      who_type: 'user',
      source: 'hook', // backfilled row
      metadata: { legacy_actor_name: 'Old User' }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders events, excluding legacy hook events by default', () => {
    (useEventLog as jest.Mock).mockReturnValue({
      events: mockEvents,
      loading: false,
      error: null
    });

    render(<EventFeed tenantId="t-1" />);

    expect(screen.getByText('Transaction created for Metro')).toBeTruthy();
    expect(screen.getByText('Delivered WhatsApp notification')).toBeTruthy();
    // Legacy event should NOT be rendered by default
    expect(screen.queryByText('Legacy transaction imported')).toBeNull();
  });

  test('renders legacy hook events when Show historical toggle is enabled', () => {
    (useEventLog as jest.Mock).mockReturnValue({
      events: mockEvents,
      loading: false,
      error: null
    });

    render(<EventFeed tenantId="t-1" />);

    // Click "Show historical" checkbox
    const toggle = screen.getByLabelText('Show historical');
    fireEvent.click(toggle);

    expect(screen.getByText('Transaction created for Metro')).toBeTruthy();
    expect(screen.getByText('Legacy transaction imported')).toBeTruthy();
  });

  test('filters events by selected action in dropdown', () => {
    (useEventLog as jest.Mock).mockReturnValue({
      events: mockEvents,
      loading: false,
      error: null
    });

    render(<EventFeed tenantId="t-1" />);

    // Select "whatsapp.delivered" from filter dropdown
    const select = screen.getByTestId('action-filter');
    fireEvent.change(select, { target: { value: 'whatsapp.delivered' } });

    expect(screen.queryByText('Transaction created for Metro')).toBeNull();
    expect(screen.getByText('Delivered WhatsApp notification')).toBeTruthy();
  });
});
