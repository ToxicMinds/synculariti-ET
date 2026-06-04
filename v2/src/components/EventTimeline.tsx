'use client';

import React from 'react';
import { useEventLog } from '@/lib/event-log-read';
import { getActionDisplay, resolveActorName } from '@/lib/event-log-display';
import type { EventLogRecord } from '@/lib/event-log-types';
import { formatRelativeTime } from '@/lib/utils';

interface EventTimelineProps {
  entityType: string;
  entityId: string;
  tenantId: string;
  limit?: number;
}

export function EventTimeline({ entityType, entityId, tenantId, limit = 20 }: EventTimelineProps): React.ReactElement | null {
  const { events, loading } = useEventLog(tenantId, {
    entityType,
    entityId,
    limit,
    ascending: true,
  });

  if (loading) {
    return (
      <div data-testid="timeline-spinner" style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="spinner-small" style={{ width: 12, height: 12 }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading history…</span>
      </div>
    );
  }

  if (events.length === 0) return null;

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.map((evt) => {
          const { label, color } = getActionDisplay(evt.action);
          const enriched = evt as EventLogRecord & { app_users?: { full_name?: string } };
          const actor = resolveActorName(enriched);

          return (
            <div key={evt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', background: color, marginTop: 4, flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {label}
                  {evt.description && (
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>
                      — {evt.description}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                  {actor} · <time dateTime={evt.created_at}>{formatRelativeTime(evt.created_at)}</time>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
