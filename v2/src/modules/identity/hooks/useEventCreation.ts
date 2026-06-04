'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { EventLogRecord } from '@/lib/event-log-types';
import { getErrorMessage } from '@/lib/utils';
import { Logger } from '@/lib/logger';

interface UseEventCreationResult {
  eventsByEntityId: Record<string, EventLogRecord>;
  loading: boolean;
  error: string | null;
}

/**
 * Batch-fetches the first creation event for a list of entity IDs in a single query.
 *
 * Pattern (no N+1):
 *   const { eventsByEntityId } = useEventCreation(tenantId, 'transaction', txIds);
 *   <TransactionRow tx={tx} creationEvent={eventsByEntityId[tx.id]} />
 *
 * Sorted ascending so the earliest event (the true creation event) is returned
 * first, and we take only one per entity_id by map insertion.
 */
export function useEventCreation(
  tenantId: string | undefined,
  entityType: string,
  entityIds: string[]
): UseEventCreationResult {
  const [eventsByEntityId, setEventsByEntityId] = useState<Record<string, EventLogRecord>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || entityIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    supabase
      .from('event_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('entity_type', entityType)
      .in('entity_id', entityIds)
      .order('created_at', { ascending: true })
      .then(({ data, error: qError }) => {
        if (qError) {
          setError(qError.message);
          Logger.system('ERROR', 'EventLog', 'useEventCreation fetch failed', { error: qError.message });
          setLoading(false);
          return;
        }

        // Build map — first occurrence wins (earliest = creation event)
        const map: Record<string, EventLogRecord> = {};
        for (const row of (data ?? []) as EventLogRecord[]) {
          if (row.entity_id && !map[row.entity_id]) {
            map[row.entity_id] = row;
          }
        }
        setEventsByEntityId(map);
        setLoading(false);
      });
  // Re-fetch when the list of IDs changes — stable JSON string comparison avoids
  // runaway re-renders from reference-unstable arrays.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, entityType, JSON.stringify(entityIds)]);

  return { eventsByEntityId, loading, error };
}
