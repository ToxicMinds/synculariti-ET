import { render, screen } from '@testing-library/react';
import React from 'react';
import { EventByline } from '../EventByline';
import type { EventLogRecord } from '@/lib/event-log-types';

describe('EventByline', () => {
  const baseEvent: EventLogRecord = {
    id: 'evt-1',
    tenant_id: 'tenant-123',
    action: 'transaction.created',
    who_id: 'user-1',
    who_type: 'user',
    entity_type: 'transaction',
    entity_id: 'tx-1',
    description: 'Transaction created',
    metadata: {},
    source: 'client',
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
  };

  test('renders nothing when event is null or undefined', () => {
    const { container } = render(<EventByline event={null} />);
    expect(container.firstChild).toBeNull();
  });

  test('renders full_name from app_users when present', () => {
    const event = {
      ...baseEvent,
      app_users: { full_name: 'Nik' }
    } as any;

    render(<EventByline event={event} />);
    // Actor name is in a <strong> element
    expect(screen.getByText('Nik')).toBeTruthy();
    // Relative time should be present (1 hour ago / an hour ago)
    expect(screen.getByText(/hour ago|an hour ago/)).toBeTruthy();
  });

  test('renders legacy_actor_name from metadata when who_id is null', () => {
    const event: EventLogRecord = {
      ...baseEvent,
      who_id: null,
      metadata: { legacy_actor_name: 'Old Actor' }
    };

    render(<EventByline event={event} prefix="Added by" />);
    // "Added by" is a text node, "Old Actor" is in <strong> — assert them separately
    expect(screen.getByText('Old Actor')).toBeTruthy();
    // The prefix is rendered as a plain text node in the parent <span>
    const span = screen.getByText('Old Actor').closest('span');
    expect(span?.textContent).toContain('Added by');
  });

  test('renders "System" for system who_type', () => {
    const event: EventLogRecord = {
      ...baseEvent,
      who_type: 'system',
      who_id: null
    };

    render(<EventByline event={event} />);
    expect(screen.getByText('System')).toBeTruthy();
  });

  test('renders "System" fallback when no names are resolved', () => {
    const event: EventLogRecord = {
      id: '1', tenant_id: 't1', action: 'transaction.created',
      who_id: null, who_type: 'user', entity_type: 'transaction',
      entity_id: 'tx-1', description: 'Test event', metadata: {},
      source: 'client', created_at: new Date().toISOString(),
    };
    render(<EventByline event={event} />);
    expect(screen.getByText('System')).toBeTruthy();
  });
});
