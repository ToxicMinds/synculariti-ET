'use client';

import React from 'react';
import type { EventLogRecord } from '@/lib/event-log-types';
import { resolveActorName } from '@/lib/event-log-display';
import { formatRelativeTime } from '@/lib/utils';

interface EventBylineProps {
  event: EventLogRecord | null | undefined;
  prefix?: string;
}

export function EventByline({ event, prefix = 'By' }: EventBylineProps): React.ReactElement | null {
  if (!event) return null;

  const rawEvent = event as EventLogRecord & { app_users?: { full_name?: string } };
  const actorName = resolveActorName(rawEvent);
  const timeAgo = formatRelativeTime(event.created_at);

  return (
    <span style={{
      fontSize: 11,
      color: 'var(--text-secondary)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    }}>
      {prefix} <strong style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{actorName}</strong>
      <span aria-hidden>·</span>
      <time dateTime={event.created_at}>{timeAgo}</time>
    </span>
  );
}
