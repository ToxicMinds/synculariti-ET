'use client';

import React, { useState, useMemo } from 'react';
import { useEventLog } from '@/lib/event-log-read';
import { getActionDisplay, resolveActorName } from '@/lib/event-log-display';
import type { EventLogRecord, EventAction } from '@/lib/event-log-types';
import { EVENT_ACTIONS } from '@/lib/event-log-types';
import { formatRelativeTime } from '@/lib/utils';

interface EventFeedProps {
  tenantId: string;
  limit?: number;
  filterByAction?: EventAction[];
}

export function EventFeed({ tenantId, limit = 50, filterByAction }: EventFeedProps): React.ReactElement | null {
  const [showHistorical, setShowHistorical] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>('');

  const { events, loading } = useEventLog(tenantId, {
    limit,
    ascending: false,
  });

  const visibleEvents = useMemo(() => {
    let filtered = showHistorical ? events : events.filter(e => e.source !== 'hook');
    if (filterByAction && filterByAction.length > 0) {
      filtered = filtered.filter(e => filterByAction.includes(e.action));
    }
    if (selectedAction) {
      filtered = filtered.filter(e => e.action === selectedAction);
    }
    return filtered;
  }, [events, showHistorical, filterByAction, selectedAction]);

  const actionOptions = useMemo(() => {
    const base = showHistorical ? events : events.filter(e => e.source !== 'hook');
    return [...new Set(base.map(e => e.action))].sort();
  }, [events, showHistorical]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
        <div className="spinner-small" style={{ width: 14, height: 14 }} />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading activity…</span>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <select
          data-testid="action-filter"
          value={selectedAction}
          onChange={e => setSelectedAction(e.target.value)}
          style={{
            fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)',
            background: 'var(--bg-hover)', color: 'var(--text-primary)', cursor: 'pointer',
          }}
        >
          <option value="">All events</option>
          {actionOptions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            aria-label="Show historical"
            checked={showHistorical}
            onChange={e => setShowHistorical(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Show historical
        </label>

        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {visibleEvents.length} event{visibleEvents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {visibleEvents.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
          No events to show.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleEvents.map((evt) => {
            const enriched = evt as EventLogRecord & { app_users?: { full_name?: string } };
            const actor = resolveActorName(enriched);
            const { icon } = getActionDisplay(evt.action);
            const isLegacy = evt.source === 'hook';

            return (
              <div
                key={evt.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
                  borderRadius: 10, background: isLegacy ? 'var(--bg-hover)' : 'var(--bg-card)',
                  border: '1px solid var(--border-color)', opacity: isLegacy ? 0.75 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.2 }} aria-hidden>
                  {icon}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 1 }}>
                    {evt.description || evt.action}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {actor} · <time dateTime={evt.created_at}>{formatRelativeTime(evt.created_at)}</time>
                    {isLegacy && (
                      <span style={{
                        marginLeft: 6, padding: '1px 5px', borderRadius: 4,
                        background: 'var(--bg-secondary)', fontSize: 9, fontWeight: 600,
                        color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase',
                      }}>
                        Historical
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { EVENT_ACTIONS };
