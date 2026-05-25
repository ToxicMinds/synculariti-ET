import { NextResponse } from 'next/server';
import { getNeo4jDriver, processOutboxSync } from '@/lib/neo4j';
import { ServerLogger } from '@/lib/logger-server';
import { withAuth } from '@/lib/withAuth';
import { SecureHandler } from '@/lib/types/api';
import { createClient } from '@/lib/supabase-server';
import { TransactionSyncPayload, ReceiptItemSyncPayload } from '@/lib/types';
import { mapToOntologyItem } from '@/lib/neo4j-ontology';

/**
 * GET /api/debug/backfill-neo4j
 * Manually rebuilds/backfills the Neo4j graph from historical Postgres transaction ledgers.
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
    await ServerLogger.system('INFO', 'Debug', 'Manual Neo4j Backfill Triggered', { tenantId, admin: user.email });

    // 1. Fetch all transactions for the tenant
    const { data: transactions, error: txsError } = await supabase
      .from('transactions')
      .select('id, amount, date, who, description, currency, tenant_id')
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .order('date', { ascending: true });

    if (txsError) {
      throw new Error(`Failed to fetch transactions: ${txsError.message}`);
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ success: true, message: 'No transactions found for this tenant to backfill' });
    }

    // 2. Fetch all receipt items for this tenant
    const { data: itemsRows, error: itemsError } = await supabase
      .from('receipt_items')
      .select('id, transaction_id, name, amount, category, currency')
      .eq('tenant_id', tenantId);

    if (itemsError) {
      throw new Error(`Failed to fetch receipt items: ${itemsError.message}`);
    }

    // Group items by transaction_id
    const itemsByTx: Record<string, typeof itemsRows> = {};
    for (const item of itemsRows || []) {
      if (item.transaction_id) {
        if (!itemsByTx[item.transaction_id]) {
          itemsByTx[item.transaction_id] = [];
        }
        itemsByTx[item.transaction_id].push(item);
      }
    }

    // 3. Map into TransactionSyncPayload
    const payloadsToSync: TransactionSyncPayload[] = transactions.map(txRow => {
      const vendorName = (txRow.who || txRow.description || 'Unknown Merchant').trim();
      const merchantId = `merchant-${vendorName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const currency = txRow.currency || 'EUR';

      const relatedItems = itemsByTx[txRow.id] || [];
      const mappedItems: ReceiptItemSyncPayload[] = relatedItems.map(item => {
        const mapped = mapToOntologyItem(item.name, merchantId, item.currency || currency);
        return {
          ...mapped,
          itemId: item.id,
          itemAmount: Number(item.amount),
          itemCategory: item.category || 'COGS - Dry Goods',
        };
      });

      return {
        txId: txRow.id,
        tenantId: txRow.tenant_id,
        amount: Number(txRow.amount),
        date: txRow.date,
        vendorName,
        merchantId,
        items: mappedItems,
      };
    });

    // 4. Run bulk sync using flat-memory cursor slide
    const backfilledCount = await processOutboxSync(payloadsToSync, session);

    return NextResponse.json({
      success: true,
      message: `Historical backfill processed successfully`,
      backfilledTransactions: backfilledCount,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Backfill exception';
    await ServerLogger.system('ERROR', 'Debug', 'Manual backfill process failed', { error: msg, tenantId });
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await session.close();
  }
};

export const GET = process.env.NODE_ENV === 'test' ? handler : withAuth(handler);
