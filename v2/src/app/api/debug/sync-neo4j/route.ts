import { NextResponse } from 'next/server';
import { getNeo4jDriver, processOutboxSync, neo4jDeleteTransaction } from '@/lib/neo4j';
import { ServerLogger } from '@/lib/logger-server';
import { withAuth } from '@/lib/withAuth';
import { SecureHandler } from '@/lib/types/api';
import { createClient } from '@/lib/supabase-server';
import { TransactionSyncPayload, ReceiptItemSyncPayload } from '@/lib/types';

// Slovak B2B Ingredient Mapping Dictionary
function mapToOntologyItem(name: string, merchantId: string, itemCurrency: string) {
  const cleanName = name.trim();
  const lowerName = cleanName.toLowerCase();
  
  let canonicalName = cleanName;
  let baseUnit = 'pcs';
  let perishability = 30;

  if (lowerName.includes('mliek') || lowerName.includes('milk')) {
    canonicalName = 'Milk';
    baseUnit = 'L';
    perishability = 7;
  } else if (lowerName.includes('masl') || lowerName.includes('butter')) {
    canonicalName = 'Butter';
    baseUnit = 'kg';
    perishability = 21;
  } else if (lowerName.includes('kur') || lowerName.includes('chick') || lowerName.includes('hydin')) {
    canonicalName = 'Chicken Breast';
    baseUnit = 'kg';
    perishability = 5;
  } else if (lowerName.includes('múk') || lowerName.includes('muka') || lowerName.includes('flour')) {
    canonicalName = 'Flour';
    baseUnit = 'kg';
    perishability = 180;
  } else if (lowerName.includes('kofol') || lowerName.includes('cola') || lowerName.includes('pepsi')) {
    canonicalName = 'Cola Beverage';
    baseUnit = 'L';
    perishability = 180;
  } else if (lowerName.includes('piv') || lowerName.includes('beer') || lowerName.includes('bažant') || lowerName.includes('keg')) {
    canonicalName = 'Draft Beer';
    baseUnit = 'L';
    perishability = 60;
  } else if (lowerName.includes('zemiak') || lowerName.includes('potat')) {
    canonicalName = 'Potatoes';
    baseUnit = 'kg';
    perishability = 30;
  }

  if (baseUnit === 'pcs') {
    if (lowerName.includes(' kg') || lowerName.includes('kg ') || lowerName.endsWith('kg')) {
      baseUnit = 'kg';
    } else if (lowerName.includes(' l ') || lowerName.includes('l ') || lowerName.endsWith('l')) {
      baseUnit = 'L';
    } else if (lowerName.includes(' g ') || lowerName.includes('g ') || lowerName.endsWith('g')) {
      baseUnit = 'g';
    }
  }

  const itemId = `item-${Math.random().toString(36).substring(2, 9)}`;
  const skuId = `sku-${merchantId}-${lowerName.replace(/[^a-z0-9]/g, '-')}`;
  const canonicalIngredientId = `ing-${canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  return {
    itemId,
    itemName: cleanName,
    skuId,
    currency: itemCurrency,
    canonicalIngredientId,
    canonicalName,
    baseUnit,
    perishability,
  };
}

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
      await supabase
        .from('graph_sync_queue')
        .update({ status: 'PROCESSING', processed_at: new Date().toISOString() })
        .eq('id', event.id);

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
            .select('id, amount, date, who, description, currency, tenant_id')
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

          const vendorName = (txRow.who || txRow.description || 'Unknown Merchant').trim();
          const merchantId = `merchant-${vendorName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
          const currency = txRow.currency || 'EUR';

          const mappedItems: ReceiptItemSyncPayload[] = (itemsRows || []).map(item => {
            const mapped = mapToOntologyItem(item.name, merchantId, item.currency || currency);
            return {
              ...mapped,
              itemId: item.id,
              itemAmount: Number(item.amount),
              itemCategory: item.category || 'COGS - Dry Goods',
            };
          });

          payloadsToSync.push({
            txId: txRow.id,
            tenantId: txRow.tenant_id,
            amount: Number(txRow.amount),
            date: txRow.date,
            vendorName,
            merchantId,
            items: mappedItems,
          });

          eventsToComplete.push(event.id);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown outbox sync error';
        const retryCount = (event.retry_count || 0) + 1;
        const maxRetries = event.max_retries || 3;
        const finalStatus = retryCount >= maxRetries ? 'FAILED' : 'PENDING';

        await supabase
          .from('graph_sync_queue')
          .update({
            status: finalStatus,
            retry_count: retryCount,
            last_error: errorMsg,
            processed_at: new Date().toISOString(),
          })
          .eq('id', event.id);

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
      await supabase
        .from('graph_sync_queue')
        .update({ status: 'COMPLETED', processed_at: new Date().toISOString() })
        .in('id', eventsToComplete);
    }

    return NextResponse.json({
      success: true,
      message: `Processed outbox events successfully`,
      syncedTransactions: processedCount,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Sync exception';
    await ServerLogger.system('ERROR', 'Debug', 'Manual sync process failed', { error: msg, tenantId });
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await session.close();
  }
};

export const GET = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
