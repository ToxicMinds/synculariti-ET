export const EVENT_ACTIONS = {
  // Financial & Logistics
  TRANSACTION_CREATED:            'transaction.created',
  TRANSACTION_UPDATED:            'transaction.updated',
  TRANSACTION_DELETED:            'transaction.deleted',
  RECEIPT_SCANNED:                'receipt.scanned',
  INVOICE_PARSED:                 'invoice.parsed',
  EXPENSE_CREATED:                'expense.created', // Used by posDiscrepancy
  CATEGORY_CREATED:               'category.created',
  RECEIPT_AUDITED:                'receipt.audited',
  PURCHASE_ORDER_RECEIVED:        'purchase_order.received',
  PURCHASE_ORDER_CANCELLED:       'purchase_order.cancelled',
  INVENTORY_ITEM_CREATED:         'inventory_item.created',
  PURCHASE_QUARANTINE_RELEASED:   'purchase_quarantine.released',
  PURCHASE_QUARANTINE_REJECTED:   'purchase_quarantine.rejected',
  PURCHASE_QUARANTINE_AUTO:       'purchase_quarantine.auto_released',
  INGESTION_FAILED:               'ingestion.failed',
  POS_DISCREPANCY_RESOLVED:       'pos.discrepancy.resolved',

  // System & Graph
  GRAPH_SYNC_COMPLETED:           'graph_sync.completed',
  GRAPH_SYNC_BACKFILLED:          'graph_sync.backfilled',
  FCV_ENRICHED:                   'fcv.enriched',

  // WhatsApp
  WHATSAPP_SENT:                  'whatsapp.notification.sent',
  WHATSAPP_DELIVERED:             'whatsapp.delivered',
  WHATSAPP_DELIVERY_FAILED:       'whatsapp.delivery_failed',
  WHATSAPP_RESPONSE:              'whatsapp.response.received',
  WHATSAPP_DECISION:              'whatsapp.decision.completed',

  // Workflows
  WORKFLOW_TRIGGERED:             'workflow.triggered',
  WORKFLOW_SKIPPED:               'workflow.skipped',
  WORKFLOW_ACTION_RESOLVED:       'workflow.action_resolved',

  // Integrations & Data
  TENANT_DATA_EXPORTED:           'tenant.data_exported',
  BANK_SYNC_STARTED:              'bank_sync.session_started',

  // Anomaly
  ANOMALY_DETECTED:               'anomaly.detected',

  // Identity & Auth
  TENANT_CONFIG_UPDATED:          'tenant_config.updated',
  TENANT_SWITCHED:                'tenant.switched',
  PIN_VERIFIED:                   'pin.verified',
} as const;

export type EventAction = typeof EVENT_ACTIONS[keyof typeof EVENT_ACTIONS];
export type WhoType    = 'user' | 'service' | 'api_key' | 'system';

export interface BaseEventPayload {
  action: EventAction;

  // Actor context
  whoId?: string | null;     // Replaces user_name; Maps to app_users.id. Null for automated processes.
  whoType?: WhoType;         // Default: 'user'. Use 'system' for cron/background jobs.

  // Target Entity context
  entityType?: string | null; // e.g., 'transaction', 'whatsapp_outbox', 'purchase', 'tenant'
  entityId?: string | null;   // e.g., UUID of the specific transaction or outbox record

  // Narrative
  description?: string;      // Human readable summary. Overrides the auto-generated description if provided.

  // Structured Data
  metadata?: Record<string, unknown>; // Replaces parsing stringified JSON.

  // Origin
  source?: 'client' | 'server_action' | 'api' | 'webhook' | 'cron' | 'hook';
}

export interface RecordEventPayload extends BaseEventPayload {
  // Client-side — tenant_id is resolved server-side by record_event_v1 via get_my_tenant()
}

export interface RecordEventServerPayload extends BaseEventPayload {
  tenantId: string; // Required in server contexts (cron, webhook, API routes)
}

/**
 * Event Log Row representation corresponding to the database schema
 */
export interface EventLogRecord {
  id: string;
  tenant_id: string;
  action: EventAction;
  who_id: string | null;
  who_type: WhoType;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  source: string;
  created_at: string;
}
