import type { EventLogRecord } from './event-log-types';

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
  if (event.app_users?.full_name) return event.app_users.full_name;
  if (event.metadata?.legacy_actor_name && typeof event.metadata.legacy_actor_name === 'string') {
    return event.metadata.legacy_actor_name;
  }
  if (event.who_type === 'system') return 'System';
  if (event.who_type === 'api_key') return 'API';
  return 'Unknown';
}
