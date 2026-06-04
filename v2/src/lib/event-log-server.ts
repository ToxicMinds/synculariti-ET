import { RecordEventServerPayload } from './event-log-types';
import { createClient } from '@/lib/supabase-server';
import { ServerLogger } from '@/lib/logger-server';

export async function recordEventServer(payload: RecordEventServerPayload): Promise<void> {
  try {
    const supabase = await createClient();
    const { tenantId, action, whoId, whoType = 'system', entityType, entityId, description, metadata, source = 'server_action' } = payload;

    const { error } = await supabase.rpc('record_event_v1', {
      p_tenant_id: tenantId,
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
      await ServerLogger.system('ERROR', 'EventLog', `record_event_v1 failed for ${action}`, { error });
    }
  } catch (err: unknown) {
    await ServerLogger.system('ERROR', 'EventLog', `Exception in recordEventServer for ${payload.action}`, { error: err });
  }
}
