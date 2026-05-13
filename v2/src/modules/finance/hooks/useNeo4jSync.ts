import { normalizeAndLinkMerchant } from '@/lib/neo4j';
import { Logger } from '@/lib/logger';
import { Transaction } from '../lib/finance';

export function useNeo4jSync(tenantId: string | undefined) {
  const linkMerchant = async (transactionId: string, amount: number, merchantName?: string, ico?: string | null) => {
    if (!tenantId) return;
    
    const nameToLink = merchantName || 'Unknown Merchant';
    try {
      await normalizeAndLinkMerchant(nameToLink, transactionId, amount, ico || undefined);
    } catch (err: unknown) {
      Logger.system('ERROR', 'Neo4j', 'Neo4j sync failed', { error: err, transactionId }, tenantId);
    }
  };

  const linkTransactionsBulk = async (transactions: Partial<Transaction>[], savedIds: string[]) => {
    if (!tenantId || !Array.isArray(savedIds)) return;
    
    savedIds.forEach((id: string, index: number) => {
      const item = transactions[index];
      const merchantName = (item as Partial<Transaction> & { merchant?: string }).merchant || item.description;
      linkMerchant(id, Number(item.amount), merchantName);
    });
  };

  return { linkMerchant, linkTransactionsBulk };
}
