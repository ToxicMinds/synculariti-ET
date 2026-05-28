import { NextResponse } from 'next/server';
import { getNeo4jDriver, processOutboxSync, neo4jDeleteTransaction } from '@/lib/neo4j';
import { ServerLogger } from '@/lib/logger-server';
import { withTestHandler } from '@/lib/withTestHandler';
import { SecureHandler } from '@/lib/types/api';
import { getErrorMessage } from '@/lib/utils';
import { createClient } from '@/lib/supabase-server';
import { TransactionSyncPayload } from '@/lib/types';
import { buildSyncPayload } from '@/lib/neo4j-ontology';

/**
 * GET /api/debug/sync-neo4j
 * Processes the transactional outbox queue (graph_sync_queue) for the current tenant.
 */
const handler: SecureHandler = async (req, context) => {
  const { tenantId, user } = context.auth || { tenantId: 'fallback', user: { email: 'test@example.com', app_metadata: {} } };

  // Hardening: Verify user session
  if (!tenantId || tenantId === 'fallback') {
    return NextResponse.json({ error: 'Unauthorized: Session missing' }, { status: 401 });
  }

  const driver = getNeo4jDriver();
  if (!driver) {
    return NextResponse.json({ error: 'Neo4j driver not initialized' }, { status: 500 });
  }

  const supabase = await createClient();
  const session = driver.session();

  try {
    await ServerLogger.system('INFO', 'Debug', 'Manual Neo4j Sync Triggered', { tenantId, admin: user.email });

    // 1. Fetch PENDING events from Postgres outbox
    const { data: events, error: fetchError } = await supabase
      .from('graph_sync_queue')
      .select('id, payload, operation, tenant_id, entity_id, retry_count, max_retries')
      .eq('status', 'PENDING')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch outbox events: ${fetchError.message}`);
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ success: true, message: 'No pending events to sync for this tenant' });
    }

    let processedCount = 0;
    const payloadsToSync: TransactionSyncPayload[] = [];
    const eventsToComplete: string[] = [];

    for (const event of events) {
      // Mark as PROCESSING to avoid concurrent workers grabbing the same event
      await supabase.rpc('update_graph_sync_queue_status_v1', {
        p_id: event.id,
        p_status: 'PROCESSING',
      });

      try {
        if (event.operation === 'DELETE') {
          // Atomic deletion in Neo4j
          await neo4jDeleteTransaction(event.entity_id, session);
          eventsToComplete.push(event.id);
          processedCount++;
        } else {
          // Fetch full transaction row to get latest state
          const { data: txRow, error: txError } = await supabase
            .from('transactions')
            .select('id, amount, date, category, who, description, currency, tenant_id')
            .eq('id', event.entity_id)
            .single();

          if (txError || !txRow) {
            throw new Error(`Transaction row missing: ${txError?.message || 'Not Found'}`);
          }

          // Fetch receipt items
          const { data: itemsRows, error: itemsError } = await supabase
            .from('receipt_items')
            .select('id, name, amount, category, currency')
            .eq('transaction_id', event.entity_id);

          if (itemsError) {
            throw new Error(`Failed to fetch receipt items: ${itemsError.message}`);
          }

          payloadsToSync.push(buildSyncPayload(txRow, itemsRows || [], { inferCategory: true }));

          eventsToComplete.push(event.id);
        }
      } catch (err: unknown) {
        const errorMsg = getErrorMessage(err);
        const retryCount = (event.retry_count || 0) + 1;
        const maxRetries = event.max_retries || 3;
        const finalStatus = retryCount >= maxRetries ? 'FAILED' : 'PENDING';

        await supabase.rpc('update_graph_sync_queue_status_v1', {
          p_id: event.id,
          p_status: finalStatus,
          p_retry_count: retryCount,
          p_last_error: errorMsg,
        });

        await ServerLogger.system('ERROR', 'Debug', `Individual outbox event sync failed (ID: ${event.id})`, { error: errorMsg, tenantId });
      }
    }

    // 2. Perform high-performance bulk merge for compiled payloads
    if (payloadsToSync.length > 0) {
      const mergedCount = await processOutboxSync(payloadsToSync, session);
      processedCount += mergedCount;
    }

    // 3. Mark successful events as COMPLETED
    if (eventsToComplete.length > 0) {
      await supabase.rpc('complete_graph_sync_batch_v1', {
        p_ids: eventsToComplete,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Processed outbox events successfully`,
      syncedTransactions: processedCount,
    });

  } catch (e: unknown) {
    const msg = getErrorMessage(e);
    await ServerLogger.system('ERROR', 'Debug', 'Manual sync process failed', { error: msg, tenantId });
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await session.close();
  }
};

export const GET = withTestHandler(handler);
