export interface WorkflowConfig {
  enabled: boolean
  threshold?: number
  threshold_pct?: number
  time?: string
  recipients: ('owner' | 'manager')[]
}

export type WorkflowKey = 'bill_approval' | 'low_stock_alert' | 'daily_summary'

export interface WorkflowsConfig {
  bill_approval?: WorkflowConfig
  low_stock_alert?: WorkflowConfig
  daily_summary?: WorkflowConfig
}

export interface TriggerParams {
  tenantId: string
  workflowKey: WorkflowKey
  amount?: number
  stockLevel?: number
  metadata: Record<string, unknown>
}

export interface TriggerResult {
  fired: boolean
  reason?: string
  outboxIds: string[]
}

export interface TenantConfig {
  phones?: Record<string, string>
  workflows?: WorkflowsConfig
}
