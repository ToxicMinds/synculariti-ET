import type { SupabaseClient } from '@supabase/supabase-js'
import { ServerLogger } from '@/lib/logger-server'
import { formatCurrency } from '@/lib/utils'
import type { TriggerParams, TriggerResult, TenantConfig } from '../types'

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

  if (workflowKey === 'bill_approval') {
    const threshold = workflowConfig.threshold ?? 100
    if (!params.amount || params.amount < threshold) {
      return { fired: false, reason: `amount ${params.amount} below threshold ${threshold}`, outboxIds: [] }
    }
  }

  if (workflowKey === 'low_stock_alert') {
    const thresholdPct = workflowConfig.threshold_pct ?? 80
    if (params.stockLevel == null || params.stockLevel > thresholdPct) {
      return { fired: false, reason: `stock ${params.stockLevel}% above threshold ${thresholdPct}%`, outboxIds: [] }
    }
  }

  const outboxIds: string[] = []

  for (const recipient of workflowConfig.recipients) {
    const phone = config.phones?.[recipient]
    if (!phone) {
      await ServerLogger.system('WARN', 'WhatsApp', `No phone for recipient ${recipient}`, {
        tenantId,
        workflowKey,
      })
      continue
    }

    let payload: Record<string, unknown>

    if (workflowKey === 'bill_approval') {
      payload = {
        type: 'poll',
        name: `Approve bill of ${params.amount ? formatCurrency(params.amount) : ''}?`,
        options: ['Approve', 'Reject'],
        metadata: { ...metadata, source: `workflow:${workflowKey}` },
      }
    } else if (workflowKey === 'low_stock_alert') {
      payload = {
        type: 'text',
        text: `⚠️ Low stock alert: items are at ${params.stockLevel}% of reorder point. Please check inventory.`,
        metadata: { ...metadata, source: `workflow:${workflowKey}` },
      }
    } else {
      payload = {
        type: 'text',
        text: `📊 Daily summary for your restaurant.`,
        metadata: { ...metadata, source: `workflow:${workflowKey}` },
      }
    }

    const { data: outboxRecord, error: insertErr } = await supabase
      .from('whatsapp_outbox')
      .insert({
        tenant_id: tenantId,
        recipient_phone: phone,
        payload,
        status: 'PENDING',
      })
      .select('id')
      .single()

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

  return { fired: true, outboxIds }
}
