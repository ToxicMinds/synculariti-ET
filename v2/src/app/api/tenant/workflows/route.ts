export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getErrorMessage } from '@synculariti/whatsapp-client'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { ServerLogger } from '@/lib/logger-server'

const querySchema = z.object({
  tenant_id: z.string().uuid().optional(),
})

export interface WorkflowsResponse {
  workflows: Record<string, unknown>
}

export const GET = async (req: Request) => {
  try {
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-Api-Key header' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: keyRecord, error: keyError } = await supabase
      .from('api_keys')
      .select('id, tenant_id')
      .eq('key_value', apiKey)
      .single()

    if (keyError || !keyRecord) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const parsed = querySchema.parse(queryParams)

    let resolvedTenantId: string

    if (!keyRecord.tenant_id) {
      if (!parsed.tenant_id) {
        return NextResponse.json(
          { error: 'tenant_id query parameter is required when using a service-level API key' },
          { status: 400 }
        )
      }
      resolvedTenantId = parsed.tenant_id
    } else {
      resolvedTenantId = keyRecord.tenant_id
    }

    const { data: tenantData, error: tenantErr } = await supabase
      .from('tenants')
      .select('config')
      .eq('id', resolvedTenantId)
      .single()

    if (tenantErr || !tenantData) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const config = tenantData.config as Record<string, unknown> | null
    const workflows = (config?.workflows as Record<string, unknown>) || {}

    await ServerLogger.system('INFO', 'WhatsApp', `Workflows config fetched for tenant ${resolvedTenantId}`, {})

    return NextResponse.json({ workflows } satisfies WorkflowsResponse)
  } catch (e: unknown) {
    const errMsg = getErrorMessage(e)
    await ServerLogger.system('ERROR', 'WhatsApp', 'workflows handler error', { error: errMsg })
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
