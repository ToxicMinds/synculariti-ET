'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';
import type { EventLogRecord } from './event-log-types';
import { enrichEventsWithActorNames } from './event-log-display';

interface UseEventLogOptions {
  entityType?: string;
  entityId?: string;
  limit?: number;
  ascending?: boolean;
}

interface UseEventLogResult {
  events: EventLogRecord[];
  loading: boolean;
  error: string | null;
}

export function useEventLog(
  tenantId: string | undefined,
  options: UseEventLogOptions = {}
): UseEventLogResult {
  const { entityType, entityId, limit = 50, ascending = false } = options;

  const [events, setEvents] = useState<EventLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('event_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending })
      .limit(limit);

    if (entityType) query = query.eq('entity_type', entityType);
    if (entityId)   query = query.eq('entity_id', entityId);

    query.then(async ({ data, error: qError }) => {
      if (cancelled) return;

      if (qError) {
        setError(qError.message);
        Logger.system('ERROR', 'EventLog', 'useEventLog fetch failed', { error: qError.message });
        setLoading(false);
        return;
      }

      const raw = (data ?? []) as EventLogRecord[];
      const enriched = await enrichEventsWithActorNames(supabase, raw);
      setEvents(enriched);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [tenantId, entityType, entityId, limit, ascending]);

  return { events, loading, error };
}
