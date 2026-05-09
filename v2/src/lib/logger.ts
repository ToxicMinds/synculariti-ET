import { supabase } from './supabase';

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'PERF';
export type LogComponent = 'API' | 'Neo4j' | 'Scanner' | 'Auth' | 'Sync' | 'AI' | 'Finance' | 'Logistics';

/**
 * Synculariti Logger (SOLID: Single Responsibility)
 * RESPONSIBILITY: Routing technical telemetry vs user activity.
 */
export class Logger {
  
  /**
   * SYSTEM LOGGING (The "Black Box")
   * Technical telemetry for debugging and monitoring failures.
   */
  static async system(
    level: LogLevel, 
    component: LogComponent, 
    message: string, 
    metadata: any = {}, 
    tenantId?: string
  ) {
    // 1. Local Development visibility
    if (level === 'ERROR') console.error(`[${component}] 🔴 ${message}`, metadata);
    else if (level === 'WARN') console.warn(`[${component}] 🟠 ${message}`, metadata);
    else console.log(`[${component}] 🔵 ${message}`, metadata);

    // 2. Remote Telemetry (Async)
    try {
      await supabase.from('system_telemetry').insert({
        level,
        component,
        message,
        metadata: {
          ...metadata,
          stack: metadata?.stack,
          timestamp: new Date().toISOString()
        },
        tenant_id: tenantId || null
      });
    } catch (e) {
      console.error('CRITICAL: Failed to write system telemetry:', e);
    }
  }

  /**
   * USER LOGGING (The "Family Feed")
   * Human-readable activity for tenant visibility.
   */
  static async user(
    tenantId: string,
    action: string,
    description: string,
    actorName: string,
    metadata: any = {}
  ) {
    try {
      await supabase.from('activity_log').insert({
        tenant_id: tenantId,
        action,
        description,
        actor_name: actorName,
        metadata
      });
    } catch (e) {
      this.system('ERROR', 'Sync', 'Failed to write user activity log', e, tenantId);
    }
  }
}
