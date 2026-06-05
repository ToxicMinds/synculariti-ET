import type { EventLogRecord } from './event-log-types';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActionDisplay {
  label: string;
  color: string;
  icon: string;
}

export const ACTION_DISPLAY: Record<string, ActionDisplay> = {
  'transaction.created':            { label: 'Created',           color: 'var(--accent-success)', icon: '💳' },
  'transaction.updated':            { label: 'Updated',           color: 'var(--accent-warn)',   icon: '✏️' },
  'transaction.deleted':            { label: 'Deleted',           color: 'var(--accent-danger)', icon: '🗑️' },
  'receipt.scanned':                { label: 'Receipt Scanned',   color: 'var(--accent-success)', icon: '📷' },
  'invoice.parsed':                 { label: 'Invoice Parsed',    color: 'var(--accent-warn)',   icon: '📄' },
  'expense.created':                { label: 'Expense Created',   color: 'var(--accent-success)', icon: '💸' },
  'category.created':               { label: 'Category Added',    color: 'var(--accent-success)', icon: '🏷️' },
  'receipt.audited':                { label: 'Receipt Audited',   color: 'var(--accent-warn)',    icon: '🛡️' },
  'purchase_order.received':        { label: 'PO Received',       color: 'var(--accent-success)', icon: '📦' },
  'purchase_order.cancelled':       { label: 'PO Cancelled',      color: 'var(--accent-danger)', icon: '❌' },
  'inventory_item.created':         { label: 'Item Created',      color: 'var(--accent-success)', icon: '🏷️' },
  'purchase_quarantine.released':   { label: 'Approved',          color: 'var(--accent-success)', icon: '✅' },
  'purchase_quarantine.rejected':   { label: 'Rejected',          color: 'var(--accent-danger)', icon: '🚫' },
  'purchase_quarantine.auto_released': { label: 'Auto-approved',  color: '#8b5cf6',              icon: '🤖' },
  'ingestion.failed':               { label: 'Ingestion Failed',  color: 'var(--accent-danger)', icon: '⚠️' },
  'graph_sync.completed':           { label: 'Graph Synced',      color: 'var(--accent-warn)',   icon: '🔄' },
  'graph_sync.backfilled':          { label: 'Graph Backfilled',  color: 'var(--accent-warn)',   icon: '🔄' },
  'fcv.enriched':                   { label: 'FCV Enriched',      color: 'var(--accent-warn)',   icon: '📊' },
  'whatsapp.notification.sent':     { label: 'WhatsApp Sent',     color: '#25d366',              icon: '💬' },
  'whatsapp.delivered':             { label: 'Delivered',         color: '#25d366',              icon: '✓' },
  'whatsapp.delivery_failed':       { label: 'Delivery Failed',   color: 'var(--accent-danger)', icon: '📵' },
  'whatsapp.response.received':     { label: 'Response Received', color: '#6366f1',             icon: '📨' },
  'whatsapp.decision.completed':    { label: 'Decision Made',     color: '#6366f1',             icon: '🤝' },
  'workflow.triggered':             { label: 'Workflow Triggered',color: 'var(--accent-success)', icon: '⚡' },
  'workflow.skipped':               { label: 'Workflow Skipped',  color: 'var(--accent-warn)',   icon: '⏭️' },
  'anomaly.detected':               { label: 'Anomaly',           color: 'var(--accent-danger)', icon: '🚨' },
  'tenant.data_exported':           { label: 'Data Exported',     color: 'var(--accent-warn)',   icon: '📤' },
  'bank_sync.session_started':      { label: 'Bank Synced',       color: 'var(--accent-success)', icon: '🏦' },
  'tenant_config.updated':          { label: 'Config Updated',    color: 'var(--accent-warn)',   icon: '⚙️' },
  'tenant.switched':                { label: 'Tenant Switched',   color: 'var(--accent-warn)',   icon: '🔀' },
  'pin.verified':                   { label: 'PIN Verified',      color: 'var(--accent-success)', icon: '🔐' },
  'workflow.action_resolved':       { label: 'Action Resolved',   color: '#6366f1',             icon: '🤝' },
};

export function getActionDisplay(action: string): ActionDisplay {
  return ACTION_DISPLAY[action] ?? { label: action, color: 'var(--text-muted)', icon: '📋' };
}

export function resolveActorName(event: EventLogRecord & { app_users?: { full_name?: string } }): string {
  // Pre-resolved name embedded at insert time by record_event_v1 (migration 48+).
  // This is the primary path — it works for all user-type events regardless of
  // whether auth.uid() matches an app_users row (they use different UUIDs).
  if (event.metadata?.actor_name && typeof event.metadata.actor_name === 'string') {
    return event.metadata.actor_name;
  }
  if (event.app_users?.full_name) return event.app_users.full_name;
  if (event.metadata?.legacy_actor_name && typeof event.metadata.legacy_actor_name === 'string') {
    return event.metadata.legacy_actor_name;
  }
  if (event.who_type === 'system') return 'System';
  if (event.who_type === 'api_key') return 'API';
  // who_type='user' with null who_id means the event was logged before migration 47
  // (which auto-derives auth.uid()). New events will have who_id populated.
  // Show "System" instead of "Unknown" for these legacy rows.
  return 'System';
}

/**
 * Batch-resolve actor names for a list of event_log records.
 * Queries app_users for all unique who_id values and attaches
 * the full_name so resolveActorName can find it.
 *
 * DRY: shared by useEventCreation and useEventLog — one pattern, two hooks.
 */
export async function enrichEventsWithActorNames(
  supabase: SupabaseClient,
  events: EventLogRecord[]
): Promise<(EventLogRecord & { app_users?: { full_name?: string } })[]> {
  const whoIds = [...new Set(events.filter(e => e.who_id).map(e => e.who_id))] as string[];
  if (whoIds.length === 0) {
    return events;
  }

  const { data: users } = await supabase
    .from('app_users')
    .select('id, full_name')
    .in('id', whoIds);

  const nameMap = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]));

  return events.map(e => ({
    ...e,
    app_users: e.who_id && nameMap[e.who_id] ? { full_name: nameMap[e.who_id] } : undefined,
  }));
}
