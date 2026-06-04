import type { SupabaseClient } from '@supabase/supabase-js'
import { ServerLogger } from '@/lib/logger-server'
import { recordEventServer } from '@/lib/event-log-server'
import { formatCurrency } from '@/lib/utils'
import type { TriggerParams, TriggerResult, TenantConfig, WorkflowConfig } from '../types'

interface WorkflowStrategy {
  checkThreshold(params: TriggerParams, config: WorkflowConfig): string | null
  buildPayload(params: TriggerParams, metadata: Record<string, unknown>): Record<string, unknown>
}

const strategies: Record<string, WorkflowStrategy> = {
  bill_approval: {
    checkThreshold(params, config) {
      const threshold = config.threshold ?? 100
      if (!params.amount || params.amount < threshold) {
        return `amount ${params.amount} below threshold ${threshold}`
      }
      return null
    },
    buildPayload(params, metadata) {
      return {
        type: 'poll',
        name: `Approve bill of ${params.amount ? formatCurrency(params.amount) : ''}?`,
        options: ['Approve', 'Reject'],
        metadata: { ...metadata, source: 'workflow:bill_approval' },
      }
    },
  },
  low_stock_alert: {
    checkThreshold(params, config) {
      const thresholdPct = config.threshold_pct ?? 80
      if (params.stockLevel == null || params.stockLevel > thresholdPct) {
        return `stock ${params.stockLevel}% above threshold ${thresholdPct}%`
      }
      return null
    },
    buildPayload(params, metadata) {
      return {
        type: 'text',
        text: `⚠️ Low stock alert: items are at ${params.stockLevel}% of reorder point. Please check inventory.`,
        metadata: { ...metadata, source: 'workflow:low_stock_alert' },
      }
    },
  },
  daily_summary: {
    checkThreshold() {
      return null
    },
    buildPayload(_params, metadata) {
      return {
        type: 'text',
        text: '📊 Daily summary for your restaurant.',
        metadata: { ...metadata, source: 'workflow:daily_summary' },
      }
    },
  },
}

export async function triggerWorkflow(
  supabase: SupabaseClient,
  params: TriggerParams
): Promise<TriggerResult> {
  const { tenantId, workflowKey, metadata } = params

  const { data: tenantData, error: tenantErr } = await supabase
    .from('tenants')
    .select('config')
    .eq('id', tenantId)
    .single()

  if (tenantErr || !tenantData) {
    await ServerLogger.system('WARN', 'WhatsApp', 'Tenant not found for workflow', {
      tenantId,
      workflowKey,
    })
    return { fired: false, reason: 'tenant not found', outboxIds: [] }
  }

  const config = (tenantData.config as TenantConfig) || {}
  const workflowConfig = config.workflows?.[workflowKey]

  if (!workflowConfig?.enabled) {
    return { fired: false, reason: 'not enabled', outboxIds: [] }
  }

  const strategy = strategies[workflowKey]
  if (strategy) {
    const thresholdReason = strategy.checkThreshold(params, workflowConfig)
    if (thresholdReason) {
      void recordEventServer({ tenantId, action: 'workflow.skipped', whoType: 'system', metadata: { workflowKey, reason: thresholdReason } })
      return { fired: false, reason: thresholdReason, outboxIds: [] }
    }
  }

  const outboxIds: string[] = []
  const payload = strategy?.buildPayload(params, metadata) || {
    type: 'text',
    text: `📊 ${workflowKey} notification.`,
    metadata: { ...metadata, source: `workflow:${workflowKey}` },
  }

  for (const recipient of workflowConfig.recipients) {
    const phone = config.phones?.[recipient]
    if (!phone) {
      await ServerLogger.system('WARN', 'WhatsApp', `No phone for recipient ${recipient}`, {
        tenantId,
        workflowKey,
      })
      continue
    }

    const { data: outboxRecord, error: insertErr } = await supabase
      .rpc('insert_whatsapp_outbox_v2', {
        p_tenant_id: tenantId,
        p_recipient_phone: phone,
        p_payload: payload,
        p_api_key_id: null,
        p_webhook_url: null,
        p_webhook_secret: null,
        p_idempotency_key: null,
      })
      .single<{ id: string }>()

    if (insertErr || !outboxRecord) {
      await ServerLogger.system('ERROR', 'WhatsApp', 'Failed to queue workflow notification', {
        tenantId,
        workflowKey,
        recipient,
        error: insertErr?.message,
      })
      continue
    }

    outboxIds.push(outboxRecord.id)

    await ServerLogger.system('INFO', 'WhatsApp', `Workflow triggered for ${recipient}`, {
      tenantId,
      workflowKey,
      outboxId: outboxRecord.id,
    })
  }

  if (outboxIds.length === 0) {
    return { fired: false, reason: 'no recipients resolved', outboxIds: [] }
  }

  void recordEventServer({ tenantId, action: 'workflow.triggered', whoType: 'system', metadata: { workflowKey, outboxIds } })
  return { fired: true, outboxIds }
}
