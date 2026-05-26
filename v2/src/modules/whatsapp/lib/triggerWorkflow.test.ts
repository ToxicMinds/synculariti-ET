import { triggerWorkflow } from './triggerWorkflow'
import type { TriggerParams, TenantConfig } from '../types'

const mockEq = jest.fn()
const mockSingle = jest.fn()
const mockOutboxSingle = jest.fn()

jest.mock('@/lib/logger-server', () => ({
  ServerLogger: { system: jest.fn(), user: jest.fn() },
}))

function makeSupabase(config?: TenantConfig) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: mockEq.mockReturnThis(),
          single: mockSingle.mockResolvedValue({
            data: config ? { config } : null,
            error: config ? null : new Error('not found'),
          }),
        }
      }
      if (table === 'whatsapp_outbox') {
        return {
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: mockOutboxSingle,
            })),
          })),
        }
      }
      return {}
    }),
  }
}

function makeTriggerParams(overrides: Partial<TriggerParams> = {}): TriggerParams {
  return {
    tenantId: 'tenant-123',
    workflowKey: 'bill_approval',
    amount: 150,
    metadata: { billId: 'bill-001' },
    ...overrides,
  }
}

describe('triggerWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEq.mockReset()
    mockSingle.mockReset()
    mockOutboxSingle.mockReset()
  })

  describe('bill_approval', () => {
    it('should fire when amount exceeds threshold', async () => {
      const supabase = makeSupabase({
        phones: { owner: '421901234567' },
        workflows: {
          bill_approval: { enabled: true, threshold: 100, recipients: ['owner'] },
        },
      }) as any

      mockOutboxSingle.mockResolvedValue({ data: { id: 'ob-1' }, error: null })

      const result = await triggerWorkflow(supabase, makeTriggerParams())

      expect(result.fired).toBe(true)
      expect(result.outboxIds).toEqual(['ob-1'])
    })

    it('should NOT fire when amount is below threshold', async () => {
      const supabase = makeSupabase({
        phones: { owner: '421901234567' },
        workflows: {
          bill_approval: { enabled: true, threshold: 200, recipients: ['owner'] },
        },
      }) as any

      const result = await triggerWorkflow(supabase, makeTriggerParams({ amount: 150 }))

      expect(result.fired).toBe(false)
      expect(result.reason).toContain('below threshold')
    })

    it('should NOT fire when workflow is disabled', async () => {
      const supabase = makeSupabase({
        phones: { owner: '421901234567' },
        workflows: {
          bill_approval: { enabled: false, threshold: 100, recipients: ['owner'] },
        },
      }) as any

      const result = await triggerWorkflow(supabase, makeTriggerParams())

      expect(result.fired).toBe(false)
      expect(result.reason).toBe('not enabled')
    })

    it('should NOT fire when no amount is provided', async () => {
      const supabase = makeSupabase({
        phones: { owner: '421901234567' },
        workflows: {
          bill_approval: { enabled: true, threshold: 100, recipients: ['owner'] },
        },
      }) as any

      const result = await triggerWorkflow(supabase, makeTriggerParams({ amount: undefined }))

      expect(result.fired).toBe(false)
      expect(result.reason).toContain('below threshold')
    })
  })

  describe('low_stock_alert', () => {
    it('should fire when stock level is below threshold', async () => {
      const supabase = makeSupabase({
        phones: { manager: '421909876543' },
        workflows: {
          low_stock_alert: { enabled: true, threshold_pct: 80, recipients: ['manager'] },
        },
      }) as any

      mockOutboxSingle.mockResolvedValue({ data: { id: 'ob-2' }, error: null })

      const result = await triggerWorkflow(supabase, {
        tenantId: 'tenant-123',
        workflowKey: 'low_stock_alert',
        stockLevel: 75,
        metadata: { item: 'Flour 25kg' },
      })

      expect(result.fired).toBe(true)
      expect(result.outboxIds).toEqual(['ob-2'])
    })

    it('should NOT fire when stock level is above threshold', async () => {
      const supabase = makeSupabase({
        phones: { manager: '421909876543' },
        workflows: {
          low_stock_alert: { enabled: true, threshold_pct: 80, recipients: ['manager'] },
        },
      }) as any

      const result = await triggerWorkflow(supabase, {
        tenantId: 'tenant-123',
        workflowKey: 'low_stock_alert',
        stockLevel: 85,
        metadata: {},
      })

      expect(result.fired).toBe(false)
      expect(result.reason).toContain('above threshold')
    })
  })

  describe('daily_summary', () => {
    it('should always fire when enabled (no threshold check)', async () => {
      const supabase = makeSupabase({
        phones: { owner: '421901234567', manager: '421909876543' },
        workflows: {
          daily_summary: { enabled: true, time: '21:00', recipients: ['owner', 'manager'] },
        },
      }) as any

      mockOutboxSingle
        .mockResolvedValueOnce({ data: { id: 'ob-3' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'ob-4' }, error: null })

      const result = await triggerWorkflow(supabase, {
        tenantId: 'tenant-123',
        workflowKey: 'daily_summary',
        metadata: {},
      })

      expect(result.fired).toBe(true)
      expect(result.outboxIds).toHaveLength(2)
    })
  })

  describe('error handling', () => {
    it('should return not fired when tenant is not found', async () => {
      const supabase = makeSupabase() as any

      const result = await triggerWorkflow(supabase, makeTriggerParams())

      expect(result.fired).toBe(false)
      expect(result.reason).toBe('tenant not found')
    })

    it('should skip recipients without phone numbers', async () => {
      const supabase = makeSupabase({
        phones: {},
        workflows: {
          bill_approval: { enabled: true, threshold: 100, recipients: ['owner'] },
        },
      }) as any

      const result = await triggerWorkflow(supabase, makeTriggerParams())

      expect(result.fired).toBe(false)
      expect(result.reason).toBe('no recipients resolved')
    })

    it('should default threshold to 100 when not configured', async () => {
      const supabase = makeSupabase({
        phones: { owner: '421901234567' },
        workflows: {
          bill_approval: { enabled: true, recipients: ['owner'] },
        },
      }) as any

      mockOutboxSingle.mockResolvedValue({ data: { id: 'ob-5' }, error: null })

      const result = await triggerWorkflow(supabase, makeTriggerParams({ amount: 150 }))

      expect(result.fired).toBe(true)
      expect(result.outboxIds).toEqual(['ob-5'])
    })

    it('should handle insert errors gracefully', async () => {
      const supabase = makeSupabase({
        phones: { owner: '421901234567' },
        workflows: {
          bill_approval: { enabled: true, threshold: 100, recipients: ['owner'] },
        },
      }) as any

      mockOutboxSingle.mockResolvedValue({ data: null, error: { message: 'insert failed' } })

      const result = await triggerWorkflow(supabase, makeTriggerParams())

      expect(result.fired).toBe(false)
      expect(result.reason).toBe('no recipients resolved')
    })
  })
})
