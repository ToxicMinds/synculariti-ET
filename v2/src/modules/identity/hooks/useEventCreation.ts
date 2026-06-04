'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { EventLogRecord } from '@/lib/event-log-types';
import { getErrorMessage } from '@/lib/utils';
import { Logger } from '@/lib/logger';

const BATCH_SIZE = 50;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface UseEventCreationResult {
  eventsByEntityId: Record<string, EventLogRecord>;
  loading: boolean;
  error: string | null;
}

/**
 * Batch-fetches the first creation event for a list of entity IDs in parallel
 * chunks. A single .in() with hundreds of IDs produces a URL that exceeds
 * Supabase's REST API length limit (~8 KB), so we split into batches of 50.
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
      setEventsByEntityId({});
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const chunks = chunkArray(entityIds, BATCH_SIZE);

    Promise.all(
      chunks.map(chunk =>
        supabase
          .from('event_log')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('entity_type', entityType)
          .in('entity_id', chunk)
          .order('created_at', { ascending: true })
      )
    ).then(results => {
      if (cancelled) return;

      const map: Record<string, EventLogRecord> = {};
      let firstError: string | null = null;

      for (const { data, error: qError } of results) {
        if (qError) {
          Logger.system('ERROR', 'EventLog', 'useEventCreation batch failed', { error: qError.message });
          if (!firstError) firstError = qError.message;
          continue;
        }
        for (const row of (data ?? []) as EventLogRecord[]) {
          if (row.entity_id && !map[row.entity_id]) {
            map[row.entity_id] = row;
          }
        }
      }

      setEventsByEntityId(map);
      if (firstError) setError(firstError);
      setLoading(false);
    });

    return () => { cancelled = true; };
  // Re-fetch when the list of IDs changes — stable JSON string comparison avoids
  // runaway re-renders from reference-unstable arrays.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, entityType, JSON.stringify(entityIds)]);

  return { eventsByEntityId, loading, error };
}
