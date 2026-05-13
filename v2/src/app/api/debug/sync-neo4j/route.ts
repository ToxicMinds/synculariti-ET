import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getNeo4jDriver, neo4jBulkMerge, neo4jDeleteTransaction } from '@/lib/neo4j';
import { withAuth } from '@/lib/withAuth';
import { ServerLogger } from '@/lib/logger-server';

/**
 * GRAPH SYNC CONSUMER: Processes graph_sync_queue from Supabase.
 * Atomically marks items as PROCESSING, performs Neo4j mutation, and completes.
 * Usage: GET /api/debug/sync-neo4j?key=...
 */
export const GET = withAuth(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (key !== process.env.SYNC_SECRET_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const driver = getNeo4jDriver();
  if (!driver) return NextResponse.json({ error: 'Neo4j not configured' }, { status: 500 });

  try {
    // 1. Fetch PENDING items
    const { data: pending, error } = await supabase
      .from('graph_sync_queue')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) throw error;
    if (!pending || pending.length === 0) {
      return NextResponse.json({ success: true, message: 'Queue is empty' });
    }

    const sessionNeo = driver.session();
    let processedCount = 0;
    let failureCount = 0;

    try {
      for (const item of pending) {
        try {
          // 2. Mark as PROCESSING
          await supabase.from('graph_sync_queue').update({ status: 'PROCESSING' }).eq('id', item.id);

          // 3. Perform Mutation
          if (item.operation === 'MERGE') {
            // BulkMerge expects an array
            await neo4jBulkMerge([item.payload], sessionNeo);
          } else if (item.operation === 'DELETE') {
            await neo4jDeleteTransaction(item.entity_id, sessionNeo);
          }

          // 4. Mark as COMPLETED
          await supabase.from('graph_sync_queue').update({ 
            status: 'COMPLETED', 
            processed_at: new Date().toISOString() 
          }).eq('id', item.id);

          processedCount++;
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          failureCount++;
          
          // 5. Handle Failure/Retries
          if (item.retry_count >= item.max_retries) {
            await supabase.from('graph_sync_queue').update({ 
              status: 'FAILED', 
              last_error: errMsg 
            }).eq('id', item.id);
            ServerLogger.system('ERROR', 'Neo4j', `Mutation ${item.id} permanently failed`, { error: errMsg });
          } else {
            await supabase.from('graph_sync_queue').update({ 
              retry_count: item.retry_count + 1, 
              last_error: errMsg,
              status: 'PENDING' // Put back in queue
            }).eq('id', item.id);
          }
        }
      }
    } finally {
      await sessionNeo.close();
    }

    return NextResponse.json({
      success: true,
      processed: processedCount,
      failed: failureCount,
      message: `Processed ${processedCount} mutations, ${failureCount} failures.`
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Neo4j consumer exception';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});
