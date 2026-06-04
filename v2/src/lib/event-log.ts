import { RecordEventPayload } from './event-log-types';
import { supabase } from '@/lib/supabase';
import { Logger } from '@/lib/logger';

export async function recordEvent(payload: RecordEventPayload): Promise<void> {
  try {
    const {
      action,
      whoId,
      whoType = 'user',
      entityType,
      entityId,
      description,
      metadata,
      source = 'client'
    } = payload;

    const { error } = await supabase.rpc('record_event_v1', {
      p_action: action,
      p_who_id: whoId || null,
      p_who_type: whoType,
      p_entity_type: entityType || null,
      p_entity_id: entityId || null,
      p_description: description || null,
      p_metadata: metadata || null,
      p_source: source
    });

    if (error) {
      Logger.system('ERROR', 'EventLog', `record_event_v1 failed for ${action}`, { error });
    }
  } catch (err: unknown) {
    Logger.system('ERROR', 'EventLog', `Exception in recordEvent for ${payload.action}`, { error: err });
  }
}
