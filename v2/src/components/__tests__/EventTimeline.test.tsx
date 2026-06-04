import { render, screen } from '@testing-library/react';
import React from 'react';
import { EventTimeline } from '../EventTimeline';
import { useEventLog } from '@/lib/event-log-read';

jest.mock('@/lib/event-log-read', () => ({
  useEventLog: jest.fn()
}));

describe('EventTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading spinner when loading', () => {
    (useEventLog as jest.Mock).mockReturnValue({
      events: [],
      loading: true,
      error: null
    });

    render(<EventTimeline entityType="purchase" entityId="p-1" tenantId="t-1" />);
    expect(screen.getByTestId('timeline-spinner')).toBeTruthy();
  });

  test('renders timeline entries with descriptions and actor names', () => {
    const mockEvents = [
      {
        id: 'evt-1',
        action: 'purchase_order.received',
        description: 'PO Received from Metro',
        created_at: '2026-06-01T12:00:00Z',
        who_type: 'user',
        app_users: { full_name: 'Nik' }
      },
      {
        id: 'evt-2',
        action: 'purchase_quarantine.released',
        description: 'Auto-released from quarantine',
        created_at: '2026-06-01T12:05:00Z',
        who_type: 'system'
      }
    ];

    (useEventLog as jest.Mock).mockReturnValue({
      events: mockEvents,
      loading: false,
      error: null
    });

    render(<EventTimeline entityType="purchase" entityId="p-1" tenantId="t-1" />);

    // Descriptions are rendered in <span> elements as "— {description}"
    // getByText with regex matches partial text within a single element
    const descSpans = screen.getAllByText(/from Metro/);
    expect(descSpans.length).toBeGreaterThanOrEqual(1);

    const autoRelSpans = screen.getAllByText(/quarantine/);
    expect(autoRelSpans.length).toBeGreaterThanOrEqual(1);

    // Actor names appear as text nodes inside mixed-content parent divs
    // (e.g. "<div>Nik · <time>3 days ago</time></div>"). String getByText
    // defaults to exact:true in @testing-library/dom v10, which fails on
    // composite textContent. Use an unanchored regex to do pattern matching.
    expect(screen.getByText(/Nik/)).toBeTruthy();
    expect(screen.getByText(/System/)).toBeTruthy();

    // Action labels sit in their own text node before the description <span>.
    // e.g. "<div>Approved<span>— Auto-released...</span></div>"
    expect(screen.getByText(/Approved/)).toBeTruthy();
  });

  test('renders nothing when there are no events', () => {
    (useEventLog as jest.Mock).mockReturnValue({
      events: [],
      loading: false,
      error: null
    });

    const { container } = render(
      <EventTimeline entityType="purchase" entityId="p-1" tenantId="t-1" />
    );
    expect(container.firstChild).toBeNull();
  });
});
