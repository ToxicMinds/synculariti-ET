import { createClient } from '@supabase/supabase-js';

import { LogLevel, LogComponent } from './types/logging';

/**
 * ServerLogger: Writes telemetry from Next.js API routes (server-side).
 *
 * Uses service-role client because API routes run outside of user sessions.
 * The client-side Logger cannot be imported in API routes — it uses the
 * browser Supabase client which doesn't exist in the Node.js runtime.
 *
 * RULE: Import this in API routes only. Use Logger (client) in components/hooks.
 */
export class ServerLogger {
  private static getClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Log a technical event from an API route.
   * Always writes to system_telemetry AND console (for Vercel log drain).
   */
  static async system(
    level: LogLevel,
    component: LogComponent,
    message: string,
    metadata: Record<string, unknown> = {},
    tenantId?: string
  ): Promise<void> {
    // Always write to Vercel log drain (visible in deployment logs)
    const prefix = level === 'ERROR' ? '🔴' : level === 'WARN' ? '🟠' : '🔵';
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
      `[${component}] ${prefix} ${message}`,
      metadata
    );

    // Write to system_telemetry (non-blocking, best-effort)
    try {
      const supabase = this.getClient();
      await supabase.from('system_telemetry').insert({
        level,
        component,
        message,
        tenant_id: tenantId || null,
        metadata: { ...metadata, timestamp: new Date().toISOString() },
      });
    } catch {
      // Intentional: never let telemetry failure crash an API route
    }
  }

  /**
   * Log a user activity event from an API route.
   */
  static async user(
    tenantId: string,
    action: string,
    description: string,
    actorName: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      const supabase = this.getClient();
      await supabase.from('activity_log').insert({
        tenant_id: tenantId,
        action,
        description,
        actor_name: actorName,
        metadata: { ...metadata, timestamp: new Date().toISOString() },
      });
    } catch {
      // Never let activity logging failure crash an API route
    }
  }
}
